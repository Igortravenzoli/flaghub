import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Subindicadores congelados de um escopo (geral ou uma fábrica) na fotografia da sprint */
export interface SnapshotScopeBreakdown {
  total: number;
  cats: {
    priorizacao: number;
    priorizacao_transbordo: number;
    bug: number;
    retorno_qa: number;
    aviao_sprint: number;
    aviao_transbordado: number;
  };
  entregue: { total: number; bug: number; retorno_qa: number; priorizacao: number; aviao: number };
  done: { total: number; bug: number; retorno_qa: number; priorizacao: number; aviao: number };
  priorizado_done: number;
  priorizado_em_dev: number;
}

export interface SprintSnapshotRow {
  sprint_code: string;
  snapshot_source: string | null;
  as_of_datetime: string | null;
  category_breakdown: {
    geral: SnapshotScopeBreakdown;
    fabricas: Record<string, SnapshotScopeBreakdown>;
  } | null;
}

/**
 * Fotografias congeladas das sprints (sprint_indicator_snapshots), indexadas
 * por sprint_code. Usadas pelo gerencial da Fábrica para exibir sprints
 * fechadas como fim-de-sprint (23:59) em vez do estado atual do DevOps.
 */
export function useSprintSnapshots() {
  return useQuery({
    queryKey: ['sprint-snapshots', 'category-breakdown'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('sprint_indicator_snapshots')
        .select('sprint_code, snapshot_source, as_of_datetime, category_breakdown')
        .order('sprint_end_date', { ascending: false })
        .limit(40);
      if (error) throw error;
      const map: Record<string, SprintSnapshotRow> = {};
      for (const row of (data || []) as SprintSnapshotRow[]) {
        if (!map[row.sprint_code]) map[row.sprint_code] = row;
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
