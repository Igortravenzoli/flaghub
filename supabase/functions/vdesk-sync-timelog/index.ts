// vdesk-sync-timelog v1.0
// ----------------------------------------------------------------------------
// Espelha apontamentos VDESK (Tb_Avd + HISTORICOOS + ATENDIMENTO) com Task
// DevOps preenchida → tabela `vdesk_time_logs` (idempotente via vdesk_ext_key).
//
// Comunicação: HTTPS contra o Flag.AI.Gateway (.NET 8) que centraliza acesso
// ao SQL Server VDESK. Autenticação via JWT de serviço emitido pelo próprio
// Gateway (POST /api/client-auth/service-token).
//
// Rota consumida: GET /Flag.Ai.Gateway/api/devops-timelog/apontamentos
//
// Background processing via EdgeRuntime.waitUntil (segue o padrão do
// devops-sync-timelog para evitar limites de CPU em sync grande).
//
// Secrets esperadas (Supabase Edge Secrets):
//   - GATEWAY_BASE_URL          (ex.: https://gateway.flag.com.br/Flag.Ai.Gateway)
//   - GATEWAY_SERVICE_NAME      (ex.: supabase-flaghub)
//   - GATEWAY_SERVICE_SECRET    (= INTERNAL_SERVICE_SECRET no Gateway)
//   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY
//   - CRON_SECRET (opcional, p/ trigger via cron)
// ----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ── Configuração ────────────────────────────────────────────────────────────
const GATEWAY_BASE_URL       = Deno.env.get('GATEWAY_BASE_URL') ?? ''
const GATEWAY_SERVICE_NAME   = Deno.env.get('GATEWAY_SERVICE_NAME')   ?? 'supabase-flaghub'
const GATEWAY_SERVICE_SECRET = Deno.env.get('GATEWAY_SERVICE_SECRET') ?? ''

const PAGE_SIZE_DEFAULT = 500
const MAX_PAGES         = 200   // hard stop p/ evitar loop em caso de bug no Gateway

// ── Tipos ───────────────────────────────────────────────────────────────────
interface ApontamentoDto {
  taskDevOps: number
  numOS: string
  osOrigem: string
  usuario: string
  data: string             // ISO datetime
  horaInicial: string      // HH:mm:ss
  tempoSegundos: number
  horas: number
  minutos: number
  dataHistorico: string    // ISO datetime
}

interface GatewayPagedResponse {
  success: boolean
  data: ApontamentoDto[]
  count: number
  totalPages: number
  currentPage: number
  pageSize: number
  errorCode?: string
  message?: string
}

interface SyncOptions {
  fromDate: string       // YYYY-MM-DD
  toDate:   string       // YYYY-MM-DD
  triggeredBy: string
}

interface SuggestedRange {
  fromDate: string
  toDate: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────
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
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return data.user.id
}

async function isAdmin(userId: string): Promise<boolean> {
  const sb = getSupabaseAdmin()
  const { data: g } = await sb
    .from('hub_user_global_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle()
  if (g) return true

  const { data: l } = await sb
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle()
  return !!l
}

// ── Cache em memória do JWT do Gateway ──────────────────────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null

async function getServiceToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt - now > 60_000) {
    return cachedToken.token
  }

  if (!GATEWAY_BASE_URL || !GATEWAY_SERVICE_SECRET) {
    throw new Error('GATEWAY_BASE_URL e/ou GATEWAY_SERVICE_SECRET não configurados.')
  }

  const url = `${GATEWAY_BASE_URL.replace(/\/$/, '')}/api/client-auth/service-token`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceName:   GATEWAY_SERVICE_NAME,
      serviceSecret: GATEWAY_SERVICE_SECRET,
    }),
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Gateway service-token falhou: ${resp.status} ${body.slice(0, 200)}`)
  }

  const payload = await resp.json() as { sessionToken?: string; expiresAt?: string }
  if (!payload.sessionToken) {
    throw new Error('Gateway service-token: sessionToken ausente.')
  }

  // Conservadoramente assume 90min de validade (Gateway emite com 120min).
  const expiresAt = payload.expiresAt
    ? new Date(payload.expiresAt).getTime()
    : now + 90 * 60_000

  cachedToken = { token: payload.sessionToken, expiresAt }
  return cachedToken.token
}

async function fetchPage(opts: SyncOptions, page: number, pageSize: number): Promise<GatewayPagedResponse> {
  const token = await getServiceToken()
  const url = new URL(`${GATEWAY_BASE_URL.replace(/\/$/, '')}/api/devops-timelog/apontamentos`)
  url.searchParams.set('from', opts.fromDate)
  url.searchParams.set('to',   opts.toDate)
  url.searchParams.set('pageNumber', String(page))
  url.searchParams.set('pageSize',   String(pageSize))

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  })

  // Token expirado / revogado → tenta uma vez forçando refresh
  if (resp.status === 401) {
    cachedToken = null
    const t2 = await getServiceToken()
    const r2 = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${t2}`, 'Accept': 'application/json' },
    })
    if (!r2.ok) {
      const body = await r2.text().catch(() => '')
      throw new Error(`Gateway apontamentos falhou após refresh: ${r2.status} ${body.slice(0, 200)}`)
    }
    return r2.json() as Promise<GatewayPagedResponse>
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Gateway apontamentos falhou: ${resp.status} ${body.slice(0, 200)}`)
  }

  return resp.json() as Promise<GatewayPagedResponse>
}

// ── Background sync ─────────────────────────────────────────────────────────
async function runSync(opts: SyncOptions, runId: string) {
  const sb = getSupabaseAdmin()
  const startMs = Date.now()
  let totalFetched = 0
  let totalUpserted = 0
  let pagesFetched = 0
  let lastError: string | null = null

  try {
    const first = await fetchPage(opts, 1, PAGE_SIZE_DEFAULT)
    if (!first.success) {
      throw new Error(`Gateway respondeu success=false: ${first.errorCode ?? '?'} ${first.message ?? ''}`)
    }

    const totalPages = Math.min(first.totalPages || 0, MAX_PAGES)
    pagesFetched = 1
    totalFetched += first.data.length
    totalUpserted += await persistPage(sb, first.data)

    for (let p = 2; p <= totalPages; p++) {
      const page = await fetchPage(opts, p, PAGE_SIZE_DEFAULT)
      if (!page.success) {
        lastError = `page ${p}: ${page.errorCode ?? '?'} ${page.message ?? ''}`
        break
      }
      pagesFetched++
      totalFetched += page.data.length
      totalUpserted += await persistPage(sb, page.data)
    }
  } catch (err) {
    lastError = (err as Error).message
    console.error('[vdesk-sync-timelog] erro:', lastError)
  }

  const durationMs = Date.now() - startMs
  await sb.from('timelog_sync_runs').update({
    finished_at:   new Date().toISOString(),
    duration_ms:   durationMs,
    rows_fetched:  totalFetched,
    rows_inserted: totalUpserted,
    pages_fetched: pagesFetched,
    status:        lastError ? (totalFetched > 0 ? 'partial' : 'error') : 'ok',
    error_message: lastError,
  }).eq('id', runId)

  console.log(`[vdesk-sync-timelog] done in ${durationMs}ms — fetched=${totalFetched} upserted=${totalUpserted} pages=${pagesFetched} err=${lastError ?? 'none'}`)
}

async function persistPage(sb: ReturnType<typeof getSupabaseAdmin>, rows: ApontamentoDto[]): Promise<number> {
  if (rows.length === 0) return 0

  const payload = rows.map(r => ({
    task_devops:    r.taskDevOps,
    num_os:         r.numOS,
    os_origem:      r.osOrigem || null,
    usuario_vdesk:  (r.usuario || '').trim(),
    log_date:       (r.data || '').slice(0, 10),
    start_time:     r.horaInicial || null,
    tempo_segundos: r.tempoSegundos,
    horas:          r.horas,
    minutos:        r.minutos,
    data_historico: r.dataHistorico,
    raw:            r as unknown as Record<string, unknown>,
  }))

  const { error, count } = await sb
    .from('vdesk_time_logs')
    .upsert(payload, { onConflict: 'vdesk_ext_key', ignoreDuplicates: false, count: 'exact' })

  if (error) {
    console.warn('[vdesk-sync-timelog] upsert error:', error.message)
    return 0
  }
  return count ?? payload.length
}

function isoDaysAgo(days: number): string {
  const base = new Date()
  base.setDate(base.getDate() - days)
  return base.toISOString().slice(0, 10)
}

function shiftIsoDate(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00`)
  base.setDate(base.getDate() + days)
  return base.toISOString().slice(0, 10)
}

async function getSuggestedRange(sb: ReturnType<typeof getSupabaseAdmin>): Promise<SuggestedRange> {
  const today = new Date().toISOString().slice(0, 10)

  const { data: lastRun } = await sb
    .from('timelog_sync_runs')
    .select('to_date, status')
    .in('status', ['ok', 'partial'])
    .not('to_date', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastRun?.to_date) {
    return {
      fromDate: shiftIsoDate(lastRun.to_date, -1),
      toDate: today,
    }
  }

  return {
    fromDate: isoDaysAgo(7),
    toDate: today,
  }
}

// ── HTTP handler ────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  try {
    const sb = getSupabaseAdmin()

    const caller = await validateAuth(req)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    if (caller !== 'cron') {
      const ok = await isAdmin(caller)
      if (!ok) {
        return new Response(JSON.stringify({ error: 'Permissão negada: apenas admins.' }), {
          status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }
    }

    // Aceita parâmetros via querystring OU body JSON
    const url = new URL(req.url)
    let fromDate = url.searchParams.get('from') || undefined
    let toDate   = url.searchParams.get('to')   || undefined

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        fromDate = body?.from ?? fromDate
        toDate   = body?.to   ?? toDate
      } catch { /* body opcional */ }
    }

    // Defaults: incremental com 1 dia de segurança; fallback para 7 dias na primeira carga
    if (!fromDate || !toDate) {
      const suggestedRange = await getSuggestedRange(sb)
      fromDate ??= suggestedRange.fromDate
      toDate   ??= suggestedRange.toDate
    }

    // Cria run de auditoria
    const triggeredBy = caller === 'cron' ? 'cron' : `admin:${caller}`
    const { data: run, error: runErr } = await sb
      .from('timelog_sync_runs')
      .insert({
        from_date:    fromDate,
        to_date:      toDate,
        triggered_by: triggeredBy,
        gateway_url:  GATEWAY_BASE_URL || null,
      })
      .select('id').single()

    if (runErr || !run) {
      throw new Error(`Falha ao criar run: ${runErr?.message ?? 'unknown'}`)
    }

    // @ts-ignore EdgeRuntime disponível em Supabase Edge Functions
    EdgeRuntime.waitUntil(
      runSync({ fromDate, toDate, triggeredBy }, run.id).catch(err => {
        console.error('[vdesk-sync-timelog] background error:', err)
      })
    )

    return new Response(JSON.stringify({
      ok: true,
      runId: run.id,
      from:  fromDate,
      to:    toDate,
      message: 'Sync iniciado em background. Acompanhe via timelog_sync_runs.',
    }), {
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[vdesk-sync-timelog] fatal:', err)
    return new Response(JSON.stringify({ error: 'Internal error', detail: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
