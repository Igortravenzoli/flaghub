// devops-sync-timelog v1.0 — Sincroniza dados do plugin TechsBCN TimeLog do Azure DevOps
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
  const { data, error } = await supabase.auth.getClaims(token)
  if (error || !data?.claims?.sub) return null
  return data.claims.sub as string
}

// ── TimeLog document shape ─────────────────────────────────────────
// Each "document" from the plugin has an `id` and a `value` array of log entries.
// The exact schema is discovered at runtime; we normalize what we can.

interface TimeLogEntry {
  workItemId?: number
  WorkItemId?: number
  date?: string       // ISO date
  Date?: string
  startTime?: string
  StartTime?: string
  time?: number       // minutes
  Time?: number
  user?: string       // TechsBCN uses 'user' not 'userName'
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
  // The plugin stores logs in `value` — could be an array or keyed object
  if (Array.isArray(doc.value)) return doc.value
  if (doc.value && typeof doc.value === 'object') {
    // Try to extract arrays from nested keys
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

function normalizeEntry(entry: TimeLogEntry, docId: string): Record<string, unknown> | null {
  // Must have at least a date and some time value
  const logDate = entry.date || entry.Date || (entry as Record<string, unknown>).LogDate
  const minutes = entry.time ?? entry.Time ?? (entry as Record<string, unknown>).TimeInMinutes
  if (!logDate || minutes == null) return null

  return {
    work_item_id: entry.workItemId ?? entry.WorkItemId ?? (entry as Record<string, unknown>).workitemid ?? null,
    log_date: String(logDate).substring(0, 10), // YYYY-MM-DD
    start_time: entry.startTime ?? entry.StartTime ?? null,
    time_minutes: Number(minutes) || 0,
    user_name: entry.user ?? entry.userName ?? entry.UserName ?? (entry as Record<string, unknown>).user ?? null,
    user_id_ext: entry.userId ?? entry.UserId ?? null,
    notes: entry.notes ?? entry.Notes ?? null,
    etag: entry.__etag != null ? String(entry.__etag) : (entry.id || docId),
    raw: entry,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startMs = Date.now()

  try {
    // Auth
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

    // ── Fetch TimeLog documents — try multiple collection names ───
    const base64Pat = btoa(`:${pat}`)
    const authHeaders = {
      'Authorization': `Basic ${base64Pat}`,
      'Accept': 'application/json',
    }

    // First, list available collections
    const listUrl = `${TIMELOG_BASE}?api-version=7.1-preview.1`
    console.log(`[timelog] Listing collections: ${listUrl}`)
    const listResp = await fetch(listUrl, { headers: authHeaders })
    if (listResp.ok) {
      const listPayload = await listResp.json()
      console.log(`[timelog] Collections response: ${JSON.stringify(listPayload).substring(0, 2000)}`)
    } else {
      console.log(`[timelog] Collections list failed: ${listResp.status}`)
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

      // The API may return:
      // 1. A plain array of entries (keys are 0,1,2...)
      // 2. An object with { value: [...] }
      let entries: TimeLogEntry[] = []

      if (Array.isArray(payload)) {
        entries = payload
      } else if (payload && typeof payload === 'object') {
        if (Array.isArray(payload.value)) {
          // Could be documents or direct entries
          const firstVal = payload.value[0]
          if (firstVal && ('workItemId' in firstVal || 'user' in firstVal || 'date' in firstVal)) {
            // Direct entries inside value
            entries = payload.value
          } else {
            // Documents with nested entries
            for (const doc of payload.value) {
              entries.push(...extractEntries(doc))
            }
          }
        } else {
          // Object with numeric keys = array-like from JSON parse
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
        if (entries.length > 0) {
          console.log(`[timelog] Sample entry keys: ${Object.keys(entries[0]).join(', ')}`)
        }
        break
      } else {
        console.log(`[timelog] Collection '${col}' has 0 entries`)
      }
    }

    console.log(`[timelog] Final: ${rawEntries.length} entries from collection '${usedCollection || 'none'}'`)

    // ── Extract & normalize entries ────────────────────────────────
    const allRows: Record<string, unknown>[] = []
    let skipped = 0

    for (const entry of rawEntries) {
      const normalized = normalizeEntry(entry, entry.id || usedCollection)
      if (normalized) {
        allRows.push(normalized)
      } else {
        skipped++
      }
    }

    console.log(`[timelog] Extracted ${allRows.length} entries (${skipped} skipped)`)

    // ── Upsert into devops_time_logs ───────────────────────────────
    const sb = getSupabaseAdmin()
    let upserted = 0
    const BATCH_SIZE = 500

    for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
      const batch = allRows.slice(i, i + BATCH_SIZE)
      const { error: upsertError, count } = await sb
        .from('devops_time_logs')
        .upsert(batch as any[], {
          onConflict: 'id',
          ignoreDuplicates: false,
        })

      if (upsertError) {
        // If conflict on 'id' fails (uuid default), try insert with dedup by etag
        console.warn(`[timelog] Upsert batch error: ${upsertError.message}. Trying individual inserts...`)
        for (const row of batch) {
          // Check if already exists by etag + work_item_id + log_date
          const { data: existing } = await sb
            .from('devops_time_logs')
            .select('id')
            .eq('etag', row.etag as string)
            .eq('work_item_id', row.work_item_id as number)
            .eq('log_date', row.log_date as string)
            .maybeSingle()

          if (existing) {
            // Update
            await sb
              .from('devops_time_logs')
              .update({
                time_minutes: row.time_minutes,
                user_name: row.user_name,
                notes: row.notes,
                start_time: row.start_time,
                raw: row.raw,
              })
              .eq('id', existing.id)
            upserted++
          } else {
            // Insert
            const { error: insertError } = await sb
              .from('devops_time_logs')
              .insert(row as any)
            if (!insertError) upserted++
            else console.warn(`[timelog] Insert error: ${insertError.message}`)
          }
        }
      } else {
        upserted += batch.length
      }
    }

    const durationMs = Date.now() - startMs
    console.log(`[timelog] Sync complete: ${upserted} upserted in ${durationMs}ms`)

    // ── Store raw payload for audit ────────────────────────────────
    await sb.from('hub_raw_ingestions').insert({
      source_type: 'devops_timelog',
      source_key: 'TechsBCN/DevOps-TimeLog',
      payload: { document_count: documents.length, entry_count: allRows.length, skipped },
      status: 'processed',
      processed_at: new Date().toISOString(),
    })

    return new Response(JSON.stringify({
      ok: true,
      documents: documents.length,
      entries_found: allRows.length,
      entries_skipped: skipped,
      upserted,
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
