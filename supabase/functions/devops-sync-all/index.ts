// devops-sync-all v1.0 — Orquestra sync de todas as queries DevOps ativas
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

    // Fetch all active queries
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

    // Invoke devops-sync-query for each query sequentially
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const authHeader = req.headers.get('authorization')!

    for (const query of queries) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/devops-sync-query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
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

      // Delay between queries
      await new Promise(r => setTimeout(r, 500))
    }

    const succeeded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    // Audit log
    await admin.rpc('hub_audit_log', {
      p_action: 'devops_sync_all',
      p_entity_type: 'devops',
      p_entity_id: null,
      p_metadata: { total: queries.length, succeeded, failed },
    })

    return new Response(JSON.stringify({
      success: failed === 0,
      total: queries.length,
      succeeded,
      failed,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[DevOpsSyncAll] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
