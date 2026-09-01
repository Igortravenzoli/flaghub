import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { devopsAuthHeaders, devopsFetch as devopsHttp } from '../_shared/devops.ts'

const QUALITY_WIQL_ID = '7b0a8298-5890-42d8-b280-1121b21786da'
const EM_TESTE_STATE = 'Em Teste'
const QUALITY_ACTIVE_STATES = new Set(['Em Teste', 'Aguardando Deploy'])

/** Teto de `/updates` por rodada. Ver o cabeçalho de `processQualityDerived`. */
const QA_MAX_PER_RUN = 200
/** Chamadas simultâneas ao `/updates` dentro de um lote. */
const QA_LOTE = 10
/** Pausa entre lotes, espelhando o `sync-all`. */
const QA_PAUSA_LOTE_MS = 300

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

async function invokeQuerySync(queryId: string): Promise<any> {
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const fallbackAnonJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bWdwcGZ5bHR3c3FyeWZ4a2JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDEwMDEsImV4cCI6MjA4NTExNzAwMX0.6TqJwx2_8dbFwbvflSZKVe6MSaagmPosQaxpg0l9Waw'
  const authJwt = anonKey && anonKey.startsWith('eyJ') ? anonKey : fallbackAnonJwt

  let cronSecret = Deno.env.get('CRON_SECRET')

  if (!cronSecret) {
    try {
      const admin = getSupabaseAdmin()
      const { data, error } = await admin.rpc('get_cron_secret')
      if (!error && typeof data === 'string' && data.length > 0) {
        cronSecret = data
      }
    } catch {
      // keep best-effort fallback to env value
    }
  }

  const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/devops-sync-query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authJwt}`,
      ...(cronSecret ? { 'x-cron-secret': cronSecret } : {}),
    },
    body: JSON.stringify({ query_id: queryId }),
  })

  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || data?.success === false) {
    const details = typeof data === 'object' && data !== null ? JSON.stringify(data) : String(data)
    throw new Error(data?.error ? `${data.error} | details=${details}` : `Falha ao sincronizar query de Qualidade (${resp.status}) | details=${details}`)
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

/** Só GET de leitura aqui — o recuo padrão do cliente compartilhado serve. */
async function devopsFetch(path: string): Promise<Response> {
  const url = path.startsWith('http') ? path : `https://dev.azure.com/FlagIW/${path}`
  return devopsHttp(
    url,
    { headers: devopsAuthHeaders(Deno.env.get('DEVOPS_PAT')!) },
    { client: 'sync-qualidade' },
  )
}

/** Mesmo critério do `devops-sync-all`: só relê quem mudou desde a última vez. */
function precisaRevisitar(
  changedDate: string | null | undefined,
  syncedAt: string | null | undefined,
): boolean {
  if (!syncedAt) return true
  const mudou = changedDate ? new Date(changedDate) : null
  if (!mudou || Number.isNaN(mudou.getTime())) return false
  const sincronizou = new Date(syncedAt)
  if (Number.isNaN(sincronizou.getTime())) return true
  return mudou > sincronizou
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

/**
 * Recalcula retorno de QA, histórico de estado e de iteração da fila corrente.
 *
 * INCREMENTAL DESDE 31/08/2026. Antes esta rotina buscava `/updates` de TODOS
 * os itens ativos da fila, a cada 10 minutos, sem filtro e sem pausa entre os
 * lotes — a única das nossas syncs sem os dois. Na prática refazia a fila
 * inteira 144 vezes por dia para descobrir que quase nada tinha mudado, e
 * `/updates` é o endpoint mais caro em identidade que consumimos: cada revisão
 * volta com `ChangedBy`/`AssignedTo` para o Azure resolver. Foi o que apareceu
 * como agravante nosso na investigação do circuit breaker de identidade.
 *
 * Agora só revisita item cujo `changed_date` é posterior ao
 * `custom_fields.qa_retorno_synced_at` que a própria rotina grava — carimbo
 * que já existia, só não estava sendo lido. Nada de coluna nova.
 *
 * O carimbo se invalida sozinho, e isso NÃO é acidente: o `devops-sync-query`
 * que roda logo antes daqui substitui o `custom_fields` inteiro pelo que vem
 * do Azure, mas só nos itens cujo `rev` mudou (o filtro do passo 5 de lá).
 * Item mexido no Azure perde o carimbo e volta para cá; item parado mantém e
 * é pulado. Se um dia aquele upsert passar a MESCLAR `custom_fields` em vez de
 * substituir, o `changed_date > synced_at` abaixo continua segurando a
 * invalidação — está aqui de propósito, e não é redundância morta.
 *
 * O teto por rodada corta pelo mais recente primeiro: se um dia a fila mudar
 * em massa (troca de sprint, reclassificação), o que fica para a rodada
 * seguinte é o passado, não o presente.
 *
 * `force` refaz a fila inteira ignorando o carimbo. Existe para quando a
 * extração mudar (campo novo em `countRetornos`, por exemplo) e o histórico
 * gravado precisar ser reconstruído — não para uso rotineiro.
 */
async function processQualityDerived(admin: any, queryId: string, force = false) {
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

  // `avioesQa` e `currentQueue` são métricas da FILA, não do sync: continuam
  // saindo de `relevant` (a fila inteira) mesmo quando quase nada é revisitado.
  const avioesQa = relevant.filter((item: any) => String(item.tags || '').toUpperCase().includes('AVIAO')).length

  const candidatos = force
    ? [...relevant]
    : relevant.filter((item: any) =>
        precisaRevisitar(item.changed_date, item.custom_fields?.qa_retorno_synced_at))

  // Mais recente primeiro, para o teto abaixo cortar o passado e não o presente.
  candidatos.sort((a: any, b: any) =>
    String(b.changed_date ?? '').localeCompare(String(a.changed_date ?? '')))

  const workItemIds = candidatos.slice(0, QA_MAX_PER_RUN).map((item: any) => item.id as number)
  const adiados = Math.max(0, candidatos.length - workItemIds.length)

  console.log(
    `[Qualidade] fila=${relevant.length} candidatos=${candidatos.length} ` +
    `nesta rodada=${workItemIds.length}${adiados ? ` adiados=${adiados}` : ''}${force ? ' (force)' : ''}`
  )

  if (workItemIds.length === 0) {
    return {
      currentQueue: relevant.length,
      retornoProcessed: 0,
      retornoHits: 0,
      avioesQa,
      stateHistoryProcessed: 0,
      candidatos: 0,
      adiados: 0,
      falhas: 0,
    }
  }

  let retornoProcessed = 0
  let retornoHits = 0
  let stateHistoryProcessed = 0
  let falhas = 0

  for (let i = 0; i < workItemIds.length; i += QA_LOTE) {
    const batch = workItemIds.slice(i, i + QA_LOTE)
    const batchResults = await Promise.all(
      batch.map(async (wiId: number) => {
        // `ok: false` marca a falha para NÃO gravar nada. Enquanto a rotina
        // refazia a fila inteira, tratar erro como "zero retornos" era
        // inofensivo — a rodada seguinte corrigia. Agora que o
        // `qa_retorno_synced_at` é o carimbo que decide quem volta, gravar em
        // cima de uma falha zeraria a contagem do item E o marcaria como
        // sincronizado: ele só seria revisitado se mudasse de novo no Azure.
        const vazio = { id: wiId, ok: false, retornos: 0, details: [], stateChanges: [], iterChanges: [] }
        try {
          const resp = await devopsFetch(`Flag.Planejamento/_apis/wit/workitems/${wiId}/updates?api-version=7.1`)
          if (!resp.ok) {
            console.warn(`[Qualidade] /updates ${wiId} → ${resp.status}; item fica para a próxima rodada`)
            return vazio
          }
          const data = await resp.json()
          const updates = data.value || []
          const { retornos, retornoDetails } = countRetornos(updates)
          const stateChanges = extractStateChanges(updates)
          const iterChanges = extractIterationChanges(updates)
          return { id: wiId, ok: true, retornos, details: retornoDetails, stateChanges, iterChanges }
        } catch (err) {
          console.warn(`[Qualidade] /updates ${wiId} falhou: ${(err as Error).message}`)
          return vazio
        }
      })
    )

    const nowIso = new Date().toISOString()
    for (const result of batchResults) {
      if (!result.ok) {
        falhas++
        continue
      }
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

    // Mesma pausa do `sync-all`: espaça os lotes em vez de emendar um no outro.
    if (i + QA_LOTE < workItemIds.length) {
      await new Promise((r) => setTimeout(r, QA_PAUSA_LOTE_MS))
    }
  }

  return {
    currentQueue: relevant.length,
    retornoProcessed,
    retornoHits,
    avioesQa,
    stateHistoryProcessed,
    candidatos: candidatos.length,
    adiados,
    falhas,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  try {
    const userId = await validateAuth(req)
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Autenticação obrigatória' }), {
        status: 401,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    // Admin role check for non-cron callers
    if (userId !== 'cron') {
      const adminClient = getSupabaseAdmin()
      const { data: roleRow } = await adminClient
        .from('hub_user_global_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle()
      const { data: legacyRole } = !roleRow ? await adminClient
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

    // `{"force": true}` refaz a fila inteira ignorando o carimbo incremental.
    // O cron manda `{}`, então a rodada de rotina segue incremental.
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const force = (body as any)?.force === true

    const syncResult = await invokeQuerySync(qualityQuery.id)
    const derived = await processQualityDerived(admin, qualityQuery.id, force)

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
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[DevOpsSyncQualidade] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})