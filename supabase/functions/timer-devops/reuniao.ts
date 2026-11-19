// Tags na criação e a "Rec reunião" do Timer (pedido do Igor, 18/11/2026).
// Regras puras, testadas em src/test/timerReuniao.test.ts.

/**
 * Marcadores que mudam KPI de sprint (fn_classifica_demanda): são decisão do
 * gestor e o Timer nunca grava. Ver src/lib/fabricaClassificacao.ts.
 */
const RE_MARCADOR_KPI = [
  /^prioriza[cç][aã]o$/i,
  /^avi[aã]o\b/i,
  /^transbord(o|ad[oa])$/i,
  /^retorno\s*(de\s*)?qa$/i,
  /^bug$/i,
  /^escopopago$/i,
  /^criticidade$/i,
]

export const ehMarcadorKpi = (tag: string) => RE_MARCADOR_KPI.some((re) => re.test(tag.trim()))

export const TAG_REUNIAO = 'Reunião'
export const MAX_TAGS = 12

/**
 * Tags vindas do app: texto limpo (sem ";", que é o separador do DevOps), sem
 * repetição (maiúscula/minúscula), sem os marcadores de KPI, no máximo 12.
 */
export function sanitizarTags(bruto: unknown): string[] {
  if (!Array.isArray(bruto)) return []
  const out: string[] = []
  const vistos = new Set<string>()
  for (const t of bruto) {
    if (typeof t !== 'string') continue
    // eslint-disable-next-line no-control-regex
    const limpo = t.replace(/[;\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!limpo || ehMarcadorKpi(limpo)) continue
    const chave = limpo.toUpperCase()
    if (vistos.has(chave)) continue
    vistos.add(chave)
    out.push(limpo)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

/** "SUITEFLEXX; HEINEKEN" — o formato de System.Tags. */
export const tagsDoDevops = (tags: string[]) => tags.join('; ')

/** Nomes da resposta de GET _apis/wit/tags (array ou { value: [...] }). */
export function nomesDasTags(json: unknown): string[] {
  const lista = Array.isArray(json) ? json : (json as { value?: unknown })?.value
  if (!Array.isArray(lista)) return []
  const nomes = lista
    .map((t) => (t as { name?: unknown })?.name)
    .filter((n): n is string => typeof n === 'string' && n.trim() !== '' && !ehMarcadorKpi(n))
    .map((n) => n.trim())
  return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export type PedidoReuniao =
  | {
      ok: true
      titulo: string
      featureId: number | null
      projeto: string | null
      tags: string[]
      cliente: string | null
      produto: string | null
    }
  | { ok: false; motivo: string; mensagem: string }

/**
 * Corpo da op `reuniao`: o tema vira "Reunião - <tema>"; vai na Feature
 * (`featureId`) ou na raiz do projeto (`projeto`, sem pai) — decisão do Igor,
 * 18/11/2026; cliente e produto vão nos campos de lista (Custom.PRODUTOSS /
 * Custom.CLIENTESS), o produto obrigatório quando o projeto tem o campo; a
 * tag Reunião vai sempre.
 */
export function validarReuniao(corpo: Record<string, unknown>): PedidoReuniao {
  const tema = typeof corpo.tema === 'string' ? corpo.tema.replace(/\s+/g, ' ').trim().replace(/^reuni[aã]o\s*-\s*/i, '') : ''
  if (tema.length < 3 || tema.length > 230) {
    return { ok: false, motivo: 'tema_invalido', mensagem: 'O tema da reunião precisa de 3 a 230 letras.' }
  }
  const f = corpo.featureId == null || corpo.featureId === '' ? null : Number(corpo.featureId)
  if (f !== null && (!Number.isInteger(f) || f <= 0)) {
    return { ok: false, motivo: 'feature_invalida', mensagem: 'Feature inválida.' }
  }
  // eslint-disable-next-line no-control-regex
  const projeto = typeof corpo.projeto === 'string' ? corpo.projeto.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) : ''
  if (f === null && !projeto) {
    return { ok: false, motivo: 'sem_destino', mensagem: 'Escolha a Feature ou o projeto da reunião.' }
  }
  const tags = sanitizarTags([TAG_REUNIAO, ...(Array.isArray(corpo.tags) ? corpo.tags : [])])
  // o produto é obrigatório quando o projeto tem o campo (a edge confere na lista)
  return {
    ok: true,
    titulo: `Reunião - ${tema}`,
    featureId: f,
    projeto: projeto || null,
    tags,
    cliente: textoDeCampo(corpo.cliente),
    produto: textoDeCampo(corpo.produto),
  }
}

// ─── Cliente e Produto: campos de lista fechada (picklist) ─────────────────

/** Texto curto e limpo vindo do app para um campo de lista. */
export function textoDeCampo(v: unknown): string | null {
  if (typeof v !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  return t || null
}

/** allowedValues da resposta de GET …/workitemtypes/{tipo}/fields/{campo}?$expand=allowedValues. */
export function valoresPermitidos(json: unknown): string[] {
  const lista = (json as { allowedValues?: unknown })?.allowedValues
  if (!Array.isArray(lista)) return []
  const nomes = lista.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim())
  return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** O valor da lista (com a grafia dela), sem caixa; fora da lista = null (o DevOps recusaria). */
export function reconciliar(valor: string | null, permitidos: string[]): string | null {
  if (!valor) return null
  const alvo = valor.trim().toLowerCase()
  return permitidos.find((p) => p.toLowerCase() === alvo) ?? null
}

export interface Permitidos {
  clientes: string[]
  produtos: string[]
}

export type Classificacao =
  | { ok: true; ops: Record<string, unknown>[]; cliente: string | null; produto: string | null }
  | { ok: false; motivo: string; mensagem: string }

/**
 * As operações de cliente/produto/tags para o JSON Patch de criação. Valor
 * fora da lista é recusado aqui, com mensagem clara (o DevOps recusaria com
 * erro genérico). Campo que o tipo não tem (lista vazia) não é gravado.
 */
export function opsDeClassificacao(
  pedido: { cliente: string | null; produto: string | null; tags: string[] },
  permitidos: Permitidos,
  /** cliente e produto obrigatórios quando o tipo tem o campo (decisão do Igor, 18/11/2026) */
  obrigatorios = true,
  /** herdado do pai (um clique): valor fora da lista é descartado em vez de recusar */
  tolerante = false,
): Classificacao {
  const ops: Record<string, unknown>[] = []
  let cliente: string | null = null
  let produto: string | null = null
  if (pedido.cliente && permitidos.clientes.length > 0) {
    cliente = reconciliar(pedido.cliente, permitidos.clientes)
    if (!cliente && !tolerante) {
      return { ok: false, motivo: 'cliente_fora_da_lista', mensagem: `O cliente "${pedido.cliente}" não está na lista do DevOps.` }
    }
    if (cliente) ops.push({ op: 'add', path: '/fields/Custom.PRODUTOSS', value: cliente })
  }
  if (pedido.produto && permitidos.produtos.length > 0) {
    produto = reconciliar(pedido.produto, permitidos.produtos)
    if (!produto && !tolerante) {
      return { ok: false, motivo: 'produto_fora_da_lista', mensagem: `O produto "${pedido.produto}" não está na lista do DevOps.` }
    }
    if (produto) ops.push({ op: 'add', path: '/fields/Custom.CLIENTESS', value: produto })
  }
  if (obrigatorios && !cliente && permitidos.clientes.length > 0) {
    return { ok: false, motivo: 'sem_cliente', mensagem: 'Escolha o cliente.' }
  }
  if (obrigatorios && !produto && permitidos.produtos.length > 0) {
    return { ok: false, motivo: 'sem_produto', mensagem: 'Escolha o produto.' }
  }
  if (pedido.tags.length > 0) ops.push({ op: 'add', path: '/fields/System.Tags', value: tagsDoDevops(pedido.tags) })
  return { ok: true, ops, cliente, produto }
}


/**
 * Só as tags que JÁ EXISTEM no projeto (com a grafia de lá). A identidade do
 * token do Timer não tem "Criar definição de tag" (403 no namespace Tagging,
 * 19/11/2026): uma tag nova derrubava a criação inteira. As outras são
 * descartadas e o app avisa quais foram.
 */
export function soTagsExistentes(tags: string[], existentes: string[]): { mantidas: string[]; descartadas: string[] } {
  const porNome = new Map(existentes.map((e) => [e.trim().toUpperCase(), e.trim()]))
  const mantidas: string[] = []
  const descartadas: string[] = []
  for (const t of tags) {
    const achada = porNome.get(t.trim().toUpperCase())
    if (achada) mantidas.push(achada)
    else descartadas.push(t)
  }
  return { mantidas, descartadas }
}
