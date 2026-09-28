// Impressão de lançamento do TimeLog — a MESMA conta no Deno e no Postgres.
//
// O devops-sync-timelog precisa saber quais lançamentos do payload diferem do
// que já está gravado sem baixar a base (egress) nem reenviar tudo (upload). O
// critério de "mudou" é o do trigger trg_time_log_revision, que cancela o UPDATE
// quando nenhuma coluna muda: na prática, o `raw`. As colunas derivadas saem do
// `raw` pelo normalizeEntry, então raw igual ⇒ linha igual, com o mesmo código
// de normalização. Mudou a normalização? Rode o sync com {"modo":"completo"}.
//
// O `etag` NÃO serve de versão: em 28/09/2026 os 8.625 lançamentos tinham
// __etag = 1 — a extensão não incrementa na edição.
//
// Impressão = sha256(ext_entry_id + '|' + texto canônico do jsonb). No banco é
// public.timelog_impressao(ext_entry_id, raw) (migration 20260928120000):
//   encode(sha256(convert_to(ext_entry_id || '|' || raw::text, 'UTF8')), 'hex')
//
// `jsonbTexto` reproduz a saída de `jsonb::text` do Postgres:
//   • chaves de objeto por tamanho em bytes e, no empate, byte a byte (é a ordem
//     em que o jsonb guarda as chaves);
//   • separadores ", " e ": ";
//   • strings e números como o JSON.stringify — o escape_json do Postgres escapa
//     o mesmo conjunto (" \ \b \f \n \r \t e \u00xx minúsculo para o resto < 0x20).
// Limite conhecido: número que o JavaScript escreve em notação exponencial
// (1e21, 1e-7) sai diferente no Postgres. O efeito é o lançamento parecer
// alterado em toda rodada — regravação que o trigger cancela —, nunca perder
// mudança.

const codificador = new TextEncoder()

/** Hex da impressão enviado na rodada 2 (64 bits: colisão desprezível). */
export const IMPRESSAO_ENVIADA = 16

/** Hex da impressão somado no resumo do balde: 60 bits cabem no bigint do Postgres. */
const PARCELA_HEX = 15

function compararChaveJsonb(a: string, b: string): number {
  const ba = codificador.encode(a)
  const bb = codificador.encode(b)
  if (ba.length !== bb.length) return ba.length - bb.length
  for (let i = 0; i < ba.length; i++) {
    if (ba[i] !== bb[i]) return ba[i] - bb[i]
  }
  return 0
}

/** Texto que o Postgres devolve em `valor::jsonb::text`. */
export function jsonbTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return 'null'
  switch (typeof valor) {
    case 'string':
      return JSON.stringify(valor)
    case 'number':
      return Number.isFinite(valor) ? JSON.stringify(valor) : 'null'
    case 'boolean':
      return valor ? 'true' : 'false'
    case 'object': {
      if (Array.isArray(valor)) {
        return '[' + valor.map((x) => jsonbTexto(x)).join(', ') + ']'
      }
      // Como o JSON.stringify: chave com undefined ou função não existe no JSON.
      const pares = Object.entries(valor as Record<string, unknown>)
        .filter(([, x]) => x !== undefined && typeof x !== 'function')
      pares.sort(([a], [b]) => compararChaveJsonb(a, b))
      return '{' + pares.map(([k, x]) => `${JSON.stringify(k)}: ${jsonbTexto(x)}`).join(', ') + '}'
    }
    default:
      return 'null'
  }
}

/** sha256 hex (64 caracteres, minúsculo) de ext_entry_id + '|' + jsonb canônico do raw. */
export async function impressaoLancamento(extEntryId: string, raw: unknown): Promise<string> {
  const bytes = codificador.encode(`${extEntryId}|${jsonbTexto(raw)}`)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  let hex = ''
  for (const b of digest) hex += b.toString(16).padStart(2, '0')
  return hex
}

/** Balde = 2 primeiros caracteres do id (até 256 baldes para UUID). No banco: left(ext_entry_id, 2). */
export function baldeDoLancamento(extEntryId: string): string {
  return extEntryId.slice(0, 2)
}

/** Parcela da impressão no resumo do balde. No banco: ('x' || left(h, 15))::bit(60)::bigint. */
export function parcelaDaImpressao(impressao: string): bigint {
  return BigInt(`0x${impressao.slice(0, PARCELA_HEX)}`)
}

export interface ResumoPorBalde {
  baldes: string[]
  qtds: number[]
  /** soma das parcelas em decimal: passa de 2^63 e vai como texto para numeric */
  somas: string[]
}

/**
 * Quantidade e soma das parcelas por balde, em ordem de balde. A soma não
 * depende da ordem das linhas, então o banco refaz a conta com GROUP BY.
 */
export function resumirPorBalde(itens: ReadonlyArray<{ id: string; impressao: string }>): ResumoPorBalde {
  const porBalde = new Map<string, { qtd: number; soma: bigint }>()
  for (const { id, impressao } of itens) {
    const balde = baldeDoLancamento(id)
    const atual = porBalde.get(balde) ?? { qtd: 0, soma: 0n }
    atual.qtd += 1
    atual.soma += parcelaDaImpressao(impressao)
    porBalde.set(balde, atual)
  }
  const baldes = [...porBalde.keys()].sort()
  return {
    baldes,
    qtds: baldes.map((b) => porBalde.get(b)!.qtd),
    somas: baldes.map((b) => porBalde.get(b)!.soma.toString()),
  }
}
