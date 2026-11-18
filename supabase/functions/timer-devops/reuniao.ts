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
  | { ok: true; titulo: string; featureId: number | null; projeto: string | null; tags: string[] }
  | { ok: false; motivo: string; mensagem: string }

/**
 * Corpo da op `reuniao`: o tema vira "Reunião - <tema>"; vai na Feature
 * (`featureId`) ou na raiz do projeto (`projeto`, sem pai) — decisão do Igor,
 * 18/11/2026; o produto é obrigatório (vem como uma das tags, conferida no
 * app); a tag Reunião vai sempre.
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
  if (tags.length < 2) {
    return { ok: false, motivo: 'sem_produto', mensagem: 'Escolha o produto da reunião.' }
  }
  return { ok: true, titulo: `Reunião - ${tema}`, featureId: f, projeto: projeto || null, tags }
}
