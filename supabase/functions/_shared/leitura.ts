// Leitura de listas grandes do PostgREST sem truncar em silêncio.
//
// O PostgREST desta instância roda com `max_rows = 1000`: uma consulta que
// casaria com mais linhas devolve mil, sem erro, sem aviso e sem nada no
// corpo indicando o corte. Todo bug desta família tem a mesma assinatura —
// o código funciona, os números ficam errados, e ninguém vê.
//
// Já custou caro duas vezes: o commit 1dc734d (varredura de estado que lia 1/6
// do que declarava) e o bloco de pais do `devops-sync-query`, corrigido na
// análise de Disk IO de 26/08/2026. Nos dois casos a correção foi manual e
// local, e nos dois casos o arquivo ao lado seguiu errado.
//
// A SUTILEZA QUE O CHUNK SOZINHO NÃO RESOLVE
//
// Fatiar a lista de entrada em mil só basta quando a coluna do filtro é ÚNICA
// na tabela — aí mil ids devolvem no máximo mil linhas. Quando não é
// (`parent_id`, `work_item_id` em `devops_query_items_current`), mil ids podem
// casar com dezenas de milhares de linhas, e o lote continua truncando em mil.
// Por isso aqui há DUAS camadas: fatia a entrada E pagina a saída.
//
// ORDEM TOTAL É OBRIGATÓRIA, não decorativa: `range()` sem `order()` estável
// repete ou pula linhas entre páginas, porque o Postgres não promete ordem
// entre execuções. Por isso `ordem` é parâmetro exigido — quem chama tem de
// declarar um conjunto de colunas que identifique a linha sem empate. Passar
// uma coluna com repetição reintroduz o mesmo bug silencioso que isto existe
// para matar.

export interface LerEmLotesOpts {
  /** Colunas que dão ORDEM TOTAL na tabela (a chave, em geral). Sem empate. */
  ordem: string[]
  /** Ids por requisição. Mantém a query string em tamanho sensato. */
  loteEntrada?: number
  /** Linhas por página de resposta. Não adianta passar do `max_rows`. */
  pagina?: number
  /** Filtros adicionais — recebe e devolve o query builder. */
  refinar?: (q: any) => any
}

const LOTE_ENTRADA_PADRAO = 500
const PAGINA_PADRAO = 1000

/**
 * Lê todas as linhas de `tabela` onde `coluna` está em `valores`.
 *
 * Devolve o conjunto COMPLETO ou lança — nunca um resultado parcial que passe
 * por completo, que é justamente o modo de falha do PostgREST aqui.
 */
export async function lerEmLotes<T = any>(
  admin: any,
  tabela: string,
  colunas: string,
  coluna: string,
  valores: Array<string | number>,
  opts: LerEmLotesOpts,
): Promise<T[]> {
  if (valores.length === 0) return []

  if (!opts.ordem || opts.ordem.length === 0) {
    throw new Error(`lerEmLotes(${tabela}): 'ordem' é obrigatório — sem ordem total a paginação pula linhas`)
  }

  const loteEntrada = opts.loteEntrada ?? LOTE_ENTRADA_PADRAO
  const pagina = opts.pagina ?? PAGINA_PADRAO
  const saida: T[] = []

  for (let i = 0; i < valores.length; i += loteEntrada) {
    const fatia = valores.slice(i, i + loteEntrada)

    for (let inicio = 0; ; inicio += pagina) {
      let q = admin.from(tabela).select(colunas).in(coluna, fatia)
      if (opts.refinar) q = opts.refinar(q)
      for (const col of opts.ordem) q = q.order(col, { ascending: true })

      const { data, error } = await q.range(inicio, inicio + pagina - 1)
      if (error) {
        throw new Error(`lerEmLotes(${tabela}.${coluna}) falhou: ${error.message}`)
      }

      const linhas = (data ?? []) as T[]
      saida.push(...linhas)

      // Página incompleta = acabou. Página cheia pode ser o corte do
      // `max_rows`, então há sempre mais uma volta para confirmar.
      if (linhas.length < pagina) break
    }
  }

  return saida
}
