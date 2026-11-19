// timer-devops — a edge do Timer Flag.
//
// Ops:
//   • ativar  (fase 1): concede o Timer, automaticamente, a quem entrou pelo
//     SSO Microsoft do tenant da Flag, e resolve a identidade da pessoa no
//     Azure DevOps (o GUID que a TechsBCN grava como userId).
//   • minhas  (fase 2): o que está atribuído à pessoa (PBI, Bug, Task abertos)
//     + ancestrais até a Epic, LIDO AO VIVO do Azure. O espelho
//     devops_work_items só cobre as queries cadastradas e quem tem só o Timer
//     nem o enxerga (RLS de hub_is_approved).
//   • buscar  (fase 2): por título (3+ letras) ou #id, Epic a Task.
//   • filhos  (fase 2): um nível da hierarquia, para descer na árvore.
//   • criar   (fase 2): só Task (sob PBI/Bug) e PBI (sob Feature), atribuído à
//     própria pessoa; PBI sempre na sprint atual do calendário oficial. Com
//     `tags` (18/11/2026): produto, cliente e categoria, sem os marcadores
//     que mudam KPI de sprint.
//   • campos  (18/11/2026): valores permitidos de Cliente (Custom.PRODUTOSS) e
//     Produto (Custom.CLIENTESS) — os nomes são TROCADOS no DevOps — por
//     projeto e tipo; 24 h por instância. Na criação, cliente/produto vão
//     nesses campos, conferidos na lista (fora dela o DevOps recusa).
//   • tags    (18/11/2026): as tags de um projeto (API Tags do DevOps), uma
//     chamada por projeto a cada 24 h por instância; o app guarda 24 h.
//   • reuniao (18/11/2026): "Rec reunião" — Task "Reunião - <tema>" na Feature
//     escolhida ou na raiz do projeto (sem pai), na sprint atual. Se o DevOps
//     recusar a Task direto na Feature, ela vai para a raiz do mesmo projeto.
//   • lancar  (fase 4): soma os trechos fechados (item × dia) no BANCO
//     (timer_lancamento_preparar: só a própria hora, últimos 7 dias, teto de
//     12 h contando o que já está no TimeLog) e grava UM documento na
//     TechsBCN com id = id do lançamento. O item é conferido no Azure antes.
//   • relancar (fase 4): lançamento com erro — procura o documento pelo id
//     ANTES de regravar; nunca repete POST às cegas.
//
// Não há update de work item nem consulta livre: o Timer não vira um proxy do
// PAT. Toda op além de `ativar` exige timer_access ativo.
//
// Regras que não podem afrouxar:
//   • Quem é a pessoa vem SEMPRE do JWT (getUser). Nada de e-mail, GUID ou
//     user_id no corpo da requisição.
//   • Sem TIMER_SSO_TENANT_ID configurado, nada é concedido (falha fechada).
//   • Revogado pelo admin continua revogado: `ativar` não reconcede.
//   • O vssps é chamado no máximo uma vez a cada 10 min por pessoa sem GUID.
//     O incidente de 31/08/2026 foi justamente o serviço de identidade do
//     Azure estrangulado; um botão "tentar de novo" não pode virar rajada.
//
// PAT: DEVOPS_PAT_TIMER (PAT de serviço só do Timer). Enquanto ele não existir,
// cai no DEVOPS_PAT, que é amplo demais e deve ser revisto.
//
// Deploy: igual às outras edges do FlagHub, com --no-verify-jwt; a função
// valida o JWT por conta própria.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { devopsAuthHeaders, devopsFetch } from '../_shared/devops.ts'
import {
  escolherIdentidadeDevops,
  lerClaimsJwt,
  lerDominios,
  MENSAGEM_RECUSA,
  validarSsoFlag,
  type UsuarioSupabase,
} from './sso.ts'
import {
  acharIteracao,
  CAMPO_CLIENTE,
  CAMPO_PRODUTO,
  CAMPOS_ITEM,
  descricaoHtml,
  ehRaiz,
  ESTADOS_FECHADOS,
  hojeSaoPaulo,
  idsDaWiql,
  idsDosFilhos,
  interpretarBusca,
  ORG,
  PAI_PERMITIDO,
  paraItem,
  sprintOficial,
  validarCriacao,
  wiqlBusca,
  wiqlFilhos,
  wiqlMinhas,
  type ItemTarefa,
} from './tarefas.ts'
import {
  API_EXT,
  desfechoDoPost,
  erroDoPreparo,
  itemAceitaHora,
  montarDocumento,
  TIMELOG_DOCS,
  validarPedidoLancar,
  type Preparado,
} from './lancamento.ts'
import { CacheCurto } from './cache.ts'
import {
  nomesDasTags,
  opsDeClassificacao,
  sanitizarTags,
  textoDeCampo,
  validarReuniao,
  valoresPermitidos,
  type Permitidos,
} from './reuniao.ts'

const REDESCOBRIR_GUID_MS = 10 * 60 * 1000
const TETO_MINHAS = 200
const TETO_BUSCA = 30
const TETO_CRIACOES_POR_HORA = 20

type Json = Record<string, unknown>

function responder(req: Request, status: number, corpo: Json): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function patDoTimer(): string | null {
  return Deno.env.get('DEVOPS_PAT_TIMER') || Deno.env.get('DEVOPS_PAT') || null
}

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

async function usuarioDoJwt(req: Request): Promise<{ user: UsuarioSupabase; token: string } | null> {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return null
  const token = auth.slice('Bearer '.length).trim()
  // O service role não é usuário: o Timer é sempre de uma pessoa.
  if (!token || token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return null

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return { user: data.user as unknown as UsuarioSupabase, token }
}

async function resolverIdentidade(email: string, pat: string) {
  const url =
    `https://vssps.dev.azure.com/${ORG}/_apis/identities` +
    `?searchFilter=MailAddress&filterValue=${encodeURIComponent(email)}&api-version=7.1-preview.1`
  const resp = await devopsFetch(url, { method: 'GET', headers: devopsAuthHeaders(pat) }, { client: 'timer-ativar' })
  if (!resp.ok) {
    console.warn(`[timer-devops] vssps respondeu ${resp.status} ao resolver identidade`)
    await resp.body?.cancel()
    return { ok: false as const, status: resp.status }
  }
  const json = await resp.json()
  return { ok: true as const, identidade: escolherIdentidadeDevops(json, email) }
}

async function ativar(req: Request, user: UsuarioSupabase, token: string): Promise<Response> {
  const sso = validarSsoFlag(user, lerClaimsJwt(token), {
    tenantId: Deno.env.get('TIMER_SSO_TENANT_ID') ?? null,
    dominios: lerDominios(Deno.env.get('TIMER_SSO_DOMINIOS')),
  })

  const sb = admin()

  if (!sso.ok) {
    if (sso.motivo === 'tenant_diferente') {
      // Só as CHAVES, para diagnosticar onde o Supabase guardou o tenant.
      const azure = (user.identities ?? []).find((i) => i.provider === 'azure')
      console.warn('[timer-devops] tenant não confere; chaves de identity_data:', Object.keys(azure?.identity_data ?? {}))
    }
    const status = sso.motivo === 'configuracao_pendente' ? 503 : 403
    return responder(req, status, { ok: false, motivo: sso.motivo, mensagem: MENSAGEM_RECUSA[sso.motivo] })
  }

  const { data: atual, error: erroLeitura } = await sb
    .from('timer_access')
    .select('status, devops_guid, devops_display, devops_resolvido_em')
    .eq('user_id', user.id)
    .maybeSingle()
  if (erroLeitura) {
    console.error('[timer-devops] leitura de timer_access falhou:', erroLeitura.message)
    return responder(req, 500, { ok: false, motivo: 'erro_interno' })
  }

  if (atual?.status === 'revogado') {
    return responder(req, 403, {
      ok: false,
      motivo: 'acesso_revogado',
      mensagem: 'Seu acesso ao Timer foi revogado por um administrador.',
    })
  }

  const novo = !atual
  let guid: string | null = atual?.devops_guid ?? null
  let display: string | null = atual?.devops_display ?? null
  let resolvidoEm: string | null = atual?.devops_resolvido_em ?? null
  let devopsEmail: string | null = null
  let erroDevops: string | null = null

  const tentouHaPouco =
    resolvidoEm !== null && Date.now() - new Date(resolvidoEm).getTime() < REDESCOBRIR_GUID_MS

  if (!guid && !tentouHaPouco) {
    const pat = patDoTimer()
    if (!pat) {
      erroDevops = 'pat_ausente'
    } else {
      try {
        const r = await resolverIdentidade(sso.email, pat)
        resolvidoEm = new Date().toISOString()
        if (!r.ok) erroDevops = `vssps_${r.status}`
        else if (r.identidade) {
          guid = r.identidade.guid
          display = r.identidade.display
          devopsEmail = r.identidade.email
        } else erroDevops = 'identidade_nao_encontrada'
      } catch (e) {
        console.error('[timer-devops] erro ao resolver identidade:', e)
        erroDevops = 'vssps_indisponivel'
      }
    }
  }

  const linha: Json = {
    user_id: user.id,
    email: sso.email,
    sso_tenant_id: sso.tenantId,
    devops_guid: guid,
    devops_display: display,
    devops_resolvido_em: resolvidoEm,
  }
  if (devopsEmail) linha.devops_email = devopsEmail
  if (novo) {
    linha.status = 'ativo'
    linha.origem = 'sso_auto'
  }

  const { error: erroGravacao } = await sb.from('timer_access').upsert(linha, { onConflict: 'user_id' })
  if (erroGravacao) {
    console.error('[timer-devops] gravação de timer_access falhou:', erroGravacao.message)
    return responder(req, 500, { ok: false, motivo: 'erro_interno' })
  }

  const eventos: Json[] = []
  if (novo) {
    eventos.push({ user_id: user.id, evento: 'acesso_concedido', origem: 'servidor', detalhe: { via: 'sso_auto' } })
  }
  if (devopsEmail) {
    eventos.push({ user_id: user.id, evento: 'identidade_devops_resolvida', origem: 'servidor', detalhe: {} })
  } else if (erroDevops) {
    eventos.push({ user_id: user.id, evento: 'identidade_devops_falhou', origem: 'servidor', detalhe: { erro: erroDevops } })
  }
  if (eventos.length > 0) {
    const { error } = await sb.from('timer_eventos').insert(eventos)
    if (error) console.warn('[timer-devops] trilha de eventos falhou:', error.message)
  }

  return responder(req, 200, {
    ok: true,
    novo,
    devops: { encontrado: !!guid, display, erro: guid ? null : erroDevops },
  })
}

// ─── tarefas (fase 2) ────────────────────────────────────────────────────────

interface Acesso {
  email: string
  devops_guid: string | null
  devops_email: string | null
}

async function acessoAtivo(userId: string): Promise<Acesso | null> {
  const { data, error } = await admin()
    .from('timer_access')
    .select('email, status, devops_guid, devops_email')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data || data.status !== 'ativo') return null
  return { email: data.email, devops_guid: data.devops_guid, devops_email: data.devops_email }
}

class ErroDevops extends Error {
  constructor(public status: number, public detalhe: string) {
    super(`devops ${status}`)
  }
}

/** Leitura no Azure (GET, WIQL e batch são leituras; 5xx pode repetir). */
async function lerAzure(url: string, pat: string, corpo?: unknown): Promise<unknown> {
  const resp = await devopsFetch(
    url,
    corpo === undefined
      ? { method: 'GET', headers: devopsAuthHeaders(pat) }
      : { method: 'POST', headers: devopsAuthHeaders(pat), body: JSON.stringify(corpo) },
    { client: 'timer-tarefas', retryOn5xx: true },
  )
  if (!resp.ok) {
    const texto = (await resp.text()).slice(0, 300)
    throw new ErroDevops(resp.status, texto)
  }
  return await resp.json()
}

async function lerItens(ids: number[], pat: string): Promise<ItemTarefa[]> {
  const out: ItemTarefa[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200)
    const json = await lerAzure(
      `https://dev.azure.com/${ORG}/_apis/wit/workitemsbatch?api-version=7.1`,
      pat,
      { ids: lote, fields: CAMPOS_ITEM, errorPolicy: 'Omit' },
    ) as { value?: unknown[] }
    for (const wi of json.value ?? []) {
      const item = paraItem(wi)
      if (item) out.push(item)
    }
  }
  return out
}

/** Sobe até 3 níveis (PBI → Feature → Epic) para dar nome aos grupos. */
async function ancestraisDe(itens: ItemTarefa[], pat: string): Promise<ItemTarefa[]> {
  const conhecidos = new Set(itens.map((i) => i.id))
  const out: ItemTarefa[] = []
  let fronteira = itens
  for (let nivel = 0; nivel < 3 && fronteira.length > 0; nivel++) {
    const ids = [...new Set(fronteira.map((i) => i.parent_id).filter((p): p is number => p != null && !conhecidos.has(p)))]
    if (ids.length === 0) break
    ids.forEach((id) => conhecidos.add(id))
    fronteira = await lerItens(ids, pat)
    out.push(...fronteira)
  }
  return out
}

async function wiql(query: string, top: number, pat: string): Promise<unknown> {
  return await lerAzure(`https://dev.azure.com/${ORG}/_apis/wit/wiql?$top=${top}&api-version=7.1`, pat, { query })
}

function erroDevops(req: Request, e: unknown): Response {
  if (e instanceof ErroDevops) {
    console.warn(`[timer-devops] Azure respondeu ${e.status}: ${e.detalhe}`)
    const mensagem = e.status === 401 || e.status === 403
      ? 'O token do Timer não tem permissão para isto no Azure DevOps.'
      : 'O Azure DevOps não respondeu como esperado. Tente de novo em instantes.'
    return responder(req, 502, { ok: false, motivo: `devops_${e.status}`, mensagem })
  }
  console.error('[timer-devops] erro inesperado:', e)
  return responder(req, 500, { ok: false, motivo: 'erro_interno', mensagem: 'Erro inesperado no servidor.' })
}

/** "Minhas tarefas" por pessoa, 3 min. Ver cache.ts. */
const cacheMinhas = new CacheCurto<Json>(3 * 60 * 1000)

async function minhas(req: Request, userId: string, acesso: Acesso, corpo: Json, pat: string): Promise<Response> {
  if (corpo.forcar !== true) {
    const guardado = cacheMinhas.ler(userId)
    if (guardado) return responder(req, 200, { ...guardado.valor, doCache: true })
  }
  const email = acesso.devops_email ?? acesso.email
  const r = idsDaWiql(await wiql(wiqlMinhas(email), TETO_MINHAS + 1, pat), TETO_MINHAS)
  const itens = await lerItens(r.ids, pat)
  const ancestrais = await ancestraisDe(itens, pat)
  const corpoResposta: Json = { ok: true, itens, ancestrais, truncado: r.truncado, lidoEm: new Date().toISOString() }
  cacheMinhas.gravar(userId, corpoResposta)
  return responder(req, 200, corpoResposta)
}

async function buscar(req: Request, corpo: Json, pat: string): Promise<Response> {
  const b = interpretarBusca(corpo.texto)
  if (b.tipo === 'curta') {
    return responder(req, 400, { ok: false, motivo: 'busca_curta', mensagem: 'Digite 3 letras ou o número (#id).' })
  }
  let itens: ItemTarefa[]
  let truncado = false
  if (b.tipo === 'id') {
    itens = (await lerItens([b.id], pat)).filter((i) => i.state !== 'Removed')
  } else {
    const r = idsDaWiql(await wiql(wiqlBusca(b.texto), TETO_BUSCA + 1, pat), TETO_BUSCA)
    truncado = r.truncado
    itens = await lerItens(r.ids, pat)
  }
  const ancestrais = await ancestraisDe(itens, pat)
  return responder(req, 200, { ok: true, itens, ancestrais, truncado })
}

async function filhos(req: Request, corpo: Json, pat: string): Promise<Response> {
  const id = Number(corpo.id)
  if (!Number.isInteger(id) || id <= 0) return responder(req, 400, { ok: false, motivo: 'id_invalido' })
  const ids = idsDosFilhos(await wiql(wiqlFilhos(id), 200, pat), id)
  const itens = await lerItens(ids, pat)
  return responder(req, 200, { ok: true, itens })
}

/** Caminho da sprint atual (calendário oficial) na árvore do projeto. */
async function iteracaoAtual(projeto: string, pat: string): Promise<{ codigo: string; caminho: string | null }> {
  const codigo = sprintOficial(hojeSaoPaulo())
  const raiz = await lerAzure(
    `https://dev.azure.com/${ORG}/${encodeURIComponent(projeto)}/_apis/wit/classificationnodes/Iterations?$depth=6&api-version=7.1`,
    pat,
  )
  return { codigo, caminho: acharIteracao(raiz as never, codigo) }
}

async function criar(req: Request, userId: string, acesso: Acesso, corpo: Json, pat: string): Promise<Response> {
  if (!acesso.devops_guid) {
    return responder(req, 409, {
      ok: false,
      motivo: 'sem_identidade_devops',
      mensagem: 'Sua conta não foi encontrada no Azure DevOps; não dá para atribuir o item a você.',
    })
  }

  const v = validarCriacao(corpo)
  if (!v.ok) return responder(req, 400, { ok: false, motivo: v.motivo, mensagem: 'Confira o título (3 a 255 letras) e o item pai.' })

  const sb = admin()
  const umaHora = new Date(Date.now() - 3_600_000).toISOString()
  const { count } = await sb
    .from('timer_eventos')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('evento', 'criou_work_item')
    .gte('criado_em', umaHora)
  if ((count ?? 0) >= TETO_CRIACOES_POR_HORA) {
    return responder(req, 429, { ok: false, motivo: 'limite_de_criacao', mensagem: 'Limite de 20 itens criados por hora.' })
  }

  const [pai] = await lerItens([v.paiId], pat)
  if (!pai) return responder(req, 404, { ok: false, motivo: 'pai_inexistente', mensagem: `O item #${v.paiId} não existe.` })
  if (!PAI_PERMITIDO[v.tipo].includes(pai.work_item_type ?? '')) {
    return responder(req, 422, {
      ok: false,
      motivo: 'pai_de_tipo_errado',
      mensagem: v.tipo === 'Task' ? 'Task só nasce debaixo de um PBI ou Bug.' : 'PBI só nasce debaixo de uma Feature.',
    })
  }
  if (ESTADOS_FECHADOS.includes(pai.state ?? '')) {
    return responder(req, 422, { ok: false, motivo: 'pai_fechado', mensagem: `O #${pai.id} já está ${pai.state}.` })
  }
  if (!pai.team_project) return responder(req, 422, { ok: false, motivo: 'pai_sem_projeto' })

  let iteracao = v.tipo === 'Task' && !ehRaiz(pai.iteration_path) ? pai.iteration_path : null
  if (!iteracao) {
    const atual = await iteracaoAtual(pai.team_project, pat)
    if (!atual.caminho) {
      return responder(req, 422, {
        ok: false,
        motivo: 'sprint_atual_inexistente',
        mensagem: `A sprint ${atual.codigo} não existe no projeto ${pai.team_project}.`,
      })
    }
    iteracao = atual.caminho
  }

  const ops: Json[] = [
    { op: 'add', path: '/fields/System.Title', value: v.titulo },
    { op: 'add', path: '/fields/System.IterationPath', value: iteracao },
    { op: 'add', path: '/fields/System.AssignedTo', value: acesso.devops_email ?? acesso.email },
    {
      op: 'add',
      path: '/relations/-',
      value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `https://dev.azure.com/${ORG}/_apis/wit/workItems/${pai.id}` },
    },
  ]
  if (pai.area_path) ops.push({ op: 'add', path: '/fields/System.AreaPath', value: pai.area_path })
  if (v.descricao) ops.push({ op: 'add', path: '/fields/System.Description', value: descricaoHtml(v.descricao) })
  const tags = sanitizarTags(corpo.tags)
  const permitidos = await permitidosDe(pai.team_project, v.tipo, pat)
  const cls = opsDeClassificacao(
    { cliente: textoDeCampo(corpo.cliente), produto: textoDeCampo(corpo.produto), tags },
    permitidos,
    true, // cliente e produto obrigatórios (quando o tipo tem o campo)
    corpo.herdado === true, // um clique: o que veio do pai e não cabe na lista é descartado
  )
  if (!cls.ok) return responder(req, 422, { ok: false, motivo: cls.motivo, mensagem: cls.mensagem })
  ops.push(...cls.ops)

  // Escrita: SEM repetir 5xx (devopsFetch só repete 429 em POST). Repetir às
  // cegas criaria item duplicado no quadro.
  const resp = await devopsFetch(
    `https://dev.azure.com/${ORG}/${encodeURIComponent(pai.team_project)}/_apis/wit/workitems/$${encodeURIComponent(v.tipo)}?api-version=7.1`,
    {
      method: 'POST',
      headers: { ...devopsAuthHeaders(pat), 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify(ops),
    },
    { client: 'timer-criar' },
  )
  if (!resp.ok) throw new ErroDevops(resp.status, (await resp.text()).slice(0, 300))

  const item = paraItem(await resp.json())
  const { error } = await sb.from('timer_eventos').insert({
    user_id: userId,
    evento: 'criou_work_item',
    origem: 'servidor',
    work_item_id: item?.id ?? null,
    detalhe: { tipo: v.tipo, pai: pai.id, projeto: pai.team_project, tags: tags.length, cliente: !!cls.cliente, produto: !!cls.produto },
  })
  if (error) console.warn('[timer-devops] trilha de criação falhou:', error.message)

  // item novo atribuído à pessoa: "minhas tarefas" precisa reler do Azure
  cacheMinhas.apagar(userId)
  if (tags.length > 0) cacheTags.apagar(pai.team_project) // tag nova aparece na hora
  return responder(req, 200, { ok: true, item })
}

// ─── tags do projeto ────────────────────────────────────────────────────────

/** Tags por projeto, 24 h por instância: a lista muda pouco e é igual para todos. */
const cacheTags = new CacheCurto<string[]>(24 * 60 * 60 * 1000, 50)

async function tagsDoProjeto(req: Request, corpo: Json, pat: string): Promise<Response> {
  const projeto = typeof corpo.projeto === 'string' ? corpo.projeto.trim().slice(0, 100) : ''
  if (!projeto) return responder(req, 400, { ok: false, motivo: 'projeto_invalido' })
  const guardado = cacheTags.ler(projeto)
  if (guardado) return responder(req, 200, { ok: true, projeto, tags: guardado.valor, doCache: true })
  // A API Tags é "preview" em parte das versões: a 7.1 cheia pode responder
  // 400 pedindo o sufixo. Tenta a 7.1 e, no 400, a 7.1-preview.1.
  const url = (versao: string) =>
    `https://dev.azure.com/${ORG}/${encodeURIComponent(projeto)}/_apis/wit/tags?api-version=${versao}`
  let json: unknown
  try {
    json = await lerAzure(url('7.1'), pat)
  } catch (e) {
    if (!(e instanceof ErroDevops) || e.status !== 400) throw e
    console.warn(`[timer-devops] tags 7.1 recusada (${e.detalhe.slice(0, 160)}); tentando 7.1-preview.1`)
    json = await lerAzure(url('7.1-preview.1'), pat)
  }
  const tags = nomesDasTags(json)
  // diagnóstico (18/11/2026: as listas vieram vazias com status 200)
  console.log(`[timer-devops] tags de ${projeto}: ${tags.length}`)
  if (tags.length === 0) {
    console.warn(`[timer-devops] tags vazias em ${projeto}; resposta: ${JSON.stringify(json).slice(0, 300)}`)
    return responder(req, 200, { ok: true, projeto, tags }) // lista vazia não fica guardada
  }
  cacheTags.gravar(projeto, tags)
  return responder(req, 200, { ok: true, projeto, tags })
}

// ─── Cliente e Produto (picklists) ──────────────────────────────────────────

/** Valores permitidos por projeto + tipo, 24 h por instância. */
const cachePermitidos = new CacheCurto<Permitidos>(24 * 60 * 60 * 1000, 50)

/** allowedValues de um campo; o tipo sem o campo (404/400) = lista vazia (não grava). */
async function valoresDoCampo(projeto: string, tipo: string, campo: string, pat: string): Promise<string[]> {
  try {
    // sem $expand=allowedValues a API responde 200 e omite a lista
    const json = await lerAzure(
      `https://dev.azure.com/${ORG}/${encodeURIComponent(projeto)}/_apis/wit/workitemtypes/${encodeURIComponent(tipo)}` +
        `/fields/${encodeURIComponent(campo)}?%24expand=allowedValues&api-version=7.1`,
      pat,
    )
    return valoresPermitidos(json)
  } catch (e) {
    if (e instanceof ErroDevops && (e.status === 404 || e.status === 400)) return []
    throw e
  }
}

async function permitidosDe(projeto: string, tipo: string, pat: string): Promise<Permitidos> {
  const chave = `${projeto}|${tipo}`
  const guardado = cachePermitidos.ler(chave)
  if (guardado) return guardado.valor
  const [clientes, produtos] = await Promise.all([
    valoresDoCampo(projeto, tipo, CAMPO_CLIENTE, pat),
    valoresDoCampo(projeto, tipo, CAMPO_PRODUTO, pat),
  ])
  const p = { clientes, produtos }
  console.log(`[timer-devops] campos de ${chave}: ${clientes.length} clientes, ${produtos.length} produtos`)
  if (clientes.length + produtos.length > 0) cachePermitidos.gravar(chave, p)
  return p
}

async function camposDoProjeto(req: Request, corpo: Json, pat: string): Promise<Response> {
  const projeto = typeof corpo.projeto === 'string' ? corpo.projeto.trim().slice(0, 100) : ''
  if (!projeto) return responder(req, 400, { ok: false, motivo: 'projeto_invalido' })
  const tipo = corpo.tipo === 'Product Backlog Item' || corpo.tipo === 'PBI' ? 'Product Backlog Item' : 'Task'
  const p = await permitidosDe(projeto, tipo, pat)
  return responder(req, 200, { ok: true, projeto, tipo, ...p })
}

// ─── Rec reunião ────────────────────────────────────────────────────────────

async function criarNoAzure(projeto: string, tipo: string, ops: Json[]): Promise<Response> {
  // Escrita: SEM repetir 5xx (ver criar).
  return await devopsFetch(
    `https://dev.azure.com/${ORG}/${encodeURIComponent(projeto)}/_apis/wit/workitems/$${encodeURIComponent(tipo)}?api-version=7.1`,
    {
      method: 'POST',
      headers: { ...devopsAuthHeaders(patDoTimer() ?? ''), 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify(ops),
    },
    { client: 'timer-criar' },
  )
}

const vinculoPai = (id: number): Json => ({
  op: 'add',
  path: '/relations/-',
  value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `https://dev.azure.com/${ORG}/_apis/wit/workItems/${id}` },
})

async function reuniao(req: Request, userId: string, acesso: Acesso, corpo: Json, pat: string): Promise<Response> {
  if (!acesso.devops_guid) {
    return responder(req, 409, {
      ok: false,
      motivo: 'sem_identidade_devops',
      mensagem: 'Sua conta não foi encontrada no Azure DevOps; não dá para atribuir a reunião a você.',
    })
  }
  const v = validarReuniao(corpo)
  if (!v.ok) return responder(req, 400, { ok: false, motivo: v.motivo, mensagem: v.mensagem })

  const sb = admin()
  const umaHora = new Date(Date.now() - 3_600_000).toISOString()
  const { count } = await sb
    .from('timer_eventos')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('evento', 'criou_work_item')
    .gte('criado_em', umaHora)
  if ((count ?? 0) >= TETO_CRIACOES_POR_HORA) {
    return responder(req, 429, { ok: false, motivo: 'limite_de_criacao', mensagem: 'Limite de 20 itens criados por hora.' })
  }

  const camposDaTask = (iteracao: string, area: string | null, classificacao: Json[]): Json[] => {
    const ops: Json[] = [
      { op: 'add', path: '/fields/System.Title', value: v.titulo },
      { op: 'add', path: '/fields/System.IterationPath', value: iteracao },
      { op: 'add', path: '/fields/System.AssignedTo', value: acesso.devops_email ?? acesso.email },
      ...classificacao,
    ]
    if (area) ops.push({ op: 'add', path: '/fields/System.AreaPath', value: area })
    return ops
  }
  /** cliente/produto conferidos na lista do projeto de destino; obrigatórios se houver o campo */
  const classificar = async (proj: string) => {
    const permitidos = await permitidosDe(proj, 'Task', pat)
    return opsDeClassificacao({ cliente: v.cliente, produto: v.produto, tags: v.tags }, permitidos, true)
  }

  let item: ItemTarefa | null = null
  let pai: ItemTarefa | null = null
  let recusouFeature = false
  let projeto = v.projeto
  let area: string | null = null

  // 1. Na Feature escolhida, se o DevOps aceitar o vínculo Task → Feature.
  if (v.featureId) {
    const [feature] = await lerItens([v.featureId], pat)
    if (!feature || feature.work_item_type !== 'Feature' || ESTADOS_FECHADOS.includes(feature.state ?? '') || !feature.team_project) {
      return responder(req, 422, { ok: false, motivo: 'feature_invalida', mensagem: `O #${v.featureId} não é uma Feature aberta.` })
    }
    projeto = feature.team_project
    area = feature.area_path
    const cls = await classificar(feature.team_project)
    if (!cls.ok) return responder(req, 422, { ok: false, motivo: cls.motivo, mensagem: cls.mensagem })
    const atual = await iteracaoAtual(feature.team_project, pat)
    const iteracao = atual.caminho ?? feature.iteration_path ?? feature.team_project
    const resp = await criarNoAzure(feature.team_project, 'Task', [...camposDaTask(iteracao, area, cls.ops), vinculoPai(feature.id)])
    if (resp.ok) {
      item = paraItem(await resp.json())
      pai = feature
    } else if (resp.status === 400) {
      // vínculo recusado pelas regras do processo: cai na raiz do mesmo projeto
      recusouFeature = true
      console.warn(`[timer-devops] Task em Feature recusada: ${(await resp.text()).slice(0, 300)}`)
    } else {
      throw new ErroDevops(resp.status, (await resp.text()).slice(0, 300))
    }
  }

  // 2. Na raiz do projeto (sem pai), na sprint atual.
  if (!item) {
    if (!projeto) return responder(req, 400, { ok: false, motivo: 'sem_destino', mensagem: 'Escolha o projeto da reunião.' })
    const cls = await classificar(projeto)
    if (!cls.ok) return responder(req, 422, { ok: false, motivo: cls.motivo, mensagem: cls.mensagem })
    const atual = await iteracaoAtual(projeto, pat)
    const resp = await criarNoAzure(projeto, 'Task', camposDaTask(atual.caminho ?? projeto, area, cls.ops))
    if (!resp.ok) throw new ErroDevops(resp.status, (await resp.text()).slice(0, 300))
    item = paraItem(await resp.json())
  }

  const { error } = await sb.from('timer_eventos').insert({
    user_id: userId,
    evento: 'criou_work_item',
    origem: 'servidor',
    work_item_id: item?.id ?? null,
    detalhe: { tipo: 'Task', reuniao: true, pai: pai?.id ?? null, feature: v.featureId, projeto, recusouFeature, tags: v.tags.length },
  })
  if (error) console.warn('[timer-devops] trilha da reunião falhou:', error.message)

  cacheMinhas.apagar(userId)
  return responder(req, 200, {
    ok: true,
    item,
    pai: pai ? { id: pai.id, title: pai.title, work_item_type: pai.work_item_type } : null,
    recusouFeature,
  })
}

// ─── lançamento (fase 4) ─────────────────────────────────────────────────────

interface ResultadoLancamento {
  id?: string
  dia: string
  work_item_id: number
  status: 'lancado' | 'erro' | 'cancelado' | 'recusado'
  minutos?: number
  motivo?: string
  mensagem?: string
}

async function registrarResultado(id: string, status: 'lancado' | 'erro' | 'cancelado', titulo: string | null, erro: string | null) {
  const { error } = await admin().rpc('timer_lancamento_resultado', {
    p_id: id, p_status: status, p_titulo: titulo, p_erro: erro,
  })
  if (error) console.error('[timer-devops] timer_lancamento_resultado falhou:', error.message)
}

/** Existe documento com este id na TechsBCN? (true/false; null = não deu para saber) */
async function documentoExiste(id: string, pat: string): Promise<boolean | null> {
  try {
    const resp = await devopsFetch(
      `${TIMELOG_DOCS}/${encodeURIComponent(id)}?${API_EXT}`,
      { method: 'GET', headers: devopsAuthHeaders(pat) },
      { client: 'timer-lancar', retryOn5xx: true },
    )
    await resp.body?.cancel()
    if (resp.ok) return true
    if (resp.status === 404) return false
    console.warn(`[timer-devops] GET do documento ${id} respondeu ${resp.status}`)
    return null
  } catch (e) {
    console.warn('[timer-devops] GET do documento falhou:', e)
    return null
  }
}

/**
 * Leva um lançamento já preparado (status 'enviando') até o fim.
 * `conferirAntes` = é reenvio: o POST anterior pode ter chegado.
 */
async function enviar(p: Preparado, pat: string, conferirAntes: boolean): Promise<ResultadoLancamento> {
  const base = { id: p.id, dia: p.dia, work_item_id: p.work_item_id, minutos: p.minutos }

  if (conferirAntes) {
    const existe = await documentoExiste(p.id, pat)
    if (existe === true) {
      await registrarResultado(p.id, 'lancado', null, null)
      return { ...base, status: 'lancado', mensagem: 'O lançamento já estava no TimeLog.' }
    }
    if (existe === null) {
      const msg = 'Não deu para conferir no TimeLog se o envio anterior chegou. Tente de novo em instantes.'
      await registrarResultado(p.id, 'erro', null, msg)
      return { ...base, status: 'erro', mensagem: msg }
    }
  }

  // O item, conferido no Azure (antes de gravar: falha aqui cancela sem risco).
  let item: ItemTarefa | undefined
  try {
    ;[item] = await lerItens([p.work_item_id], pat)
  } catch (e) {
    const msg = e instanceof ErroDevops && (e.status === 401 || e.status === 403)
      ? 'O token do Timer não tem permissão para ler o item no Azure DevOps.'
      : 'O Azure DevOps não respondeu ao conferir o item. Tente de novo.'
    await registrarResultado(p.id, 'cancelado', null, msg)
    return { ...base, status: 'cancelado', mensagem: msg }
  }
  const aceita = itemAceitaHora(item)
  if (!aceita.ok) {
    await registrarResultado(p.id, 'cancelado', null, aceita.mensagem)
    return { ...base, status: 'cancelado', mensagem: aceita.mensagem }
  }
  const titulo = item?.title ?? null

  // Escrita: SEM repetir 5xx (o devopsFetch só repete 429 em POST).
  let status: number
  try {
    const resp = await devopsFetch(
      `${TIMELOG_DOCS}?${API_EXT}`,
      { method: 'POST', headers: devopsAuthHeaders(pat), body: JSON.stringify(montarDocumento(p, titulo)) },
      { client: 'timer-lancar' },
    )
    status = resp.status
    if (!resp.ok) console.warn(`[timer-devops] POST do documento ${p.id}: ${resp.status} ${(await resp.text()).slice(0, 300)}`)
    else await resp.body?.cancel()
  } catch (e) {
    console.warn('[timer-devops] POST do documento falhou na rede:', e)
    status = 0
  }

  const desfecho = desfechoDoPost(status)
  const msg = desfecho === 'lancado'
    ? null
    : desfecho === 'cancelado'
      ? (status === 401 || status === 403
          ? 'O token do Timer não tem permissão para gravar no TimeLog.'
          : `O TimeLog recusou o lançamento (HTTP ${status}).`)
      : 'O TimeLog não confirmou o lançamento. Use "tentar de novo": conferimos antes de regravar.'
  await registrarResultado(p.id, desfecho, titulo, msg)
  return { ...base, status: desfecho, ...(msg ? { mensagem: msg } : {}) }
}

async function lancar(req: Request, userId: string, corpo: Json, pat: string): Promise<Response> {
  const v = validarPedidoLancar(corpo)
  if (!v.ok) return responder(req, 400, { ok: false, motivo: v.motivo, mensagem: 'Pedido de lançamento inválido.' })

  const sb = admin()
  const resultados: ResultadoLancamento[] = []
  for (const g of v.valor) {
    const { data, error } = await sb.rpc('timer_lancamento_preparar', {
      p_user: userId, p_dia: g.dia, p_work_item_id: g.workItemId, p_notas: g.notas,
    })
    if (error) {
      const e = erroDoPreparo(error)
      resultados.push({ dia: g.dia, work_item_id: g.workItemId, status: 'recusado', motivo: e.motivo, mensagem: e.mensagem })
      continue
    }
    resultados.push(await enviar(data as Preparado, pat, false))
  }
  return responder(req, 200, { ok: true, resultados })
}

async function relancar(req: Request, userId: string, corpo: Json, pat: string): Promise<Response> {
  const id = typeof corpo.id === 'string' && /^[0-9a-f-]{36}$/i.test(corpo.id) ? corpo.id : null
  if (!id) return responder(req, 400, { ok: false, motivo: 'id_invalido' })
  const { data, error } = await admin().rpc('timer_lancamento_reenviar', { p_user: userId, p_id: id })
  if (error) {
    const e = erroDoPreparo(error)
    return responder(req, 409, { ok: false, motivo: e.motivo, mensagem: e.mensagem })
  }
  const r = await enviar(data as Preparado, pat, true)
  return responder(req, 200, { ok: true, resultados: [r] })
}

// ─── lançamento automático das 23:50 (cron) ─────────────────────────────────

function cronValido(req: Request): boolean {
  const recebido = req.headers.get('x-cron-secret')
  const esperado = Deno.env.get('CRON_SECRET')
  return !!recebido && !!esperado && recebido === esperado
}

/**
 * O job `timer-lanca-23h50` chama isto. O banco parte os timers rodando e
 * devolve, por pessoa, os itens com tempo pendente no dia; cada um é
 * preparado e enviado como no botão Lançar. Roda em segundo plano para o
 * cron não esperar o Azure.
 */
async function lancarDiaAuto(req: Request): Promise<Response> {
  const pat = patDoTimer()
  if (!pat) return responder(req, 503, { ok: false, motivo: 'pat_ausente' })
  const dia = hojeSaoPaulo()
  const sb = admin()
  const { data, error } = await sb.rpc('timer_auto_pendencias', { p_dia: dia })
  if (error) {
    console.error('[timer-devops] timer_auto_pendencias falhou:', error.message)
    return responder(req, 500, { ok: false, motivo: 'erro_interno' })
  }
  const pendencias = (data ?? []) as { user_id: string; work_item_id: number }[]

  const trabalho = (async () => {
    let lancados = 0
    let falhas = 0
    for (const p of pendencias) {
      const prep = await sb.rpc('timer_lancamento_preparar', {
        p_user: p.user_id, p_dia: dia, p_work_item_id: p.work_item_id, p_notas: 'Timer Flag (automático 23:50)',
      })
      if (prep.error) {
        falhas++
        console.warn(`[timer-devops] auto: preparo recusado (${p.work_item_id}): ${prep.error.message}`)
        continue
      }
      const r = await enviar(prep.data as Preparado, pat, false)
      if (r.status === 'lancado') lancados++
      else falhas++
    }
    console.log(`[timer-devops] auto 23:50 ${dia}: ${pendencias.length} pendência(s), ${lancados} lançada(s), ${falhas} falha(s)`)
  })()

  // @ts-ignore EdgeRuntime existe nas Edge Functions da Supabase
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(trabalho)
  else await trabalho
  return responder(req, 202, { ok: true, dia, pendencias: pendencias.length })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return responder(req, 405, { ok: false, motivo: 'metodo_nao_permitido' })

  // O cron não é uma pessoa: entra só pelo segredo, e só para esta op.
  if (cronValido(req)) {
    let corpoCron: Json = {}
    try {
      corpoCron = await req.json()
    } catch {
      return responder(req, 400, { ok: false, motivo: 'corpo_invalido' })
    }
    if (corpoCron.op === 'lancar_dia_auto') return await lancarDiaAuto(req)
    return responder(req, 400, { ok: false, motivo: 'op_desconhecida' })
  }

  const quem = await usuarioDoJwt(req)
  if (!quem) return responder(req, 401, { ok: false, motivo: 'nao_autenticado' })

  let corpo: Json = {}
  try {
    corpo = await req.json()
  } catch {
    return responder(req, 400, { ok: false, motivo: 'corpo_invalido' })
  }

  if (corpo.op === 'ativar') return await ativar(req, quem.user, quem.token)

  const op = corpo.op
  const OPS = ['minhas', 'buscar', 'filhos', 'criar', 'lancar', 'relancar', 'tags', 'campos', 'reuniao']
  if (typeof op !== 'string' || !OPS.includes(op)) {
    return responder(req, 400, { ok: false, motivo: 'op_desconhecida' })
  }

  const acesso = await acessoAtivo(quem.user.id)
  if (!acesso) return responder(req, 403, { ok: false, motivo: 'timer_sem_acesso', mensagem: 'Você não tem o Timer ativo.' })

  const pat = patDoTimer()
  if (!pat) return responder(req, 503, { ok: false, motivo: 'pat_ausente', mensagem: 'O Timer está sem token do DevOps no servidor.' })

  try {
    if (op === 'minhas') return await minhas(req, quem.user.id, acesso, corpo, pat)
    if (op === 'buscar') return await buscar(req, corpo, pat)
    if (op === 'filhos') return await filhos(req, corpo, pat)
    if (op === 'lancar') return await lancar(req, quem.user.id, corpo, pat)
    if (op === 'relancar') return await relancar(req, quem.user.id, corpo, pat)
    if (op === 'tags') return await tagsDoProjeto(req, corpo, pat)
    if (op === 'campos') return await camposDoProjeto(req, corpo, pat)
    if (op === 'reuniao') return await reuniao(req, quem.user.id, acesso, corpo, pat)
    return await criar(req, quem.user.id, acesso, corpo, pat)
  } catch (e) {
    return erroDevops(req, e)
  }
})
