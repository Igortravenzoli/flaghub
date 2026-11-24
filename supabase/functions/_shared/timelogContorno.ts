// O que o devops-sync-timelog faz quando o diff por balde (EG-4) falha.
//
// Até a v3.5, qualquer falha das RPCs do diff caía no caminho legado: regravar os
// ~9,7 mil lançamentos (5,7 MB de upload e o WAL do ON CONFLICT). Medido em
// 24/11/2026: 52 quedas em 30 dias, todas "canceling statement due to statement
// timeout" (8 s do authenticator), 45 delas nos minutos :15 e :45, quando o
// timelog roda junto com outras rotinas e o banco trava por alguns segundos. A
// conta do diff leva 70 ms: o timeout é engarrafamento passageiro, não defeito.
//
// Regra da v3.6: falha passageira ganha UMA nova tentativa depois de uma espera;
// se falhar de novo, a rodada é PULADA (nada é regravado; a próxima, em 15 min,
// compara de novo e pega o que mudou). Regravar tudo fica para três casos:
//   • função ausente (edge publicada antes da migration): esperar não resolve;
//   • pedido explícito de {"modo":"completo"};
//   • PULADAS_ANTES_DE_REGRAVAR rodadas puladas em sequência: o diff está fora do
//     ar de verdade e o dado não pode ficar parado.
//
// Sem import por URL: é testado pelo vitest (src/test/timelogContorno.test.ts).

/** Espera antes da nova tentativa: as travadas medidas duraram de 10 a 20 s. */
export const ESPERA_NOVA_TENTATIVA_MS = 15_000

/** Rodadas puladas em sequência antes de regravar tudo (3 × 15 min = 45 min). */
export const PULADAS_ANTES_DE_REGRAVAR = 3

/** Valor de `meta.diff.modo` no hub_sync_runs de uma rodada pulada. */
export const MODO_PULADO = 'pulado'

export interface ErroRpc {
  code?: string
  message: string
}

export interface RespostaRpc<T> {
  data: T | null
  error: ErroRpc | null
}

/**
 * Função ausente: PGRST202 (o PostgREST não achou) ou 42883 (o Postgres não
 * achou). É a edge publicada antes da migration; tentar de novo não muda nada.
 */
export function falhaEstrutural(err: ErroRpc): boolean {
  return err.code === 'PGRST202' || err.code === '42883'
}

const dormirDeVerdade = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms))

/**
 * Chama a RPC; em falha passageira, espera e chama mais uma vez. Devolve a
 * última resposta e quantas chamadas foram feitas.
 */
export async function comNovaTentativa<T>(
  chamar: () => PromiseLike<RespostaRpc<T>>,
  opcoes: { esperaMs?: number; dormir?: (ms: number) => Promise<void> } = {},
): Promise<RespostaRpc<T> & { tentativas: number }> {
  const primeira = await chamar()
  if (!primeira.error || falhaEstrutural(primeira.error)) return { ...primeira, tentativas: 1 }
  await (opcoes.dormir ?? dormirDeVerdade)(opcoes.esperaMs ?? ESPERA_NOVA_TENTATIVA_MS)
  const segunda = await chamar()
  return { ...segunda, tentativas: 2 }
}

/**
 * Quantas rodadas seguidas foram puladas, a partir da mais recente.
 * `modos` = `meta.diff.modo` das últimas rodadas, da mais nova para a mais velha.
 */
export function puladasSeguidas(modos: Array<string | null | undefined>): number {
  let n = 0
  for (const modo of modos) {
    if (modo !== MODO_PULADO) break
    n++
  }
  return n
}

/** Sem diff nesta rodada: pular ou regravar tudo? */
export function decidirSemDiff(
  err: ErroRpc,
  contexto: { modoCompleto: boolean; puladasAntes: number },
): 'pular' | 'regravar' {
  if (falhaEstrutural(err)) return 'regravar'
  if (contexto.modoCompleto) return 'regravar'
  if (contexto.puladasAntes >= PULADAS_ANTES_DE_REGRAVAR) return 'regravar'
  return 'pular'
}
