// gateway-sync-clients v1.1 — Sincroniza clientes do Gateway/VDesk (upsert + inativação de ausentes)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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
    return new Response('ok', { headers: corsHeaders(req) })
  }

  const startTime = Date.now()
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
      //
      // `sistemas` é ordenado antes de qualquer coisa porque o gateway devolve
      // esse array em ordem VARIÁVEL entre coletas. A ordem da origem não
      // carrega significado (ela muda sozinha de uma requisição para a outra),
      // então fixá-la aqui torna determinísticos o array gravado, o
      // `sistemas_label` e principalmente o `source_hash`.
      //
      // Sem isso o hash mudava a cada ciclo em todo cliente com 2+ sistemas —
      // 1.193 dos 2.061. Medido em 26/08/2026: o primeiro ciclo após o filtro
      // de mudança entrar ainda reescreveu 1.058 linhas só por esse motivo.
      const syncTimestamp = new Date().toISOString()
      const normalized = allClients.map((c: any) => {
        const brutos = c.sistemas || c.products || []
        const sistemas = Array.isArray(brutos) ? [...brutos].sort() : brutos
        const row = {
          nome: c.nome || c.name || c.razaoSocial || 'Desconhecido',
          apelido: c.apelido || c.nomeFantasia || null,
          status: c.status || c.situacao || 'ativo',
          bandeira: c.bandeira || c.flagBandeira || null,
          sistemas,
          sistemas_label: Array.isArray(sistemas) ? sistemas.join(', ') : (c.sistemasLabel || null),
        }
        // Hash do conteúdo normalizado, não do payload bruto: `hashPayload(c)`
        // via JSON.stringify herdava a instabilidade de ordem acima, e ainda
        // disparava escrita por campo do gateway que nem gravamos.
        return {
          ...row,
          source_hash: hashPayload([
            row.nome, row.apelido, row.status, row.bandeira, row.sistemas_label,
          ]),
          synced_at: syncTimestamp,
          raw: c,
        }
      })

      // Estado atual da base — alimenta o filtro de mudança E a reconciliação
      // abaixo, numa leitura só.
      //
      // PAGINADO de propósito: o PostgREST desta instância roda com
      // `max_rows = 1000` e a base tem 2.061 clientes. Sem paginar, o mapa vinha
      // com os primeiros mil e os 1.061 restantes caíam no ramo "cliente novo"
      // do filtro logo abaixo, sendo reescritos a cada ciclo — exatamente o
      // desperdício que este patch existe para eliminar.
      //
      // Medido em 26/08/2026: 1.058 linhas reescritas por ciclo com TODOS os
      // campos idênticos, `source_hash` inclusive. `.order('id')` é obrigatório:
      // sem ordem estável a paginação pode repetir ou pular linhas.
      const PAGINA = 1000
      type ClienteExistente = { id: number; nome: string; source_hash: string | null; status: string | null }
      const existentes: ClienteExistente[] = []
      for (let inicio = 0; ; inicio += PAGINA) {
        const { data, error } = await admin
          .from('vdesk_clients')
          .select('id, nome, source_hash, status')
          .order('id')
          .range(inicio, inicio + PAGINA - 1)

        if (error) {
          throw new Error(`Lookup de clientes existentes falhou: ${error.message}`)
        }
        existentes.push(...((data || []) as ClienteExistente[]))
        if (!data || data.length < PAGINA) break
      }

      console.log(`[GatewaySyncClients] ${existentes.length} clientes ja na base`)

      const porNome = new Map(existentes.map(c => [c.nome, c]))

      // Só escreve quem mudou de fato.
      //
      // `source_hash` existe desde 12/03/2026 e nunca era lido: o sync reescrevia
      // os 2.061 clientes a cada 15 min só para recarimbar `synced_at` — 23,6
      // milhões de UPDATEs, 11.477 por linha. Ver análise de Disk IO de 26/08/2026.
      //
      // A comparação de `status` é obrigatória junto com a de hash: um cliente
      // inativado localmente pela reconciliação volta com o MESMO payload (e
      // portanto o mesmo hash) quando reaparece na carga. Sem essa segunda
      // condição ele nunca seria reativado.
      const mudaram = normalized.filter(c => {
        const atual = porNome.get(c.nome)
        if (!atual) return true                              // cliente novo
        if (atual.source_hash !== c.source_hash) return true  // payload mudou
        return atual.status !== c.status                      // reativação pendente
      })

      console.log(`[GatewaySyncClients] ${mudaram.length} de ${normalized.length} clientes mudaram`)

      // Upsert in chunks using nome as natural key (unique index)
      let upsertedCount = 0
      let upsertErrors = 0
      for (let i = 0; i < mudaram.length; i += 100) {
        const chunk = mudaram.slice(i, i + 100)
        const { error } = await admin.from('vdesk_clients').upsert(chunk, {
          onConflict: 'nome',
          ignoreDuplicates: false,
        })
        if (error) {
          console.error(`[GatewaySyncClients] Upsert chunk error:`, error.message)
          upsertErrors++
        } else {
          upsertedCount += chunk.length
        }
      }

      // Reconciliação: quem não veio na carga saiu da base VDesk — marcar Inativo.
      // Só roda com carga não-vazia e sem nenhum chunk com erro, para nunca
      // inativar em massa por falha parcial de upsert.
      //
      // Antes o corte era `.lt('synced_at', syncTimestamp)`, o que EXIGIA
      // recarimbar todas as linhas a cada ciclo para funcionar — era esse
      // requisito que sustentava os 23,6 milhões de UPDATEs. Agora o diff sai
      // da leitura acima e só as linhas que realmente mudam de status são escritas.
      let deactivatedCount = 0
      if (normalized.length > 0 && upsertErrors === 0) {
        const nomesNaCarga = new Set(normalized.map(c => c.nome))
        const idsParaInativar = (existentes || [])
          .filter(c => !nomesNaCarga.has(c.nome) && c.status !== 'Inativo')
          .map(c => c.id)

        for (let i = 0; i < idsParaInativar.length; i += 100) {
          const { data: deactivated, error: deactError } = await admin
            .from('vdesk_clients')
            .update({ status: 'Inativo', synced_at: syncTimestamp })
            .in('id', idsParaInativar.slice(i, i + 100))
            .select('id, nome')
          if (deactError) {
            console.error('[GatewaySyncClients] Deactivation error:', deactError.message)
          } else if (deactivated && deactivated.length > 0) {
            deactivatedCount += deactivated.length
            console.log(`[GatewaySyncClients] Deactivated ${deactivated.length} stale clients:`, deactivated.map(d => d.nome).join(', '))
          }
        }
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
        p_metadata: { total: allClients.length, upserted: upsertedCount, deactivated: deactivatedCount, duration_ms: duration },
      })

      return new Response(JSON.stringify({
        success: true, total: allClients.length, upserted: upsertedCount, deactivated: deactivatedCount, duration_ms: duration,
      }), { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

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
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
