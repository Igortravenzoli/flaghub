import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SprintHistoricalData {
  sprint_code: string;
  total_demands: number;
  planned_demands: number;
  unplanned_demands: number;
  delivered_demands: number;
  finalized_demands: number;
  delivered_in_dev: number;
  delivered_in_qa: number;
  unplanned_bug_count: number;
  unplanned_retorno_qa_count: number;
  unplanned_aviao_count: number;
  itens_criticos: number;
  itens_atencao: number;
  itens_saudaveis: number;
  avg_lead_time_days: number | null;
  max_lead_time_days: number | null;
  transbordo_count: number;
  work_item_count: number;
  source_work_item_ids: number[];
  snapshot_datetime: string;
  captured_by: string;
  notes: string | null;
  qa_done_items: number;
  qa_items_with_return: number;
  qa_return_cycles_total: number;
  qa_return_rate_pct: number;
  qa_avg_return_cycles: number;
}

export interface SprintBackfillResult {
  sprint_code: string;
  status: string;
  snapshot_id: string | null;
  qa_done_items: number | null;
  qa_items_with_return: number | null;
  qa_return_cycles_total: number | null;
}

export interface SprintSnapshot {
  sprint_code: string;
  total_demands: number;
  planned_demands: number;
  unplanned_demands: number;
  delivered_demands: number;
  finalized_demands: number;
  snapshot_datetime: string;
  snapshot_age_days: number;
  itens_criticos: number;
  avg_lead_time_days: number | null;
}

export interface SprintComparison {
  metric: string;
  sprint_1_value: string;
  sprint_2_value: string;
  difference: string;
  direction: string;
}

/**
 * Consulta dados históricos congelados de uma sprint específica
 * Exemplo: Como terminou a Sprint S8-2026?
 */
export function useSprintHistorical(sprintCode: string | null) {
  return useQuery({
    queryKey: ['sprint-historical', sprintCode],
    queryFn: async () => {
      if (!sprintCode) return null;
      
      const { data, error } = await supabase.rpc('rpc_get_sprint_historical_v2', {
        p_sprint_code: sprintCode,
      });
      
      if (error) throw error;
      return data?.[0] as SprintHistoricalData | undefined;
    },
    enabled: !!sprintCode,
    staleTime: 60 * 60 * 1000, // 1 hora (dado histórico não muda frequentemente)
  });
}

/**
 * Lista últimas N sprints com snapshots capturados
 */
export function useSprintSnapshots(limit = 20) {
  return useQuery({
    queryKey: ['sprint-snapshots', limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_list_sprint_snapshots', {
        p_limit: limit,
      });
      
      if (error) throw error;
      return (data || []) as SprintSnapshot[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
  });
}

/**
 * Compara indicadores de duas sprints
 * Útil para análise de tendências
 */
export function useCompareSprintSnapshots(sprintCode1: string | null, sprintCode2: string | null) {
  return useQuery({
    queryKey: ['sprint-comparison', sprintCode1, sprintCode2],
    queryFn: async () => {
      if (!sprintCode1 || !sprintCode2) return null;
      
      const { data, error } = await supabase.rpc('rpc_compare_sprint_snapshots', {
        p_sprint_1: sprintCode1,
        p_sprint_2: sprintCode2,
      });
      
      if (error) throw error;
      return (data || []) as SprintComparison[];
    },
    enabled: !!(sprintCode1 && sprintCode2),
    staleTime: 60 * 60 * 1000, // 1 hora
  });
}

/**
 * Captura um novo snapshot da sprint (usa estado atual)
 * Geralmente chamado ao final de uma sprint
 */
export function useCaptureSprintSnapshot() {
  return async (sprintCode: string, notes?: string) => {
    const { data, error } = await supabase.rpc('rpc_capture_sprint_snapshot', {
      p_sprint_code: sprintCode,
      p_notes: notes || null,
    });
    
    if (error) throw error;
    return data?.[0];
  };
}

/**
 * Retroprocessa snapshots para todas as sprints encerradas de um ano.
 * Mantem compatibilidade com a rotina atual e adiciona suporte historico para QA.
 */
export function useBackfillClosedSprintSnapshots() {
  return async (year: number, forceReprocess = false, notes?: string) => {
    const { data, error } = await supabase.rpc('rpc_backfill_closed_sprint_snapshots', {
      p_year: year,
      p_force_reprocess: forceReprocess,
      p_notes: notes || null,
    });

    if (error) throw error;
    return (data || []) as SprintBackfillResult[];
  };
}
