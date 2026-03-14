import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TransbordoItem extends FabricaItem {
  overflowCount: number;
  sprintsOverflowed: string[];
}

export interface FabricaItem {
  id: number | null;
  title: string | null;
  work_item_type: string | null;
  state: string | null;
  assigned_to_display: string | null;
  priority: number | null;
  effort: number | null;
  iteration_path: string | null;
  created_date: string | null;
  changed_date: string | null;
  parent_id: number | null;
  parent_title: string | null;
  parent_type: string | null;
  web_url: string | null;
}

function isInRange(dateStr: string | null, from: Date, to: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

/**
 * Parse sprint identifier from iteration_path to enable ordering.
 * Patterns: "Flag.Planejamento\S5-2026" → { year: 2026, num: 5 }
 *           "Flag.Planejamento\Sprint 34" → { year: 0, num: 34 }
 */
function parseSprintOrder(iterPath: string): { year: number; num: number } {
  // Pattern: S{num}-{year}
  const sMatch = iterPath.match(/\\S(\d+)-(\d{4})$/);
  if (sMatch) return { year: parseInt(sMatch[2]), num: parseInt(sMatch[1]) };
  // Pattern: Sprint {num}
  const sprintMatch = iterPath.match(/\\Sprint\s*(\d+)$/);
  if (sprintMatch) return { year: 0, num: parseInt(sprintMatch[1]) };
  return { year: 0, num: 0 };
}

function sprintCompare(a: string, b: string): number {
  const pa = parseSprintOrder(a);
  const pb = parseSprintOrder(b);
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.num - pb.num;
}

export function useFabricaKpis(dateFrom?: Date, dateTo?: Date) {
  const query = useQuery({
    queryKey: ['fabrica', 'kpis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_fabrica_kpis')
        .select('*');
      if (error) throw error;
      return (data || []) as FabricaItem[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const lastSyncQuery = useQuery({
    queryKey: ['fabrica', 'last-sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('devops_queries')
        .select('last_synced_at')
        .order('last_synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.last_synced_at || null;
    },
    staleTime: 60 * 1000,
  });

  // Fetch time logs for hours-based KPIs (when available)
  const timeLogsQuery = useQuery({
    queryKey: ['fabrica', 'time-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('devops_time_logs')
        .select('work_item_id, time_minutes');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const allItems = query.data || [];

  // Apply date filter
  const items = (dateFrom && dateTo)
    ? allItems.filter(i => isInRange(i.created_date, dateFrom, dateTo) || isInRange(i.changed_date, dateFrom, dateTo))
    : allItems;

  const total = items.length;
  const inProgress = items.filter(i => i.state === 'In Progress' || i.state === 'Active').length;
  const toDo = items.filter(i => i.state === 'To Do' || i.state === 'New').length;
  const done = items.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved').length;

  const porColaborador = items.reduce((acc, item) => {
    const name = item.assigned_to_display || 'Não atribuído';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── Corporate KPIs ──────────────────────────────────────────────

  // Check for time_logs data
  const fabricaItemIds = new Set(items.map(i => i.id).filter(Boolean));
  const timeLogs = (timeLogsQuery.data || []).filter(
    tl => tl.work_item_id && fabricaItemIds.has(tl.work_item_id)
  );
  const totalHoursLogged = timeLogs.reduce((sum, tl) => sum + (tl.time_minutes || 0), 0) / 60;
  const hasTimeLogs = timeLogs.length > 0;

  // PBIs / User Stories
  const pbis = items.filter(
    i => i.work_item_type === 'Product Backlog Item' || i.work_item_type === 'User Story'
  );
  const pbisWithEffort = pbis.filter(i => i.effort != null && i.effort > 0);

  // ── Lead Time Médio ─────────────────────────────────────────────
  // Primary: hours from time_logs / PBI count
  // Fallback: average effort (story points) per PBI from DevOps
  let leadTimeMedio: number | null = null;
  let leadTimeSource: 'timelog' | 'effort' | null = null;

  if (hasTimeLogs && pbis.length > 0) {
    leadTimeMedio = Math.round((totalHoursLogged / pbis.length) * 10) / 10;
    leadTimeSource = 'timelog';
  } else if (pbisWithEffort.length > 0) {
    const totalEffort = pbisWithEffort.reduce((sum, i) => sum + (i.effort || 0), 0);
    leadTimeMedio = Math.round((totalEffort / pbisWithEffort.length) * 10) / 10;
    leadTimeSource = 'effort';
  }

  // ── Velocidade Média Squad ──────────────────────────────────────
  // Primary: hours logged / sprint count
  // Fallback: total effort per sprint (average)
  const sprintSet = new Set(items.map(i => i.iteration_path).filter(Boolean) as string[]);
  const sprintCount = sprintSet.size;
  let velocidadeMedia: number | null = null;
  let velocidadeSource: 'timelog' | 'effort' | null = null;

  if (hasTimeLogs && sprintCount > 0) {
    velocidadeMedia = Math.round((totalHoursLogged / sprintCount) * 10) / 10;
    velocidadeSource = 'timelog';
  } else if (sprintCount > 0 && pbisWithEffort.length > 0) {
    // Sum effort by sprint
    const effortBySprint: Record<string, number> = {};
    for (const item of pbisWithEffort) {
      const sp = item.iteration_path || 'unknown';
      effortBySprint[sp] = (effortBySprint[sp] || 0) + (item.effort || 0);
    }
    const sprintsWithEffort = Object.values(effortBySprint);
    if (sprintsWithEffort.length > 0) {
      const avgPerSprint = sprintsWithEffort.reduce((a, b) => a + b, 0) / sprintsWithEffort.length;
      velocidadeMedia = Math.round(avgPerSprint * 10) / 10;
      velocidadeSource = 'effort';
    }
  }

  // ── Transbordo (%) ──────────────────────────────────────────────
  // Items in past sprints that are still active (not Done/Closed/Resolved)
  // "Current sprint" = the latest sprint by naming convention
  const sortedSprints = [...sprintSet].sort(sprintCompare);
  const currentSprint = sortedSprints.length > 0 ? sortedSprints[sortedSprints.length - 1] : null;

  let transbordoPct: number | null = null;
  let transbordoCount = 0;
  let transbordoTotal = 0;
  let transbordoItems: TransbordoItem[] = [];

  if (currentSprint && sortedSprints.length > 1) {
    const pastSprints = new Set(sortedSprints.slice(0, -1));
    const pastSprintItems = items.filter(i => i.iteration_path && pastSprints.has(i.iteration_path));
    transbordoTotal = pastSprintItems.length;

    // Items not done in past sprints
    const overflowedItems = pastSprintItems.filter(
      i => i.state !== 'Done' && i.state !== 'Closed' && i.state !== 'Resolved'
    );
    transbordoCount = overflowedItems.length;
    transbordoPct = transbordoTotal > 0
      ? Math.round((transbordoCount / transbordoTotal) * 100)
      : 0;

    // Count how many past sprints each item appeared in (overflow count)
    // Group by item id across all past sprints
    const itemSprintMap = new Map<number, Set<string>>();
    for (const item of pastSprintItems) {
      if (!item.id || !item.iteration_path) continue;
      if (!itemSprintMap.has(item.id)) itemSprintMap.set(item.id, new Set());
      itemSprintMap.get(item.id)!.add(item.iteration_path);
    }

    // For overflowed items, count sprints they've been in
    const seen = new Set<number>();
    transbordoItems = overflowedItems
      .filter(i => {
        if (!i.id || seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      })
      .map(i => ({
        ...i,
        overflowCount: itemSprintMap.get(i.id!)?.size ?? 1,
        sprintsOverflowed: [...(itemSprintMap.get(i.id!) ?? [])].sort(sprintCompare),
      }));
  }

  // ── Capacidade Plan. vs Util. ───────────────────────────────────
  // Status: Pendente — requires DevOps Capacity API (Boards → Sprints → Capacity)
  // Not calculable from current data

  return {
    items,
    total,
    inProgress,
    toDo,
    done,
    porColaborador,
    lastSync: lastSyncQuery.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    // Corporate KPIs
    leadTimeMedio,
    leadTimeSource,
    velocidadeMedia,
    velocidadeSource,
    transbordoPct,
    transbordoCount,
    transbordoTotal,
    transbordoItems,
    currentSprint,
    sprintCount,
    hasTimeLogs,
  };
}
