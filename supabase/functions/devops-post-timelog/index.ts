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

/**
 * POST a single time entry to TechsBCN DevOps TimeLog.
 * Uses Azure DevOps Extension Data PATCH (upsert-by-etag) API.
 * Returns the entry id created by the API, or throws on failure.
 */
async function postToDevOps(
  entry: QueueEntry,
  collection: string,
  pat: string,
): Promise<string> {
  const headers = makeAuthHeaders(pat)
  const docKey = String(entry.task_devops)   // TechsBCN keys documents by work item ID

  // ── Step 1: Try to fetch existing document for this work item ────────────
  const getUrl = `${TIMELOG_BASE}/${collection}/Documents/${docKey}?api-version=7.1-preview.1`
  console.log(`[post-timelog] GET ${collection}/Documents/${docKey}`)
  const getResp = await fetch(getUrl, { headers })
  console.log(`[post-timelog] GET response: ${getResp.status}`)

  let existingEntries: unknown[] = []
  let currentEtag: number | string = -1
  let docExists = false

  if (getResp.ok) {
    const existing = await getResp.json()
    existingEntries = Array.isArray(existing?.value) ? existing.value : []
    currentEtag = existing?.__etag ?? -1
    docExists = true
    console.log(`[post-timelog] Found existing doc etag=${currentEtag}, ${existingEntries.length} entries`)
  } else if (getResp.status !== 404) {
    const errText = await getResp.text()
    throw new Error(`GET document failed ${getResp.status}: ${errText.slice(0, 300)}`)
  } else {
    console.log(`[post-timelog] No existing doc for workItem=${docKey}, will create`)
  }

  // ── Step 2: Build the new time entry ────────────────────────────────────
  const newEntry = {
    id: `fh-${entry.id.replace(/-/g, '').slice(0, 12)}`,   // unique entry-level id
    workItemId: entry.task_devops,
    date:      entry.log_date,
    time:      entry.time_minutes,
    user:      entry.target_user_email ?? entry.target_user_display ?? entry.vdesk_user_name,
    notes:     entry.notes ?? `VDESK ${entry.vdesk_user_name} — lançamento automatizado FlagHub`,
    startTime: '00:00',
  }

  const doc = {
    '__etag': docExists ? currentEtag : -1,
    id: docKey,
    value: [...existingEntries, newEntry],
  }

  // ── Step 3: PATCH (update) or POST (create) ──────────────────────────────
  const method = docExists ? 'PATCH' : 'POST'
  const writeUrl = `${TIMELOG_BASE}/${collection}/Documents?api-version=7.1-preview.1`
  console.log(`[post-timelog] ${method} ${collection}/Documents id=${docKey} entries=${doc.value.length}`)

  const writeResp = await fetch(writeUrl, {
    method,
    headers,
    body: JSON.stringify(doc),
  })

  const writeText = await writeResp.text()
  console.log(`[post-timelog] ${method} response: ${writeResp.status} ${writeText.slice(0, 300)}`)

  if (!writeResp.ok) {
    throw new Error(`DevOps API ${method} ${writeResp.status}: ${writeText.slice(0, 400)}`)
  }

  let parsed: Record<string, unknown> = {}
  try { parsed = JSON.parse(writeText) } catch { /* ignore */ }
  return (parsed?.id as string) ?? docKey
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
      const url = `${TIMELOG_BASE}/${collection}/Documents?api-version=7.1-preview.1`
      const resp = await fetch(url, { headers: authHdrs })
      const raw = await resp.json()

      // Normalize to array of documents
      const docs: unknown[] = Array.isArray(raw) ? raw
        : Array.isArray(raw?.value) ? raw.value
        : []

      // Return first 5 docs with redacted structure: id, __etag, value[0..1] (sample)
      const sample = docs.slice(0, 5).map((d: any) => ({
        id: d?.id,
        __etag: d?.__etag,
        value_count: Array.isArray(d?.value) ? d.value.length : typeof d?.value,
        value_sample: Array.isArray(d?.value) ? d.value.slice(0, 2) : d?.value,
        other_keys: Object.keys(d ?? {}).filter(k => !['id','__etag','value'].includes(k)),
      }))

      return new Response(JSON.stringify({
        ok: true, collection, total_docs: docs.length, sample,
      }), { status: 200, headers })
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

    return new Response(JSON.stringify({ error: `Modo desconhecido: ${mode}. Use probe | process | process-one` }), { status: 400, headers })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[post-timelog] Fatal:', msg)
    return new Response(JSON.stringify({ error: 'Erro interno', detail: msg }), { status: 500, headers })
  }
})
