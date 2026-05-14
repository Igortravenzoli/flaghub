import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type QueueStatus =
  | 'pending'
  | 'approved'
  | 'posting'
  | 'posted'
  | 'duplicated'
  | 'error'
  | 'skipped'
  | 'rejected';

export interface TimelogQueueRow {
  id: string;
  vdesk_log_id: string;
  task_devops: number;
  log_date: string;
  time_minutes: number;
  target_user_email: string | null;
  target_user_display: string | null;
  vdesk_user_name: string;
  notes: string | null;
  status: QueueStatus;
  created_at: string;
  updated_at: string;
}

export function useTimelogQueue(filters?: { status?: string }) {
  return useQuery({
    queryKey: ['timelog-post-queue', filters],
    queryFn: async () => {
      let q = (supabase as any)
        .from('timelog_post_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);
      if (filters?.status) q = q.eq('status', filters.status);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as TimelogQueueRow[];
    },
    staleTime: 60 * 1000,
  });
}

/** Queue a VDESK log entry for later posting to DevOps */
export function useTimelogQueuePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      vdeskLogId: string;
      targetUserEmail?: string;
      dryRun?: boolean;
      notesOverride?: string;
    }) => {
      const { data, error } = await (supabase as any).rpc('rpc_timelog_queue_post', {
        p_vdesk_log_id: params.vdeskLogId,
        p_target_user_email: params.targetUserEmail ?? null,
        p_dry_run: params.dryRun ?? false,
        p_notes_override: params.notesOverride ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['timelog-post-queue'] });
    },
  });
}

/** Approve a pending queue entry — uses SECURITY DEFINER rpc_timelog_set_status */
export function useTimelogQueueApprove() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (queueId: string) => {
      const { data, error } = await (supabase as any).rpc('rpc_timelog_set_status', {
        p_queue_id: queueId,
        p_action: 'approve',
      });
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['timelog-post-queue'] });
    },
  });
}

/** Reset an error/rejected entry back to pending for retry */
export function useTimelogQueueReset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (queueId: string) => {
      const { data, error } = await (supabase as any).rpc('rpc_timelog_set_status', {
        p_queue_id: queueId,
        p_action: 'reset',
      });
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['timelog-post-queue'] });
    },
  });
}

/** Call devops-post-timelog Edge Function */
export function useTimelogQueueProcess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      mode: 'probe' | 'process' | 'process-one' | 'probe-docs' | 'cleanup';
      queueId?: string;
      limit?: number;
      checkIds?: number[];
      taskIds?: number[];
    }) => {
      const { data: { session } } = await (await import('@/integrations/supabase/client')).supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Não autenticado.');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const resp = await fetch(`${supabaseUrl}/functions/v1/devops-post-timelog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(params),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error ?? json?.detail ?? `HTTP ${resp.status}`);
      return json;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['timelog-post-queue'] });
    },
  });
}

/** Reject a pending/error queue entry — uses SECURITY DEFINER rpc_timelog_set_status */
export function useTimelogQueueReject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (queueId: string) => {
      const { data, error } = await (supabase as any).rpc('rpc_timelog_set_status', {
        p_queue_id: queueId,
        p_action: 'reject',
      });
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['timelog-post-queue'] });
    },
  });
}
