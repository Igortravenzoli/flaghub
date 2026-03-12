// devops-sync-query v1.0 — Sincroniza work items de uma query DevOps específica
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEVOPS_ORG = 'FlagIW'
const DEVOPS_PROJECT = 'Flag.Planejamento'
const BATCH_SIZE = 200 // max work items per batch call
const DEVOPS_API_VERSION = '7.0'
const WIQL_API_VERSION = '7.1'

const CORE_FIELDS = [
  'System.Id', 'System.TeamProject', 'System.WorkItemType', 'System.Title',
  'System.State', 'System.AssignedTo', 'System.Tags',
  'Microsoft.VSTS.Common.Priority', 'Microsoft.VSTS.Scheduling.Effort',
  'System.Parent', 'System.AreaPath', 'System.IterationPath',
  'System.CreatedDate', 'System.ChangedDate',
]

const CORE_FIELD_SET = new Set(CORE_FIELDS.map(f => f.toLowerCase()))

interface DevOpsWorkItem {
  id: number
  rev: number
  fields: Record<string, any>
  url: string
  _links?: { html?: { href?: string } }
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function validateAuth(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return null
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function devopsFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const pat = Deno.env.get('DEVOPS_PAT')!
  const base64Pat = btoa(`:${pat}`)
  const url = path.startsWith('http') ? path : `https://dev.azure.com/${DEVOPS_ORG}/${path}`
  return await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${base64Pat}`,
      ...(options.headers || {}),
    },
  })
}

async function runWiql(wiqlOrId: string, mode: string): Promise<number[]> {
  let url: string
  let body: string | undefined
  let method: string

  if (mode === 'saved_query') {
    url = `${DEVOPS_PROJECT}/_apis/wit/wiql/${wiqlOrId}?api-version=${WIQL_API_VERSION}`
    method = 'GET'
  } else {
    url = `${DEVOPS_PROJECT}/_apis/wit/wiql?api-version=${WIQL_API_VERSION}`
    method = 'POST'
    body = JSON.stringify({ query: wiqlOrId })
  }

  const resp = await devopsFetch(url, { method, body })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`WIQL failed (${resp.status}): ${text}`)
  }
  const data = await resp.json()
  return (data.workItems || []).map((wi: any) => wi.id as number)
}

async function fetchWorkItemsBatch(ids: number[]): Promise<DevOpsWorkItem[]> {
  const allItems: DevOpsWorkItem[] = []
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE)
    const resp = await devopsFetch(
      `_apis/wit/workitemsbatch?api-version=${DEVOPS_API_VERSION}`,
      {
        method: 'POST',
        body: JSON.stringify({
          ids: chunk,
          fields: CORE_FIELDS,
          $expand: 'none',
        }),
      }
    )
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`WorkItemsBatch failed (${resp.status}): ${text}`)
    }
    const data = await resp.json()
    allItems.push(...(data.value || []))
    // Small delay between batches
    if (i + BATCH_SIZE < ids.length) await new Promise(r => setTimeout(r, 200))
  }
  return allItems
}

function mapWorkItem(wi: DevOpsWorkItem) {
  const f = wi.fields || {}
  const assignedTo = f['System.AssignedTo']

  // Separate custom fields
  const customFields: Record<string, any> = {}
  for (const [key, val] of Object.entries(f)) {
    if (!CORE_FIELD_SET.has(key.toLowerCase())) {
      customFields[key] = val
    }
  }

  return {
    id: wi.id,
    rev: wi.rev,
    team_project: f['System.TeamProject'] ?? null,
    work_item_type: f['System.WorkItemType'] ?? null,
    title: f['System.Title'] ?? null,
    state: f['System.State'] ?? null,
    assigned_to: assignedTo?.displayName ?? assignedTo ?? null,
    assigned_to_display: assignedTo?.displayName ?? null,
    assigned_to_unique: assignedTo?.uniqueName ?? null,
    assigned_to_id: assignedTo?.id ?? null,
    tags: f['System.Tags'] ?? null,
    priority: f['Microsoft.VSTS.Common.Priority'] ?? null,
    effort: f['Microsoft.VSTS.Scheduling.Effort'] ?? null,
    parent_id: f['System.Parent'] ?? null,
    area_path: f['System.AreaPath'] ?? null,
    iteration_path: f['System.IterationPath'] ?? null,
    created_date: f['System.CreatedDate'] ?? null,
    changed_date: f['System.ChangedDate'] ?? null,
    web_url: wi._links?.html?.href ?? null,
    api_url: wi.url ?? null,
    custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
    raw: wi,
    synced_at: new Date().toISOString(),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  const admin = getSupabaseAdmin()

  try {
    // Auth check
    const userId = await validateAuth(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Autenticação obrigatória' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const queryId: string = body.query_id

    if (!queryId) {
      return new Response(JSON.stringify({ error: 'query_id é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Load query config
    const { data: queryConfig, error: qErr } = await admin
      .from('devops_queries')
      .select('*')
      .eq('id', queryId)
      .single()

    if (qErr || !queryConfig) {
      return new Response(JSON.stringify({ error: 'Query não encontrada', detail: qErr?.message }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Find associated sync job
    const { data: syncJob } = await admin
      .from('hub_sync_jobs')
      .select('id')
      .eq('integration_id', (await admin.from('hub_integrations').select('id').eq('key', 'azure_devops').single()).data?.id ?? '')
      .limit(1)
      .maybeSingle()

    const jobId = syncJob?.id

    // Create sync run
    let runId: number | null = null
    if (jobId) {
      const { data: run } = await admin
        .from('hub_sync_runs')
        .insert({ job_id: jobId, status: 'running', started_at: new Date().toISOString() })
        .select('id')
        .single()
      runId = run?.id ?? null
    }

    try {
      // 2. Run WIQL
      const sourceMode = queryConfig.source_mode || 'saved_query'
      const wiqlInput = sourceMode === 'saved_query'
        ? queryConfig.wiql_id
        : queryConfig.wiql_text

      if (!wiqlInput) throw new Error('Nenhum WIQL configurado para esta query')

      console.log(`[DevOpsSync] Running WIQL for query ${queryConfig.name} (mode: ${sourceMode})`)
      const workItemIds = await runWiql(wiqlInput, sourceMode)
      console.log(`[DevOpsSync] Found ${workItemIds.length} work items`)

      if (workItemIds.length === 0) {
        const duration = Date.now() - startTime
        if (runId) {
          await admin.from('hub_sync_runs').update({
            status: 'ok', finished_at: new Date().toISOString(),
            duration_ms: duration, items_found: 0, items_upserted: 0,
          }).eq('id', runId)
        }
        return new Response(JSON.stringify({ success: true, items_found: 0, items_upserted: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // 3. Fetch work items in batches
      const workItems = await fetchWorkItemsBatch(workItemIds)
      console.log(`[DevOpsSync] Fetched ${workItems.length} work items`)

      // 4. Get existing revs for dedupe
      const { data: existingItems } = await admin
        .from('devops_work_items')
        .select('id, rev')
        .in('id', workItemIds)

      const existingRevs = new Map((existingItems || []).map(e => [e.id, e.rev]))

      // 5. Filter items that need upsert (rev changed)
      const mapped = workItems.map(mapWorkItem)
      const toUpsert = mapped.filter(m => {
        const existingRev = existingRevs.get(m.id)
        return existingRev === undefined || existingRev < m.rev
      })

      console.log(`[DevOpsSync] ${toUpsert.length} items need upsert (${mapped.length - toUpsert.length} unchanged)`)

      // 6. Upsert in chunks
      let upsertedCount = 0
      for (let i = 0; i < toUpsert.length; i += 100) {
        const chunk = toUpsert.slice(i, i + 100)
        const { error: upsertErr } = await admin
          .from('devops_work_items')
          .upsert(chunk, { onConflict: 'id' })
        if (upsertErr) {
          console.error(`[DevOpsSync] Upsert error:`, upsertErr)
          throw new Error(`Upsert failed: ${upsertErr.message}`)
        }
        upsertedCount += chunk.length
      }

      // 7. Update devops_query_items_current (replace set for this query)
      await admin
        .from('devops_query_items_current')
        .delete()
        .eq('query_id', queryId)

      const currentItems = workItemIds.map(id => ({
        query_id: queryId,
        work_item_id: id,
        synced_at: new Date().toISOString(),
      }))

      for (let i = 0; i < currentItems.length; i += 500) {
        const chunk = currentItems.slice(i, i + 500)
        await admin.from('devops_query_items_current').insert(chunk)
      }

      // 8. Fetch missing parents (1 level)
      const parentIds = [...new Set(mapped.map(m => m.parent_id).filter(Boolean))] as number[]
      const existingIds = new Set(workItemIds)
      const missingParentIds = parentIds.filter(pid => !existingIds.has(pid))

      let parentsFetched = 0
      if (missingParentIds.length > 0) {
        console.log(`[DevOpsSync] Fetching ${missingParentIds.length} missing parents`)
        const parentItems = await fetchWorkItemsBatch(missingParentIds)
        const parentMapped = parentItems.map(mapWorkItem)
        if (parentMapped.length > 0) {
          await admin.from('devops_work_items').upsert(parentMapped, { onConflict: 'id' })
          parentsFetched = parentMapped.length
        }
      }

      // 9. Update query last_synced_at
      await admin.from('devops_queries').update({ last_synced_at: new Date().toISOString() }).eq('id', queryId)

      // 10. Store raw ingestion record
      await admin.from('hub_raw_ingestions').insert({
        source_type: 'devops',
        source_key: `query:${queryConfig.name}`,
        external_id: queryId,
        payload: { query_name: queryConfig.name, item_count: workItemIds.length, ids: workItemIds.slice(0, 50) },
        status: 'processed',
        processed_at: new Date().toISOString(),
      })

      // 11. Finalize sync run
      const duration = Date.now() - startTime
      if (runId) {
        await admin.from('hub_sync_runs').update({
          status: 'ok', finished_at: new Date().toISOString(),
          duration_ms: duration, items_found: workItemIds.length, items_upserted: upsertedCount,
          meta: { parents_fetched: parentsFetched, unchanged: mapped.length - toUpsert.length },
        }).eq('id', runId)
      }

      // Audit log
      await admin.rpc('hub_audit_log', {
        p_action: 'devops_sync_query',
        p_entity_type: 'devops_query',
        p_entity_id: queryId,
        p_metadata: { items_found: workItemIds.length, items_upserted: upsertedCount, duration_ms: duration },
      })

      return new Response(JSON.stringify({
        success: true,
        query: queryConfig.name,
        items_found: workItemIds.length,
        items_upserted: upsertedCount,
        parents_fetched: parentsFetched,
        duration_ms: duration,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (innerErr) {
      const duration = Date.now() - startTime
      const errMsg = (innerErr as Error).message
      if (runId) {
        await admin.from('hub_sync_runs').update({
          status: 'error', finished_at: new Date().toISOString(),
          duration_ms: duration, error: errMsg,
        }).eq('id', runId)
      }
      throw innerErr
    }

  } catch (err) {
    console.error('[DevOpsSync] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
