// devops-sync-all v3.0 — Orquestra sync de todas as queries DevOps ativas + children + retorno QA
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const DEVOPS_ORG = 'FlagIW'
const DEVOPS_PROJECT = 'Flag.Planejamento'
const EM_TESTE_STATE = 'Em Teste'
const QUALITY_WIQL_ID = '7b0a8298-5890-42d8-b280-1121b21786da'
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

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function shouldRefreshByChange(
  changedDate: string | null | undefined,
  lastSyncedAt: string | null | undefined
): boolean {
  if (!lastSyncedAt) return true
  const changed = toDateOrNull(changedDate)
  if (!changed) return false
  const synced = toDateOrNull(lastSyncedAt)
  if (!synced) return true
  return changed > synced
}

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

interface EmTesteTransition {
  newValue: string
  oldValue?: string
  revisedDate: string
}

function countRetornos(updates: any[]): { retornos: number; retornoDetails: EmTesteTransition[] } {
  const emTesteTransitions: EmTesteTransition[] = []
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

interface StageConfigRow {
  stage_key: string
  label_pt: string
  sort_order: number
  state_patterns: string[] | null
  pipeline_roles: string[] | null
  iteration_suffix_patterns: string[] | null
  fallback_order: number
  is_active: boolean
}

interface LeadAreaMapRow {
  lead_email: string
  pipeline_role: string
  is_active: boolean
}

interface HealthThresholdRow {
  stage_key: string
  warn_days: number
  critical_days: number
  is_active: boolean
}

function normalizeText(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

function extractSprintCodeFromPath(path: string | null | undefined): string | null {
  if (!path) return null
  const match = path.match(/S\d+-\d{4}/i)
  return match ? match[0].toUpperCase() : null
}

function getDurationDays(fromIso: string | null | undefined, toIso: string | null | undefined): number {
  const from = toDateOrNull(fromIso)
  const to = toDateOrNull(toIso)
  if (!from || !to) return 0
  const diffMs = to.getTime() - from.getTime()
  return Math.max(0, diffMs / 86400000)
}

function isDoneState(state: string | null | undefined): boolean {
  const s = normalizeText(state)
  return s === 'done' || s === 'closed' || s === 'resolved'
}

function isBacklogLikeState(state: string | null | undefined): boolean {
  const s = normalizeText(state)
  return s === 'new' || s === 'to do' || s === 'backlog'
}

function matchArrayValue(value: string, patterns: string[] | null | undefined): boolean {
  if (!patterns || patterns.length === 0) return false
  return patterns.some((pattern) => {
    const p = normalizeText(pattern)
    if (!p) return false
    return value.includes(p)
  })
}

function inferStage(
  state: string | null | undefined,
  leadEmail: string | null | undefined,
  iterationPath: string | null | undefined,
  stageConfig: StageConfigRow[],
  leadRoleByEmail: Map<string, string>
): { stageKey: string; inferenceMethod: 'state_pattern' | 'pipeline_role' | 'iteration_suffix' | 'fallback' } {
  const active = stageConfig
    .filter((row) => row.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
  const normalizedState = normalizeText(state)
  const normalizedPath = normalizeText(iterationPath)
  const leadRole = leadRoleByEmail.get(normalizeText(leadEmail)) || ''

  const byState = active.find((row) => matchArrayValue(normalizedState, row.state_patterns))
  if (byState) return { stageKey: byState.stage_key, inferenceMethod: 'state_pattern' }

  if (leadRole) {
    const byRole = active.find((row) => matchArrayValue(leadRole, row.pipeline_roles))
    if (byRole) return { stageKey: byRole.stage_key, inferenceMethod: 'pipeline_role' }
  }

  const bySuffix = active.find((row) => matchArrayValue(normalizedPath, row.iteration_suffix_patterns))
  if (bySuffix) return { stageKey: bySuffix.stage_key, inferenceMethod: 'iteration_suffix' }

  const fallback = [...active].sort((a, b) => a.fallback_order - b.fallback_order)[0]
  return { stageKey: fallback?.stage_key || 'backlog', inferenceMethod: 'fallback' }
}

function computeHealthStatus(input: {
  currentStage: string | null
  currentStageDays: number
  sprintMigrationCount: number
  overflowCount: number
  qaReturnCount: number
  thresholdsByStage: Map<string, { warn: number; critical: number }>
}): { health: 'verde' | 'amarelo' | 'vermelho'; reasons: string[]; bottleneckStage: string | null } {
  const reasons: string[] = []
  const stage = input.currentStage || 'backlog'
  const threshold = input.thresholdsByStage.get(stage) || { warn: 9999, critical: 99999 }

  const isCriticalAging = input.currentStageDays > threshold.critical
  const isWarnAging = input.currentStageDays > threshold.warn

  if (input.overflowCount > 0) reasons.push('transbordo_real')
  if (input.sprintMigrationCount > 1) reasons.push('multiplas_migracoes')
  if (input.qaReturnCount > 1) reasons.push('multiplos_retorno_qa')
  if (isCriticalAging) reasons.push('aging_critico_etapa')

  if (reasons.length > 0) {
    return { health: 'vermelho', reasons, bottleneckStage: stage }
  }

  if (input.sprintMigrationCount === 1) reasons.push('uma_migracao')
  if (input.qaReturnCount === 1) reasons.push('um_retorno_qa')
  if (isWarnAging) reasons.push('aging_atencao_etapa')

  if (reasons.length > 0) {
    return { health: 'amarelo', reasons, bottleneckStage: isWarnAging ? stage : null }
  }

  return { health: 'verde', reasons: ['fluxo_saudavel'], bottleneckStage: null }
}

async function processLifecycleAndHealth(admin: any): Promise<{ processed: number; skippedTimeout: number }> {
  const startedAt = Date.now()
  const maxMs = 8000

  const [{ data: configRows, error: configErr }, { data: leadRows, error: leadErr }, { data: thresholdRows, error: thresholdErr }] = await Promise.all([
    admin
      .from('pbi_stage_config')
      .select('stage_key, label_pt, sort_order, state_patterns, pipeline_roles, iteration_suffix_patterns, fallback_order, is_active')
      .eq('is_active', true),
    admin
      .from('devops_lead_area_map')
      .select('lead_email, pipeline_role, is_active')
      .eq('is_active', true),
    admin
      .from('pbi_health_thresholds')
      .select('stage_key, warn_days, critical_days, is_active')
      .eq('is_active', true),
  ])

  if (configErr || leadErr || thresholdErr) {
    console.error('[LifecycleHealth] Failed to load configs:', configErr?.message || leadErr?.message || thresholdErr?.message)
    return { processed: 0, skippedTimeout: 0 }
  }

  const stageConfig = (configRows || []) as StageConfigRow[]
  const leadRoleByEmail = new Map<string, string>()
  for (const row of (leadRows || []) as LeadAreaMapRow[]) {
    leadRoleByEmail.set(normalizeText(row.lead_email), normalizeText(row.pipeline_role))
  }

  const thresholdsByStage = new Map<string, { warn: number; critical: number }>()
  for (const row of (thresholdRows || []) as HealthThresholdRow[]) {
    thresholdsByStage.set(row.stage_key, {
      warn: Number(row.warn_days || 0),
      critical: Number(row.critical_days || 0),
    })
  }

  const { data: pbiItems, error: pbiErr } = await admin
    .from('devops_work_items')
    .select('id, work_item_type, state, iteration_path, assigned_to_unique, created_date, changed_date, custom_fields, iteration_history')
    .in('work_item_type', ['Product Backlog Item', 'User Story'])
    .limit(3000)

  if (pbiErr) {
    console.error('[LifecycleHealth] Failed to fetch PBIs:', pbiErr.message)
    return { processed: 0, skippedTimeout: 0 }
  }

  const pbiIds = (pbiItems || []).map((row: any) => row.id).filter(Boolean)
  if (pbiIds.length === 0) return { processed: 0, skippedTimeout: 0 }

  const [{ data: summaryRows }, { data: queryRows }] = await Promise.all([
    admin
      .from('pbi_lifecycle_summary')
      .select('work_item_id, computed_at')
      .in('work_item_id', pbiIds),
    admin
      .from('devops_query_items_current')
      .select('work_item_id, query_id')
      .in('work_item_id', pbiIds),
  ])

  const queryIds = [...new Set((queryRows || []).map((row: any) => row.query_id).filter(Boolean))]
  let queriesById = new Map<string, string>()
  if (queryIds.length > 0) {
    const { data: queryDefs } = await admin
      .from('devops_queries')
      .select('id, sector')
      .in('id', queryIds)
    for (const q of queryDefs || []) {
      queriesById.set(q.id, q.sector || '')
    }
  }

  const sectorByWorkItem = new Map<number, string>()
  for (const row of queryRows || []) {
    if (sectorByWorkItem.has(row.work_item_id)) continue
    const sector = queriesById.get(row.query_id)
    if (sector) sectorByWorkItem.set(row.work_item_id, sector)
  }

  const summaryComputedAt = new Map<number, string>()
  for (const row of summaryRows || []) {
    summaryComputedAt.set(row.work_item_id, row.computed_at)
  }

  const candidates = (pbiItems || []).filter((item: any) =>
    shouldRefreshByChange(item.changed_date, summaryComputedAt.get(item.id))
  )

  if (candidates.length === 0) {
    console.log('[LifecycleHealth] No PBIs changed since last summary')
    return { processed: 0, skippedTimeout: 0 }
  }

  console.log(`[LifecycleHealth] Processing ${candidates.length} changed PBIs`)

  let processed = 0
  let skippedTimeout = 0

  for (const item of candidates) {
    if (Date.now() - startedAt > maxMs) {
      skippedTimeout++
      continue
    }

    const sector = sectorByWorkItem.get(item.id) || null
    const state = item.state as string | null
    const assignedTo = item.assigned_to_unique as string | null
    const createdDate = item.created_date as string | null
    const changedDate = item.changed_date as string | null
    const iterationPath = item.iteration_path as string | null
    const iterationHistory = (item.iteration_history as IterationChange[] | null) || []
    const customFields = (item.custom_fields || {}) as Record<string, any>

    const orderedHistory = [...iterationHistory]
      .filter((h) => h && h.newValue)
      .sort((a, b) => new Date(a.revisedDate).getTime() - new Date(b.revisedDate).getTime())

    const checkpoints: Array<{ at: string; path: string | null }> = []
    if (createdDate) {
      const firstPath = orderedHistory[0]?.oldValue || iterationPath || null
      checkpoints.push({ at: createdDate, path: firstPath })
    }
    for (const ch of orderedHistory) {
      checkpoints.push({ at: ch.revisedDate, path: ch.newValue || null })
    }

    if (checkpoints.length === 0 && changedDate) {
      checkpoints.push({ at: changedDate, path: iterationPath || null })
    }

    const events: any[] = []
    for (let i = 0; i < checkpoints.length; i++) {
      const current = checkpoints[i]
      const next = checkpoints[i + 1]
      const inferred = inferStage(state, assignedTo, current.path, stageConfig, leadRoleByEmail)
      const enteredAt = current.at
      const exitedAt = next?.at || null
      const durationDays = exitedAt ? getDurationDays(enteredAt, exitedAt) : null
      const sprintPath = current.path || null
      const sprintCode = extractSprintCodeFromPath(sprintPath)

      events.push({
        work_item_id: item.id,
        sector,
        stage_key: inferred.stageKey,
        entered_at: enteredAt,
        exited_at: exitedAt,
        duration_days: durationDays,
        sprint_path: sprintPath,
        sprint_code: sprintCode,
        responsible_email: assignedTo,
        inference_method: inferred.inferenceMethod,
        is_overflow: false,
        updated_at: new Date().toISOString(),
      })
    }

    let sprintMigrationCount = 0
    let overflowCount = 0
    let firstCommittedSprint: string | null = null
    let lastCommittedSprint: string | null = null
    let leadOwnerAtCommitment: string | null = null
    let overflowStage: string | null = null
    const overflowByStage: Record<string, number> = {}

    const hasLead = !!leadRoleByEmail.get(normalizeText(assignedTo))
    const currentSprintCode = extractSprintCodeFromPath(iterationPath)
    if (hasLead && currentSprintCode) {
      firstCommittedSprint = currentSprintCode
      lastCommittedSprint = currentSprintCode
      leadOwnerAtCommitment = assignedTo
    }

    for (let i = 0; i < orderedHistory.length; i++) {
      const ch = orderedHistory[i]
      const oldSprint = extractSprintCodeFromPath(ch.oldValue)
      const newSprint = extractSprintCodeFromPath(ch.newValue)

      if (!oldSprint || !newSprint || oldSprint === newSprint) continue

      sprintMigrationCount++

      if (hasLead && !isBacklogLikeState(state) && !isDoneState(state)) {
        overflowCount++
        if (!firstCommittedSprint) firstCommittedSprint = oldSprint
        lastCommittedSprint = newSprint
        if (!leadOwnerAtCommitment) leadOwnerAtCommitment = assignedTo

        const eventAt = events.find((ev) => ev.entered_at === ch.revisedDate)
        const stageAtOverflow = eventAt?.stage_key || inferStage(state, assignedTo, ch.newValue, stageConfig, leadRoleByEmail).stageKey
        overflowStage = stageAtOverflow
        overflowByStage[stageAtOverflow] = (overflowByStage[stageAtOverflow] || 0) + 1

        if (eventAt) eventAt.is_overflow = true
      }
    }

    // Compute QA return count from state_history if available
    let qaReturnCount = 0
    try {
      const { data: wiRow } = await admin
        .from('devops_work_items')
        .select('state_history')
        .eq('id', item.id)
        .maybeSingle()
      const stateHistory = (wiRow?.state_history as StateChange[] | null) || []
      if (stateHistory.length > 0) {
        qaReturnCount = countQaReturns(stateHistory)
      } else {
        qaReturnCount = Number(customFields['qa_retorno_count'] || 0)
      }
    } catch {
      qaReturnCount = Number(customFields['qa_retorno_count'] || 0)
    }
    const nowIso = new Date().toISOString()
    const lastEvent = events.length > 0 ? events[events.length - 1] : null
    const currentStage = lastEvent?.stage_key || inferStage(state, assignedTo, iterationPath, stageConfig, leadRoleByEmail).stageKey
    const currentStageDays = lastEvent
      ? (lastEvent.duration_days ?? getDurationDays(lastEvent.entered_at, nowIso))
      : 0

    const perStageDays: Record<string, number> = {
      backlog: 0,
      design: 0,
      fabrica: 0,
      qualidade: 0,
      deploy: 0,
    }
    for (const ev of events) {
      const d = ev.duration_days ?? getDurationDays(ev.entered_at, nowIso)
      if (perStageDays[ev.stage_key] !== undefined) perStageDays[ev.stage_key] += d
    }

    const totalLeadTimeDays = createdDate ? getDurationDays(createdDate, nowIso) : 0
    const health = computeHealthStatus({
      currentStage,
      currentStageDays,
      sprintMigrationCount,
      overflowCount,
      qaReturnCount,
      thresholdsByStage,
    })

    await admin.from('pbi_stage_events').delete().eq('work_item_id', item.id)
    if (events.length > 0) {
      const { error: eventsErr } = await admin.from('pbi_stage_events').insert(events)
      if (eventsErr) {
        console.error(`[LifecycleHealth] Failed to insert stage events for ${item.id}:`, eventsErr.message)
      }
    }

    const lifecycleRow = {
      work_item_id: item.id,
      sector,
      current_stage: currentStage,
      has_design_stage: events.some((ev) => ev.stage_key === 'design'),
      first_committed_sprint: firstCommittedSprint,
      last_committed_sprint: lastCommittedSprint,
      lead_owner_at_commitment: leadOwnerAtCommitment,
      overflow_stage: overflowStage,
      total_lead_time_days: totalLeadTimeDays,
      backlog_days: perStageDays.backlog,
      design_days: perStageDays.design,
      fabrica_days: perStageDays.fabrica,
      qualidade_days: perStageDays.qualidade,
      deploy_days: perStageDays.deploy,
      sprint_migration_count: sprintMigrationCount,
      overflow_count: overflowCount,
      overflow_by_stage: Object.keys(overflowByStage).length > 0 ? overflowByStage : null,
      qa_return_count: qaReturnCount,
      computed_at: nowIso,
      updated_at: nowIso,
    }

    const healthRow = {
      work_item_id: item.id,
      sector,
      health_status: health.health,
      bottleneck_stage: health.bottleneckStage,
      health_reasons: health.reasons,
      computed_at: nowIso,
      updated_at: nowIso,
    }

    await admin.from('pbi_lifecycle_summary').upsert(lifecycleRow, { onConflict: 'work_item_id' })
    await admin.from('pbi_health_summary').upsert(healthRow, { onConflict: 'work_item_id' })

    processed++
  }

  console.log(`[LifecycleHealth] Done: ${processed} processed, ${skippedTimeout} skipped by time budget`)
  return { processed, skippedTimeout }
}

interface StateChange {
  oldValue: string | null
  newValue: string
  revisedDate: string
  revisedBy: string | null
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

function extractStateChanges(updates: any[]): StateChange[] {
  const changes: StateChange[] = []
  for (const update of updates) {
    const stateField = update.fields?.['System.State']
    if (!stateField) continue
    // First revision has only newValue (creation)
    const revisedDate = update.fields?.['System.ChangedDate']?.newValue
      || update.fields?.['System.ChangedDate']?.oldValue
      || update.revisedDate
    const changedBy = update.revisedBy?.displayName || null
    if (stateField.newValue) {
      changes.push({
        oldValue: stateField.oldValue || null,
        newValue: stateField.newValue,
        revisedDate: revisedDate,
        revisedBy: changedBy,
      })
    }
  }
  return changes
}

function countQaReturns(stateChanges: StateChange[]): number {
  // Count times the task entered "Em Teste" AFTER the first entry
  let emTesteEntries = 0
  for (const change of stateChanges) {
    if (change.newValue === 'Em Teste') {
      emTesteEntries++
    }
  }
  // First entry is normal flow, subsequent ones are QA returns
  return Math.max(0, emTesteEntries - 1)
}

async function processIterationHistory(admin: any): Promise<{ processed: number; withChanges: number }> {
  const { data: pbiItems, error } = await admin
    .from('devops_work_items')
    .select('id, changed_date, iteration_history_synced_at')
    .in('work_item_type', ['Product Backlog Item', 'User Story'])
    .limit(3000)

  if (error) {
    console.warn('[IterHistory] Failed to fetch PBIs:', error.message)
    return { processed: 0, withChanges: 0 }
  }

  const candidates = (pbiItems || []).filter((item: any) =>
    shouldRefreshByChange(item.changed_date, item.iteration_history_synced_at)
  )

  const workItemIds = candidates.map((i: any) => i.id).filter(Boolean) as number[]
  if (workItemIds.length === 0) {
    console.log('[IterHistory] No PBIs with changes since last iteration sync')
    return { processed: 0, withChanges: 0 }
  }

  console.log(`[IterHistory] Processing ${workItemIds.length} PBIs for iteration + state changes`)
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
          if (!resp.ok) return { id: wiId, iterChanges: [], stateChanges: [] }
          const data = await resp.json()
          const updates = data.value || []
          const iterChanges = extractIterationChanges(updates)
          const stateChanges = extractStateChanges(updates)
          return { id: wiId, iterChanges, stateChanges }
        } catch {
          return { id: wiId, iterChanges: [], stateChanges: [] }
        }
      })
    )

    const nowIso = new Date().toISOString()
    for (const result of batchResults) {
      const updatePayload: Record<string, any> = {
        iteration_history_synced_at: nowIso,
      }

      if (result.iterChanges.length > 0) {
        updatePayload.iteration_history = result.iterChanges
        withChanges++
      } else {
        updatePayload.iteration_history = null
      }

      if (result.stateChanges.length > 0) {
        updatePayload.state_history = result.stateChanges
      } else {
        updatePayload.state_history = null
      }

      await admin
        .from('devops_work_items')
        .update(updatePayload)
        .eq('id', result.id)

      processed++
    }

    if (i + 20 < workItemIds.length) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  console.log(`[IterHistory] Done: ${processed} processed, ${withChanges} with iteration changes`)
  return { processed, withChanges }
}

// ── Main handler ───────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  const admin = getSupabaseAdmin()

  try {
    const userId = await validateAuth(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Autenticação obrigatória' }), {
        status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    // Admin role check for non-cron callers
    if (userId !== 'cron') {
      const { data: roleRow } = await admin
        .from('hub_user_global_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle()
      const { data: legacyRole } = !roleRow ? await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle() : { data: roleRow }
      if (!roleRow && !legacyRole) {
        return new Response(JSON.stringify({ error: 'Permissão negada: apenas admins podem executar sincronização' }), {
          status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }
    }

    // ── Step 1: Sync all active queries ──
    const { data: queries, error: qErr } = await admin
      .from('devops_queries')
      .select('id, name, is_active, wiql_id')
      .eq('is_active', true)

    if (qErr) throw qErr

    if (!queries || queries.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Nenhuma query ativa', results: [] }), {
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    const generalQueries = (queries || []).filter((query: any) => query.wiql_id !== QUALITY_WIQL_ID)

    console.log(`[DevOpsSyncAll] Syncing ${generalQueries.length} active general queries (background)`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!

    // ── Find sync job and create run record ──
    const { data: syncJob } = await admin
      .from('hub_sync_jobs')
      .select('id')
      .eq('job_key', 'devops_sync_all_default')
      .maybeSingle()

    const syncJobId = syncJob?.id
    let runId: number | null = null
    if (syncJobId) {
      const { data: run } = await admin
        .from('hub_sync_runs')
        .insert({ job_id: syncJobId, status: 'running', started_at: new Date().toISOString() })
        .select('id')
        .single()
      runId = run?.id ?? null
    }

    const isCron = validateCronSecret(req)
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (isCron) {
      forwardHeaders['x-cron-secret'] = Deno.env.get('CRON_SECRET')!
    } else {
      forwardHeaders['Authorization'] = req.headers.get('authorization')!
    }

    // ALL heavy work runs in background
    const backgroundWork = async () => {
      const bgAdmin = getSupabaseAdmin()
      const bgStartMs = Date.now()

      // ── Step 1: Sync all queries sequentially ──
      const results: Array<{ query_id: string; name: string; success: boolean; error?: string }> = []
      for (const query of generalQueries) {
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/devops-sync-query`, {
            method: 'POST',
            headers: forwardHeaders,
            body: JSON.stringify({ query_id: query.id }),
          })
          const data = await resp.json()
          results.push({ query_id: query.id, name: query.name, success: data.success ?? resp.ok })
        } catch (err) {
          results.push({ query_id: query.id, name: query.name, success: false, error: (err as Error).message })
        }
        await new Promise(r => setTimeout(r, 300))
      }

      const succeeded = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length
      console.log(`[DevOpsSyncAll:BG] Queries done: ${succeeded} ok, ${failed} failed`)

      let childrenResult = { fetched: 0, upserted: 0 }
      let iterHistory = { processed: 0, withChanges: 0 }
      let lifecycleHealth = { processed: 0, skippedTimeout: 0 }

      // ── Step 2: Iteration history ──
      try {
        console.log('[DevOpsSyncAll:BG] Starting iteration history sync...')
        iterHistory = await processIterationHistory(bgAdmin)
        console.log(`[DevOpsSyncAll:BG] Iteration history done: ${iterHistory.processed} processed, ${iterHistory.withChanges} with changes`)
      } catch (iterErr) {
        console.error('[DevOpsSyncAll:BG] Iteration history error:', (iterErr as Error).message)
      }

      // ── Step 3: Children sync ──
      try {
        console.log('[DevOpsSyncAll:BG] Fetching child work items (Tasks/Bugs)...')
        const { data: pbiItems } = await bgAdmin
          .from('devops_work_items')
          .select('id')
          .in('work_item_type', ['Product Backlog Item', 'User Story', 'Feature'])
          .limit(2000)

        const pbiIds = (pbiItems || []).map((i: any) => i.id) as number[]
        childrenResult = await fetchChildrenOfItems(pbiIds, bgAdmin)
        console.log(`[DevOpsSyncAll:BG] Children sync: ${childrenResult.fetched} found, ${childrenResult.upserted} upserted`)
      } catch (childErr) {
        console.error('[DevOpsSyncAll:BG] Children sync error:', (childErr as Error).message)
      }

      // ── Step 4: Lifecycle + health (incremental post-processing) ──
      try {
        lifecycleHealth = await processLifecycleAndHealth(bgAdmin)
      } catch (lifecycleErr) {
        console.error('[DevOpsSyncAll:BG] Lifecycle/Health error:', (lifecycleErr as Error).message)
      }

      // ── Step 5: QA Return detection + alerts ──
      try {
        console.log('[DevOpsSyncAll:BG] Triggering QA return detection...')
        const qaAlertUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/devops-qa-alert`
        const cronSecret = Deno.env.get('CRON_SECRET')
        if (cronSecret) {
          const qaResp = await fetch(qaAlertUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cron-secret': cronSecret,
            },
            body: JSON.stringify({ source: 'devops-sync-all' }),
          })
          const qaData = await qaResp.json().catch(() => ({}))
          console.log(`[DevOpsSyncAll:BG] QA return: ${qaData.detected ?? 0} detected, ${qaData.alerted ?? 0} alerted, ${qaData.resolved ?? 0} resolved`)
        } else {
          console.warn('[DevOpsSyncAll:BG] QA return detection skipped: CRON_SECRET not configured')
        }
      } catch (qaErr) {
        console.error('[DevOpsSyncAll:BG] QA return detection error:', (qaErr as Error).message)
      }

      // Audit log
      await bgAdmin.rpc('hub_audit_log', {
        p_action: 'devops_sync_all',
        p_entity_type: 'devops',
        p_entity_id: null,
        p_metadata: {
          total: generalQueries.length,
          succeeded,
          failed,
          children: childrenResult,
          qa_retorno: { delegated_to: 'devops-sync-qualidade' },
          iteration_history: iterHistory,
          lifecycle_health: lifecycleHealth,
          skipped_quality_wiql_id: QUALITY_WIQL_ID,
        },
      })
      console.log('[DevOpsSyncAll:BG] All background work complete')

      // ── Persist sync run status ──
      const bgDuration = Date.now() - bgStartMs
      if (runId) {
        await bgAdmin.from('hub_sync_runs').update({
          status: failed > 0 ? 'error' : 'ok',
          finished_at: new Date().toISOString(),
          duration_ms: bgDuration,
          items_found: generalQueries.length,
          items_upserted: succeeded,
          error: failed > 0 ? `${failed} queries falharam` : null,
          meta: { children: childrenResult, iteration_history: iterHistory, lifecycle_health: lifecycleHealth },
        }).eq('id', runId)
      }
      if (syncJobId) {
        await bgAdmin.from('hub_sync_jobs').update({ last_run_at: new Date().toISOString() }).eq('id', syncJobId)
      }
    }

    // @ts-ignore - EdgeRuntime.waitUntil available in Supabase Edge Functions
    EdgeRuntime.waitUntil(backgroundWork().catch(err => console.error('[DevOpsSyncAll:BG] Fatal:', err)))

    return new Response(JSON.stringify({
      success: true,
      total: generalQueries.length,
      message: 'Sync started in background',
    }), { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[DevOpsSyncAll] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
