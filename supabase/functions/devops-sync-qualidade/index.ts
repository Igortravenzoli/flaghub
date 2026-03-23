import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const QUALITY_WIQL_ID = '7b0a8298-5890-42d8-b280-1121b21786da'
const EM_TESTE_STATE = 'Em Teste'
const QUALITY_ACTIVE_STATES = new Set(['Em Teste', 'Aguardando Deploy'])

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

async function invokeQuerySync(queryId: string): Promise<any> {
  const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/devops-sync-query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': Deno.env.get('CRON_SECRET')!,
    },
    body: JSON.stringify({ query_id: queryId }),
  })

  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || data?.success === false) {
    throw new Error(data?.error || `Falha ao sincronizar query de Qualidade (${resp.status})`)
  }
  return data
}

function countRetornos(updates: any[]): { retornos: number; retornoDetails: Array<{ newValue: string; oldValue?: string; revisedDate: string }> } {
  const emTesteTransitions: Array<{ newValue: string; oldValue?: string; revisedDate: string }> = []
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

async function devopsFetch(path: string): Promise<Response> {
  const pat = Deno.env.get('DEVOPS_PAT')!
  const base64Pat = btoa(`:${pat}`)
  const url = path.startsWith('http') ? path : `https://dev.azure.com/FlagIW/${path}`
  return fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${base64Pat}`,
    },
  })
}

function extractStateChanges(updates: any[]): Array<{ oldValue: string | null; newValue: string; revisedDate: string; revisedBy: string | null }> {
  const changes: Array<{ oldValue: string | null; newValue: string; revisedDate: string; revisedBy: string | null }> = []
  for (const update of updates) {
    const stateField = update.fields?.['System.State']
    if (!stateField) continue
    const revisedDate = update.fields?.['System.ChangedDate']?.newValue
      || update.fields?.['System.ChangedDate']?.oldValue
      || update.revisedDate
    const changedBy = update.revisedBy?.displayName || null
    if (stateField.newValue) {
      changes.push({
        oldValue: stateField.oldValue || null,
        newValue: stateField.newValue,
        revisedDate,
        revisedBy: changedBy,
      })
    }
  }
  return changes
}

function extractIterationChanges(updates: any[]): Array<{ oldValue: string; newValue: string; revisedDate: string }> {
  const changes: Array<{ oldValue: string; newValue: string; revisedDate: string }> = []
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

async function processQualityDerived(admin: any, queryId: string) {
  const { data: queueRows, error: queueErr } = await admin
    .from('devops_query_items_current')
    .select('work_item_id, devops_work_items!inner(id, state, custom_fields, tags, iteration_path, changed_date)')
    .eq('query_id', queryId)

  if (queueErr) {
    throw new Error(`Falha ao carregar fila atual da Qualidade: ${queueErr.message}`)
  }

  const relevant = (queueRows || [])
    .map((row: any) => row.devops_work_items)
    .filter((item: any) => item && QUALITY_ACTIVE_STATES.has(item.state))

  const workItemIds = relevant.map((item: any) => item.id as number)
  if (workItemIds.length === 0) {
    return { currentQueue: 0, retornoProcessed: 0, retornoHits: 0, avioesQa: 0, stateHistoryProcessed: 0 }
  }

  let retornoProcessed = 0
  let retornoHits = 0
  let stateHistoryProcessed = 0

  for (let i = 0; i < workItemIds.length; i += 10) {
    const batch = workItemIds.slice(i, i + 10)
    const batchResults = await Promise.all(
      batch.map(async (wiId: number) => {
        try {
          const resp = await devopsFetch(`Flag.Planejamento/_apis/wit/workitems/${wiId}/updates?api-version=7.1`)
          if (!resp.ok) return { id: wiId, retornos: 0, details: [], stateChanges: [], iterChanges: [] }
          const data = await resp.json()
          const updates = data.value || []
          const { retornos, retornoDetails } = countRetornos(updates)
          const stateChanges = extractStateChanges(updates)
          const iterChanges = extractIterationChanges(updates)
          return { id: wiId, retornos, details: retornoDetails, stateChanges, iterChanges }
        } catch {
          return { id: wiId, retornos: 0, details: [], stateChanges: [], iterChanges: [] }
        }
      })
    )

    const nowIso = new Date().toISOString()
    for (const result of batchResults) {
      const baseItem = relevant.find((item: any) => item.id === result.id)
      const customFields = { ...((baseItem?.custom_fields || {}) as Record<string, any>) }
      customFields['qa_retorno_count'] = result.retornos
      customFields['qa_retorno_details'] = result.details
      customFields['qa_retorno_synced_at'] = nowIso

      const updatePayload: Record<string, any> = { custom_fields: customFields }

      // Persist state_history and iteration_history for full lifecycle timeline
      if (result.stateChanges.length > 0) {
        updatePayload.state_history = result.stateChanges
        stateHistoryProcessed++
      }
      if (result.iterChanges.length > 0) {
        updatePayload.iteration_history = result.iterChanges
        updatePayload.iteration_history_synced_at = nowIso
      }

      await admin
        .from('devops_work_items')
        .update(updatePayload)
        .eq('id', result.id)

      retornoProcessed++
      if (result.retornos > 0) retornoHits++
    }
  }

  const avioesQa = relevant.filter((item: any) => String(item.tags || '').toUpperCase().includes('AVIAO')).length

  return {
    currentQueue: workItemIds.length,
    retornoProcessed,
    retornoHits,
    avioesQa,
    stateHistoryProcessed,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const userId = await validateAuth(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Autenticação obrigatória' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = getSupabaseAdmin()
    const { data: qualityQuery, error: queryErr } = await admin
      .from('devops_queries')
      .select('id, name, wiql_id')
      .eq('wiql_id', QUALITY_WIQL_ID)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (queryErr || !qualityQuery?.id) {
      throw new Error('Query oficial de Qualidade não encontrada no banco')
    }

    const syncResult = await invokeQuerySync(qualityQuery.id)
    const derived = await processQualityDerived(admin, qualityQuery.id)

    await admin.rpc('hub_audit_log', {
      p_action: 'devops_sync_qualidade',
      p_entity_type: 'devops_query',
      p_entity_id: qualityQuery.id,
      p_metadata: {
        wiql_id: QUALITY_WIQL_ID,
        sync_result: syncResult,
        derived,
      },
    })

    return new Response(JSON.stringify({
      success: true,
      query: qualityQuery.name,
      wiql_id: QUALITY_WIQL_ID,
      ...syncResult,
      derived,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[DevOpsSyncQualidade] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})