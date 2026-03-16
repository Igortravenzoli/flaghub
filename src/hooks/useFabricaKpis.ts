import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

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
  /** Tags string (semicolon-separated) — populated from vw_fabrica_kpis */
  tags?: string | null;
  /**
   * false for Tasks/Bugs whose parent PBI is also in the queue,
   * and for child Tasks pulled in via the second UNION.
   * Use kpiItems (count_in_kpi !== false) for metric counts to avoid
   * double-counting PBIs alongside their child Tasks.
   */
  count_in_kpi?: boolean;
}

export interface TimelogAggregation {
  name: string;
  hours: number;
  minutes: number;
}

function isInRange(dateStr: string | null, from: Date, to: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

function parseSprintOrder(iterPath: string): { year: number; num: number } {
  const sMatch = iterPath.match(/\\S(\d+)-(\d{4})$/);
  if (sMatch) return { year: parseInt(sMatch[2]), num: parseInt(sMatch[1]) };
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

/** Known product tags — only these are considered "products" */
const KNOWN_PRODUCTS = new Set([
  'FLEXX', 'FLEXXSALES', 'CONNECTSALES', 'FLEXXGO', 'FLEXXGPS',
  'HEISHOP', 'PORTALBROKER', 'PORTAL BROKER', 'FLEXXLEAD', 'QUICKONE',
  'CONNECTMERCHAN',
]);

/** Canonical product name normalization */
function normalizeProduct(tag: string): string {
  const upper = tag.toUpperCase();
  if (upper === 'PORTALBROKER' || upper === 'PORTAL BROKER') return 'Portal Broker';
  if (upper === 'CONNECTMERCHAN') return 'ConnectMerchan';
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

/** Extract only known product tags from a tags string */
function extractProducts(tags: string | null): string[] {
  if (!tags) return [];
  return tags.split(';').map(t => t.trim()).filter(t => KNOWN_PRODUCTS.has(t.toUpperCase()));
}

/** Normalise a raw user name for dedup: strip diacritics, lowercase, collapse spaces */
function normalizeUserName(name: string | null): string {
  if (!name) return 'Desconhecido';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function useFabricaKpis(dateFrom?: Date, dateTo?: Date, sprintFilter: string = 'all') {
  const query = useQuery({
    queryKey: ['fabrica', 'kpis'],
    queryFn: async () => {
      return fetchAllRows<FabricaItem>((from, to) =>
        supabase.from('vw_fabrica_kpis').select('*').range(from, to)
      );
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

  // ── Time logs: server-side filtered by date range ──
  const fromStr = dateFrom ? dateFrom.toISOString().split('T')[0] : undefined;
  const toStr = dateTo ? dateTo.toISOString().split('T')[0] : undefined;

  const timeLogsQuery = useQuery({
    queryKey: ['fabrica', 'time-logs', fromStr, toStr],
    queryFn: async () => {
      return fetchAllRows<{ work_item_id: number | null; time_minutes: number | null; user_name: string | null; log_date: string | null }>((from, to) => {
        let q = supabase
          .from('devops_time_logs')
          .select('work_item_id, time_minutes, user_name, log_date');
        if (fromStr) q = q.gte('log_date', fromStr);
        if (toStr) q = q.lte('log_date', toStr);
        return q.range(from, to);
      });
    },
    staleTime: 5 * 60 * 1000,
  });

  // Work items with tags for product mapping & iteration_history
  const workItemsQuery = useQuery({
    queryKey: ['fabrica', 'work-items-tags'],
    queryFn: async () => {
      return fetchAllRows<{ id: number; tags: string | null; title: string | null; parent_id: number | null; assigned_to_display: string | null; area_path: string | null; work_item_type: string | null; iteration_history: any }>((from, to) =>
        supabase
          .from('devops_work_items')
          .select('id, tags, title, parent_id, assigned_to_display, area_path, work_item_type, iteration_history')
          .range(from, to)
      );
    },
    staleTime: 5 * 60 * 1000,
  });

  // Persistent collaborator name map — admin-managed, overrides in-memory normalisation
  const collabMapQuery = useQuery({
    queryKey: ['devops', 'collaborator-map'],
    queryFn: async () => {
        // Table not yet in generated types (migration pending) — cast to any
        const { data } = await (supabase as any)
          .from('devops_collaborator_map')
          .select('timelog_name, canonical_name') as { data: Array<{ timelog_name: string; canonical_name: string }> | null };
      const map = new Map<string, string>();
      for (const r of (data || [])) {
        map.set(r.timelog_name.toLowerCase(), r.canonical_name);
      }
      return map;
    },
      staleTime: 10 * 60 * 1000, // 10 min — rarely changes
  });

  const allItems = query.data || [];
  const INFRA_PREFIX = '[INFRA]';
  const nonInfraItems = allItems.filter(i => !i.title?.startsWith(INFRA_PREFIX));

  // Sprint is the primary filter; date range is a drill-down on time logs only.
  const items = sprintFilter === 'all'
    ? nonInfraItems
    : nonInfraItems.filter(i => i.iteration_path === sprintFilter);

  // kpiItems: exclude Tasks/Bugs whose parent PBI is also in the view (count_in_kpi flag)
  // This prevents double-counting PBIs + their child Tasks in KPI metric totals.
  const kpiItems = items.filter(i => i.count_in_kpi !== false);

  const total      = kpiItems.length;
  const inProgress = kpiItems.filter(i => i.state === 'In Progress' || i.state === 'Active').length;
  const toDo       = kpiItems.filter(i => i.state === 'To Do' || i.state === 'New').length;
  const done       = kpiItems.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved').length;

  const porColaborador = items.reduce((acc, item) => {
    const name = item.assigned_to_display || 'Não atribuído';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── Timelog aggregations ──
  const timeLogs = timeLogsQuery.data || [];
  // Scope time logs to the work items currently in sprint (when a sprint filter is active)
  const itemIdsInScope = new Set(items.map(i => i.id).filter((id): id is number => id != null));
  const scopedTimeLogs = sprintFilter === 'all'
    ? timeLogs
    : timeLogs.filter(tl => tl.work_item_id != null && itemIdsInScope.has(tl.work_item_id));

  const totalHoursLogged = scopedTimeLogs.reduce((sum, tl) => sum + (tl.time_minutes || 0), 0) / 60;
  const hasTimeLogs = scopedTimeLogs.length > 0;

  // Build work item lookup
  const wiMap = new Map<number, { tags: string | null; title: string | null; parent_id: number | null; assigned_to_display: string | null; area_path: string | null; work_item_type: string | null; iteration_history: any }>();
  const tagsByWorkItemId: Record<number, string> = {};
  for (const wi of (workItemsQuery.data || [])) {
    wiMap.set(wi.id, wi);
    if (wi.tags) tagsByWorkItemId[wi.id] = wi.tags;
  }

  // Find top-level Epic by walking parent_id
  function findEpic(startId: number, maxDepth = 10): { title: string; id: number } | null {
    let currentId = startId;
    let current = wiMap.get(currentId);
    let depth = 0;
    while (current && depth < maxDepth) {
      if (current.work_item_type === 'Epic') {
        return { title: current.title || `Epic #${currentId}`, id: currentId };
      }
      if (!current.parent_id) break;
      currentId = current.parent_id;
      current = wiMap.get(currentId);
      depth++;
    }
    if (current && depth > 0) {
      return { title: current.title || `Item #${currentId}`, id: currentId };
    }
    return null;
  }

  // Hours by collaborator
  const horasPorColaborador: TimelogAggregation[] = (() => {
    if (!hasTimeLogs) return [];
    const map: Record<string, number> = {};
    const labelMap: Record<string, string> = {};
    const collabMap = collabMapQuery.data || new Map<string, string>();
    for (const tl of scopedTimeLogs) {
      const rawName = tl.user_name || 'Desconhecido';
      const normalized = normalizeUserName(rawName);
      // Persistent map takes precedence over first-seen heuristic
      const canonical = collabMap.get(rawName.toLowerCase()) ?? collabMap.get(normalized);
      if (canonical) {
        labelMap[normalized] = canonical;
      } else {
        labelMap[normalized] = labelMap[normalized] ?? rawName;
      }
      map[normalized] = (map[normalized] || 0) + (tl.time_minutes || 0);
    }
    return Object.entries(map)
      .map(([normalized, minutes]) => ({
        name: labelMap[normalized] || normalized,
        hours: Math.round(minutes / 60 * 10) / 10,
        minutes,
      }))
      .sort((a, b) => b.hours - a.hours);
  })();

  // Hours by product
  const horasPorProduto: TimelogAggregation[] = (() => {
    if (!hasTimeLogs) return [];
    const map: Record<string, number> = {};
    for (const tl of scopedTimeLogs) {
      const wi = tl.work_item_id ? wiMap.get(tl.work_item_id) : null;
      const products = extractProducts(wi?.tags || null);
      if (products.length > 0) {
        const share = (tl.time_minutes || 0) / products.length;
        for (const p of products) {
          const normalized = normalizeProduct(p);
          map[normalized] = (map[normalized] || 0) + share;
        }
      }
    }
    return Object.entries(map)
      .map(([name, minutes]) => ({ name, hours: Math.round(minutes / 60 * 10) / 10, minutes }))
      .sort((a, b) => b.hours - a.hours);
  })();

  // Hours by fábrica/squad (grouped by parent Epic)
  const horasPorFabrica: TimelogAggregation[] = (() => {
    if (!hasTimeLogs) return [];
    const map: Record<string, number> = {};
    for (const tl of scopedTimeLogs) {
      if (!tl.work_item_id) continue;
      const epic = findEpic(tl.work_item_id);
      const label = epic?.title || 'Sem Epic';
      map[label] = (map[label] || 0) + (tl.time_minutes || 0);
    }
    return Object.entries(map)
      .map(([name, minutes]) => ({
        name: `${name} ${(minutes / 60 / 8).toFixed(1)}d (${Math.round(minutes / 60 * 10) / 10}h)`,
        hours: Math.round(minutes / 60 * 10) / 10,
        minutes,
      }))
      .sort((a, b) => b.hours - a.hours);
  })();

  // ── Corporate KPIs ──
  const pbis = items.filter(
    i => i.work_item_type === 'Product Backlog Item' || i.work_item_type === 'User Story'
  );
  const pbisWithEffort = pbis.filter(i => i.effort != null && i.effort > 0);

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

  const sprintSet = new Set(items.map(i => i.iteration_path).filter(Boolean) as string[]);
  const sprintCount = sprintSet.size;
  const sortedSprints = [...sprintSet].sort(sprintCompare);
  const currentSprint = sortedSprints.length > 0 ? sortedSprints[sortedSprints.length - 1] : null;

  let velocidadeMedia: number | null = null;
  let velocidadeSource: 'timelog' | 'effort' | null = null;

  if (hasTimeLogs && sprintCount > 0) {
    velocidadeMedia = Math.round((totalHoursLogged / sprintCount) * 10) / 10;
    velocidadeSource = 'timelog';
  } else if (sprintCount > 0 && pbisWithEffort.length > 0) {
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

  // Transbordo — PBIs with iteration_history changes
  let transbordoPct: number | null = null;
  let transbordoCount = 0;
  let transbordoTotal = 0;
  let transbordoItems: TransbordoItem[] = [];

  const allPbis = items.filter(
    i => i.work_item_type === 'Product Backlog Item' || i.work_item_type === 'User Story'
  );
  transbordoTotal = allPbis.length;

  const overflowedPbis = allPbis.filter(i => {
    if (!i.id) return false;
    const wi = wiMap.get(i.id);
    const history = wi?.iteration_history;
    return Array.isArray(history) && history.length > 0;
  });

  transbordoCount = overflowedPbis.length;
  transbordoPct = transbordoTotal > 0
    ? Math.round((transbordoCount / transbordoTotal) * 100)
    : 0;

  const seen = new Set<number>();
  transbordoItems = overflowedPbis
    .filter(i => {
      if (!i.id || seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    })
    .map(i => {
      const wi = wiMap.get(i.id!);
      const history = (wi?.iteration_history || []) as Array<{ oldValue: string; newValue: string; revisedDate: string }>;
      const sprintsMoved = history.map(h => h.oldValue);
      if (i.iteration_path) sprintsMoved.push(i.iteration_path);
      const uniqueSprints = [...new Set(sprintsMoved)].sort(sprintCompare);
      return {
        ...i,
        overflowCount: history.length,
        sprintsOverflowed: uniqueSprints,
      };
    });

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
      // Phase 4: roll-up — kpiItems excludes double-counted Tasks whose parent is in view
      kpiItems,
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
    sortedSprints,
    sprintCount,
    hasTimeLogs,
    totalHoursLogged,
    // Timelog aggregations
    horasPorColaborador,
    horasPorProduto,
    horasPorFabrica,
    tagsByWorkItemId,
  };
}
