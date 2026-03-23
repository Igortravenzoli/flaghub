import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PbiHealthSummary, PbiLifecycleSummary, PbiStageEvent } from '@/types/pbi';

interface IterationChange {
  oldValue: string;
  newValue: string;
  revisedDate: string;
}

interface WorkItemBasic {
  id: number;
  created_date: string | null;
  iteration_history: IterationChange[] | null;
  iteration_path: string | null;
  state: string | null;
  assigned_to_display: string | null;
}

function extractSprintLabel(iterationPath: string): string {
  const parts = iterationPath.split('\\');
  return parts[parts.length - 1] || iterationPath;
}

function buildEnrichedTimeline(
  workItem: WorkItemBasic | null,
  lifecycle: PbiLifecycleSummary | null,
  workItemId: number | null,
): PbiStageEvent[] {
  if (!workItemId) return [];

  const events: PbiStageEvent[] = [];
  let syntheticId = -1;

  const createdDate = workItem?.created_date
    ? new Date(workItem.created_date)
    : lifecycle?.computed_at
      ? new Date(lifecycle.computed_at)
      : null;

  if (!createdDate || Number.isNaN(createdDate.getTime())) return [];

  // 1. Creation event
  const iterHistory = workItem?.iteration_history;
  const firstSprint = iterHistory && iterHistory.length > 0
    ? extractSprintLabel(iterHistory[0].oldValue)
    : lifecycle?.first_committed_sprint || extractSprintLabel(workItem?.iteration_path || '');

  const firstTransitionDate = iterHistory && iterHistory.length > 0
    ? new Date(iterHistory[0].revisedDate)
    : null;

  const creationExitedAt = firstTransitionDate && firstTransitionDate.getTime() < 253370764800000 // < year 9999
    ? firstTransitionDate
    : null;

  const creationDays = creationExitedAt
    ? Math.max(0, Math.round((creationExitedAt.getTime() - createdDate.getTime()) / (24 * 60 * 60 * 1000)))
    : Math.max(0, Math.round((Date.now() - createdDate.getTime()) / (24 * 60 * 60 * 1000)));

  events.push({
    id: syntheticId--,
    work_item_id: workItemId,
    sector: lifecycle?.sector || null,
    stage_key: 'backlog',
    entered_at: createdDate.toISOString(),
    exited_at: creationExitedAt ? creationExitedAt.toISOString() : null,
    duration: creationDays,
    duration_days: creationDays,
    state_at_entry: null,
    state_at_exit: null,
    lead_area: lifecycle?.sector || null,
    sprint_path: null,
    sprint_code: firstSprint,
    responsible_email: workItem?.assigned_to_display || lifecycle?.lead_owner_at_commitment || null,
    inference_method: 'fallback',
    is_overflow: false,
  });

  // 2. Sprint migration events from iteration_history
  if (iterHistory && iterHistory.length > 0) {
    for (let i = 0; i < iterHistory.length; i++) {
      const change = iterHistory[i];
      const revisedDate = new Date(change.revisedDate);
      // Skip sentinel dates (9999-01-01)
      if (revisedDate.getTime() > 253370764800000) continue;

      const nextChange = iterHistory[i + 1];
      const nextDate = nextChange ? new Date(nextChange.revisedDate) : null;
      const exitedAt = nextDate && nextDate.getTime() < 253370764800000 ? nextDate : null;

      const newSprint = extractSprintLabel(change.newValue);
      const durationDays = exitedAt
        ? Math.max(0, Math.round((exitedAt.getTime() - revisedDate.getTime()) / (24 * 60 * 60 * 1000)))
        : Math.max(0, Math.round((Date.now() - revisedDate.getTime()) / (24 * 60 * 60 * 1000)));

      events.push({
        id: syntheticId--,
        work_item_id: workItemId,
        sector: lifecycle?.sector || null,
        stage_key: 'sprint_change',
        entered_at: revisedDate.toISOString(),
        exited_at: exitedAt ? exitedAt.toISOString() : null,
        duration: durationDays,
        duration_days: durationDays,
        state_at_entry: extractSprintLabel(change.oldValue),
        state_at_exit: newSprint,
        lead_area: lifecycle?.sector || null,
        sprint_path: change.newValue,
        sprint_code: newSprint,
        responsible_email: workItem?.assigned_to_display || lifecycle?.lead_owner_at_commitment || null,
        inference_method: 'fallback',
        is_overflow: true,
      });
    }
  }

  return events;
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

  const workItemQuery = useQuery({
    queryKey: ['pbi', 'work-item-base', workItemId],
    enabled: !!workItemId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('devops_work_items')
        .select('id, created_date, iteration_history, iteration_path, state, assigned_to_display')
        .eq('id', workItemId)
        .maybeSingle();

      if (error) throw error;
      return (data || null) as WorkItemBasic | null;
    },
    staleTime: 60 * 1000,
  });

  const stageEvents = (eventsQuery.data && eventsQuery.data.length > 0)
    ? eventsQuery.data
    : buildEnrichedTimeline(
        workItemQuery.data || null,
        lifecycleQuery.data || null,
        workItemId,
      );

  return {
    lifecycle: lifecycleQuery.data || null,
    health: healthQuery.data || null,
    stageEvents,
    workItem: workItemQuery.data || null,
    isLoading: lifecycleQuery.isLoading || healthQuery.isLoading || eventsQuery.isLoading || workItemQuery.isLoading,
    isError: lifecycleQuery.isError || healthQuery.isError || eventsQuery.isError || workItemQuery.isError,
    error: lifecycleQuery.error || healthQuery.error || eventsQuery.error || workItemQuery.error,
    refetch: async () => {
      await Promise.all([
        lifecycleQuery.refetch(),
        healthQuery.refetch(),
        eventsQuery.refetch(),
        workItemQuery.refetch(),
      ]);
    },
  };
}
