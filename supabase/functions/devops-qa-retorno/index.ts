// devops-qa-retorno v1.0 — Calcula retornos QA (quantas vezes voltou para "Em Teste")
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEVOPS_ORG = 'FlagIW'
const EM_TESTE_STATE = 'Em Teste'

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function validateAuth(req: Request): Promise<string | null> {
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

/**
 * Conta retornos para "Em Teste" de um work item.
 * A primeira transição para "Em Teste" faz parte do fluxo normal e NÃO é contada.
 * Retornos = total de transições para "Em Teste" - 1 (primeira vez).
 */
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

  // First transition to "Em Teste" is normal flow, skip it
  const retornoDetails = emTesteTransitions.length > 1 ? emTesteTransitions.slice(1) : []
  return {
    retornos: retornoDetails.length,
    retornoDetails,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const admin = getSupabaseAdmin()
  const startTime = Date.now()

  try {
    const userId = await validateAuth(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Autenticação obrigatória' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    // Optional: pass specific work_item_ids, otherwise fetch all QA items
    let workItemIds: number[] = body.work_item_ids || []

    if (workItemIds.length === 0) {
      // Fetch all QA work item IDs from the view
      const { data: qaItems, error } = await admin
        .from('vw_qualidade_kpis')
        .select('id')
      if (error) throw new Error(`Failed to fetch QA items: ${error.message}`)
      workItemIds = (qaItems || []).map((i: any) => i.id).filter(Boolean)
    }

    console.log(`[QA-Retorno] Processing ${workItemIds.length} work items`)

    let processed = 0
    let withRetornos = 0
    const results: Array<{ id: number; retornos: number }> = []

    // Process in batches of 10 to avoid rate limits
    for (let i = 0; i < workItemIds.length; i += 10) {
      const batch = workItemIds.slice(i, i + 10)
      
      const batchResults = await Promise.all(
        batch.map(async (wiId) => {
          try {
            const resp = await devopsFetch(
              `Flag.Planejamento/_apis/wit/workitems/${wiId}/updates?api-version=7.1`
            )
            if (!resp.ok) {
              console.warn(`[QA-Retorno] Failed to fetch updates for ${wiId}: ${resp.status}`)
              return { id: wiId, retornos: 0, details: [] }
            }
            const data = await resp.json()
            const { retornos, retornoDetails } = countRetornos(data.value || [])
            return { id: wiId, retornos, details: retornoDetails }
          } catch (err) {
            console.warn(`[QA-Retorno] Error processing ${wiId}:`, err)
            return { id: wiId, retornos: 0, details: [] }
          }
        })
      )

      // Update custom_fields for each item
      for (const result of batchResults) {
        // Read existing custom_fields
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
        results.push({ id: result.id, retornos: result.retornos })
      }

      // Rate limiting: small delay between batches
      if (i + 10 < workItemIds.length) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    const duration = Date.now() - startTime
    console.log(`[QA-Retorno] Done: ${processed} processed, ${withRetornos} with retornos, ${duration}ms`)

    return new Response(JSON.stringify({
      success: true,
      processed,
      with_retornos: withRetornos,
      duration_ms: duration,
      items: results.filter(r => r.retornos > 0), // only return items with retornos
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[QA-Retorno] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
