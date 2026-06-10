import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

export function useTimelogUnificado(filters: TimelogFilters = {}) {
  return useQuery({
    queryKey: ['timelog-unificado', filters],
    queryFn: async () => {
      let query = (supabase as any)
        .from('v_timelog_unified')
        .select(
          'task_id,log_date,user_canonical,vdesk_user_name,minutes_vdesk,minutes_devops,gap_minutes,rows_vdesk,rows_devops,num_os_sample,work_item_title,work_item_state,work_item_url,status'
        )
        .order('log_date', { ascending: false })
        .order('task_id', { ascending: true });

      if (filters.dateFrom) query = query.gte('log_date', filters.dateFrom);
      if (filters.dateTo) query = query.lte('log_date', filters.dateTo);
      if (filters.userCanonical) query = query.eq('user_canonical', filters.userCanonical);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.taskId && filters.taskId.trim()) {
        const id = parseInt(filters.taskId.trim(), 10);
        if (!Number.isNaN(id)) query = query.eq('task_id', id);
      }
      // Escopos grandes (ex.: todas as sprints com tasks consolidadas) estouram o
      // limite de URL do PostgREST — acima do corte, filtra client-side.
      const MAX_IN_FILTER_IDS = 800;
      const idSet = filters.workItemIds?.length ? new Set(filters.workItemIds) : null;
      if (idSet && idSet.size <= MAX_IN_FILTER_IDS) {
        query = query.in('task_id', [...idSet]);
      }

      const { data, error } = await query.limit(2000);
      if (error) throw error;
      let rows = (data ?? []) as unknown as TimelogUnificadoRow[];
      if (idSet && idSet.size > MAX_IN_FILTER_IDS) {
        rows = rows.filter((r) => idSet.has(r.task_id));
      }
      return rows;
    },
    staleTime: 3 * 60 * 1000,
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
      const { data, error } = await (supabase as any)
        .from('vdesk_time_logs')
        .select('usuario_vdesk')
        .limit(2000);
      if (error) throw error;
      const users = [...new Set((data ?? []).map((r: any) => r.usuario_vdesk as string))].sort();
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
