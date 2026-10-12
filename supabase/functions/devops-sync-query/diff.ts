// Diff do devops-sync-query feito no banco (EG-5).
//
// Sem import por URL de propósito: roda no Deno (edge) e é testado no vitest
// (src/test/devopsSyncQueryDiff.test.ts), como o sensivel.ts do sync SGSI.
//
// ── Por quê ────────────────────────────────────────────────────────────────
// A edge roda ~136×/dia por query ativa (o devops-sync-all a chama a cada
// 10 min, uma vez por query) e, em toda chamada, baixava do PostgREST duas
// listas inteiras só para comparar e jogar fora (edge_logs, 09/10/2026, UTC):
//
//   (id, rev) de devops_work_items      4.093 req   1,69 mi linhas   ~40,4 MB
//     dos itens da query, em lotes de 500 (lerEmLotes) — "02-Devops Base
//     Geral" sozinha tem ~11,5 mil itens: 23 requests por rodada.
//   (id, rev) dos pais fora da query      954 req   26 mil linhas     ~0,6 MB
//   work_item_id de devops_query_items_current
//                                       2.450 req   1,69 mi linhas   ~43,5 MB
//     do snapshot da query, em páginas de 1000 (12 por rodada na Base Geral).
//
// bytes/linha medidos no PROD com octet_length(json_agg(t)::text)/count(*),
// que é o corpo que o PostgREST devolve: 23,97 para (id, rev) e 25,72 para
// (work_item_id). Para gravar, na média, nada: a rodada típica não muda rev
// nenhuma e não entra nem sai item de query.
//
// ── A troca ────────────────────────────────────────────────────────────────
// A edge manda o que veio do Azure e recebe só o resultado, escalar (o
// PostgREST corta SETOF em max_rows = 1000 sem avisar):
//
//   rev       rpc_devops_stale_ids(p_ids, p_revs) — a MESMA do EG-2 (ChildrenSync
//             do devops-sync-all), reusada: a regra é idêntica, "sem linha no
//             banco ou rev do banco MENOR". Já está no PROD.
//   snapshot  rpc_devops_query_snapshot_diff(p_query_id, p_ids) — nova (EG-5),
//             devolve {inserir, remover}.
//
// As regras antigas ficam aqui em JS (filtrarPorRev, diffSnapshot): são o
// caminho quando a RPC não existe (PGRST202 = edge publicada antes da
// migration) e a referência que os testes usam para provar a equivalência.

export interface ErroRpc {
  code?: string
  message: string
}

export interface ItemComRev {
  id: number
  rev: number
}

export interface DiffSnapshot {
  inserir: number[]
  remover: number[]
}

/** PGRST202 = o PostgREST não achou a função no schema cache. */
export function rpcAusente(err: ErroRpc | null | undefined): boolean {
  return err?.code === 'PGRST202'
}

/** Migrations que criam as RPCs — vão no log quando a edge cai no fallback. */
export const MIGRATION_EG2 = '20260921120000_eg2_sync_all_rpcs'
export const MIGRATION_EG5 = '20261011120000_eg5_sync_query_diff'

/**
 * Regra antiga do passo 5 e do passo 8, sem mudança:
 *
 *     existingRev === undefined || existingRev < m.rev
 *
 * Mantém ordem e repetições da entrada (é um filter).
 */
export function filtrarPorRev<T extends ItemComRev>(itens: T[], revsNoBanco: Map<number, number>): T[] {
  return itens.filter(m => {
    const existingRev = revsNoBanco.get(m.id)
    return existingRev === undefined || existingRev < m.rev
  })
}

/**
 * Regra antiga do passo 7, sem mudança:
 *   inserir = ids da query que não estão no snapshot (ordem do WIQL, repetição mantida)
 *   remover = ids do snapshot que saíram da query (sem repetição, na ordem lida)
 */
export function diffSnapshot(idsQuery: number[], idsNoSnapshot: number[]): DiffSnapshot {
  const naQuery = new Set(idsQuery)
  const noSnapshot = new Set(idsNoSnapshot)
  return {
    inserir: idsQuery.filter(id => !noSnapshot.has(id)),
    remover: [...noSnapshot].filter(id => !naQuery.has(id)),
  }
}

export type ViaDiff = 'rpc' | 'fallback'

/**
 * Itens que precisam de upsert, decididos no banco por `rpc_devops_stale_ids`.
 *
 * `lerRevsAntigo` é a leitura de (id, rev) de antes; só roda se a RPC faltar
 * (PGRST202). Outro erro da RPC vai para `aoFalhar`: o passo 5 lança (como o
 * lerEmLotes lançava), o passo 8 grava tudo (como a leitura dos pais, que
 * ignorava o erro e tratava o item como novo).
 */
export async function itensParaGravar<T extends ItemComRev>(
  admin: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: ErroRpc | null }> },
  itens: T[],
  lerRevsAntigo: () => Promise<Map<number, number>>,
  aoFalhar: (err: ErroRpc) => T[],
): Promise<{ itens: T[]; via: ViaDiff | 'erro' }> {
  if (itens.length === 0) return { itens: [], via: 'rpc' }

  const { data, error } = await admin.rpc('rpc_devops_stale_ids', {
    p_ids: itens.map(m => m.id),
    p_revs: itens.map(m => m.rev),
  })

  if (error) {
    if (rpcAusente(error)) {
      return { itens: filtrarPorRev(itens, await lerRevsAntigo()), via: 'fallback' }
    }
    return { itens: aoFalhar(error), via: 'erro' }
  }

  if (!Array.isArray(data)) {
    return { itens: aoFalhar({ message: `rpc_devops_stale_ids devolveu ${typeof data}, esperado array` }), via: 'erro' }
  }
  const stale = new Set<number>(data as number[])
  return { itens: itens.filter(m => stale.has(m.id)), via: 'rpc' }
}

/**
 * Diff do snapshot da query, decidido no banco por `rpc_devops_query_snapshot_diff`.
 *
 * `lerSnapshotAntigo` é a leitura paginada de antes; só roda se a RPC faltar
 * (PGRST202). Outro erro lança com a mesma mensagem da leitura antiga
 * ("Current snapshot lookup failed"), que também lançava.
 */
export async function diffSnapshotNoBanco(
  admin: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: ErroRpc | null }> },
  queryId: string,
  idsQuery: number[],
  lerSnapshotAntigo: () => Promise<number[]>,
): Promise<DiffSnapshot & { via: ViaDiff }> {
  const { data, error } = await admin.rpc('rpc_devops_query_snapshot_diff', {
    p_query_id: queryId,
    p_ids: idsQuery,
  })

  if (error) {
    if (rpcAusente(error)) {
      return { ...diffSnapshot(idsQuery, await lerSnapshotAntigo()), via: 'fallback' }
    }
    throw new Error(`Current snapshot lookup failed: ${error.message}`)
  }

  const d = data as { inserir?: unknown; remover?: unknown } | null
  if (!d || !Array.isArray(d.inserir) || !Array.isArray(d.remover)) {
    throw new Error('Current snapshot lookup failed: rpc_devops_query_snapshot_diff devolveu formato inesperado')
  }
  return { inserir: d.inserir as number[], remover: d.remover as number[], via: 'rpc' }
}
