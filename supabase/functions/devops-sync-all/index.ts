// devops-sync-all v3.0 — Orquestra sync de todas as queries DevOps ativas + children + retorno QA
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEVOPS_ORG = 'FlagIW'
const DEVOPS_PROJECT = 'Flag.Planejamento'
const EM_TESTE_STATE = 'Em Teste'
const BATCH_SIZE = 200
const DEVOPS_API_VERSION = '7.0'
const WIQL_API_VERSION = '7.1'

const CORE_FIELDS = [
  'System.Id', 'System.TeamProject', 'System.WorkItemType', 'System.Title',
  'System.State', 'System.AssignedTo', 'System.Tags',
  'Microsoft.VSTS.Common.Priority', 'Microsoft.VSTS.Scheduling.Effort',
  'System.Parent', 'System.AreaPath', 'System.IterationPath',
  'System.CreatedDate', 'System.ChangedDate',
]

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

// ── DevOps API helpers ─────────────────────────────────────────────

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

interface DevOpsWorkItem {
  id: number
  rev: number
  fields: Record<string, any>
  url: string
  _links?: { html?: { href?: string } }
}

function mapWorkItem(wi: DevOpsWorkItem) {
  const f = wi.fields || {}
  const assignedTo = f['System.AssignedTo']
  const coreFieldSet = new Set(CORE_FIELDS.map(ff => ff.toLowerCase()))
  const customFields: Record<string, any> = {}
  for (const [key, val] of Object.entries(f)) {
    if (!coreFieldSet.has(key.toLowerCase())) customFields[key] = val
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
    web_url: wi._links?.html?.href ?? `https://dev.azure.com/${DEVOPS_ORG}/${encodeURIComponent(f['System.TeamProject'] || DEVOPS_PROJECT)}/_workitems/edit/${wi.id}`,
    api_url: wi.url ?? null,
    custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
    raw: wi,
    synced_at: new Date().toISOString(),
  }
}

async function fetchWorkItemsBatch(ids: number[]): Promise<DevOpsWorkItem[]> {
  const allItems: DevOpsWorkItem[] = []
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE)
    const resp = await devopsFetch(
      `_apis/wit/workitemsbatch?api-version=${DEVOPS_API_VERSION}`,
      {
        method: 'POST',
        body: JSON.stringify({ ids: chunk, fields: CORE_FIELDS, $expand: 'none' }),
      }
    )
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`WorkItemsBatch failed (${resp.status}): ${text}`)
    }
    const data = await resp.json()
    allItems.push(...(data.value || []))
    if (i + BATCH_SIZE < ids.length) await new Promise(r => setTimeout(r, 200))
  }
  return allItems
}

// ── Fetch children via WorkItemLinks (Hierarchy-Forward) ──────────

async function fetchChildrenOfItems(parentIds: number[], admin: any): Promise<{ fetched: number; upserted: number }> {
  if (parentIds.length === 0) return { fetched: 0, upserted: 0 }

  let allChildIds: number[] = []

  // Use WorkItemLinks WIQL for reliable hierarchy traversal
  for (let i = 0; i < parentIds.length; i += 100) {
    const chunk = parentIds.slice(i, i + 100)
    const idList = chunk.join(',')

    const wiql = `
      SELECT [System.Id]
      FROM WorkItemLinks
      WHERE
        (
          [Source].[System.TeamProject] = '${DEVOPS_PROJECT}'
          AND [Source].[System.Id] IN (${idList})
        )
        AND
        (
          [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward'
        )
        AND
        (
          [Target].[System.WorkItemType] IN ('Task', 'Bug')
        )
      MODE (MustContain)
    `

    const resp = await devopsFetch(
      `${DEVOPS_PROJECT}/_apis/wit/wiql?api-version=${WIQL_API_VERSION}`,
      { method: 'POST', body: JSON.stringify({ query: wiql }) }
    )

    if (!resp.ok) {
      const errText = await resp.text()
      console.warn(`[ChildrenSync] WorkItemLinks WIQL failed for chunk ${i}: ${resp.status} - ${errText}`)
      continue
    }

    const data = await resp.json()

    // WorkItemLinks returns workItemRelations with source/target
    const ids = (data.workItemRelations || [])
      .map((r: any) => r.target?.id)
      .filter((id: any) => Number.isInteger(id))

    allChildIds.push(...ids)
    console.log(`[ChildrenSync] Chunk ${i}: found ${ids.length} children via WorkItemLinks`)

    if (i + 100 < parentIds.length) await new Promise(r => setTimeout(r, 300))
  }

  // Deduplicate
  allChildIds = [...new Set(allChildIds)]

  if (allChildIds.length === 0) {
    console.log('[ChildrenSync] No child items found via WorkItemLinks')
    return { fetched: 0, upserted: 0 }
  }

  console.log(`[ChildrenSync] Total unique children: ${allChildIds.length} (Task/Bug)`)

  // Check existing revs for dedup
  let existingRevs = new Map<number, number>()
  for (let i = 0; i < allChildIds.length; i += 1000) {
    const chunk = allChildIds.slice(i, i + 1000)
    const { data: existingItems } = await admin
      .from('devops_work_items')
      .select('id, rev')
      .in('id', chunk)
    for (const e of (existingItems || [])) {
      existingRevs.set(e.id, e.rev)
    }
  }

  // Fetch from DevOps API
  const childItems = await fetchWorkItemsBatch(allChildIds)
  const mapped = childItems.map(mapWorkItem)

  // Filter only changed items
  const toUpsert = mapped.filter(m => {
    const existingRev = existingRevs.get(m.id)
    return existingRev === undefined || existingRev < m.rev
  })

  console.log(`[ChildrenSync] ${toUpsert.length} children need upsert (${mapped.length - toUpsert.length} unchanged)`)

  // Upsert
  let upsertedCount = 0
  for (let i = 0; i < toUpsert.length; i += 100) {
    const chunk = toUpsert.slice(i, i + 100)
    const { error: upsertErr } = await admin
      .from('devops_work_items')
      .upsert(chunk, { onConflict: 'id' })
    if (upsertErr) {
      console.error('[ChildrenSync] Upsert error:', upsertErr.message)
    } else {
      upsertedCount += chunk.length
    }
  }

  return { fetched: allChildIds.length, upserted: upsertedCount }
}

// ── QA Retorno helpers ─────────────────────────────────────────────

interface StateChange {
  newValue: string
  oldValue?: string
  revisedDate: string
}

function countRetornos(updates: any[]): { retornos: number; retornoDetails: StateChange[] } {
  const emTesteTransitions: StateChange[] = []
  for (const update of updates) {
    const stateField = update.fields?.['System.State']
    if (!stateField) continue
    if (stateField.newValue === EM_TESTE_STATE) {
      emTesteTransitions.push({
        newValue: stateField.newValue,
        oldValue: stateField.oldValue ?? undefined,
        revisedDate: update.revisedDate,
      })
    }
  }
  const retornoDetails = emTesteTransitions.length > 1 ? emTesteTransitions.slice(1) : []
  return { retornos: retornoDetails.length, retornoDetails }
}

// ── Iteration History helpers ──────────────────────────────────────

interface IterationChange {
  oldValue: string
  newValue: string
  revisedDate: string
}

function extractIterationChanges(updates: any[]): IterationChange[] {
  const changes: IterationChange[] = []
  for (const update of updates) {
    const iterField = update.fields?.['System.IterationPath']
    if (!iterField || !iterField.newValue) continue
    if (iterField.oldValue && iterField.oldValue !== iterField.newValue) {
      changes.push({
        oldValue: iterField.oldValue,
        newValue: iterField.newValue,
        revisedDate: update.revisedDate,
      })
    }
  }
  return changes
}

async function processIterationHistory(admin: any): Promise<{ processed: number; withChanges: number }> {
  const { data: pbiItems, error } = await admin
    .from('devops_work_items')
    .select('id')
    .in('work_item_type', ['Product Backlog Item', 'User Story'])
    .limit(3000)

  if (error) {
    console.warn('[IterHistory] Failed to fetch PBIs:', error.message)
    return { processed: 0, withChanges: 0 }
  }

  const workItemIds = (pbiItems || []).map((i: any) => i.id).filter(Boolean) as number[]
  if (workItemIds.length === 0) return { processed: 0, withChanges: 0 }

  console.log(`[IterHistory] Processing ${workItemIds.length} PBIs for iteration changes`)
  let processed = 0
  let withChanges = 0

  for (let i = 0; i < workItemIds.length; i += 20) {
    const batch = workItemIds.slice(i, i + 20)
    const batchResults = await Promise.all(
      batch.map(async (wiId) => {
        try {
          const resp = await devopsFetch(
            `${DEVOPS_PROJECT}/_apis/wit/workitems/${wiId}/updates?api-version=7.1`
          )
          if (!resp.ok) return { id: wiId, changes: [] }
          const data = await resp.json()
          const changes = extractIterationChanges(data.value || [])
          return { id: wiId, changes }
        } catch {
          return { id: wiId, changes: [] }
        }
      })
    )

    for (const result of batchResults) {
      if (result.changes.length > 0) {
        await admin
          .from('devops_work_items')
          .update({ iteration_history: result.changes })
          .eq('id', result.id)
        withChanges++
      } else {
        await admin
          .from('devops_work_items')
          .update({ iteration_history: null })
          .eq('id', result.id)
      }
      processed++
    }

    if (i + 10 < workItemIds.length) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  console.log(`[IterHistory] Done: ${processed} processed, ${withChanges} with iteration changes`)
  return { processed, withChanges }
}

async function processQaRetornos(admin: any): Promise<{ processed: number; withRetornos: number }> {
  const { data: qaItems, error } = await admin
    .from('vw_qualidade_kpis')
    .select('id')
  if (error) {
    console.warn('[QA-Retorno] Failed to fetch QA items:', error.message)
    return { processed: 0, withRetornos: 0 }
  }

  const workItemIds = (qaItems || []).map((i: any) => i.id).filter(Boolean) as number[]
  if (workItemIds.length === 0) return { processed: 0, withRetornos: 0 }

  console.log(`[QA-Retorno] Processing ${workItemIds.length} work items`)
  let processed = 0
  let withRetornos = 0

  for (let i = 0; i < workItemIds.length; i += 10) {
    const batch = workItemIds.slice(i, i + 10)
    const batchResults = await Promise.all(
      batch.map(async (wiId) => {
        try {
          const resp = await devopsFetch(
            `${DEVOPS_PROJECT}/_apis/wit/workitems/${wiId}/updates?api-version=7.1`
          )
          if (!resp.ok) return { id: wiId, retornos: 0, details: [] }
          const data = await resp.json()
          const { retornos, retornoDetails } = countRetornos(data.value || [])
          return { id: wiId, retornos, details: retornoDetails }
        } catch {
          return { id: wiId, retornos: 0, details: [] }
        }
      })
    )

    for (const result of batchResults) {
      const { data: existing } = await admin
        .from('devops_work_items')
        .select('custom_fields')
        .eq('id', result.id)
        .single()

      const customFields = (existing?.custom_fields as Record<string, any>) || {}
      customFields['qa_retorno_count'] = result.retornos
      customFields['qa_retorno_details'] = result.details
      customFields['qa_retorno_synced_at'] = new Date().toISOString()

      await admin
        .from('devops_work_items')
        .update({ custom_fields: customFields })
        .eq('id', result.id)

      processed++
      if (result.retornos > 0) withRetornos++
    }

    if (i + 10 < workItemIds.length) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  console.log(`[QA-Retorno] Done: ${processed} processed, ${withRetornos} with retornos`)
  return { processed, withRetornos }
}

// ── Main handler ───────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const admin = getSupabaseAdmin()

  try {
    const userId = await validateAuth(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Autenticação obrigatória' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Step 1: Sync all active queries ──
    const { data: queries, error: qErr } = await admin
      .from('devops_queries')
      .select('id, name, is_active')
      .eq('is_active', true)

    if (qErr) throw qErr

    if (!queries || queries.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Nenhuma query ativa', results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[DevOpsSyncAll] Syncing ${queries.length} active queries`)

    const results: Array<{ query_id: string; name: string; success: boolean; detail?: any; error?: string }> = []
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const isCron = validateCronSecret(req)
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (isCron) {
      forwardHeaders['x-cron-secret'] = Deno.env.get('CRON_SECRET')!
    } else {
      forwardHeaders['Authorization'] = req.headers.get('authorization')!
    }

    for (const query of queries) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/devops-sync-query`, {
          method: 'POST',
          headers: forwardHeaders,
          body: JSON.stringify({ query_id: query.id }),
        })

        const data = await resp.json()
        results.push({
          query_id: query.id,
          name: query.name,
          success: data.success ?? resp.ok,
          detail: data,
        })
      } catch (err) {
        results.push({
          query_id: query.id,
          name: query.name,
          success: false,
          error: (err as Error).message,
        })
      }

      await new Promise(r => setTimeout(r, 500))
    }

    const succeeded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    // ── Step 1.5 + 2: Offload heavy work to background ──
    // Children sync + QA retorno run after response is sent
    const backgroundWork = async () => {
      const bgAdmin = getSupabaseAdmin()
      let childrenResult = { fetched: 0, upserted: 0 }
      let qaRetorno = { processed: 0, withRetornos: 0 }
      let iterHistory = { processed: 0, withChanges: 0 }

      // Run iteration history FIRST (highest priority, newest feature)
      try {
        console.log('[DevOpsSyncAll:BG] Starting iteration history sync...')
        iterHistory = await processIterationHistory(bgAdmin)
        console.log(`[DevOpsSyncAll:BG] Iteration history done: ${iterHistory.processed} processed, ${iterHistory.withChanges} with changes`)
      } catch (iterErr) {
        console.error('[DevOpsSyncAll:BG] Iteration history error:', (iterErr as Error).message)
      }

      // Then children sync
      try {
        console.log('[DevOpsSyncAll:BG] Fetching child work items (Tasks/Bugs)...')
        const { data: pbiItems } = await bgAdmin
          .from('devops_work_items')
          .select('id')
          .in('work_item_type', ['Product Backlog Item', 'User Story', 'Feature'])
          .limit(2000)

        const pbiIds = (pbiItems || []).map((i: any) => i.id) as number[]
        console.log(`[DevOpsSyncAll:BG] Found ${pbiIds.length} PBIs to check for children`)

        childrenResult = await fetchChildrenOfItems(pbiIds, bgAdmin)
        console.log(`[DevOpsSyncAll:BG] Children sync: ${childrenResult.fetched} found, ${childrenResult.upserted} upserted`)
      } catch (childErr) {
        console.error('[DevOpsSyncAll:BG] Children sync error:', (childErr as Error).message)
      }

      // QA retorno last
      try {
        console.log('[DevOpsSyncAll:BG] Starting QA retorno calculation...')
        qaRetorno = await processQaRetornos(bgAdmin)
      } catch (qaErr) {
        console.error('[DevOpsSyncAll:BG] QA retorno error:', (qaErr as Error).message)
      }

      // Audit log with full results
      await bgAdmin.rpc('hub_audit_log', {
        p_action: 'devops_sync_all',
        p_entity_type: 'devops',
        p_entity_id: null,
        p_metadata: { total: queries!.length, succeeded, failed, children: childrenResult, qa_retorno: qaRetorno, iteration_history: iterHistory },
      })
      console.log('[DevOpsSyncAll:BG] Background work complete')
    }

    // @ts-ignore - EdgeRuntime.waitUntil available in Supabase Edge Functions
    EdgeRuntime.waitUntil(backgroundWork())

    return new Response(JSON.stringify({
      success: failed === 0,
      total: queries.length,
      succeeded,
      failed,
      children: 'processing_in_background',
      qa_retorno: 'processing_in_background',
      iteration_history: 'processing_in_background',
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[DevOpsSyncAll] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
