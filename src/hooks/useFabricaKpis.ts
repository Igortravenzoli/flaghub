import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

function modeValue(arr: string[]): string | null {
  if (arr.length === 0) return null;
  const freq: Record<string, number> = {};
  for (const v of arr) freq[v] = (freq[v] || 0) + 1;
  return Object.entries(freq).sort(([, a], [, b]) => b - a)[0][0];
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

  // Fetch time logs for hours-based KPIs
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

  // --- Corporate KPIs ---
  const fabricaItemIds = new Set(items.map(i => i.id).filter(Boolean));
  const timeLogs = (timeLogsQuery.data || []).filter(
    tl => tl.work_item_id && fabricaItemIds.has(tl.work_item_id)
  );
  const totalHoursLogged = timeLogs.reduce((sum, tl) => sum + (tl.time_minutes || 0), 0) / 60;
  const hasTimeLogs = timeLogs.length > 0;

  // PBIs / User Stories count
  const pbis = items.filter(
    i => i.work_item_type === 'Product Backlog Item' || i.work_item_type === 'User Story'
  );

  // Lead Time Médio: total hours logged / PBI count
  const leadTimeMedio = hasTimeLogs && pbis.length > 0
    ? Math.round((totalHoursLogged / pbis.length) * 10) / 10
    : null;

  // Velocidade Média Squad: total hours logged / number of distinct sprints
  const sprintSet = new Set(items.map(i => i.iteration_path).filter(Boolean));
  const sprintCount = sprintSet.size;
  const velocidadeMedia = hasTimeLogs && sprintCount > 0
    ? Math.round((totalHoursLogged / sprintCount) * 10) / 10
    : null;

  // Transbordo (%): items in past sprints that are not done / total items with sprint
  // Current sprint = the sprint with most active/in-progress items
  const activeIterations = items
    .filter(i => i.state === 'In Progress' || i.state === 'Active')
    .map(i => i.iteration_path)
    .filter(Boolean) as string[];
  const currentSprint = modeValue(activeIterations) || [...sprintSet].pop() || null;

  const itemsWithSprint = items.filter(i => i.iteration_path);
  let transbordoPct: number | null = null;
  if (currentSprint && itemsWithSprint.length > 0) {
    const pastSprintItems = itemsWithSprint.filter(i => i.iteration_path !== currentSprint);
    const pastNotDone = pastSprintItems.filter(
      i => i.state !== 'Done' && i.state !== 'Closed' && i.state !== 'Resolved'
    );
    transbordoPct = pastSprintItems.length > 0
      ? Math.round((pastNotDone.length / pastSprintItems.length) * 100)
      : 0;
  }

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
    velocidadeMedia,
    transbordoPct,
    currentSprint,
    sprintCount,
    hasTimeLogs,
  };
}
