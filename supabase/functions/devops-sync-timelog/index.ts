// devops-sync-timelog v2.0 — Sincroniza dados do plugin TechsBCN TimeLog do Azure DevOps
// v2.0: Dedup by (work_item_id, log_date, user_name, start_time, time_minutes)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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
    raw: entry,
  }
}

/** Build a dedup key for a normalized row */
function dedupKey(row: NormalizedRow): string {
  return `${row.work_item_id}|${row.log_date}|${row.user_name || ''}|${row.start_time || ''}|${row.time_minutes}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startMs = Date.now()

  try {
    const caller = await validateAuth(req)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const pat = Deno.env.get('DEVOPS_PAT')
    if (!pat) {
      return new Response(JSON.stringify({ error: 'DEVOPS_PAT not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Fetch TimeLog documents ───
    const base64Pat = btoa(`:${pat}`)
    const authHeaders = {
      'Authorization': `Basic ${base64Pat}`,
      'Accept': 'application/json',
    }

    let rawEntries: TimeLogEntry[] = []
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
      let entries: TimeLogEntry[] = []

      if (Array.isArray(payload)) {
        entries = payload
      } else if (payload && typeof payload === 'object') {
        if (Array.isArray(payload.value)) {
          const firstVal = payload.value[0]
          if (firstVal && ('workItemId' in firstVal || 'user' in firstVal || 'date' in firstVal)) {
            entries = payload.value
          } else {
            for (const doc of payload.value) {
              entries.push(...extractEntries(doc))
            }
          }
        } else {
          const numericKeys = Object.keys(payload).filter(k => /^\d+$/.test(k))
          if (numericKeys.length > 0) {
            entries = numericKeys.map(k => payload[k] as TimeLogEntry)
          }
        }
      }

      if (entries.length > 0) {
        rawEntries = entries
        usedCollection = col
        console.log(`[timelog] Found ${entries.length} entries in collection '${col}'`)
        break
      }
    }

    console.log(`[timelog] Final: ${rawEntries.length} entries from collection '${usedCollection || 'none'}'`)

    // ── Normalize & dedup in-memory ────────────────────────────────
    const allRows: NormalizedRow[] = []
    const seenKeys = new Set<string>()
    let skipped = 0
    let dedupSkipped = 0

    for (const entry of rawEntries) {
      const normalized = normalizeEntry(entry, entry.id || usedCollection)
      if (!normalized) { skipped++; continue }

      const key = dedupKey(normalized)
      if (seenKeys.has(key)) { dedupSkipped++; continue }
      seenKeys.add(key)
      allRows.push(normalized)
    }

    console.log(`[timelog] Normalized ${allRows.length} entries (${skipped} invalid, ${dedupSkipped} in-memory dupes)`)

    // ── Check existing rows to avoid inserting duplicates ──────────
    const sb = getSupabaseAdmin()
    let inserted = 0
    let updated = 0
    let unchanged = 0
    const BATCH_SIZE = 200

    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      const batch = allRows.slice(i, i + BATCH_SIZE)

      for (const row of batch) {
        // Check if this exact combination already exists
        let query = sb
          .from('devops_time_logs')
          .select('id, time_minutes, notes')
          .eq('log_date', row.log_date)
          .eq('time_minutes', row.time_minutes)

        if (row.work_item_id != null) {
          query = query.eq('work_item_id', row.work_item_id)
        } else {
          query = query.is('work_item_id', null)
        }

        if (row.user_name != null) {
          query = query.eq('user_name', row.user_name)
        } else {
          query = query.is('user_name', null)
        }

        if (row.start_time != null) {
          query = query.eq('start_time', row.start_time)
        } else {
          query = query.is('start_time', null)
        }

        const { data: existing } = await query.maybeSingle()

        if (existing) {
          // Row already exists — only update if notes changed
          if ((existing.notes || '') !== (row.notes || '')) {
            await sb.from('devops_time_logs')
              .update({ notes: row.notes, raw: row.raw as any, etag: row.etag })
              .eq('id', existing.id)
            updated++
          } else {
            unchanged++
          }
        } else {
          // New row — insert
          const { error: insertError } = await sb
            .from('devops_time_logs')
            .insert({
              work_item_id: row.work_item_id,
              log_date: row.log_date,
              start_time: row.start_time,
              time_minutes: row.time_minutes,
              user_name: row.user_name,
              user_id_ext: row.user_id_ext,
              notes: row.notes,
              etag: row.etag,
              raw: row.raw as any,
            })
          if (!insertError) inserted++
          else console.warn(`[timelog] Insert error: ${insertError.message}`)
        }
      }
    }

    const durationMs = Date.now() - startMs
    console.log(`[timelog] Sync complete: ${inserted} inserted, ${updated} updated, ${unchanged} unchanged in ${durationMs}ms`)

    // ── Audit ────────────────────────────────────────────────────
    await sb.from('hub_raw_ingestions').insert({
      source_type: 'devops_timelog',
      source_key: 'TechsBCN/DevOps-TimeLog',
      payload: { entry_count: allRows.length, skipped, dedupSkipped, inserted, updated, unchanged, collection: usedCollection },
      status: 'processed',
      processed_at: new Date().toISOString(),
    })

    return new Response(JSON.stringify({
      ok: true,
      entries_total: rawEntries.length,
      entries_normalized: allRows.length,
      entries_skipped: skipped,
      dedup_skipped: dedupSkipped,
      inserted,
      updated,
      unchanged,
      duration_ms: durationMs,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[timelog] Fatal error:', err)
    return new Response(JSON.stringify({
      error: 'Internal error',
      detail: err instanceof Error ? err.message : String(err),
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
