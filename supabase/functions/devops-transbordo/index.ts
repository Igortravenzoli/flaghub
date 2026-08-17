// devops-transbordo v1.0
//
// PRIMEIRA escrita do FlagHub em work items do Azure DevOps. Até aqui o espelho
// era 100% somente-leitura — nenhum PATCH existia no repositório.
//
// Modos (POST body):
//   { mode: 'probe-write' }
//       Testa se o DEVOPS_PAT tem escopo de ESCRITA sem alterar nada: manda um
//       PATCH deliberadamente inválido (campo inexistente). 401/403 = sem
//       permissão; 400 = tem permissão e recusou o campo. Nenhuma revisão é
//       criada em nenhum dos casos.
//
//   { mode: 'classify', workItemIds: number[], dryRun?: boolean }
//       Aplica a tag TRANSBORDO nos itens escolhidos pelo gestor. É a etapa
//       "Classificar": marca o que vai transbordar, sem mover nada.
//
//   { mode: 'migrate', workItemIds?: number[], dryRun?: boolean }
//       Move para a próxima sprint SÓ o que está classificado (tem a tag).
//       Tasks filhas acompanham o pai. Sem workItemIds, migra todos os
//       classificados elegíveis da sprint que fechou.
//
// TRAVA: 'migrate' revalida rpc_transbordo_contexto() no servidor antes de
// escrever — foto da sprint que fechou já TIRADA (selada) E data posterior ao
// fim dela. A foto corta sábado 13:00 BRT e é selada ~13:20 (SN-9), então o
// transbordo libera no próprio sábado. Nunca confiar no gate do front.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const ORG = 'FlagIW'
const WIT_BASE = `https://dev.azure.com/${ORG}/_apis/wit/workitems`
const API_VERSION = '7.1'
const TAG_TRANSBORDO = 'TRANSBORDO'

// Mesmas regexes de fn_classifica_demanda / fn_tem_tag_transbordo.
const RE_TRANSBORDO = /(^|;)\s*transbord(o|ad[oa])\s*(;|$)/i
const RE_AVIAO_LEGADO = /(^|;)\s*avi[aã]o\s+(antigo|transbordad[oa])\s*(;|$)/i
const temTagTransbordo = (tags: string | null) =>
  RE_TRANSBORDO.test(tags ?? '') || RE_AVIAO_LEGADO.test(tags ?? '')

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

function authHeaders(pat: string, contentType = 'application/json') {
  return {
    Authorization: `Basic ${btoa(`:${pat}`)}`,
    'Content-Type': contentType,
    Accept: 'application/json',
  }
}

function validateCronSecret(req: Request): boolean {
  const s = req.headers.get('x-cron-secret')
  const expected = Deno.env.get('CRON_SECRET')
  return !!s && !!expected && s === expected
}

async function validateAuth(req: Request): Promise<string | null> {
  if (validateCronSecret(req)) return 'cron'
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (serviceRoleKey && token === serviceRoleKey) return 'service_role'
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return data.user.id
}

/** Admin global ou owner da Fábrica — mesmo predicado do devops-post-timelog. */
async function assertAdmin(caller: string, sb: ReturnType<typeof getSupabaseAdmin>): Promise<boolean> {
  if (caller === 'cron' || caller === 'service_role') return true
  const { data: r1 } = await sb.from('hub_user_global_roles')
    .select('role').eq('user_id', caller).eq('role', 'admin').maybeSingle()
  if (r1) return true
  const { data: r2 } = await sb.from('user_roles')
    .select('role').eq('user_id', caller).eq('role', 'admin').maybeSingle()
  if (r2) return true
  const { data: r3 } = await sb.from('hub_area_members')
    .select('area_role, hub_areas!inner(key)')
    .eq('user_id', caller).eq('area_role', 'owner').eq('hub_areas.key', 'fabrica').maybeSingle()
  return !!r3
}

// ── Azure DevOps ────────────────────────────────────────────────────────────

interface PatchOp { op: string; path: string; value?: unknown }

async function patchWorkItem(id: number, ops: PatchOp[], pat: string): Promise<{ ok: boolean; status: number; body: string }> {
  const resp = await fetch(`${WIT_BASE}/${id}?api-version=${API_VERSION}`, {
    method: 'PATCH',
    headers: authHeaders(pat, 'application/json-patch+json'),
    body: JSON.stringify(ops),
  })
  const body = await resp.text()
  return { ok: resp.ok, status: resp.status, body: body.slice(0, 500) }
}

/**
 * Testa escopo de escrita SEM alterar nada: um PATCH em campo inexistente.
 * Se o PAT não puder escrever, o Azure barra na autorização (401/403) antes de
 * olhar o campo; se puder, recusa o campo (400). Nos dois casos o item fica
 * intacto — nenhuma revisão é criada.
 */
async function probeWrite(pat: string): Promise<Record<string, unknown>> {
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('devops_work_items').select('id').limit(1).maybeSingle()
  const alvo = (data as { id: number } | null)?.id
  if (!alvo) return { ok: false, message: 'Nenhum work item espelhado para testar.' }

  const r = await patchWorkItem(
    alvo,
    [{ op: 'add', path: '/fields/System.__FlagHubProbeCampoInexistente__', value: 'probe' }],
    pat,
  )

  if (r.status === 400) {
    return { ok: true, canWrite: true, httpStatus: 400, workItemId: alvo,
      message: 'PAT TEM escopo de escrita (o Azure recusou o campo inventado, não a permissão). Nenhum item foi alterado.' }
  }
  if (r.status === 401 || r.status === 403) {
    return { ok: true, canWrite: false, httpStatus: r.status, workItemId: alvo,
      message: `PAT SEM escopo de escrita em work items (HTTP ${r.status}). É necessário um PAT com Work Items Read & Write.` }
  }
  if (r.ok) {
    return { ok: false, canWrite: true, httpStatus: r.status, workItemId: alvo,
      message: 'INESPERADO: o Azure aceitou um campo inexistente. Conferir o item manualmente.' }
  }
  return { ok: false, canWrite: null, httpStatus: r.status, workItemId: alvo,
    message: `Resposta inesperada (HTTP ${r.status}): ${r.body}` }
}

/** Substitui o código da sprint no iteration_path do PRÓPRIO item. */
function trocaSprintNoPath(pathAtual: string | null, sprintDestino: string): string | null {
  if (!pathAtual) return null
  const partes = pathAtual.split('\\')
  const ultima = partes[partes.length - 1]
  if (/^S\d+-\d{4}$/i.test(ultima)) {
    partes[partes.length - 1] = sprintDestino
    return partes.join('\\')
  }
  return null   // formato inesperado → não adivinhar
}

/** Acrescenta TRANSBORDO sem duplicar segmento. */
function comTagTransbordo(tagsAtuais: string | null): string {
  const atual = (tagsAtuais ?? '').trim()
  if (temTagTransbordo(atual)) return atual
  return atual ? `${atual}; ${TAG_TRANSBORDO}` : TAG_TRANSBORDO
}

// ── Serve ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    const caller = await validateAuth(req)
    if (!caller) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })

    const sb = getSupabaseAdmin()
    if (!(await assertAdmin(caller, sb))) {
      return new Response(JSON.stringify({ error: 'Permissão negada: apenas admins ou owner da Fábrica.' }), { status: 403, headers })
    }

    const pat = Deno.env.get('DEVOPS_PAT')
    if (!pat) return new Response(JSON.stringify({ error: 'DEVOPS_PAT não configurado.' }), { status: 500, headers })

    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* defaults */ }
    const mode = (body.mode as string) ?? 'probe-write'
    const dryRun = body.dryRun === true
    const executedBy = caller.length === 36 ? caller : null   // uuid de usuário; cron/service_role → null

    // ── probe-write ─────────────────────────────────────────────────────────
    if (mode === 'probe-write') {
      const r = await probeWrite(pat)
      return new Response(JSON.stringify({ mode, ...r }), { status: r.ok ? 200 : 502, headers })
    }

    if (mode !== 'classify' && mode !== 'migrate') {
      return new Response(JSON.stringify({ error: `Modo desconhecido: ${mode}. Use probe-write | classify | migrate` }), { status: 400, headers })
    }

    // ── Contexto/trava (servidor manda, não o front) ────────────────────────
    const { data: ctxRows, error: ctxErr } = await sb.rpc('rpc_transbordo_contexto')
    if (ctxErr) throw new Error(`Contexto: ${ctxErr.message}`)
    const ctx = (ctxRows as Array<Record<string, unknown>>)?.[0]
    if (!ctx) throw new Error('Contexto de transbordo indisponível.')

    if (mode === 'migrate' && ctx.pode_migrar !== true) {
      return new Response(JSON.stringify({ error: 'Transbordo bloqueado', motivo: ctx.motivo, contexto: ctx }), { status: 409, headers })
    }

    const sprintOrigem = ctx.sprint_origem as string
    const sprintDestino = ctx.sprint_destino as string

    // ── Selecionar itens ────────────────────────────────────────────────────
    const { data: elegiveis, error: elErr } = await sb.rpc('rpc_transbordo_elegiveis', { p_sprint: sprintOrigem })
    if (elErr) throw new Error(`Elegíveis: ${elErr.message}`)

    type Elegivel = {
      work_item_id: number; work_item_type: string; title: string; state: string
      tags: string; tem_tag: boolean; iteration_path: string; tasks_filhas: number
      ja_migrado: boolean
    }
    let alvos = (elegiveis ?? []) as Elegivel[]

    const pedidos = (body.workItemIds as number[] | undefined)?.map(Number)
    if (pedidos?.length) alvos = alvos.filter(e => pedidos.includes(e.work_item_id))

    // A lista de elegíveis inclui o que JÁ saiu da sprint — é o registro do que
    // transbordou (TR-3, 16/08/2026), não fila de trabalho. Agir sobre ele
    // moveria de novo quem já está no destino, criando revisão à toa no Azure e
    // inflando os contadores de migração, que não têm reversão.
    alvos = alvos.filter(e => !e.ja_migrado)

    // classify → só quem AINDA NÃO tem a tag. migrate → só quem JÁ tem.
    alvos = mode === 'classify' ? alvos.filter(e => !e.tem_tag) : alvos.filter(e => e.tem_tag)

    if (alvos.length === 0) {
      return new Response(JSON.stringify({
        ok: true, mode, sprintOrigem, sprintDestino, processados: 0,
        message: mode === 'classify'
          ? 'Nenhum item pendente de classificação nos critérios.'
          : 'Nenhum item classificado para migrar.',
      }), { status: 200, headers })
    }

    // ── Lote ────────────────────────────────────────────────────────────────
    const { data: batch, error: bErr } = await sb.from('sprint_migration_batches').insert({
      tipo: mode === 'classify' ? 'classificacao' : 'transbordo',
      sprint_origem: sprintOrigem,
      sprint_destino: mode === 'migrate' ? sprintDestino : null,
      executed_by: executedBy,
      snapshot_as_of: ctx.foto_as_of ?? null,
      total_itens: alvos.length,
      dry_run: dryRun,
    }).select('id').single()
    if (bErr) throw new Error(`Lote: ${bErr.message}`)
    const batchId = (batch as { id: string }).id

    let sucesso = 0, falha = 0
    const detalhes: Array<Record<string, unknown>> = []

    for (const item of alvos) {
      // Tasks filhas acompanham o pai (só no migrate — classificar é do pai).
      let filhas: Array<{ id: number; iteration_path: string | null }> = []
      if (mode === 'migrate') {
        const { data: cs } = await sb.from('devops_work_items')
          .select('id, iteration_path').eq('parent_id', item.work_item_id)
        filhas = (cs ?? []) as Array<{ id: number; iteration_path: string | null }>
      }

      const pathNovo = mode === 'migrate' ? trocaSprintNoPath(item.iteration_path, sprintDestino) : null
      if (mode === 'migrate' && !pathNovo) {
        await sb.from('sprint_migration_items').insert({
          batch_id: batchId, work_item_id: item.work_item_id, work_item_type: item.work_item_type,
          work_item_title: item.title, iteration_path_anterior: item.iteration_path,
          tags_anterior: item.tags, child_task_count: filhas.length,
          status: 'falha', error_message: `iteration_path em formato inesperado: ${item.iteration_path}`,
        })
        falha++; detalhes.push({ id: item.work_item_id, status: 'falha', motivo: 'path inesperado' })
        continue
      }

      // Registra ANTES do PATCH — iteration_path_anterior é o insumo da reversão
      const { data: linha } = await sb.from('sprint_migration_items').insert({
        batch_id: batchId, work_item_id: item.work_item_id, work_item_type: item.work_item_type,
        work_item_title: item.title, iteration_path_anterior: item.iteration_path,
        iteration_path_novo: pathNovo, tags_anterior: item.tags,
        child_task_count: filhas.length, status: dryRun ? 'simulado' : 'pendente',
      }).select('id').single()
      const linhaId = (linha as { id: string } | null)?.id

      if (dryRun) {
        sucesso++
        detalhes.push({ id: item.work_item_id, status: 'simulado', pathNovo, filhas: filhas.length })
        continue
      }

      const ops: PatchOp[] = []
      if (mode === 'classify') {
        ops.push({ op: 'add', path: '/fields/System.Tags', value: comTagTransbordo(item.tags) })
      } else {
        ops.push({ op: 'add', path: '/fields/System.IterationPath', value: pathNovo })
        // Garante a tag no destino: sem ela o item volta a ser classificado como
        // "Priorização pura" e o indicador gerencial regride.
        ops.push({ op: 'add', path: '/fields/System.Tags', value: comTagTransbordo(item.tags) })
      }

      const r = await patchWorkItem(item.work_item_id, ops, pat)
      if (!r.ok) {
        if (linhaId) await sb.from('sprint_migration_items').update({
          status: 'falha', error_message: `HTTP ${r.status}: ${r.body}`, attempt_count: 1,
        }).eq('id', linhaId)
        falha++; detalhes.push({ id: item.work_item_id, status: 'falha', http: r.status })
        continue
      }

      // Filhas seguem o pai
      let filhasOk = 0
      for (const f of filhas) {
        const fPath = trocaSprintNoPath(f.iteration_path, sprintDestino)
        if (!fPath) continue
        const fr = await patchWorkItem(f.id, [{ op: 'add', path: '/fields/System.IterationPath', value: fPath }], pat)
        if (fr.ok) {
          filhasOk++
          await sb.from('sprint_migration_items').insert({
            batch_id: batchId, work_item_id: f.id, work_item_type: 'Task',
            iteration_path_anterior: f.iteration_path, iteration_path_novo: fPath,
            is_child: true, parent_work_item_id: item.work_item_id, status: 'sucesso',
          })
        }
      }

      if (linhaId) await sb.from('sprint_migration_items').update({
        status: 'sucesso', tag_transbordo_aplicada: true, attempt_count: 1,
      }).eq('id', linhaId)
      sucesso++
      detalhes.push({ id: item.work_item_id, status: 'sucesso', filhas: filhasOk })
    }

    await sb.from('sprint_migration_batches')
      .update({ total_sucesso: sucesso, total_falha: falha }).eq('id', batchId)

    // Re-sincroniza para o espelho refletir as mudanças (fire-and-forget)
    if (!dryRun && sucesso > 0) {
      const url = Deno.env.get('SUPABASE_URL'), secret = Deno.env.get('CRON_SECRET')
      if (url && secret) {
        fetch(`${url}/functions/v1/devops-sync-all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
          body: JSON.stringify({ triggered_by: 'transbordo' }),
        }).catch(e => console.warn('[transbordo] re-sync falhou:', e))
      }
    }

    return new Response(JSON.stringify({
      ok: true, mode, dryRun, batchId, sprintOrigem,
      sprintDestino: mode === 'migrate' ? sprintDestino : null,
      processados: alvos.length, sucesso, falha, detalhes,
    }), { status: 200, headers })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[transbordo] Fatal:', msg)
    return new Response(JSON.stringify({ error: 'Erro interno', detail: msg }), { status: 500, headers })
  }
})
