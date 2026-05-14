// devops-post-timelog v1.0
// Processes approved entries from timelog_post_queue and POSTs them
// to the TechsBCN DevOps TimeLog extension via Azure DevOps Extension Data API.
//
// Modes (POST body):
//   { mode: 'probe' }                    → test connectivity only, no writes
//   { mode: 'process', limit?: number }  → process up to N approved entries (default 20)
//   { mode: 'process-one', queueId: string } → process a single entry by ID
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ── TechsBCN Extension Data base URL ──────────────────────────────────────────
const TIMELOG_BASE =
  'https://extmgmt.dev.azure.com/FlagIW/_apis/ExtensionManagement/InstalledExtensions/TechsBCN/DevOps-TimeLog/Data/Scopes/Default/Current/Collections'

// Ordered preference of collections — same as the sync function
const WRITE_COLLECTIONS = ['TimeLogData', 'TimeLog', 'timelog', 'Logs']

// ── Auth helpers ──────────────────────────────────────────────────────────────
function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

function validateCronSecret(req: Request): boolean {
  const cronSecret = req.headers.get('x-cron-secret')
  const expected = Deno.env.get('CRON_SECRET')
  return !!cronSecret && !!expected && cronSecret === expected
}

async function validateAuth(req: Request): Promise<string | null> {
  if (validateCronSecret(req)) return 'cron'
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')

  // Accept Supabase service role key (for CLI/server-side calls)
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (serviceRoleKey && token === serviceRoleKey) return 'service_role'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return data.user.id
}

async function assertAdmin(caller: string, sb: ReturnType<typeof getSupabaseAdmin>): Promise<boolean> {
  if (caller === 'cron' || caller === 'service_role') return true
  const { data: r1 } = await sb
    .from('hub_user_global_roles')
    .select('role')
    .eq('user_id', caller)
    .eq('role', 'admin')
    .maybeSingle()
  if (r1) return true
  const { data: r2 } = await sb
    .from('user_roles')
    .select('role')
    .eq('user_id', caller)
    .eq('role', 'admin')
    .maybeSingle()
  return !!r2
}

// ── DevOps API helpers ────────────────────────────────────────────────────────

function makeAuthHeaders(pat: string) {
  return {
    'Authorization': `Basic ${btoa(`:${pat}`)}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

/** Probe: verify we can reach at least one collection */
async function probeCollection(pat: string): Promise<{ ok: boolean; collection: string | null; status: number; message: string }> {
  const headers = makeAuthHeaders(pat)
  for (const col of WRITE_COLLECTIONS) {
    const url = `${TIMELOG_BASE}/${col}/Documents?api-version=7.1-preview.1`
    console.log(`[post-timelog] probe GET ${col}`)
    try {
      const resp = await fetch(url, { method: 'GET', headers })
      console.log(`[post-timelog] probe ${col} → ${resp.status}`)
      if (resp.status === 200) {
        const body = await resp.json()
        const count = Array.isArray(body?.value) ? body.value.length : (Array.isArray(body) ? body.length : '?')
        return { ok: true, collection: col, status: resp.status, message: `Collection '${col}' accessible — ${count} documents` }
      }
      if (resp.status === 401) {
        return { ok: false, collection: null, status: 401, message: 'DEVOPS_PAT inválido ou expirado.' }
      }
      if (resp.status === 403) {
        return { ok: false, collection: null, status: 403, message: 'PAT sem permissões para TechsBCN DevOps TimeLog.' }
      }
    } catch (e) {
      console.error(`[post-timelog] probe error for ${col}:`, e)
    }
  }
  return { ok: false, collection: null, status: 404, message: 'Nenhuma collection acessível (TimeLogData, TimeLog, timelog, Logs).' }
}

interface QueueEntry {
  id: string
  task_devops: number
  log_date: string
  time_minutes: number
  target_user_email: string | null
  target_user_display: string | null
  vdesk_user_name: string
  notes: string | null
  dry_run: boolean
  attempt_count: number
}

// ── Per-run caches for identity & work-item title lookups ───────────────────
const userIdCache = new Map<string, string>()
const workItemNameCache = new Map<number, string>()

function newUuid(): string {
  // RFC 4122 v4 UUID via crypto
  return crypto.randomUUID()
}

async function lookupUserId(email: string, pat: string): Promise<string> {
  const cached = userIdCache.get(email.toLowerCase())
  if (cached !== undefined) return cached
  try {
    const url = `https://vssps.dev.azure.com/FlagIW/_apis/identities?searchFilter=MailAddress&filterValue=${encodeURIComponent(email)}&api-version=7.1-preview.1`
    const resp = await fetch(url, { headers: makeAuthHeaders(pat) })
    if (resp.ok) {
      const json = await resp.json()
      const id = json?.value?.[0]?.id ?? ''
      userIdCache.set(email.toLowerCase(), id)
      return id
    }
  } catch (e) {
    console.warn(`[post-timelog] lookupUserId failed for ${email}:`, e)
  }
  userIdCache.set(email.toLowerCase(), '')
  return ''
}

async function lookupWorkItemName(taskId: number, pat: string): Promise<string> {
  const cached = workItemNameCache.get(taskId)
  if (cached !== undefined) return cached
  try {
    const url = `https://dev.azure.com/FlagIW/_apis/wit/workitems/${taskId}?fields=System.Title&api-version=7.1-preview.3`
    const resp = await fetch(url, { headers: makeAuthHeaders(pat) })
    if (resp.ok) {
      const json = await resp.json()
      const title = json?.fields?.['System.Title'] ?? ''
      workItemNameCache.set(taskId, title)
      return title
    }
  } catch (e) {
    console.warn(`[post-timelog] lookupWorkItemName failed for ${taskId}:`, e)
  }
  workItemNameCache.set(taskId, '')
  return ''
}

/**
 * POST a single time entry to TechsBCN DevOps TimeLog.
 *
 * TechsBCN stores each entry as its OWN document (UUID id) with FLAT fields:
 *   { id, user, userId, workItemId, workItemName, startTime, date, time, notes }
 * There is NO nested `value` array.
 */
async function postToDevOps(
  entry: QueueEntry,
  collection: string,
  pat: string,
): Promise<string> {
  const headers = makeAuthHeaders(pat)
  const email = entry.target_user_email ?? ''
  const displayName = entry.target_user_display ?? entry.vdesk_user_name

  // Resolve Azure DevOps identity id + work item title in parallel
  const [userId, workItemName] = await Promise.all([
    email ? lookupUserId(email, pat) : Promise.resolve(''),
    lookupWorkItemName(entry.task_devops, pat),
  ])

  const docId = newUuid()
  const doc = {
    id: docId,
    user: displayName,                                      // display name (matches real docs)
    userId: userId,                                         // Azure DevOps identity GUID
    workItemId: entry.task_devops,
    workItemName: workItemName,
    startTime: '00:00',
    date: entry.log_date,
    time: entry.time_minutes,
    notes: entry.notes ?? `VDESK ${entry.vdesk_user_name} — lançamento automatizado FlagHub`,
  }

  const writeUrl = `${TIMELOG_BASE}/${collection}/Documents?api-version=7.1-preview.1`
  console.log(`[post-timelog] POST ${collection}/Documents id=${docId} workItem=${entry.task_devops} user=${email}`)

  const writeResp = await fetch(writeUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(doc),
  })

  const writeText = await writeResp.text()
  console.log(`[post-timelog] POST response: ${writeResp.status} ${writeText.slice(0, 300)}`)

  if (!writeResp.ok) {
    throw new Error(`DevOps API POST ${writeResp.status}: ${writeText.slice(0, 400)}`)
  }

  let parsed: Record<string, unknown> = {}
  try { parsed = JSON.parse(writeText) } catch { /* ignore */ }
  return (parsed?.id as string) ?? docId
}

// ── Main processor ────────────────────────────────────────────────────────────

interface ProcessResult {
  processed: number
  posted: number
  dry_run_skipped: number
  errors: number
  details: Array<{ id: string; status: 'posted' | 'dry_run' | 'error'; message: string }>
}

async function processQueue(
  sb: ReturnType<typeof getSupabaseAdmin>,
  pat: string,
  options: { limit: number; queueId?: string },
): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, posted: 0, dry_run_skipped: 0, errors: 0, details: [] }

  // ── 1) Discover writable collection via probe ───────────────────────────────
  const probe = await probeCollection(pat)
  if (!probe.ok) {
    throw new Error(`Conectividade DevOps falhou: ${probe.message}`)
  }
  const collection = probe.collection!
  console.log(`[post-timelog] Using collection: ${collection}`)

  // ── 2) Fetch approved entries ──────────────────────────────────────────────
  let query = (sb as any)
    .from('timelog_post_queue')
    .select('id, task_devops, log_date, time_minutes, target_user_email, target_user_display, vdesk_user_name, notes, dry_run, attempt_count')
    .eq('status', 'approved')
    .lt('attempt_count', 3)         // max 3 attempts
    .order('created_at', { ascending: true })
    .limit(options.limit)

  if (options.queueId) {
    query = (sb as any)
      .from('timelog_post_queue')
      .select('id, task_devops, log_date, time_minutes, target_user_email, target_user_display, vdesk_user_name, notes, dry_run, attempt_count')
      .eq('id', options.queueId)
      .eq('status', 'approved')
      .limit(1)
  }

  const { data: entries, error: fetchErr } = await query
  if (fetchErr) throw new Error(`Erro ao buscar fila: ${fetchErr.message}`)
  if (!entries || entries.length === 0) {
    console.log('[post-timelog] No approved entries to process.')
    return result
  }

  console.log(`[post-timelog] Processing ${entries.length} approved entries`)

  // ── 3) Process each entry ──────────────────────────────────────────────────
  for (const entry of entries as QueueEntry[]) {
    result.processed++

    // Mark as 'posting' + increment attempt_count
    await (sb as any)
      .from('timelog_post_queue')
      .update({
        status: 'posting',
        attempt_count: entry.attempt_count + 1,
        last_attempt_at: new Date().toISOString(),
      })
      .eq('id', entry.id)

    // ── DRY RUN ──────────────────────────────────────────────────────────────
    if (entry.dry_run) {
      console.log(`[post-timelog] DRY RUN entry ${entry.id} — skipping DevOps write`)
      await (sb as any)
        .from('timelog_post_queue')
        .update({
          status: 'posted',
          posted_at: new Date().toISOString(),
          devops_entry_id: 'DRY_RUN',
          error_message: null,
        })
        .eq('id', entry.id)

      result.dry_run_skipped++
      result.details.push({ id: entry.id, status: 'dry_run', message: 'dry_run=true — não enviado ao DevOps' })
      continue
    }

    // ── REAL WRITE ────────────────────────────────────────────────────────────
    try {
      const devopsId = await postToDevOps(entry, collection, pat)

      await (sb as any)
        .from('timelog_post_queue')
        .update({
          status: 'posted',
          posted_at: new Date().toISOString(),
          devops_entry_id: devopsId,
          error_code: null,
          error_message: null,
        })
        .eq('id', entry.id)

      result.posted++
      result.details.push({ id: entry.id, status: 'posted', message: `devops_id=${devopsId}` })
      console.log(`[post-timelog] ✓ posted entry ${entry.id} → ${devopsId}`)

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[post-timelog] ✗ error entry ${entry.id}: ${msg}`)

      await (sb as any)
        .from('timelog_post_queue')
        .update({
          status: 'error',
          error_code: 'DEVOPS_API_ERROR',
          error_message: msg.slice(0, 500),
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', entry.id)

      result.errors++
      result.details.push({ id: entry.id, status: 'error', message: msg.slice(0, 200) })
    }
  }

  return result
}

// ── Serve ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const caller = await validateAuth(req)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
    }

    const sb = getSupabaseAdmin()
    const isAdmin = await assertAdmin(caller, sb)
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Permissão negada: apenas admins.' }), { status: 403, headers })
    }

    // ── PAT ─────────────────────────────────────────────────────────────────
    const pat = Deno.env.get('DEVOPS_PAT')
    if (!pat) {
      return new Response(JSON.stringify({ error: 'DEVOPS_PAT não configurado.' }), { status: 500, headers })
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch { /* GET or empty body → defaults */ }

    const mode = (body.mode as string) ?? 'probe'

    // ── MODE: probe-docs ────────────────────────────────────────────────────
    if (mode === 'probe-docs') {
      const probe = await probeCollection(pat)
      if (!probe.ok) {
        return new Response(JSON.stringify({ ok: false, message: probe.message }), { status: 502, headers })
      }
      const collection = probe.collection!
      const authHdrs = makeAuthHeaders(pat)

      // List all documents
      const listUrl = `${TIMELOG_BASE}/${collection}/Documents?api-version=7.1-preview.1`
      const listResp = await fetch(listUrl, { headers: authHdrs })
      const rawList = await listResp.json()
      const docs: unknown[] = Array.isArray(rawList) ? rawList
        : Array.isArray(rawList?.value) ? rawList.value : []

      // Sample first 5 docs (structure only)
      const sampleDocs = docs.slice(0, 5).map((d: any) => ({
        id: d?.id,
        __etag: d?.__etag,
        value_type: Array.isArray(d?.value) ? `array[${d.value.length}]` : typeof d?.value,
        value_sample: Array.isArray(d?.value) ? d.value.slice(0, 1) : d?.value,
        other_keys: Object.keys(d ?? {}).filter(k => !['id','__etag','value'].includes(k)),
      }))

      // Try to read specific work item documents that user is testing
      const testIds = (body.checkIds as number[] | undefined) ?? [15345, 15374]
      const specificDocs: Record<string, unknown> = {}
      for (const id of testIds) {
        const getResp = await fetch(
          `${TIMELOG_BASE}/${collection}/Documents/${id}?api-version=7.1-preview.1`,
          { headers: authHdrs }
        )
        if (getResp.ok) {
          specificDocs[String(id)] = await getResp.json()
        } else {
          specificDocs[String(id)] = { httpStatus: getResp.status, message: await getResp.text().then(t => t.slice(0, 200)) }
        }
      }

      return new Response(JSON.stringify({
        ok: true, collection,
        total_docs: docs.length,
        sample_docs: sampleDocs,
        specific_docs: specificDocs,
      }, null, 2), { status: 200, headers })
    }

    // ── MODE: probe ─────────────────────────────────────────────────────────
    if (mode === 'probe') {
      const probe = await probeCollection(pat)
      return new Response(JSON.stringify({
        ok: probe.ok,
        mode: 'probe',
        collection: probe.collection,
        httpStatus: probe.status,
        message: probe.message,
      }), { status: probe.ok ? 200 : 502, headers })
    }

    // ── MODE: process-one ───────────────────────────────────────────────────
    if (mode === 'process-one') {
      const queueId = body.queueId as string | undefined
      if (!queueId) {
        return new Response(JSON.stringify({ error: 'queueId obrigatório para mode=process-one' }), { status: 400, headers })
      }
      const result = await processQueue(sb, pat, { limit: 1, queueId })
      return new Response(JSON.stringify({ ok: true, mode, ...result }), { status: 200, headers })
    }

    // ── MODE: process ───────────────────────────────────────────────────────
    if (mode === 'process') {
      const limit = Math.min(Number(body.limit ?? 20), 50)
      const result = await processQueue(sb, pat, { limit })
      return new Response(JSON.stringify({ ok: true, mode, collection_used: 'auto', ...result }), { status: 200, headers })
    }

    // ── MODE: cleanup ───────────────────────────────────────────────────────
    // Deletes orphan TechsBCN documents (from previous wrong-format attempts) and
    // resets the corresponding timelog_post_queue rows back to 'pending' so they
    // can be re-approved and re-posted with the correct structure.
    if (mode === 'cleanup') {
      const taskIds = (body.taskIds as number[] | undefined) ?? []
      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return new Response(JSON.stringify({ error: 'taskIds[] obrigatório para mode=cleanup' }), { status: 400, headers })
      }

      const probe = await probeCollection(pat)
      if (!probe.ok) {
        return new Response(JSON.stringify({ error: `Conectividade DevOps falhou: ${probe.message}` }), { status: 502, headers })
      }
      const collection = probe.collection!
      const authHdrs = makeAuthHeaders(pat)

      // Fetch queue rows for these tasks (any status)
      const { data: rows, error: qErr } = await (sb as any)
        .from('timelog_post_queue')
        .select('id, task_devops, status, devops_entry_id')
        .in('task_devops', taskIds)
      if (qErr) {
        return new Response(JSON.stringify({ error: `Erro ao buscar fila: ${qErr.message}` }), { status: 500, headers })
      }

      const cleanupDetails: Array<Record<string, unknown>> = []
      // Always also try to delete docs keyed by the task id itself (legacy bug-shape docs)
      const docIdsToDelete = new Set<string>(taskIds.map(String))
      for (const r of (rows ?? []) as Array<{ id: string; task_devops: number; status: string; devops_entry_id: string | null }>) {
        if (r.devops_entry_id) docIdsToDelete.add(r.devops_entry_id)
      }

      for (const docId of docIdsToDelete) {
        const delUrl = `${TIMELOG_BASE}/${collection}/Documents/${encodeURIComponent(docId)}?api-version=7.1-preview.1`
        const resp = await fetch(delUrl, { method: 'DELETE', headers: authHdrs })
        cleanupDetails.push({
          docId,
          httpStatus: resp.status,
          deleted: resp.ok,
          message: resp.ok ? 'deleted' : (await resp.text()).slice(0, 200),
        })
      }

      // Reset queue rows to pending so they can be re-approved
      const { error: updErr } = await (sb as any)
        .from('timelog_post_queue')
        .update({
          status: 'pending',
          devops_entry_id: null,
          posted_at: null,
          error_code: null,
          error_message: null,
          attempt_count: 0,
        })
        .in('task_devops', taskIds)
      if (updErr) {
        return new Response(JSON.stringify({ error: `Erro ao resetar fila: ${updErr.message}`, cleanup: cleanupDetails }), { status: 500, headers })
      }

      return new Response(JSON.stringify({
        ok: true,
        mode: 'cleanup',
        collection,
        taskIds,
        docs_attempted: cleanupDetails.length,
        docs_deleted: cleanupDetails.filter(d => d.deleted).length,
        queue_rows_reset: rows?.length ?? 0,
        details: cleanupDetails,
      }, null, 2), { status: 200, headers })
    }

    return new Response(JSON.stringify({ error: `Modo desconhecido: ${mode}. Use probe | probe-docs | process | process-one | cleanup` }), { status: 400, headers })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[post-timelog] Fatal:', msg)
    return new Response(JSON.stringify({ error: 'Erro interno', detail: msg }), { status: 500, headers })
  }
})
