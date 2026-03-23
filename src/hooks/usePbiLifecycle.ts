import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PbiHealthSummary, PbiLifecycleSummary, PbiStageEvent } from '@/types/pbi';

interface IterationChange {
  oldValue: string;
  newValue: string;
  revisedDate: string;
}

interface StateChange {
  oldValue: string | null;
  newValue: string;
  revisedDate: string;
  revisedBy: string | null;
}

interface WorkItemBasic {
  id: number;
  created_date: string | null;
  iteration_history: IterationChange[] | null;
  state_history: StateChange[] | null;
  iteration_path: string | null;
  state: string | null;
  assigned_to_display: string | null;
}

const SENTINEL_TIMESTAMP = new Date('9000-01-01').getTime();

function isSentinelDate(iso: string): boolean {
  return new Date(iso).getTime() > SENTINEL_TIMESTAMP;
}

function extractSprintLabel(iterationPath: string): string {
  const parts = iterationPath.split('\\');
  return parts[parts.length - 1] || iterationPath;
}

/** Map DevOps state names to stage keys for display */
function stateToStageKey(state: string): string {
  const lower = state.toLowerCase();
  if (lower === 'new') return 'backlog';
  if (lower === 'em desenvolvimento' || lower === 'in progress' || lower === 'active') return 'fabrica';
  if (lower === 'em teste') return 'qualidade';
  if (lower === 'aguardando deploy') return 'deploy';
  if (lower === 'done' || lower === 'closed' || lower === 'resolved') return 'done';
  return 'backlog';
}

/** Action label for timeline cards */
const STATE_ACTION_LABELS: Record<string, string> = {
  'New': 'Criação',
  'Em desenvolvimento': 'Em Desenvolvimento',
  'In Progress': 'Em Desenvolvimento',
  'Active': 'Em Desenvolvimento',
  'Em Teste': 'Em Teste',
  'Aguardando Deploy': 'Aguardando Deploy',
  'Done': 'Concluído',
  'Closed': 'Concluído',
  'Resolved': 'Resolvido',
};

function getDurationDays(from: string, to: string): number {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return 0;
  return Math.max(0, Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000)));
}

function buildEnrichedTimeline(
  workItem: WorkItemBasic | null,
  lifecycle: PbiLifecycleSummary | null,
  workItemId: number | null,
): PbiStageEvent[] {
  if (!workItemId) return [];

  const stateHistory = workItem?.state_history || [];
  const iterHistory = workItem?.iteration_history || [];
  const createdDate = workItem?.created_date;

  if (!createdDate) return [];

  const createdMs = new Date(createdDate).getTime();
  if (Number.isNaN(createdMs)) return [];

  // Build a unified event list from state changes and iteration changes
  type RawEvent = {
    type: 'state' | 'sprint_change';
    date: string;
    dateMs: number;
    stateOld?: string | null;
    stateNew?: string;
    sprintOld?: string;
    sprintNew?: string;
    actor?: string | null;
  };

  const rawEvents: RawEvent[] = [];

  // State changes
  for (const sc of stateHistory) {
    if (!sc.revisedDate || isSentinelDate(sc.revisedDate)) continue;
    rawEvents.push({
      type: 'state',
      date: sc.revisedDate,
      dateMs: new Date(sc.revisedDate).getTime(),
      stateOld: sc.oldValue,
      stateNew: sc.newValue,
      actor: sc.revisedBy,
    });
  }

  // Sprint changes
  for (const ic of iterHistory) {
    if (!ic.revisedDate || isSentinelDate(ic.revisedDate)) continue;
    rawEvents.push({
      type: 'sprint_change',
      date: ic.revisedDate,
      dateMs: new Date(ic.revisedDate).getTime(),
      sprintOld: ic.oldValue,
      sprintNew: ic.newValue,
    });
  }

  // If no state_history available, create a minimal creation event
  if (stateHistory.length === 0) {
    rawEvents.push({
      type: 'state',
      date: createdDate,
      dateMs: createdMs,
      stateOld: null,
      stateNew: workItem?.state || 'New',
      actor: workItem?.assigned_to_display || lifecycle?.lead_owner_at_commitment || null,
    });
  }

  // Sort by date
  rawEvents.sort((a, b) => a.dateMs - b.dateMs);

  const events: PbiStageEvent[] = [];
  let syntheticId = -1;

  for (let i = 0; i < rawEvents.length; i++) {
    const ev = rawEvents[i];
    // Find next event of the same type for duration calc (or use next event overall)
    const nextEvent = rawEvents[i + 1];
    const exitedAt = nextEvent ? nextEvent.date : null;
    const exitedMs = nextEvent ? nextEvent.dateMs : Date.now();
    const durationDays = Math.max(0, Math.round((exitedMs - ev.dateMs) / (24 * 60 * 60 * 1000)));

    if (ev.type === 'state') {
      const stateName = ev.stateNew || 'New';
      events.push({
        id: syntheticId--,
        work_item_id: workItemId,
        sector: lifecycle?.sector || null,
        stage_key: stateToStageKey(stateName),
        entered_at: ev.date,
        exited_at: exitedAt && !isSentinelDate(exitedAt) ? exitedAt : null,
        duration: durationDays,
        duration_days: durationDays,
        state_at_entry: ev.stateOld || null,
        state_at_exit: ev.stateNew || null,
        lead_area: lifecycle?.sector || null,
        sprint_path: null,
        sprint_code: extractSprintLabel(workItem?.iteration_path || ''),
        responsible_email: ev.actor || workItem?.assigned_to_display || lifecycle?.lead_owner_at_commitment || null,
        inference_method: 'fallback',
        is_overflow: false,
      });
    } else if (ev.type === 'sprint_change') {
      const oldSprint = extractSprintLabel(ev.sprintOld || '');
      const newSprint = extractSprintLabel(ev.sprintNew || '');
      events.push({
        id: syntheticId--,
        work_item_id: workItemId,
        sector: lifecycle?.sector || null,
        stage_key: 'sprint_change',
        entered_at: ev.date,
        exited_at: exitedAt && !isSentinelDate(exitedAt) ? exitedAt : null,
        duration: durationDays,
        duration_days: durationDays,
        state_at_entry: oldSprint,
        state_at_exit: newSprint,
        lead_area: lifecycle?.sector || null,
        sprint_path: ev.sprintNew || null,
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
        .select('id, created_date, iteration_history, state_history, iteration_path, state, assigned_to_display')
        .eq('id', workItemId)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as WorkItemBasic | null;
    },
    staleTime: 60 * 1000,
  });

  // Prefer enriched timeline from state_history + iteration_history over DB events
  const hasStateHistory = !!(workItemQuery.data?.state_history && (workItemQuery.data.state_history as any[]).length > 0);
  const hasIterHistory = !!(workItemQuery.data?.iteration_history && (workItemQuery.data.iteration_history as any[]).length > 0);

  const stageEvents = (hasStateHistory || hasIterHistory)
    ? buildEnrichedTimeline(
        workItemQuery.data || null,
        lifecycleQuery.data || null,
        workItemId,
      )
    : (eventsQuery.data && eventsQuery.data.length > 0)
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
