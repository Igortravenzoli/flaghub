import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PbiHealthSummary, PbiLifecycleSummary, PbiStageEvent } from '@/types/pbi';

export function usePbiLifecycle(workItemId: number | null) {
  const lifecycleQuery = useQuery({
    queryKey: ['pbi', 'lifecycle', workItemId],
    enabled: !!workItemId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('pbi_lifecycle_summary')
        .select('*')
        .eq('work_item_id', workItemId)
        .maybeSingle();

      if (error) throw error;
      return (data || null) as PbiLifecycleSummary | null;
    },
    staleTime: 60 * 1000,
  });

  const healthQuery = useQuery({
    queryKey: ['pbi', 'health', workItemId],
    enabled: !!workItemId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('pbi_health_summary')
        .select('*')
        .eq('work_item_id', workItemId)
        .maybeSingle();

      if (error) throw error;
      return (data || null) as PbiHealthSummary | null;
    },
    staleTime: 60 * 1000,
  });

  const eventsQuery = useQuery({
    queryKey: ['pbi', 'stage-events', workItemId],
    enabled: !!workItemId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('pbi_stage_events')
        .select('*')
        .eq('work_item_id', workItemId)
        .order('entered_at', { ascending: true });

      if (error) throw error;
      return (data || []) as PbiStageEvent[];
    },
    staleTime: 60 * 1000,
  });

  return {
    lifecycle: lifecycleQuery.data || null,
    health: healthQuery.data || null,
    stageEvents: eventsQuery.data || [],
    isLoading: lifecycleQuery.isLoading || healthQuery.isLoading || eventsQuery.isLoading,
    isError: lifecycleQuery.isError || healthQuery.isError || eventsQuery.isError,
    error: lifecycleQuery.error || healthQuery.error || eventsQuery.error,
    refetch: async () => {
      await Promise.all([
        lifecycleQuery.refetch(),
        healthQuery.refetch(),
        eventsQuery.refetch(),
      ]);
    },
  };
}
