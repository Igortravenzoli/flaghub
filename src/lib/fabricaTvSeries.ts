import type { SnapshotScopeBreakdown, SprintSnapshotRow } from '@/hooks/useSprintSnapshots';
import { classificaDemanda, ehAviao } from '@/lib/fabricaClassificacao';

/**
 * Séries da Visão Executiva da Fábrica (régua de entrega), derivadas das
 * fotografias de fim de sprint.
 *
 * Funções puras de propósito: as duas telas de TV consomem daqui e os testes
 * exercitam a regra sem tocar em Supabase.
 *
 * REGRA CENTRAL (26/07/2026): **concluído = done + entregue**, igual ao
 * gerencial. Na fotografia os dois conjuntos são disjuntos por construção
 * (`done` = done/closed/resolved; `entregue` = aguardando teste/em teste/
 * aguardando deploy — migration 20260726120000), então somar não conta o mesmo
 * item duas vezes.
 */

export function concluidoDoEscopo(scope: SnapshotScopeBreakdown): number {
  return scope.done.total + scope.entregue.total;
}

/** Séries do gráfico de evolução por sprint. */
export type SerieSprint = 'Entrega' | 'Retorno QA' | 'Bug';

/**
 * Ids dos itens por trás de cada série, para o drill-down do gráfico.
 *
 * Entrega = done + entregue, na mesma régua de `concluidoDoEscopo` — os dois
 * conjuntos são disjuntos por construção na fotografia, então concatenar não
 * duplica item. Fotos seladas antes da SN-7 (03/08/2026) não têm `ids`:
 * devolve lista vazia e o front avisa em vez de mostrar zero itens como se
 * fosse resposta.
 */
export function idsDaSerie(scope: SnapshotScopeBreakdown, serie: SerieSprint): number[] {
  const ids = scope.ids;
  if (!ids) return [];
  if (serie === 'Entrega') return [...(ids.done ?? []), ...(ids.entregue ?? [])];
  if (serie === 'Bug') return ids.bug ?? [];
  return ids.retorno_qa ?? [];
}

export function pctDe(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((parte / total) * 1000) / 10;
}

export function sprintNum(code: string): number {
  return Number(code.match(/\d+/)?.[0] ?? 0);
}

/** Fotografias do ano vigente, em ordem cronológica, limitadas às N últimas. */
export function sprintsSeladas(
  snapshots: Record<string, SprintSnapshotRow>,
  ano: number,
  maxSprints: number,
): SprintSnapshotRow[] {
  const reAno = new RegExp(`^S\\d+-${ano}$`);
  return Object.values(snapshots)
    .filter((s) => reAno.test(s.sprint_code) && s.category_breakdown)
    .sort((a, b) => sprintNum(a.sprint_code) - sprintNum(b.sprint_code))
    .slice(-maxSprints);
}

export type PontoEntrega = {
  /** Rótulo curto, ex.: "S14". */
  sprint: string;
  code: string;
  total: number;
  concluido: number;
  pct: number;
  bugPct: number;
  retornoPct: number;
  /** true = sprint ainda aberta (dado ao vivo, não fotografia). */
  emCurso: boolean;
};

/** Régua de entrega do escopo geral, uma linha por sprint selada. */
export function serieEntregaGeral(
  snapshots: Record<string, SprintSnapshotRow>,
  opts: { ano: number; maxSprints: number },
): PontoEntrega[] {
  return sprintsSeladas(snapshots, opts.ano, opts.maxSprints).map((s) => {
    const scope = s.category_breakdown!.geral;
    const concluido = concluidoDoEscopo(scope);
    return {
      sprint: s.sprint_code.split('-')[0],
      code: s.sprint_code,
      total: scope.total,
      concluido,
      pct: pctDe(concluido, scope.total),
      bugPct: pctDe(scope.cats.bug, scope.total),
      retornoPct: pctDe(scope.cats.retorno_qa, scope.total),
      emCurso: false,
    };
  });
}

// A matriz fábrica × sprint (e o agregado ao vivo pelo Épico raiz) saiu na F4,
// 23/11/2026: não aparecia em nenhuma tela desde 07/08 e lia as squads do
// formato anterior (K8, FLEXX). Fábrica por sprint mora em `@/lib/fabricaFoto`.

export type ItemLive = {
  id?: number | null;
  state?: string | null;
  work_item_type?: string | null;
  tags?: string | null;
  retorno_qa_hist?: boolean | null;
};

/**
 * Categoria do item, delegando à régua canônica (`@/lib/fabricaClassificacao`,
 * espelho de `fn_classifica_demanda`).
 *
 * A implementação anterior morava aqui e divergia em dois pontos: **ignorava a
 * tag Priorização** (então bug priorizado contava como bug, ao contrário da
 * fotografia de sprint) e usava regex sem âncora de segmento, casando substring
 * — "DEBUG" virava bug. Corrigido em 29/07/2026.
 */
export function categoriaDoItem(item: ItemLive): 'retorno_qa' | 'aviao' | 'bug' | 'outro' {
  const cat = classificaDemanda(item);
  if (cat === 'retorno_qa') return 'retorno_qa';
  if (ehAviao(cat)) return 'aviao';
  if (cat === 'bug') return 'bug';
  return 'outro';
}

