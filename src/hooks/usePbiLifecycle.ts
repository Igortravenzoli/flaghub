import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PbiHealthSummary, PbiLifecycleSummary, PbiStageEvent } from '@/types/pbi';

const STAGE_DAYS_FIELDS = [
  { key: 'backlog', field: 'backlog_days' },
  { key: 'design', field: 'design_days' },
  { key: 'fabrica', field: 'fabrica_days' },
  { key: 'qualidade', field: 'qualidade_days' },
  { key: 'deploy', field: 'deploy_days' },
] as const;

function buildSyntheticTimeline(lifecycle: PbiLifecycleSummary | null, workItemId: number | null): PbiStageEvent[] {
  if (!lifecycle || !workItemId) return [];

  const computedAt = lifecycle.computed_at ? new Date(lifecycle.computed_at) : new Date();
  if (Number.isNaN(computedAt.getTime())) return [];

  const events: PbiStageEvent[] = [];
  let cursor = new Date(computedAt);
  let syntheticId = -1;

  for (let i = STAGE_DAYS_FIELDS.length - 1; i >= 0; i -= 1) {
    const stage = STAGE_DAYS_FIELDS[i];
    const daysRaw = Number(lifecycle[stage.field] ?? 0);
    if (daysRaw <= 0) continue;

    const stageDays = Number(daysRaw.toFixed(2));
    const durationMs = Math.round(stageDays * 24 * 60 * 60 * 1000);
    const enteredAt = new Date(cursor.getTime() - durationMs);
    const isCurrentStage = lifecycle.current_stage === stage.key;

    events.unshift({
      id: syntheticId,
      work_item_id: workItemId,
      sector: lifecycle.sector,
      stage_key: stage.key,
      entered_at: enteredAt.toISOString(),
      exited_at: isCurrentStage ? null : cursor.toISOString(),
      duration: stageDays,
      duration_days: stageDays,
      state_at_entry: null,
      state_at_exit: isCurrentStage ? null : stage.key,
      lead_area: lifecycle.sector,
      sprint_path: null,
      sprint_code: lifecycle.last_committed_sprint || lifecycle.first_committed_sprint,
      responsible_email: lifecycle.lead_owner_at_commitment,
      inference_method: 'fallback',
      is_overflow: lifecycle.overflow_count > 0,
    });

    cursor = enteredAt;
    syntheticId -= 1;
  }

  if (events.length > 0) return events;

  // Minimum fallback to keep timeline useful even with partial lifecycle data.
  return [{
    id: -999,
    work_item_id: workItemId,
    sector: lifecycle.sector,
    stage_key: lifecycle.current_stage || 'backlog',
    entered_at: lifecycle.computed_at,
    exited_at: null,
    duration: null,
    duration_days: null,
    state_at_entry: null,
    state_at_exit: null,
    lead_area: lifecycle.sector,
    sprint_path: null,
    sprint_code: lifecycle.last_committed_sprint || lifecycle.first_committed_sprint,
    responsible_email: lifecycle.lead_owner_at_commitment,
    inference_method: 'fallback',
    is_overflow: lifecycle.overflow_count > 0,
  }];
}

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
    stageEvents: (eventsQuery.data && eventsQuery.data.length > 0)
      ? eventsQuery.data
      : buildSyntheticTimeline(lifecycleQuery.data || null, workItemId),
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
