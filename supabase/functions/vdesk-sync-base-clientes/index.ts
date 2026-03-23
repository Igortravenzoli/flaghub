// gateway-sync-clients v1.0 — Sincroniza clientes ativos do Gateway/VDesk
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

async function getGatewayToken(): Promise<string> {
  const baseUrl = Deno.env.get('GATEWAY_BASE_URL')!
  const serviceName = Deno.env.get('GATEWAY_SERVICE_NAME')!
  const serviceSecret = Deno.env.get('GATEWAY_SERVICE_SECRET')!

  const resp = await fetch(`${baseUrl}/api/client-auth/service-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceName, serviceSecret }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Gateway auth failed (${resp.status}): ${text}`)
  }

  const data = await resp.json()
  return data.token || data.sessionToken || data.access_token
}

function hashPayload(obj: any): string {
  const str = JSON.stringify(obj)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString(36)
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
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Find associated sync job
    const { data: syncJob } = await admin
      .from('hub_sync_jobs')
      .select('id')
      .eq('job_key', 'gateway_helpdesk_clients_default')
      .maybeSingle()

    const jobId = syncJob?.id

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
      console.log('[GatewaySyncClients] Getting service token...')
      const token = await getGatewayToken()

      const baseUrl = Deno.env.get('GATEWAY_BASE_URL')!
      let allClients: any[] = []
      let pageNumber = 1
      const pageSize = 100
      let totalPages = 1

      do {
        console.log(`[GatewaySyncClients] Fetching pageNumber=${pageNumber}/${totalPages}...`)
        const url = `${baseUrl}/api/helpdesk/clientes?pageNumber=${pageNumber}&pageSize=${pageSize}`
        const resp = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        })

        if (!resp.ok) {
          const text = await resp.text()
          throw new Error(`Clients fetch failed (${resp.status}): ${text}`)
        }

        const data = await resp.json()
        const items = Array.isArray(data) ? data : (data.data ?? data.items ?? data.clientes ?? [])
        totalPages = data.totalPages ?? data.totalPaginas ?? 1

        allClients = allClients.concat(items)
        console.log(`[GatewaySyncClients] Page ${pageNumber}: ${items.length} items, totalPages=${totalPages}`)
        pageNumber++

        if (pageNumber > 50) break // safety
        await new Promise(r => setTimeout(r, 200))
      } while (pageNumber <= totalPages)

      console.log(`[GatewaySyncClients] Fetched ${allClients.length} clients total`)

      // Store raw ingestion
      await admin.from('hub_raw_ingestions').insert({
        source_type: 'api_gateway',
        source_key: 'helpdesk_clientes',
        payload: { total: allClients.length, fetched_at: new Date().toISOString(), sample: allClients.slice(0, 3) },
        status: 'processed',
        processed_at: new Date().toISOString(),
      })

      // Normalize and upsert to vdesk_clients
      const normalized = allClients.map((c: any) => ({
        nome: c.nome || c.name || c.razaoSocial || 'Desconhecido',
        apelido: c.apelido || c.nomeFantasia || null,
        status: c.status || c.situacao || 'ativo',
        bandeira: c.bandeira || c.flagBandeira || null,
        sistemas: c.sistemas || c.products || [],
        sistemas_label: Array.isArray(c.sistemas) ? c.sistemas.join(', ') : (c.sistemasLabel || null),
        source_hash: hashPayload(c),
        synced_at: new Date().toISOString(),
        raw: c,
      }))

      // Upsert in chunks using nome as natural key (unique index)
      let upsertedCount = 0
      for (let i = 0; i < normalized.length; i += 100) {
        const chunk = normalized.slice(i, i + 100)
        const { error } = await admin.from('vdesk_clients').upsert(chunk, {
          onConflict: 'nome',
          ignoreDuplicates: false,
        })
        if (error) {
          console.error(`[GatewaySyncClients] Upsert chunk error:`, error.message)
        }
        upsertedCount += chunk.length
      }

      const duration = Date.now() - startTime
      if (runId) {
        await admin.from('hub_sync_runs').update({
          status: 'ok', finished_at: new Date().toISOString(),
          duration_ms: duration, items_found: allClients.length, items_upserted: upsertedCount,
        }).eq('id', runId)
      }

      if (jobId) {
        await admin.from('hub_sync_jobs').update({ last_run_at: new Date().toISOString() }).eq('id', jobId)
      }

      await admin.rpc('hub_audit_log', {
        p_action: 'gateway_sync_clients',
        p_entity_type: 'vdesk_clients',
        p_entity_id: null,
        p_metadata: { total: allClients.length, upserted: upsertedCount, duration_ms: duration },
      })

      return new Response(JSON.stringify({
        success: true, total: allClients.length, upserted: upsertedCount, duration_ms: duration,
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
    console.error('[GatewaySyncClients] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
