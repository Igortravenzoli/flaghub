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

const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw error;

    const chunk = data || [];
    rows.push(...chunk);

    if (chunk.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
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
  // Title case
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

/** Extract only known product tags from a tags string */
function extractProducts(tags: string | null): string[] {
  if (!tags) return [];
  return tags.split(';').map(t => t.trim()).filter(t => KNOWN_PRODUCTS.has(t.toUpperCase()));
}

/** Known fábrica/squad tags */
const KNOWN_FABRICAS = new Set([
  'STAGING', 'K8', 'INFRA', 'APP', 'FLEXX', 'UX/UI', 'UX', 'UI',
]);

/** Extract fábrica/squad from tags */
function extractFabrica(tags: string | null): string | null {
  if (!tags) return null;
  const parts = tags.split(';').map(t => t.trim().toUpperCase());
  for (const p of parts) {
    if (KNOWN_FABRICAS.has(p)) {
      if (p === 'UX' || p === 'UI') return '[UX/UI]';
      return `[${p}]`;
    }
  }
  return null;
}

export function useFabricaKpis(dateFrom?: Date, dateTo?: Date) {
  const query = useQuery({
    queryKey: ['fabrica', 'kpis'],
    queryFn: async () => {
      const data = await fetchAllRows<FabricaItem>((from, to) =>
        supabase
          .from('vw_fabrica_kpis')
          .select('*')
          .range(from, to)
      );
      return data;
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

  // Fetch time logs with full details for aggregation
  const timeLogsQuery = useQuery({
    queryKey: ['fabrica', 'time-logs-full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('devops_time_logs')
        .select('work_item_id, time_minutes, user_name, log_date');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch work items with tags for product mapping
  const workItemsQuery = useQuery({
    queryKey: ['fabrica', 'work-items-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('devops_work_items')
        .select('id, tags, title, parent_id, assigned_to_display, area_path, work_item_type, iteration_history');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const allItems = query.data || [];
  const INFRA_PREFIX = '[INFRA]';
  const nonInfraItems = allItems.filter(i => !i.title?.startsWith(INFRA_PREFIX));

  const items = (dateFrom && dateTo)
    ? nonInfraItems.filter(i => isInRange(i.created_date, dateFrom, dateTo) || isInRange(i.changed_date, dateFrom, dateTo))
    : nonInfraItems;

  const total = items.length;
  const inProgress = items.filter(i => i.state === 'In Progress' || i.state === 'Active').length;
  const toDo = items.filter(i => i.state === 'To Do' || i.state === 'New').length;
  const done = items.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved').length;

  const porColaborador = items.reduce((acc, item) => {
    const name = item.assigned_to_display || 'Não atribuído';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── Timelog aggregations (filtered by date range) ──
  const allTimeLogs = timeLogsQuery.data || [];
  const timeLogs = (dateFrom && dateTo)
    ? allTimeLogs.filter(tl => {
        if (!tl.log_date) return false;
        const d = new Date(tl.log_date);
        return d >= dateFrom && d <= dateTo;
      })
    : allTimeLogs;
  const totalHoursLogged = timeLogs.reduce((sum, tl) => sum + (tl.time_minutes || 0), 0) / 60;
  const hasTimeLogs = timeLogs.length > 0;

  // Build work item lookup for tags/area_path/hierarchy mapping
  const wiMap = new Map<number, { tags: string | null; title: string | null; parent_id: number | null; assigned_to_display: string | null; area_path: string | null; work_item_type: string | null; iteration_history: any }>();
  for (const wi of (workItemsQuery.data || [])) {
    wiMap.set(wi.id, wi);
  }

  // Find the top-level Epic for a work item by walking up parent_id
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
    // If we reached the top without finding "Epic" type, use the topmost item
    if (current && depth > 0) {
      return { title: current.title || `Item #${currentId}`, id: currentId };
    }
    return null;
  }

  // Hours by collaborator (from timelog user_name)
  const horasPorColaborador: TimelogAggregation[] = (() => {
    if (!hasTimeLogs) return [];
    const map: Record<string, number> = {};
    for (const tl of timeLogs) {
      const name = tl.user_name || 'Desconhecido';
      map[name] = (map[name] || 0) + (tl.time_minutes || 0);
    }
    return Object.entries(map)
      .map(([name, minutes]) => ({ name, hours: Math.round(minutes / 60 * 10) / 10, minutes }))
      .sort((a, b) => b.hours - a.hours);
  })();

  // Hours by product (from work item tags)
  const horasPorProduto: TimelogAggregation[] = (() => {
    if (!hasTimeLogs) return [];
    const map: Record<string, number> = {};
    for (const tl of timeLogs) {
      const wi = tl.work_item_id ? wiMap.get(tl.work_item_id) : null;
      const products = extractProducts(wi?.tags || null);
      if (products.length === 0) {
        // Skip — don't show "Sem produto"
      } else {
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
    for (const tl of timeLogs) {
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

  // ── Corporate KPIs ──────────────────────────────────────────────
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

  // Transbordo — only PBIs with "changed Iteration Path" in their history count.
  // iteration_history is an array of { oldValue, newValue, revisedDate } from the Updates API.
  const sortedSprints = [...sprintSet].sort(sprintCompare);
  const currentSprint = sortedSprints.length > 0 ? sortedSprints[sortedSprints.length - 1] : null;

  let transbordoPct: number | null = null;
  let transbordoCount = 0;
  let transbordoTotal = 0;
  let transbordoItems: TransbordoItem[] = [];

  // All PBIs in scope
  const allPbis = items.filter(
    i => i.work_item_type === 'Product Backlog Item' || i.work_item_type === 'User Story'
  );
  transbordoTotal = allPbis.length;

  // A PBI is transbordo if it has iteration_history with at least one change
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
      // Add current iteration too
      if (i.iteration_path) sprintsMoved.push(i.iteration_path);
      const uniqueSprints = [...new Set(sprintsMoved)].sort(sprintCompare);
      return {
        ...i,
        overflowCount: history.length, // number of times iteration was changed
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
    totalHoursLogged,
    // Timelog aggregations
    horasPorColaborador,
    horasPorProduto,
    horasPorFabrica,
  };
}
