import { CADENCIA_MINIMA_MS } from '@/lib/cadencia';
import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

export type TimelogStatus = 'match' | 'only_vdesk' | 'only_devops' | 'divergent';

export interface TimelogUnificadoRow {
  task_id: number;
  log_date: string;
  user_canonical: string;
  vdesk_user_name: string | null;
  minutes_vdesk: number;
  minutes_devops: number;
  gap_minutes: number;
  rows_vdesk: number | null;
  rows_devops: number | null;
  num_os_sample: string | null;
  work_item_title: string | null;
  work_item_state: string | null;
  work_item_url: string | null;
  status: TimelogStatus;
}

export interface TimelogFilters {
  dateFrom?: string;
  dateTo?: string;
  userCanonical?: string;
  status?: TimelogStatus | '';
  taskId?: string;
  /** Filter to a specific set of DevOps work item IDs (for sector-scoped views) */
  workItemIds?: number[];
}

const UNIFIED_COLUMNS =
  'task_id,log_date,user_canonical,vdesk_user_name,minutes_vdesk,minutes_devops,gap_minutes,rows_vdesk,rows_devops,num_os_sample,work_item_title,work_item_state,work_item_url,status';

/**
 * Quantos ids cabem num `.in()` sem estourar o limite de URL do PostgREST.
 * Escopos grandes são partidos em lotes — NUNCA descartados. A versão anterior
 * abandonava o filtro acima de 800 ids e caía num `.limit(2000)` global ordenado
 * por data: em 08/2026 o escopo da Fábrica já era 2 032 ids contra 6 755 linhas
 * na view, então o mês inteiro vinha cortado em silêncio (export saía vazio e
 * "Horas por Colaborador" ficava menor que o relatório do TimeLog).
 */
const IN_FILTER_CHUNK = 300;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function useTimelogUnificado(filters: TimelogFilters = {}) {
  return useQuery({
    queryKey: ['timelog-unificado', filters],
    queryFn: async () => {
      const applyFilters = (q: any) => {
        let query = q;
        if (filters.dateFrom) query = query.gte('log_date', filters.dateFrom);
        if (filters.dateTo) query = query.lte('log_date', filters.dateTo);
        if (filters.userCanonical) query = query.eq('user_canonical', filters.userCanonical);
        if (filters.status) query = query.eq('status', filters.status);
        if (filters.taskId && filters.taskId.trim()) {
          const id = parseInt(filters.taskId.trim(), 10);
          if (!Number.isNaN(id)) query = query.eq('task_id', id);
        }
        return query;
      };

      const page = (taskIds: number[] | null) => (from: number, to: number) => {
        let query = applyFilters(
          (supabase as any).from('v_timelog_unified').select(UNIFIED_COLUMNS)
        )
          .order('log_date', { ascending: false })
          .order('task_id', { ascending: true });
        if (taskIds) query = query.in('task_id', taskIds);
        return query.range(from, to);
      };

      const ids = filters.workItemIds?.length ? [...new Set(filters.workItemIds)] : null;

      if (!ids) {
        return await fetchAllRows<TimelogUnificadoRow>(page(null));
      }

      const batches = await Promise.all(
        chunk(ids, IN_FILTER_CHUNK).map((slice) => fetchAllRows<TimelogUnificadoRow>(page(slice)))
      );
      return batches.flat();
    },
    staleTime: CADENCIA_MINIMA_MS,
    placeholderData: keepPreviousData,
    // If caller passes workItemIds=[] (still loading), skip query
    enabled: filters.workItemIds === undefined || filters.workItemIds.length > 0,
  });
}

export interface TimelogSyncRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  rows_inserted: number;
  rows_updated: number;
  triggered_by: string;
  error_message: string | null;
}

export function useVdeskSyncTrigger() {
  return useMutation({
    mutationFn: async (params: { from: string; to: string }) => {
      const { data, error } = await (supabase as any).functions.invoke('vdesk-sync-timelog', {
        body: { from: params.from, to: params.to },
      });
      if (error) throw error;
      return data as { ok: boolean; runId: string; from: string; to: string; message: string };
    },
  });
}

export interface CollaboratorMapRow {
  timelog_name: string;
  canonical_name: string | null;
  vdesk_user_name: string | null;
  devops_email: string | null;
  is_active: boolean;
}

export function useCollaboratorMap() {
  return useQuery({
    queryKey: ['collaborator-map'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('devops_collaborator_map')
        .select('timelog_name,canonical_name,vdesk_user_name,devops_email,is_active')
        .order('canonical_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CollaboratorMapRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useVdeskDistinctUsers() {
  return useQuery({
    queryKey: ['vdesk-distinct-users'],
    queryFn: async () => {
      const rows = await fetchAllRows<{ usuario_vdesk: string }>((from, to) =>
        (supabase as any).from('vdesk_time_logs').select('usuario_vdesk').range(from, to)
      );
      const users = [...new Set(rows.map((r) => r.usuario_vdesk))].filter(Boolean).sort();
      return users as string[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useTimelogSyncRuns() {
  return useQuery({
    queryKey: ['timelog-sync-runs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('timelog_sync_runs')
        .select(
          'id,started_at,finished_at,status,rows_inserted,rows_updated,triggered_by,error_message'
        )
        .order('started_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as TimelogSyncRun[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
