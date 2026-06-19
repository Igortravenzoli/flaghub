import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SnapshotScopeBreakdown } from '@/hooks/useSprintSnapshots';

/**
 * Um ponto da série diária de evolução de uma sprint (visão "evolução").
 * Capturado 1x/dia da sprint aberta pelo cron `sprint-daily-progress`
 * (estado atual do dia), gravado em sprint_daily_progress.
 */
export interface SprintDailyProgressRow {
  sprint_code: string;
  captured_date: string;
  snapshot_datetime: string;
  as_of_datetime: string | null;
  sprint_start_date: string | null;
  sprint_end_date: string | null;
  total_demands: number;
  planned_demands: number;
  unplanned_demands: number;
  delivered_demands: number;
  finalized_demands: number;
  itens_criticos: number;
  itens_atencao: number;
  itens_saudaveis: number;
  avg_lead_time_days: number | null;
  max_lead_time_days: number | null;
  transbordo_count: number;
  qa_done_items: number;
  qa_items_with_return: number;
  qa_return_cycles_total: number;
  qa_return_rate_pct: number;
  qa_avg_return_cycles: number;
  qa_concluidos: number;
  qa_concluidos_sem_retorno: number;
  qa_concluidos_com_retorno: number;
  work_item_count: number;
  category_breakdown: {
    geral: SnapshotScopeBreakdown;
    fabricas: Record<string, SnapshotScopeBreakdown>;
  } | null;
}

/**
 * Série diária (evolução) de uma sprint. Ordenada por captured_date asc.
 * Complementa a foto de fim de sprint (useSprintSnapshots) e a visão ao vivo.
 */
export function useSprintDailyProgress(sprintCode: string | null) {
  return useQuery({
    queryKey: ['sprint-daily-progress', sprintCode],
    queryFn: async () => {
      if (!sprintCode) return [] as SprintDailyProgressRow[];
      const { data, error } = await (supabase as any).rpc('rpc_get_sprint_daily_progress', {
        p_sprint_code: sprintCode,
      });
      if (error) throw error;
      return (data || []) as SprintDailyProgressRow[];
    },
    enabled: !!sprintCode,
    staleTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
