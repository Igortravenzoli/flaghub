// gateway-sync-dashboard v2.0 — Sincroniza snapshots do dashboard helpdesk
// Initial sync: last 90 days with Periodo=custom
// Subsequent syncs: incremental (only since last collected_at)
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

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0] // YYYY-MM-DD
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
    const consultor = body.consultor || null

    // Determine date range: check last snapshot WITH real data to decide initial vs incremental
    const { data: lastSnapshot } = await admin
      .from('helpdesk_dashboard_snapshots')
      .select('collected_at, total_registros')
      .gt('total_registros', 0)
      .order('collected_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let dataInicio: string
    let dataFim: string
    const now = new Date()
    dataFim = body.data_fim || formatDate(now)

    if (body.data_inicio) {
      // Explicit date from request body takes priority
      dataInicio = body.data_inicio
      console.log(`[GatewaySyncDashboard] Explicit date range: ${dataInicio} to ${dataFim}`)
    } else if (lastSnapshot?.collected_at && lastSnapshot.total_registros > 0) {
      // Incremental: from last collected minus 1 day for safety overlap
      const lastDate = new Date(lastSnapshot.collected_at)
      lastDate.setDate(lastDate.getDate() - 1)
      dataInicio = formatDate(lastDate)
      console.log(`[GatewaySyncDashboard] Incremental sync from ${dataInicio}`)
    } else {
      // Initial: last 90 days
      const d = new Date()
      d.setDate(d.getDate() - 90)
      dataInicio = formatDate(d)
      console.log(`[GatewaySyncDashboard] Initial sync - last 90 days from ${dataInicio}`)
    }

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

      // Always use custom period with explicit dates
      const params = new URLSearchParams()
      params.set('Periodo', 'custom')
      params.set('DataInicio', dataInicio)
      params.set('DataFim', dataFim)
      if (consultor) params.set('Consultor', consultor)

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

      // Extract totals from response — check multiple paths
      const acum = dashData.acumulado || {}
      const totalReg = dashData.totalRegistros || acum.totalRegistros || 
        (dashData.registrosPorConsultor || []).reduce((s: number, c: any) => s + (c.totalRegistros || c.quantidade || 0), 0) || null
      const totalMin = dashData.totalMinutos || acum.totalMinutos ||
        (dashData.registrosPorConsultor || []).reduce((s: number, c: any) => s + (c.totalMinutos || 0), 0) || null

      // Store snapshot
      const snapshot = {
        periodo_tipo: 'custom',
        data_inicio: dataInicio,
        data_fim: dataFim,
        consultor: consultor,
        total_registros: totalReg,
        total_minutos: totalMin,
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
        p_entity_id: `${dataInicio}_${dataFim}`,
        p_metadata: { data_inicio: dataInicio, data_fim: dataFim, consultor, duration_ms: duration },
      })

      return new Response(JSON.stringify({
        success: true, data_inicio: dataInicio, data_fim: dataFim,
        snapshot_saved: true, duration_ms: duration,
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
