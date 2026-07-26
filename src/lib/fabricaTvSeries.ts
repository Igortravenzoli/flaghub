import type { SnapshotScopeBreakdown, SprintSnapshotRow } from '@/hooks/useSprintSnapshots';
import { cleanFabricaName } from '@/lib/fabricaNames';

/**
 * Séries da Visão Executiva da Fábrica (régua de entrega e matriz fábrica ×
 * sprint), derivadas das fotografias de fim de sprint.
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

/** Fábricas da fotografia, com o rótulo já normalizado ("[K8] - Squad" → "K8"). */
function fabricasNormalizadas(snap: SprintSnapshotRow): Record<string, SnapshotScopeBreakdown> {
  const out: Record<string, SnapshotScopeBreakdown> = {};
  for (const [raw, scope] of Object.entries(snap.category_breakdown?.fabricas ?? {})) {
    out[cleanFabricaName(raw)] = scope;
  }
  return out;
}

export type CelulaFabrica = { pct: number; concluido: number; total: number };
export type LinhaFabrica = {
  fabrica: string;
  /** Uma célula por sprint exibida (chave = rótulo curto); null quando a fábrica não teve escopo. */
  celulas: Record<string, CelulaFabrica | null>;
  /** Qualidade da sprint mais recente exibida (a em curso, se houver). */
  bugPct: number;
  retornoPct: number;
  /** Encerrados na sprint mais recente — é o que ordena as linhas. */
  concluidoRecente: number;
};

export type Matriz = { sprints: string[]; linhas: LinhaFabrica[] };

/**
 * Matriz fábrica × sprint. Só as squads do roster entram: o Épico raiz também
 * produz "Sem fábrica", "DESIGN" e "FLG", que sem escopo iriam para o topo do
 * ranking e inverteriam o pódio (bug corrigido em 14/07 no ranking por caixinha
 * — a mesma armadilha vale aqui).
 */
export function matrizFabricaSprint(
  snapshots: Record<string, SprintSnapshotRow>,
  opts: {
    ano: number;
    maxSprints: number;
    squads: string[];
    /** Coluna ao vivo da sprint aberta, por fábrica. */
    live?: { sprint: string; porFabrica: Record<string, AgregadoLive> } | null;
  },
): Matriz {
  const seladas = sprintsSeladas(snapshots, opts.ano, opts.maxSprints);
  const rotulos = seladas.map((s) => s.sprint_code.split('-')[0]);
  const sprints = opts.live ? [...rotulos, opts.live.sprint] : rotulos;

  const linhas: LinhaFabrica[] = opts.squads.map((fabrica) => {
    const celulas: Record<string, CelulaFabrica | null> = {};
    let bugPct = 0;
    let retornoPct = 0;
    let concluidoRecente = 0;

    for (const snap of seladas) {
      const rotulo = snap.sprint_code.split('-')[0];
      const scope = fabricasNormalizadas(snap)[fabrica];
      if (!scope || scope.total <= 0) {
        celulas[rotulo] = null;
        continue;
      }
      const concluido = concluidoDoEscopo(scope);
      celulas[rotulo] = { pct: pctDe(concluido, scope.total), concluido, total: scope.total };
      bugPct = pctDe(scope.cats.bug, scope.total);
      retornoPct = pctDe(scope.cats.retorno_qa, scope.total);
      concluidoRecente = concluido;
    }

    if (opts.live) {
      const ao = opts.live.porFabrica[fabrica];
      if (ao && ao.total > 0) {
        celulas[opts.live.sprint] = { pct: pctDe(ao.concluido, ao.total), concluido: ao.concluido, total: ao.total };
        bugPct = pctDe(ao.bug, ao.total);
        retornoPct = pctDe(ao.retorno, ao.total);
        concluidoRecente = ao.concluido;
      } else {
        celulas[opts.live.sprint] = null;
      }
    }

    return { fabrica, celulas, bugPct, retornoPct, concluidoRecente };
  });

  // Ordem = encerrados na sprint mais recente, mesma régua da caixinha (TV-3).
  linhas.sort((a, b) => b.concluidoRecente - a.concluidoRecente);
  return { sprints, linhas };
}

export type AgregadoLive = { total: number; concluido: number; bug: number; retorno: number };

export type ItemLive = {
  id?: number | null;
  state?: string | null;
  work_item_type?: string | null;
  tags?: string | null;
};

/**
 * Categoria do item pela mesma precedência do banco (`fn_classifica_demanda`):
 * retorno de QA vence avião, que vence bug. Sem essa ordem um bug com tag de
 * retorno seria contado duas vezes.
 */
export function categoriaDoItem(item: ItemLive): 'retorno_qa' | 'aviao' | 'bug' | 'outro' {
  const t = (item.tags || '').toLowerCase();
  if (/retorno\s*(de\s*)?qa/.test(t)) return 'retorno_qa';
  if (/avi[aã]o/.test(t)) return 'aviao';
  if (item.work_item_type === 'Bug' || /(^|;)\s*bug\s*(;|$)/.test(t)) return 'bug';
  return 'outro';
}

/**
 * Agrega os itens vivos da sprint em curso por fábrica (Épico raiz → squad).
 * `isConcluido` é injetado para a lib não depender do hook (e o teste não
 * precisar de Supabase).
 */
export function agregaLivePorFabrica(
  items: ItemLive[],
  fabricaByItemId: Record<number, string>,
  squads: string[],
  isConcluido: (state: string | null | undefined) => boolean,
): Record<string, AgregadoLive> {
  const permitidas = new Set(squads);
  const out: Record<string, AgregadoLive> = {};

  for (const item of items) {
    if (item.id == null) continue;
    const epico = fabricaByItemId[item.id];
    if (!epico) continue;
    const fabrica = cleanFabricaName(epico);
    if (!permitidas.has(fabrica)) continue;

    const agg = out[fabrica] ?? { total: 0, concluido: 0, bug: 0, retorno: 0 };
    agg.total += 1;
    if (isConcluido(item.state)) agg.concluido += 1;
    const cat = categoriaDoItem(item);
    if (cat === 'bug') agg.bug += 1;
    else if (cat === 'retorno_qa') agg.retorno += 1;
    out[fabrica] = agg;
  }

  return out;
}
