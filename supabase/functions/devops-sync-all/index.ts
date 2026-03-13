// devops-sync-all v2.0 — Orquestra sync de todas as queries DevOps ativas + cálculo retorno QA
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEVOPS_ORG = 'FlagIW'
const DEVOPS_PROJECT = 'Flag.Planejamento'
const EM_TESTE_STATE = 'Em Teste'

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
  // Allow pg_cron calls via shared secret
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

// ── QA Retorno helpers ─────────────────────────────────────────────

async function devopsFetch(path: string): Promise<Response> {
  const pat = Deno.env.get('DEVOPS_PAT')!
  const base64Pat = btoa(`:${pat}`)
  const url = path.startsWith('http') ? path : `https://dev.azure.com/${DEVOPS_ORG}/${path}`
  return await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${base64Pat}`,
    },
  })
}

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

    // ── Step 2: QA Retorno calculation ──
    console.log('[DevOpsSyncAll] Starting QA retorno calculation...')
    const qaRetorno = await processQaRetornos(admin)

    const succeeded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    // Audit log
    await admin.rpc('hub_audit_log', {
      p_action: 'devops_sync_all',
      p_entity_type: 'devops',
      p_entity_id: null,
      p_metadata: { total: queries.length, succeeded, failed, qa_retorno: qaRetorno },
    })

    return new Response(JSON.stringify({
      success: failed === 0,
      total: queries.length,
      succeeded,
      failed,
      qa_retorno: qaRetorno,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[DevOpsSyncAll] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
