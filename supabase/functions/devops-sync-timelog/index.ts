// devops-sync-timelog v3.3 — Background processing via EdgeRuntime.waitUntil()
// v3.0: Respond immediately, process in background to avoid CPU limits
// v3.1: fix ext_entry_id — o caller passava entry.id como docId, anulando o
//       teste `entry.id !== docId` e deixando TODAS as linhas sem id oficial
//       (edição no DevOps virava linha nova/fantasma em vez de update).
//       Agora o docId é a coleção/documento real; edições caem no UPSERT
//       (Phase A) e a versão anterior é preservada por trigger
//       (devops_time_log_revisions, migration 20260720100000).
// v3.3: + detecção de exclusão na origem. O sync nunca apaga, então lançamento
//       excluído no DevOps ficava na base para sempre, em silêncio (7.137 no
//       payload contra 7.175 na base em 12/08/2026). A diferença vai para
//       devops_time_log_orphans. Carimbo por linha NÃO serve: o trigger
//       trg_time_log_revision cancela update sem mudança de conteúdo.
// v3.2: fix dedup — o teste por conteúdo (que ignora `notes`) valia também para
//       linha COM ext_entry_id e engolia lançamento legítimo repetido no mesmo
//       item/dia/pessoa com a mesma duração. Conferência de 12/08/2026 contra o
//       relatório do TimeLog: 6 lançamentos / 11h15 perdidos em 07/2026.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const TIMELOG_BASE =
  'https://extmgmt.dev.azure.com/FlagIW/_apis/ExtensionManagement/InstalledExtensions/TechsBCN/DevOps-TimeLog/Data/Scopes/Default/Current/Collections'
const COLLECTIONS_TO_TRY = ['TimeLogData', 'TimeLog', 'timelog', 'Logs']

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
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return data.user.id
}

// ── TimeLog document shape ─────────────────────────────────────────
interface TimeLogEntry {
  workItemId?: number
  WorkItemId?: number
  date?: string
  Date?: string
  startTime?: string
  StartTime?: string
  time?: number
  Time?: number
  user?: string
  userName?: string
  UserName?: string
  userId?: string
  UserId?: string
  notes?: string
  Notes?: string
  id?: string
  __etag?: number | string
  [key: string]: unknown
}

interface TimeLogDocument {
  id: string
  __etag?: string
  value?: TimeLogEntry[] | Record<string, unknown>
  [key: string]: unknown
}

function extractEntries(doc: TimeLogDocument): TimeLogEntry[] {
  if (Array.isArray(doc.value)) return doc.value
  if (doc.value && typeof doc.value === 'object') {
    const entries: TimeLogEntry[] = []
    for (const val of Object.values(doc.value)) {
      if (Array.isArray(val)) entries.push(...val)
      else if (val && typeof val === 'object' && 'workItemId' in (val as Record<string, unknown>)) {
        entries.push(val as TimeLogEntry)
      }
    }
    return entries
  }
  return []
}

interface NormalizedRow {
  work_item_id: number | null
  log_date: string
  start_time: string | null
  time_minutes: number
  user_name: string | null
  user_id_ext: string | null
  notes: string | null
  etag: string
  /** Official per-entry ID from TechsBCN API — used as primary dedup key when present */
  ext_entry_id: string | null
  raw: TimeLogEntry
}

function normalizeEntry(entry: TimeLogEntry, docId: string): NormalizedRow | null {
  const logDate = entry.date || entry.Date || (entry as Record<string, unknown>).LogDate
  const minutes = entry.time ?? entry.Time ?? (entry as Record<string, unknown>).TimeInMinutes
  if (!logDate || minutes == null) return null

  return {
    work_item_id: entry.workItemId ?? entry.WorkItemId ?? (entry as Record<string, unknown>).workitemid as number ?? null,
    log_date: String(logDate).substring(0, 10),
    start_time: (entry.startTime ?? entry.StartTime ?? null) as string | null,
    time_minutes: Number(minutes) || 0,
    user_name: (entry.user ?? entry.userName ?? entry.UserName ?? (entry as Record<string, unknown>).user ?? null) as string | null,
    user_id_ext: (entry.userId ?? entry.UserId ?? null) as string | null,
    notes: (entry.notes ?? entry.Notes ?? null) as string | null,
    etag: entry.__etag != null ? String(entry.__etag) : (entry.id || docId),
    // Use entry.id as the official per-entry dedup key when it differs from the
    // document-level docId (i.e. the entry has its own unique identifier).
    ext_entry_id: (entry.id && typeof entry.id === 'string' && entry.id !== docId)
      ? entry.id
      : null,
    raw: entry,
  }
}

/** Build a dedup key for a normalized row */
function dedupKey(row: NormalizedRow): string {
  return `${row.work_item_id}|${row.log_date}|${row.user_name || ''}|${row.start_time || ''}|${row.time_minutes}`
}

/** Background processing — runs after response is sent */
async function processTimeLogs(pat: string) {
  const startMs = Date.now()
  const base64Pat = btoa(`:${pat}`)
  const authHeaders = {
    'Authorization': `Basic ${base64Pat}`,
    'Accept': 'application/json',
  }

  // Cada entrada carrega o docId REAL de onde veio (coleção ou documento) —
  // nunca o próprio entry.id, senão o teste `entry.id !== docId` da
  // normalização anula o ext_entry_id (bug corrigido na v3.1).
  let rawPairs: Array<{ entry: TimeLogEntry; docId: string }> = []
  let usedCollection = ''

  for (const col of COLLECTIONS_TO_TRY) {
    const url = `${TIMELOG_BASE}/${col}/Documents?api-version=7.1-preview.1`
    console.log(`[timelog] Trying collection: ${col}`)
    const resp = await fetch(url, { headers: authHeaders })

    if (!resp.ok) {
      console.log(`[timelog] Collection '${col}' returned ${resp.status}`)
      continue
    }

    const payload = await resp.json()
    const pairs: Array<{ entry: TimeLogEntry; docId: string }> = []

    if (Array.isArray(payload)) {
      for (const e of payload) pairs.push({ entry: e as TimeLogEntry, docId: col })
    } else if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.value)) {
        const firstVal = payload.value[0]
        if (firstVal && ('workItemId' in firstVal || 'user' in firstVal || 'date' in firstVal)) {
          for (const e of payload.value) pairs.push({ entry: e as TimeLogEntry, docId: col })
        } else {
          for (const doc of payload.value) {
            for (const e of extractEntries(doc)) pairs.push({ entry: e, docId: (doc as TimeLogDocument).id || col })
          }
        }
      } else {
        const numericKeys = Object.keys(payload).filter(k => /^\d+$/.test(k))
        for (const k of numericKeys) pairs.push({ entry: payload[k] as TimeLogEntry, docId: col })
      }
    }

    if (pairs.length > 0) {
      rawPairs = pairs
      usedCollection = col
      console.log(`[timelog] Found ${pairs.length} entries in collection '${col}'`)
      break
    }
  }

  console.log(`[timelog] Final: ${rawPairs.length} entries from collection '${usedCollection || 'none'}'`)

  // ── Normalize & dedup in-memory ────────────────────────────────
  const allRows: NormalizedRow[] = []
  const seenKeys = new Set<string>()
  const seenExtIds = new Set<string>()
  let skipped = 0
  let dedupSkipped = 0

  for (const { entry, docId } of rawPairs) {
    const normalized = normalizeEntry(entry, docId)
    if (!normalized) { skipped++; continue }

    // id oficial repetido no payload → 2ª ocorrência cai no dedup por conteúdo
    // (evita "ON CONFLICT cannot affect row a second time" no upsert em lote)
    if (normalized.ext_entry_id) {
      if (seenExtIds.has(normalized.ext_entry_id)) normalized.ext_entry_id = null
      else seenExtIds.add(normalized.ext_entry_id)
    }

    /**
     * O dedup por conteúdo vale SÓ para linha sem id oficial.
     *
     * `dedupKey` não olha `notes`: dois apontamentos legítimos no mesmo
     * item/dia/pessoa, com a mesma duração e sem hora de início, geram a MESMA
     * chave. Enquanto o teste valia para todo mundo, o segundo era descartado
     * aqui — antes de chegar ao upsert — mesmo carregando `ext_entry_id`
     * próprio, que é a garantia da extensão de que são lançamentos distintos.
     * Em 07/2026 isso custou 6 lançamentos / 11h15 (Rodolfo ×4, Charles,
     * Mauricio); ex.: 90min "certificado Ambiente PA" + 90min "certificado
     * Ambiente Nespresso" viravam um só. Os pares que sobreviviam eram os de
     * manhã/tarde, porque `start_time` diferente muda a chave.
     *
     * A chave continua sendo REGISTRADA para as duas famílias: é ela que evita
     * uma linha sem id oficial entrar em duplicidade com uma que já tem id.
     */
    const key = dedupKey(normalized)
    if (!normalized.ext_entry_id && seenKeys.has(key)) { dedupSkipped++; continue }
    seenKeys.add(key)
    allRows.push(normalized)
  }

  console.log(`[timelog] Normalized ${allRows.length} entries (${skipped} invalid, ${dedupSkipped} in-memory dupes)`)

  // ── Two-phase upsert ────────────────────────────────────────────────────────
  // Phase A — rows WITH ext_entry_id: UPSERT on the unique index.
  //   Handles both new and updated entries (e.g. admin edits time_minutes).
  // Phase B — rows WITHOUT ext_entry_id: content-based insert-only dedup.
  //   Fetches existing content keys in bulk, inserts only truly new rows.
  const sb = getSupabaseAdmin()
  const BATCH_SIZE = 500
  let inserted = 0
  let upserted = 0

  // ── Phase A: UPSERT rows that carry an official entry ID ────────────────────
  const rowsWithId    = allRows.filter(r => r.ext_entry_id != null)
  const rowsWithoutId = allRows.filter(r => r.ext_entry_id == null)

  console.log(`[timelog] ${rowsWithId.length} rows with ext_entry_id (UPSERT), ${rowsWithoutId.length} without (content dedup)`)

  for (let i = 0; i < rowsWithId.length; i += BATCH_SIZE) {
    const batch = rowsWithId.slice(i, i + BATCH_SIZE).map(row => ({
      work_item_id: row.work_item_id,
      log_date:     row.log_date,
      start_time:   row.start_time,
      time_minutes: row.time_minutes,
      user_name:    row.user_name,
      user_id_ext:  row.user_id_ext,
      notes:        row.notes,
      etag:         row.etag,
      ext_entry_id: row.ext_entry_id,
      raw:          row.raw as any,
    }))

    const { error, count } = await sb
      .from('devops_time_logs')
      .upsert(batch, {
        onConflict:        'ext_entry_id',
        ignoreDuplicates:  false,
        count:             'exact',
      })

    if (error) {
      console.warn(`[timelog] Phase A upsert error: ${error.message}`)
    } else {
      upserted += count ?? batch.length
    }
  }

  /**
   * ── Exclusão na origem ────────────────────────────────────────────────────
   *
   * O sync nunca apaga, então lançamento excluído no DevOps ficava na base para
   * sempre: em 12/08/2026 a extensão devolvia 7.137 e a base tinha 7.175.
   *
   * A diferença é calculada aqui, em memória, e só ela é gravada
   * (devops_time_log_orphans). Carimbar cada linha com "visto nesta coleta" era
   * o caminho óbvio e está errado: o trigger `trg_time_log_revision` cancela o
   * update quando nenhuma coluna de conteúdo muda, justamente para não gerar 7
   * mil updates a cada 15 minutos.
   */
  const idsNoPayload = new Set(
    allRows.map(r => r.ext_entry_id).filter((id): id is string => id != null)
  )
  const orfaos: Array<{ ext_entry_id: string; work_item_id: number | null; log_date: string; user_name: string | null; time_minutes: number | null }> = []
  const PAGINA_ORFAOS = 1000
  let fromOrfao = 0
  for (;;) {
    const { data, error } = await sb
      .from('devops_time_logs')
      .select('ext_entry_id, work_item_id, log_date, user_name, time_minutes')
      .not('ext_entry_id', 'is', null)
      .range(fromOrfao, fromOrfao + PAGINA_ORFAOS - 1)
    if (error) { console.warn(`[timelog] Órfãos: leitura falhou: ${error.message}`); break }
    const chunk = data || []
    for (const r of chunk) {
      if (!idsNoPayload.has(r.ext_entry_id as string)) orfaos.push(r as typeof orfaos[number])
    }
    if (chunk.length < PAGINA_ORFAOS) break
    fromOrfao += PAGINA_ORFAOS
  }

  if (orfaos.length > 0) {
    // insert-only: `first_missing_at` tem que preservar a PRIMEIRA ausência.
    const { error } = await sb
      .from('devops_time_log_orphans')
      .upsert(orfaos, { onConflict: 'ext_entry_id', ignoreDuplicates: true })
    if (error) console.warn(`[timelog] Órfãos: gravação falhou: ${error.message}`)
  }
  // Lançamento que reapareceu deixa de ser órfão.
  const { data: jaOrfaos } = await sb.from('devops_time_log_orphans').select('ext_entry_id')
  const voltaram = (jaOrfaos || [])
    .map(o => o.ext_entry_id as string)
    .filter(id => idsNoPayload.has(id))
  if (voltaram.length > 0) {
    await sb.from('devops_time_log_orphans').delete().in('ext_entry_id', voltaram)
  }
  console.log(`[timelog] Órfãos (na base, fora do payload): ${orfaos.length}; voltaram: ${voltaram.length}`)

  // ── Phase B: content-based insert-only for entries without official IDs ─────
  const existingKeys = new Set<string>()
  let from = 0
  const PAGE = 1000
  while (rowsWithoutId.length > 0) {
    const { data } = await sb
      .from('devops_time_logs')
      .select('work_item_id, log_date, user_name, start_time, time_minutes')
      .is('ext_entry_id', null)
      .range(from, from + PAGE - 1)
    const chunk = data || []
    for (const r of chunk) {
      existingKeys.add(`${r.work_item_id}|${r.log_date}|${r.user_name || ''}|${r.start_time || ''}|${r.time_minutes}`)
    }
    if (chunk.length < PAGE) break
    from += PAGE
  }

  console.log(`[timelog] Phase B: fetched ${existingKeys.size} existing content keys`)

  const newRows = rowsWithoutId.filter(row => !existingKeys.has(dedupKey(row)))
  console.log(`[timelog] Phase B: ${newRows.length} new rows to insert (${rowsWithoutId.length - newRows.length} already exist)`)

  for (let i = 0; i < newRows.length; i += BATCH_SIZE) {
    const batch = newRows.slice(i, i + BATCH_SIZE).map(row => ({
      work_item_id: row.work_item_id,
      log_date:     row.log_date,
      start_time:   row.start_time,
      time_minutes: row.time_minutes,
      user_name:    row.user_name,
      user_id_ext:  row.user_id_ext,
      notes:        row.notes,
      etag:         row.etag,
      ext_entry_id: null,
      raw:          row.raw as any,
    }))

    const { error } = await sb
      .from('devops_time_logs')
      .insert(batch)

    if (error) {
      console.warn(`[timelog] Phase B insert error: ${error.message}`)
      // Fallback: insert one-by-one to skip individual constraint conflicts
      for (const row of batch) {
        const { error: singleErr } = await sb.from('devops_time_logs').insert(row)
        if (!singleErr) inserted++
      }
    } else {
      inserted += batch.length
    }
  }

  const durationMs = Date.now() - startMs
  const unchanged = allRows.length - upserted - newRows.length
  console.log(`[timelog] Sync complete: ${upserted} upserted (Phase A), ${inserted} inserted (Phase B), ~${unchanged} unchanged in ${durationMs}ms`)

  // ── Audit ────────────────────────────────────────────────────
  await sb.from('hub_raw_ingestions').insert({
    source_type: 'devops_timelog',
    source_key: 'TechsBCN/DevOps-TimeLog',
    payload: {
      entry_count: allRows.length,
      skipped,
      dedupSkipped,
      phase_a_upserted: upserted,
      phase_b_inserted: inserted,
      unchanged,
      collection: usedCollection,
      duration_ms: durationMs,
    },
    status: 'processed',
    processed_at: new Date().toISOString(),
  })

  // ── Persist sync run status to hub_sync_runs / hub_sync_jobs ──
  const { data: syncJob } = await sb
    .from('hub_sync_jobs')
    .select('id')
    .eq('job_key', 'devops-sync-timelog')
    .maybeSingle()

  if (syncJob?.id) {
    await sb.from('hub_sync_runs').insert({
      job_id: syncJob.id,
      status: 'ok',
      started_at: new Date(Date.now() - durationMs).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      items_found: allRows.length,
      items_upserted: upserted + inserted,
    })
    await sb.from('hub_sync_jobs').update({ last_run_at: new Date().toISOString() }).eq('id', syncJob.id)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  try {
    const caller = await validateAuth(req)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    // Admin role check for non-cron callers
    if (caller !== 'cron') {
      const sb = getSupabaseAdmin()
      const { data: roleRow } = await sb
        .from('hub_user_global_roles')
        .select('role')
        .eq('user_id', caller)
        .eq('role', 'admin')
        .maybeSingle()
      const { data: legacyRole } = !roleRow ? await sb
        .from('user_roles')
        .select('role')
        .eq('user_id', caller)
        .eq('role', 'admin')
        .maybeSingle() : { data: roleRow }
      if (!roleRow && !legacyRole) {
        return new Response(JSON.stringify({ error: 'Permissão negada: apenas admins podem executar sincronização' }), {
          status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }
    }

    const pat = Deno.env.get('DEVOPS_PAT')
    if (!pat) {
      return new Response(JSON.stringify({ error: 'DEVOPS_PAT not configured' }), {
        status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    // Start background processing (non-blocking)
    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(
      processTimeLogs(pat).catch(err => {
        console.error('[timelog] Background processing error:', err)
      })
    )

    // Return immediately
    return new Response(JSON.stringify({
      ok: true,
      message: 'TimeLogs sync started in background. Check logs for results.',
    }), {
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[timelog] Fatal error:', err)
    return new Response(JSON.stringify({
      error: 'Internal error',
      detail: err instanceof Error ? err.message : String(err),
    }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
