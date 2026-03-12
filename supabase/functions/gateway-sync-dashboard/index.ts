// gateway-sync-dashboard v1.0 — Sincroniza snapshots do dashboard helpdesk
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  if (!authHeader) return null
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function getGatewayToken(): Promise<string> {
  const baseUrl = Deno.env.get('GATEWAY_BASE_URL')!
  const serviceName = Deno.env.get('GATEWAY_SERVICE_NAME')!
  const serviceSecret = Deno.env.get('GATEWAY_SERVICE_SECRET')!

  const resp = await fetch(`${baseUrl}/api/client-auth/service-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceName, serviceSecret }),
  })

  if (!resp.ok) throw new Error(`Gateway auth failed (${resp.status})`)

  const data = await resp.json()
  return data.token || data.sessionToken || data.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  const admin = getSupabaseAdmin()

  try {
    const userId = await validateAuth(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Autenticação obrigatória' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const periodoTipo = body.periodo_tipo || 'currentMonth'
    const consultor = body.consultor || null
    const dataInicio = body.data_inicio || null
    const dataFim = body.data_fim || null

    // Find sync job
    const { data: syncJob } = await admin
      .from('hub_sync_jobs')
      .select('id')
      .eq('job_key', 'gateway_helpdesk_dashboard_default')
      .maybeSingle()

    let runId: number | null = null
    if (syncJob?.id) {
      const { data: run } = await admin
        .from('hub_sync_runs')
        .insert({ job_id: syncJob.id, status: 'running', started_at: new Date().toISOString() })
        .select('id')
        .single()
      runId = run?.id ?? null
    }

    try {
      const token = await getGatewayToken()
      const baseUrl = Deno.env.get('GATEWAY_BASE_URL')!

      // Build query params
      const params = new URLSearchParams()
      if (periodoTipo) params.set('periodo', periodoTipo)
      if (consultor) params.set('consultor', consultor)
      if (dataInicio) params.set('dataInicio', dataInicio)
      if (dataFim) params.set('dataFim', dataFim)

      const url = `${baseUrl}/api/helpdesk/dashboard?${params}`
      console.log(`[GatewaySyncDashboard] Fetching: ${url}`)

      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      })

      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`Dashboard fetch failed (${resp.status}): ${text}`)
      }

      const dashData = await resp.json()

      // Store raw ingestion
      await admin.from('hub_raw_ingestions').insert({
        source_type: 'api_gateway',
        source_key: 'helpdesk_dashboard',
        payload: dashData,
        status: 'processed',
        processed_at: new Date().toISOString(),
      })

      // Store snapshot
      const snapshot = {
        periodo_tipo: periodoTipo,
        data_inicio: dataInicio || dashData.dataInicio || null,
        data_fim: dataFim || dashData.dataFim || null,
        consultor: consultor,
        total_registros: dashData.totalRegistros || dashData.total || null,
        total_minutos: dashData.totalMinutos || dashData.tempoTotal || null,
        raw: dashData,
        collected_at: new Date().toISOString(),
      }

      await admin.from('helpdesk_dashboard_snapshots').insert(snapshot)

      const duration = Date.now() - startTime
      if (runId) {
        await admin.from('hub_sync_runs').update({
          status: 'ok', finished_at: new Date().toISOString(),
          duration_ms: duration, items_found: 1, items_upserted: 1,
        }).eq('id', runId)
      }

      if (syncJob?.id) {
        await admin.from('hub_sync_jobs').update({ last_run_at: new Date().toISOString() }).eq('id', syncJob.id)
      }

      await admin.rpc('hub_audit_log', {
        p_action: 'gateway_sync_dashboard',
        p_entity_type: 'helpdesk_dashboard',
        p_entity_id: periodoTipo,
        p_metadata: { periodo_tipo: periodoTipo, consultor, duration_ms: duration },
      })

      return new Response(JSON.stringify({
        success: true, periodo_tipo: periodoTipo, snapshot_saved: true, duration_ms: duration,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (innerErr) {
      const duration = Date.now() - startTime
      if (runId) {
        await admin.from('hub_sync_runs').update({
          status: 'error', finished_at: new Date().toISOString(),
          duration_ms: duration, error: (innerErr as Error).message,
        }).eq('id', runId)
      }
      throw innerErr
    }

  } catch (err) {
    console.error('[GatewaySyncDashboard] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
