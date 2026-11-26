// Regras puras das tarefas do Timer (sem Deno e sem rede; testadas no vitest
// em src/test/timerTarefas.test.ts).

export const ORG = 'FlagIW'

/** Forma que o front já sabe agrupar (src/lib/minhasAtividades.ts, ItemDevops). */
export interface ItemTarefa {
  id: number
  title: string | null
  state: string | null
  work_item_type: string | null
  parent_id: number | null
  iteration_path: string | null
  web_url: string | null
  tags: string | null
  team_project: string | null
  area_path: string | null
  /** Custom.PRODUTOSS (o nome é trocado no DevOps: guarda o CLIENTE) */
  cliente: string | null
  /** Custom.CLIENTESS (o nome é trocado no DevOps: guarda o PRODUTO) */
  produto: string | null
}

/**
 * Cliente e Produto são campos de lista fechada (picklist) do DevOps da Flag,
 * com os nomes TROCADOS (mapeamento da Mode.IA, docs/devops-field-analysis.md):
 * "Clientes" na tela = Custom.PRODUTOSS; "Produtos" na tela = Custom.CLIENTESS.
 * Não "corrigir" a troca sem reconferir na API.
 */
export const CAMPO_CLIENTE = 'Custom.PRODUTOSS'
export const CAMPO_PRODUTO = 'Custom.CLIENTESS'

export const CAMPOS_ITEM = [
  'System.Id',
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.Parent',
  'System.IterationPath',
  'System.AreaPath',
  'System.TeamProject',
  'System.Tags',
  'Custom.PRODUTOSS',
  'Custom.CLIENTESS',
]

export const TIPOS_ATRIBUIVEIS = ['Product Backlog Item', 'Bug', 'Task']
export const TIPOS_BUSCAVEIS = ['Epic', 'Feature', 'Product Backlog Item', 'Bug', 'Task']
export const ESTADOS_FECHADOS = ['Done', 'Closed', 'Removed']

/** Converte um item do Azure (workitemsbatch) para ItemTarefa. */
export function paraItem(wi: unknown): ItemTarefa | null {
  const w = wi as { id?: unknown; fields?: Record<string, unknown> } | null
  const id = typeof w?.id === 'number' ? w.id : Number(w?.fields?.['System.Id'])
  if (!Number.isInteger(id) || id <= 0) return null
  const f = w?.fields ?? {}
  const s = (k: string) => (typeof f[k] === 'string' ? (f[k] as string) : null)
  const pai = Number(f['System.Parent'])
  const projeto = s('System.TeamProject')
  return {
    id,
    title: s('System.Title'),
    state: s('System.State'),
    work_item_type: s('System.WorkItemType'),
    parent_id: Number.isInteger(pai) && pai > 0 ? pai : null,
    iteration_path: s('System.IterationPath'),
    web_url: projeto ? `https://dev.azure.com/${ORG}/${encodeURIComponent(projeto)}/_workitems/edit/${id}` : null,
    tags: s('System.Tags'),
    team_project: projeto,
    area_path: s('System.AreaPath'),
    cliente: s('Custom.PRODUTOSS')?.trim() || null,
    produto: s('Custom.CLIENTESS')?.trim() || null,
  }
}

/** Texto seguro dentro de aspas simples na WIQL. */
export function literalWiql(texto: string): string {
  // eslint-disable-next-line no-control-regex
  const limpo = texto.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100)
  return `'${limpo.replace(/'/g, "''")}'`
}

export function wiqlMinhas(email: string): string {
  const tipos = TIPOS_ATRIBUIVEIS.map(literalWiql).join(', ')
  const fechados = ESTADOS_FECHADOS.map(literalWiql).join(', ')
  return (
    `SELECT [System.Id] FROM WorkItems ` +
    `WHERE [System.AssignedTo] = ${literalWiql(email)} ` +
    `AND [System.WorkItemType] IN (${tipos}) ` +
    `AND [System.State] NOT IN (${fechados}) ` +
    `ORDER BY [System.ChangedDate] DESC`
  )
}

export type Busca = { tipo: 'id'; id: number } | { tipo: 'texto'; texto: string } | { tipo: 'curta' }

/** "#16603" ou "16603" = número exato; texto precisa de 3+ caracteres. */
export function interpretarBusca(bruto: unknown): Busca {
  const t = typeof bruto === 'string' ? bruto.trim() : ''
  const num = t.match(/^#?(\d{1,9})$/)
  if (num) return { tipo: 'id', id: Number(num[1]) }
  if (t.replace(/^#/, '').length < 3) return { tipo: 'curta' }
  return { tipo: 'texto', texto: t.slice(0, 100) }
}

export function wiqlBusca(texto: string): string {
  const tipos = TIPOS_BUSCAVEIS.map(literalWiql).join(', ')
  return (
    `SELECT [System.Id] FROM WorkItems ` +
    `WHERE [System.Title] CONTAINS ${literalWiql(texto)} ` +
    `AND [System.WorkItemType] IN (${tipos}) ` +
    `AND [System.State] <> 'Removed' ` +
    `ORDER BY [System.ChangedDate] DESC`
  )
}

/**
 * Os filhos ABERTOS de um item (19/11/2026): Done, Closed e Removed ficam de
 * fora. Antes vinha tudo menos Removed, e num PBI com centenas de Tasks
 * fechadas (o 2700 passa de mil) as abertas nem cabiam nos 200 da consulta.
 */
export function wiqlFilhos(id: number): string {
  const fechados = ESTADOS_FECHADOS.map(literalWiql).join(', ')
  return (
    `SELECT [System.Id] FROM WorkItemLinks ` +
    `WHERE [Source].[System.Id] = ${Math.trunc(id)} ` +
    `AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward' ` +
    `AND [Target].[System.State] NOT IN (${fechados}) ` +
    `MODE (MustContain)`
  )
}

/** Ids dos filhos na resposta de uma WIQL de links (ignora a linha da origem). */
export function idsDosFilhos(resposta: unknown, origem: number): number[] {
  const rel = (resposta as { workItemRelations?: Array<{ source?: { id?: number } | null; target?: { id?: number } }> })
    ?.workItemRelations
  if (!Array.isArray(rel)) return []
  const ids = rel
    .filter((r) => r?.source?.id === origem && typeof r?.target?.id === 'number')
    .map((r) => r.target!.id as number)
  return [...new Set(ids)]
}

export function idsDaWiql(resposta: unknown, teto: number): { ids: number[]; truncado: boolean } {
  const lista = (resposta as { workItems?: Array<{ id?: number }> })?.workItems
  if (!Array.isArray(lista)) return { ids: [], truncado: false }
  const ids = lista.map((w) => w?.id).filter((x): x is number => typeof x === 'number')
  return { ids: ids.slice(0, teto), truncado: ids.length > teto }
}

// ─── criação ────────────────────────────────────────────────────────────────

export type TipoCriacao = 'Task' | 'Product Backlog Item'

/** Quem pode ser pai de quem, no que o Timer cria. */
export const PAI_PERMITIDO: Record<TipoCriacao, string[]> = {
  Task: ['Product Backlog Item', 'Bug'],
  'Product Backlog Item': ['Feature'],
}

export type ValidacaoCriacao =
  | { ok: true; tipo: TipoCriacao; titulo: string; paiId: number; descricao: string | null }
  | { ok: false; motivo: string }

export function validarCriacao(corpo: Record<string, unknown>): ValidacaoCriacao {
  const tipo = corpo.tipo === 'Task' ? 'Task' : corpo.tipo === 'PBI' || corpo.tipo === 'Product Backlog Item' ? 'Product Backlog Item' : null
  if (!tipo) return { ok: false, motivo: 'tipo_invalido' }
  const titulo = typeof corpo.titulo === 'string' ? corpo.titulo.replace(/\s+/g, ' ').trim() : ''
  if (titulo.length < 3 || titulo.length > 255) return { ok: false, motivo: 'titulo_invalido' }
  const paiId = Number(corpo.paiId)
  if (!Number.isInteger(paiId) || paiId <= 0) return { ok: false, motivo: 'pai_invalido' }
  const descricao = typeof corpo.descricao === 'string' && corpo.descricao.trim()
    ? corpo.descricao.trim().slice(0, 4000)
    : null
  return { ok: true, tipo, titulo, paiId, descricao }
}

/** HTML mínimo e escapado para System.Description. */
export function descricaoHtml(texto: string): string {
  const esc = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.split(/\r?\n/).map((l) => `<div>${l || '<br>'}</div>`).join('')
}

// ─── sprint ─────────────────────────────────────────────────────────────────

/** yyyy-mm-dd no fuso de São Paulo. */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora)
}

/**
 * Mesmo calendário oficial de src/lib/sprintCalendar.ts
 * (getCurrentOfficialSprintCode): a S1 começa na primeira segunda do ano e
 * cada sprint tem 14 dias. Reescrito em UTC puro para a edge; o vitest
 * confere que os dois dão o mesmo código em todos os dias de três anos.
 */
export function sprintOficial(hoje: string): string {
  const [ano, mes, dia] = hoje.split('-').map(Number)
  const jan1 = Date.UTC(ano, 0, 1)
  const dow = new Date(jan1).getUTCDay()
  const ateSegunda = (8 - (dow === 0 ? 7 : dow)) % 7
  const inicio = jan1 + ateSegunda * 86_400_000
  const dias = Math.round((Date.UTC(ano, mes - 1, dia) - inicio) / 86_400_000)
  const n = dias < 0 ? 1 : Math.floor(dias / 14) + 1
  return `S${n}-${ano}`
}

export interface NoIteracao {
  name?: string
  path?: string
  children?: NoIteracao[]
}

/** O path da árvore vem "\Proj\Iteration\X"; o campo espera "Proj\X". */
export function caminhoDoNo(path: string): string {
  const partes = path.replace(/^\\+/, '').split('\\')
  if (partes[1] === 'Iteration') partes.splice(1, 1)
  return partes.join('\\')
}

/** Nó de iteração cujo nome traz o código da sprint (ex.: "S23-2026"). */
export function acharIteracao(raiz: NoIteracao | null | undefined, codigo: string): string | null {
  if (!raiz) return null
  const alvo = codigo.toUpperCase()
  const pilha: NoIteracao[] = [raiz]
  while (pilha.length > 0) {
    const n = pilha.shift()!
    const cod = n.name?.match(/S\d+-\d{4}/i)?.[0]?.toUpperCase()
    if (cod === alvo && n.path) return caminhoDoNo(n.path)
    pilha.push(...(n.children ?? []))
  }
  return null
}

/** Iteração na raiz do projeto não é sprint (o item some do quadro). */
export function ehRaiz(iteracao: string | null | undefined): boolean {
  return !iteracao || !iteracao.includes('\\')
}

// ─── concluir (19/11/2026) ──────────────────────────────────────────────────
// "Encerrar demanda" leva a Task para o estado de conclusão do processo do
// projeto (Done no Scrum, Closed no Agile). Só Task, só atribuída à própria
// pessoa: PBI e Bug fecham por quem cuida do backlog.

/** O estado da categoria Completed do tipo (API workitemtypes/{tipo}/states); sem ela, Done. */
export function estadoConcluido(estados: unknown): string {
  const lista = (estados as { value?: { name?: unknown; category?: unknown }[] } | null)?.value ?? []
  const achado = lista.find((e) => e?.category === 'Completed' && typeof e.name === 'string')
  return (achado?.name as string | undefined) ?? 'Done'
}

// 25/11/2026 (pedido do Igor): PBI e Bug também andam pelo Timer. Quem muda o
// estado é o responsável pelo item, e o PBI tem mais de um passo até o fim
// (New › Em desenvolvimento › Aguardando Teste › … › Done): no encerrar, a
// pessoa escolhe para onde ele vai, e o padrão é o estado de conclusão.

/** Tipos cujo estado o Timer muda no encerrar. */
export const TIPOS_QUE_ANDAM = ['Task', 'Product Backlog Item', 'Bug']

const ORDEM_CATEGORIA: Record<string, number> = { Proposed: 0, InProgress: 1, Resolved: 2, Completed: 3 }

export interface EstadoDoTipo {
  nome: string
  categoria: string
}

/**
 * Os estados do tipo que o Timer pode gravar: todos menos a categoria Removed,
 * na ordem do fluxo (a categoria manda; dentro dela, a ordem do DevOps).
 */
export function estadosDoTipo(estados: unknown): EstadoDoTipo[] {
  const lista = (estados as { value?: { name?: unknown; category?: unknown }[] } | null)?.value ?? []
  return lista
    .filter((e) => typeof e?.name === 'string' && (e.name as string).trim() !== '' && e.category !== 'Removed')
    .map((e, i) => ({ nome: e.name as string, categoria: typeof e.category === 'string' ? e.category : '', i }))
    .sort((a, b) => (ORDEM_CATEGORIA[a.categoria] ?? 1) - (ORDEM_CATEGORIA[b.categoria] ?? 1) || a.i - b.i)
    .map(({ nome, categoria }) => ({ nome, categoria }))
}

/**
 * Para onde o item vai no encerrar.
 *   • com `pedido` (o estado escolhido na tela): tem de ser um estado do tipo,
 *     fora da categoria Removed; devolve o nome como o DevOps escreve.
 *   • sem `pedido`: a Task vai para o estado de conclusão (como desde 19/11);
 *     PBI e Bug não mudam (`destino: null`) — só andam com escolha explícita.
 */
export function destinoDoEncerrar(
  tipo: string,
  pedido: unknown,
  estados: unknown,
): { ok: true; destino: string | null } | { ok: false; motivo: 'estado_invalido' } {
  if (pedido === undefined || pedido === null || pedido === '') {
    return { ok: true, destino: tipo === 'Task' ? estadoConcluido(estados) : null }
  }
  if (typeof pedido !== 'string' || pedido.length > 100) return { ok: false, motivo: 'estado_invalido' }
  const alvo = pedido.trim().toLowerCase()
  const achado = estadosDoTipo(estados).find((e) => e.nome.toLowerCase() === alvo)
  return achado ? { ok: true, destino: achado.nome } : { ok: false, motivo: 'estado_invalido' }
}

// 26/11/2026 (regra do Igor): PBI e Bug só vão para o estado de conclusão
// quando não têm filho aberto. Os passos intermediários (Em desenvolvimento,
// Aguardando Teste…) seguem livres; a Task não tem a regra.

/** Tipos que só fecham sem filho aberto. */
export const TIPOS_QUE_FECHAM_SEM_FILHO_ABERTO = ['Product Backlog Item', 'Bug']

/** O destino é um estado de conclusão do tipo (categoria Completed)? */
export function ehConclusao(destino: string, estados: unknown): boolean {
  const alvo = destino.trim().toLowerCase()
  return estadosDoTipo(estados).some((e) => e.categoria === 'Completed' && e.nome.toLowerCase() === alvo)
}

/** O aviso de quem tentou fechar um PBI/Bug com filho aberto: diz quais são. */
export function mensagemFilhosAbertos(id: number, destino: string, abertos: number[]): string {
  const n = abertos.length
  const lista = abertos.slice(0, 5).map((f) => `#${f}`).join(', ') + (n > 5 ? ` e mais ${n - 5}` : '')
  return `O item #${id} tem ${n} ${n === 1 ? 'filho aberto' : 'filhos abertos'} (${lista}). Conclua ${n === 1 ? 'ele' : 'eles'} antes de levar o item para ${destino}.`
}

// 26/11/2026 (pedido do Igor): deu play, a Task sai de To Do e vai para In
// Progress. Só Task: o PBI e o Bug têm mais de um passo e seguem andando só no
// encerrar, com o destino escolhido na tela.

/** Tipos cujo estado o Timer muda ao INICIAR o timer. */
export const TIPOS_QUE_ANDAM_AO_INICIAR = ['Task']

/**
 * Para onde o item vai quando o timer começa: só sai de um estado da categoria
 * Proposed (To Do, New) para o primeiro da categoria InProgress do tipo.
 * `null` = fica onde está (já em andamento, concluído, removido, estado que o
 * tipo não conhece, ou tipo sem estado "em andamento").
 */
export function destinoDoIniciar(estadoAtual: string, estados: unknown): string | null {
  const lista = estadosDoTipo(estados)
  const alvo = estadoAtual.trim().toLowerCase()
  const atual = lista.find((e) => e.nome.toLowerCase() === alvo)
  if (!atual || atual.categoria !== 'Proposed') return null
  return lista.find((e) => e.categoria === 'InProgress')?.nome ?? null
}

/**
 * A Task está atribuída a esta pessoa? Compara o GUID do DevOps e, sem ele, o
 * e-mail (uniqueName), sem diferenciar maiúsculas.
 */
export function atribuidoA(
  atribuido: unknown,
  pessoa: { devops_guid: string | null; devops_email: string | null; email: string },
): boolean {
  const a = atribuido as { id?: unknown; uniqueName?: unknown } | null
  if (!a || typeof a !== 'object') return false
  if (pessoa.devops_guid && typeof a.id === 'string' && a.id.toLowerCase() === pessoa.devops_guid.toLowerCase()) return true
  const nome = typeof a.uniqueName === 'string' ? a.uniqueName.toLowerCase() : ''
  return !!nome && [pessoa.devops_email, pessoa.email].some((e) => !!e && e.toLowerCase() === nome)
}
