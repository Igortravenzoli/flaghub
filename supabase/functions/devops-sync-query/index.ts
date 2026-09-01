// devops-sync-query v1.0 — Sincroniza work items de uma query DevOps específica
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { devopsAuthHeaders, devopsFetch as devopsHttp } from '../_shared/devops.ts'
import { lerEmLotes } from '../_shared/leitura.ts'

const DEVOPS_ORG = 'FlagIW'
const DEVOPS_PROJECT = 'Flag.Planejamento'
const BATCH_SIZE = 200 // max work items per GET /workitems call
const WIQL_API_VERSION = '7.1'
// Campo personalizado só volta na 7.1 do GET /workitems; a 7.0 era do batch antigo.
const WORKITEMS_API_VERSION = '7.1'

const CORE_FIELDS = [
  'System.Id', 'System.TeamProject', 'System.WorkItemType', 'System.Title',
  'System.State', 'System.AssignedTo', 'System.Tags',
  'Microsoft.VSTS.Common.Priority', 'Microsoft.VSTS.Scheduling.Effort',
  'System.Parent', 'System.AreaPath', 'System.IterationPath',
  'System.CreatedDate', 'System.ChangedDate',
  'System.Description',
  'Microsoft.VSTS.Common.ClosedBy', 'Microsoft.VSTS.Common.ClosedDate',
]

const CORE_FIELD_SET = new Set(CORE_FIELDS.map(f => f.toLowerCase()))

/**
 * Campos personalizados da FLAG. Ficam FORA de CORE_FIELDS de propósito: o
 * montador da linha joga em `custom_fields` tudo que não é core, então basta
 * pedi-los na requisição para serem gravados sem virar coluna nova.
 *
 * Esta função é a que traz os PBIs e Bugs das queries, ou seja, é onde
 * cliente e produto realmente moram — a `devops-sync-all` só busca os filhos.
 * Até 12/08/2026 ela não pedia nenhum campo além dos core, e por isso
 * `custom_fields` estava nulo nos 9.812 itens.
 *
 * ATENÇÃO: OS REF-NAMES ESTÃO TROCADOS NA ORIGEM, e não é engano de leitura:
 *
 *     Custom.PRODUTOSS  contém a picklist de CLIENTES ("Heineken", "Nestle"...)
 *     Custom.CLIENTESS  contém a picklist de PRODUTOS ("Flexx", "Decision"...)
 *
 * Quem criou os campos na FLAG inverteu o nome interno e corrigiu só o rótulo
 * do formulário, e é assim que o Timer (modeia-platform) já consome. NÃO
 * "corrigir" o mapeamento por intuição: trocar inverte cliente e produto no
 * relatório financeiro inteiro. A tradução para a semântica correta vive na
 * view de negócio, não aqui.
 */
const CUSTOM_FIELDS_FLAG = ['Custom.CLIENTESS', 'Custom.PRODUTOSS']

interface DevOpsWorkItem {
  id: number
  rev: number
  fields: Record<string, any>
  url: string
  _links?: { html?: { href?: string } }
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function validateCronSecret(req: Request): Promise<boolean> {
  const cronSecret = req.headers.get('x-cron-secret')
  if (!cronSecret) return false

  const expectedEnv = Deno.env.get('CRON_SECRET')
  if (expectedEnv && cronSecret === expectedEnv) return true

  // Fallback: compare against vault helper to tolerate temporary env drift.
  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin.rpc('get_cron_secret')
    if (error) return false
    return typeof data === 'string' && data.length > 0 && cronSecret === data
  } catch {
    return false
  }
}

async function validateAuth(req: Request): Promise<string | null> {
  if (await validateCronSecret(req)) return 'cron'

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')

  // Allow service-to-service calls from internal edge functions.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (serviceRoleKey && token === serviceRoleKey) return 'service-role-internal'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data, error } = await supabase.auth.getClaims(token)
  if (error || !data?.claims?.sub) return null
  return data.claims.sub as string
}

/** Igual ao `sync-all`: so leitura aqui, incluindo o POST do WIQL. */
async function devopsFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `https://dev.azure.com/${DEVOPS_ORG}/${path}`
  return await devopsHttp(
    url,
    {
      ...options,
      headers: { ...devopsAuthHeaders(Deno.env.get('DEVOPS_PAT')!), ...(options.headers || {}) },
    },
    { client: 'sync-query', retryOn5xx: true },
  )
}

async function runWiql(wiqlOrId: string, mode: string): Promise<number[]> {
  let url: string
  let body: string | undefined
  let method: string

  if (mode === 'saved_query') {
    url = `${DEVOPS_PROJECT}/_apis/wit/wiql/${wiqlOrId}?api-version=${WIQL_API_VERSION}`
    method = 'GET'
  } else {
    url = `${DEVOPS_PROJECT}/_apis/wit/wiql?api-version=${WIQL_API_VERSION}`
    method = 'POST'
    body = JSON.stringify({ query: wiqlOrId })
  }

  const resp = await devopsFetch(url, { method, body })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`WIQL failed (${resp.status}): ${text}`)
  }
  const data = await resp.json()
  return (data.workItems || []).map((wi: any) => wi.id as number)
}

/**
 * Busca work items por id no GET `/{projeto}/_apis/wit/workitems`, não no
 * POST `workitemsbatch`.
 *
 * O batch NÃO devolve campo personalizado, e não é questão de rota: em
 * 12/08/2026 foi testado com a organização sozinha e com o projeto na rota,
 * com os dois ref-names na lista `fields`, e nas duas o payload voltou só com
 * System.* e Microsoft.VSTS.*, sem erro nem aviso. O GET equivalente, com os
 * mesmos ref-names na query string, devolve os dois. O limite de 200 ids por
 * chamada é o mesmo, então o batch não compra nada.
 *
 * `errorPolicy=omit` mantém o comportamento tolerante: id apagado no DevOps
 * sai da resposta em vez de derrubar o lote inteiro com 404.
 */
async function fetchWorkItemsBatch(ids: number[]): Promise<DevOpsWorkItem[]> {
  const allItems: DevOpsWorkItem[] = []
  const fields = [...CORE_FIELDS, ...CUSTOM_FIELDS_FLAG].join(',')
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE)
    const resp = await devopsFetch(
      `${encodeURIComponent(DEVOPS_PROJECT)}/_apis/wit/workitems` +
      `?ids=${chunk.join(',')}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&errorPolicy=omit&api-version=${WORKITEMS_API_VERSION}`
    )
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`WorkItems GET failed (${resp.status}): ${text}`)
    }
    const data = await resp.json()
    allItems.push(...(data.value || []))
    // Small delay between batches
    if (i + BATCH_SIZE < ids.length) await new Promise(r => setTimeout(r, 200))
  }
  return allItems
}

function mapWorkItem(wi: DevOpsWorkItem) {
  const f = wi.fields || {}
  const assignedTo = f['System.AssignedTo']
  const closedBy = f['Microsoft.VSTS.Common.ClosedBy']

  // Separate custom fields
  const customFields: Record<string, any> = {}
  for (const [key, val] of Object.entries(f)) {
    if (!CORE_FIELD_SET.has(key.toLowerCase())) {
      customFields[key] = val
    }
  }

  return {
    id: wi.id,
    rev: wi.rev,
    team_project: f['System.TeamProject'] ?? null,
    work_item_type: f['System.WorkItemType'] ?? null,
    title: f['System.Title'] ?? null,
    state: f['System.State'] ?? null,
    assigned_to: assignedTo?.displayName ?? assignedTo ?? null,
    assigned_to_display: assignedTo?.displayName ?? null,
    assigned_to_unique: assignedTo?.uniqueName ?? null,
    assigned_to_id: assignedTo?.id ?? null,
    tags: f['System.Tags'] ?? null,
    priority: f['Microsoft.VSTS.Common.Priority'] ?? null,
    effort: f['Microsoft.VSTS.Scheduling.Effort'] ?? null,
    parent_id: f['System.Parent'] ?? null,
    area_path: f['System.AreaPath'] ?? null,
    iteration_path: f['System.IterationPath'] ?? null,
    created_date: f['System.CreatedDate'] ?? null,
    changed_date: f['System.ChangedDate'] ?? null,
    closed_by: closedBy?.displayName ?? (typeof closedBy === 'string' ? closedBy : null),
    closed_by_email: closedBy?.uniqueName ?? null,
    closed_date: f['Microsoft.VSTS.Common.ClosedDate'] ?? null,
    web_url: wi._links?.html?.href ?? `https://dev.azure.com/${DEVOPS_ORG}/${encodeURIComponent(f['System.TeamProject'] || DEVOPS_PROJECT)}/_workitems/edit/${wi.id}`,
    api_url: wi.url ?? null,
    custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
    raw: wi,
    synced_at: new Date().toISOString(),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  const startTime = Date.now()
  const admin = getSupabaseAdmin()

  try {
    // Auth check
    const userId = await validateAuth(req)
    if (!userId) {
      return new Response(JSON.stringify({
        error: 'Autenticação obrigatória',
        debug: {
          has_cron_header: !!req.headers.get('x-cron-secret'),
          has_auth_header: !!req.headers.get('authorization'),
          cron_env_set: !!Deno.env.get('CRON_SECRET'),
          service_role_env_set: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        },
      }), {
        status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    // Admin role check for non-cron callers
    if (userId !== 'cron' && userId !== 'service-role-internal') {
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

    const body = await req.json()
    let queryId: string = body.query_id

    // Allow lookup by wiql_id if query_id not provided
    if (!queryId && body.wiql_id) {
      const { data: found } = await admin
        .from('devops_queries')
        .select('id')
        .eq('wiql_id', body.wiql_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (found?.id) queryId = found.id
    }

    if (!queryId) {
      return new Response(JSON.stringify({ error: 'query_id é obrigatório' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    // 1. Load query config
    const { data: queryConfig, error: qErr } = await admin
      .from('devops_queries')
      .select('*')
      .eq('id', queryId)
      .single()

    if (qErr || !queryConfig) {
      return new Response(JSON.stringify({ error: 'Query não encontrada', detail: qErr?.message }), {
        status: 404, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    // Find associated sync job
    const { data: syncJob } = await admin
      .from('hub_sync_jobs')
      .select('id')
      .eq('integration_id', (await admin.from('hub_integrations').select('id').eq('key', 'azure_devops').single()).data?.id ?? '')
      .limit(1)
      .maybeSingle()

    const jobId = syncJob?.id

    // Create sync run
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
      // 2. Run WIQL
      const sourceMode = queryConfig.source_mode || 'saved_query'
      const wiqlInput = sourceMode === 'saved_query'
        ? queryConfig.wiql_id
        : queryConfig.wiql_text

      if (!wiqlInput) throw new Error('Nenhum WIQL configurado para esta query')

      console.log(`[DevOpsSync] Running WIQL for query ${queryConfig.name} (mode: ${sourceMode})`)
      const workItemIds = await runWiql(wiqlInput, sourceMode)
      console.log(`[DevOpsSync] Found ${workItemIds.length} work items`)

      const snapshotAt = new Date().toISOString()

      // Keep snapshot table in sync even when query returns no items.
      if (workItemIds.length === 0) {
        await admin
          .from('devops_query_items_current')
          .delete()
          .eq('query_id', queryId)

        const duration = Date.now() - startTime
        if (runId) {
          await admin.from('hub_sync_runs').update({
            status: 'ok', finished_at: new Date().toISOString(),
            duration_ms: duration, items_found: 0, items_upserted: 0,
          }).eq('id', runId)
        }
        return new Response(JSON.stringify({ success: true, items_found: 0, items_upserted: 0 }), {
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        })
      }

      // 3. Fetch work items in batches
      const workItems = await fetchWorkItemsBatch(workItemIds)
      console.log(`[DevOpsSync] Fetched ${workItems.length} work items`)

      // 4. Get existing revs for dedupe
      //
      // PAGINADO. Era um `.in('id', workItemIds)` numa chamada só, e o
      // PostgREST desta instância corta em `max_rows = 1000`: a query
      // "02-Devops Base Geral" traz 3.978 itens, então chegavam mil `rev` e os
      // outros ~2.978 caíam no `existingRev === undefined` do passo 5 — ou
      // seja, eram reescritos a cada ciclo de cron mesmo sem nenhuma alteração
      // no DevOps. É exatamente o upsert cego que este branch existe para
      // matar, e ele estava no caminho PRINCIPAL enquanto o caminho dos pais,
      // 120 linhas abaixo, já tinha sido corrigido em 26/08/2026.
      //
      // Reescrever linha sem mudança não é só IO desperdiçado: o upsert
      // substitui `custom_fields` inteiro, e é ali que a Qualidade guarda
      // `qa_retorno_count` e o carimbo de sincronismo dela.
      const existingItems = await lerEmLotes<{ id: number; rev: number }>(
        admin, 'devops_work_items', 'id, rev', 'id', workItemIds, { ordem: ['id'] },
      )

      const existingRevs = new Map(existingItems.map(e => [e.id, e.rev]))

      // 5. Filter items that need upsert (rev changed)
      const mapped = workItems.map(mapWorkItem)
      const toUpsert = mapped.filter(m => {
        const existingRev = existingRevs.get(m.id)
        return existingRev === undefined || existingRev < m.rev
      })

      console.log(`[DevOpsSync] ${toUpsert.length} items need upsert (${mapped.length - toUpsert.length} unchanged)`)

      // 6. Upsert in chunks
      let upsertedCount = 0
      for (let i = 0; i < toUpsert.length; i += 100) {
        const chunk = toUpsert.slice(i, i + 100)
        const { error: upsertErr } = await admin
          .from('devops_work_items')
          .upsert(chunk, { onConflict: 'id' })
        if (upsertErr) {
          console.error(`[DevOpsSync] Upsert error:`, upsertErr)
          throw new Error(`Upsert failed: ${upsertErr.message}`)
        }
        upsertedCount += chunk.length
      }

      // 7. Update devops_query_items_current — só o delta (entrou / saiu)
      //
      // Antes: upsert das ~5.150 linhas a cada ciclo só para recarimbar
      // `synced_at`. O par (query_id, work_item_id) É a linha inteira, então
      // nada mais mudava — 69,8 milhões de UPDATEs numa tabela de 5.150 linhas,
      // cada um gerando WAL + full-page image + tupla morta para o autovacuum.
      // Ver análise de Disk IO de 26/08/2026.
      //
      // Agora a leitura do estado atual vem primeiro e alimenta os dois lados
      // do diff. `synced_at` passa a significar "quando este item entrou nesta
      // query", que é mais útil que "última vez que o cron rodou" — esse dado
      // já vive em devops_queries.last_synced_at (passo 9).
      // PAGINADO: o PostgREST desta instancia roda com `max_rows = 1000`. Uma
      // query com mais de mil itens vinha truncada, e o `toDelete` calculado
      // logo abaixo deixava de fora as sobras — item que saiu da query ficava
      // na tabela para sempre. O insert nao sofria (protegido por
      // `ignoreDuplicates`), mas a limpeza sim. `.order` garante ordem estavel
      // entre as paginas. Ver analise de Disk IO de 26/08/2026.
      const PAGINA_SNAPSHOT = 1000
      const existingCurrent: Array<{ work_item_id: number }> = []
      for (let inicio = 0; ; inicio += PAGINA_SNAPSHOT) {
        const { data, error: existingCurrentErr } = await admin
          .from('devops_query_items_current')
          .select('work_item_id')
          .eq('query_id', queryId)
          .order('work_item_id')
          .range(inicio, inicio + PAGINA_SNAPSHOT - 1)

        if (existingCurrentErr) {
          throw new Error(`Current snapshot lookup failed: ${existingCurrentErr.message}`)
        }
        existingCurrent.push(...((data || []) as Array<{ work_item_id: number }>))
        if (!data || data.length < PAGINA_SNAPSHOT) break
      }

      const currentSet = new Set(workItemIds)
      const existingCurrentSet = new Set(existingCurrent.map(row => row.work_item_id))

      const toInsert = workItemIds
        .filter(id => !existingCurrentSet.has(id))
        .map(id => ({ query_id: queryId, work_item_id: id, synced_at: snapshotAt }))

      console.log(`[DevOpsSync] snapshot: +${toInsert.length} novos de ${workItemIds.length} (${workItemIds.length - toInsert.length} já presentes)`)

      for (let i = 0; i < toInsert.length; i += 500) {
        const chunk = toInsert.slice(i, i + 500)
        // ignoreDuplicates protege contra corrida entre duas execuções do cron:
        // se o item entrou entre a leitura acima e este insert, não vira UPDATE.
        const { error: currentErr } = await admin
          .from('devops_query_items_current')
          .upsert(chunk, { onConflict: 'query_id,work_item_id', ignoreDuplicates: true })

        if (currentErr) {
          throw new Error(`Current snapshot insert failed: ${currentErr.message}`)
        }
      }

      const toDelete = [...existingCurrentSet].filter(id => !currentSet.has(id))

      for (let i = 0; i < toDelete.length; i += 1000) {
        const chunk = toDelete.slice(i, i + 1000)
        const { error: deleteErr } = await admin
          .from('devops_query_items_current')
          .delete()
          .eq('query_id', queryId)
          .in('work_item_id', chunk)

        if (deleteErr) {
          throw new Error(`Current snapshot cleanup failed: ${deleteErr.message}`)
        }
      }

      // 8. Fetch missing parents (1 level)
      const parentIds = [...new Set(mapped.map(m => m.parent_id).filter(Boolean))] as number[]
      const existingIds = new Set(workItemIds)
      const missingParentIds = parentIds.filter(pid => !existingIds.has(pid))

      let parentsFetched = 0
      if (missingParentIds.length > 0) {
        console.log(`[DevOpsSync] Fetching ${missingParentIds.length} missing parents`)
        const parentItems = await fetchWorkItemsBatch(missingParentIds)
        const parentMapped = parentItems.map(mapWorkItem)
        parentsFetched = parentMapped.length

        // Mesmo filtro por `rev` do passo 5. Sem ele, todo parent buscado era
        // reescrito a cada ciclo mesmo sem nenhuma alteração no DevOps — o
        // passo 5 fazia certo desde 12/03/2026 e este caminho, criado depois,
        // não herdou a regra. Ver análise de Disk IO de 26/08/2026.
        const parentRevs = new Map<number, number>()
        for (let i = 0; i < missingParentIds.length; i += 1000) {
          const { data: existingParents } = await admin
            .from('devops_work_items')
            .select('id, rev')
            .in('id', missingParentIds.slice(i, i + 1000))
          for (const p of (existingParents || [])) parentRevs.set(p.id, p.rev)
        }

        const parentsToUpsert = parentMapped.filter(p => {
          const existingRev = parentRevs.get(p.id)
          return existingRev === undefined || existingRev < p.rev
        })

        console.log(`[DevOpsSync] ${parentsToUpsert.length} parents need upsert (${parentMapped.length - parentsToUpsert.length} unchanged)`)

        for (let i = 0; i < parentsToUpsert.length; i += 100) {
          const { error: parentErr } = await admin
            .from('devops_work_items')
            .upsert(parentsToUpsert.slice(i, i + 100), { onConflict: 'id' })
          if (parentErr) {
            console.error('[DevOpsSync] Parent upsert error:', parentErr.message)
          }
        }
      }

      // 9. Update query last_synced_at
      await admin.from('devops_queries').update({ last_synced_at: new Date().toISOString() }).eq('id', queryId)

      // 10. Store raw ingestion record
      await admin.from('hub_raw_ingestions').insert({
        source_type: 'devops',
        source_key: `query:${queryConfig.name}`,
        external_id: queryId,
        payload: { query_name: queryConfig.name, item_count: workItemIds.length, ids: workItemIds.slice(0, 50) },
        status: 'processed',
        processed_at: new Date().toISOString(),
      })

      // 11. Finalize sync run
      const duration = Date.now() - startTime
      if (runId) {
        await admin.from('hub_sync_runs').update({
          status: 'ok', finished_at: new Date().toISOString(),
          duration_ms: duration, items_found: workItemIds.length, items_upserted: upsertedCount,
          meta: {
            parents_fetched: parentsFetched,
            unchanged: mapped.length - toUpsert.length,
            current_snapshot_deleted: toDelete.length,
          },
        }).eq('id', runId)
      }

      // Audit log
      await admin.rpc('hub_audit_log', {
        p_action: 'devops_sync_query',
        p_entity_type: 'devops_query',
        p_entity_id: queryId,
        p_metadata: { items_found: workItemIds.length, items_upserted: upsertedCount, duration_ms: duration },
      })

      return new Response(JSON.stringify({
        success: true,
        query: queryConfig.name,
        items_found: workItemIds.length,
        items_upserted: upsertedCount,
        parents_fetched: parentsFetched,
        duration_ms: duration,
      }), { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

    } catch (innerErr) {
      const duration = Date.now() - startTime
      const errMsg = (innerErr as Error).message
      if (runId) {
        await admin.from('hub_sync_runs').update({
          status: 'error', finished_at: new Date().toISOString(),
          duration_ms: duration, error: errMsg,
        }).eq('id', runId)
      }
      throw innerErr
    }

  } catch (err) {
    console.error('[DevOpsSync] Error:', err)
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
