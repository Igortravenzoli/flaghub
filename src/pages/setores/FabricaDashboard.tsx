import { useState, useMemo, useCallback, useEffect } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useFabricaKpis, FabricaItem, TimelogAggregation } from '@/hooks/useFabricaKpis';
import { usePbiHealthBatch } from '@/hooks/usePbiHealthBatch';
import { usePbiBottlenecks } from '@/hooks/usePbiBottlenecks';
import { useFeaturePbiSummary } from '@/hooks/useFeaturePbiSummary';
import { useDevopsOperationalQueue } from '@/hooks/useDevopsOperationalQueue';
import { TransbordoTab } from '@/components/fabrica/TransbordoTab';
import { PbiHealthBadge } from '@/components/pbi/PbiHealthBadge';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { useCrossSectorSearch } from '@/hooks/useCrossSectorSearch';
import { CrossSectorSearchBanner } from '@/components/dashboard/CrossSectorSearchBanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getAvailableDateKeysFromItems, getDateBoundsFromItems } from '@/lib/dateBounds';
import { 
  Code2, ListTodo, Bug, Users, ChevronRight, ChevronDown, Search, ChevronLeft, X,
  Clock, Gauge, AlertTriangle, HelpCircle, Timer, Package, Building2, 
  TrendingUp, BarChart3, Zap, Plane, HeartPulse, Workflow
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { Integration } from '@/components/setores/SectorIntegrations';
import { extractSprintCodeFromPath, formatSprintIntervalLabel, getCurrentOfficialSprintCode, getOfficialSprintRange } from '@/lib/sprintCalendar';

type FabKpiFilter = 'all' | 'in_progress' | 'todo' | 'done' | 'aguardando_teste' | 'aviao' | 'sem_task';
type HealthFilter = 'all' | 'verde' | 'amarelo' | 'vermelho';

const FABRICA_IN_PROGRESS_STATES = new Set(['In Progress', 'Active', 'Em desenvolvimento', 'Aguardando Teste']);
const FABRICA_TODO_STATES = new Set(['To Do', 'New']);
const DONE_STATES = new Set(['Done', 'Closed', 'Resolved']);

function isFabricaInProgress(state: string | null | undefined): boolean {
  return FABRICA_IN_PROGRESS_STATES.has(state || '');
}

function isFabricaTodo(state: string | null | undefined): boolean {
  return FABRICA_TODO_STATES.has(state || '');
}

function isDone(state: string | null | undefined): boolean {
  return DONE_STATES.has(state || '');
}

const integrations: Integration[] = [
  { name: 'Azure DevOps API', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Work Items, Sprints' },
  { name: 'DevOps TimeLog', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Horas alocadas (TechsBCN)' },
];

const typeColors: Record<string, string> = {
  'Product Backlog Item': 'bg-primary/15 text-primary border-primary/30',
  'Task': 'bg-accent text-accent-foreground',
  'Bug': 'bg-destructive/15 text-destructive border-destructive/30',
  'User Story': 'bg-[hsl(var(--info))]/15 text-[hsl(var(--info))]',
};
const typeLabels: Record<string, string> = {
  'Product Backlog Item': 'PBI',
  'Task': 'Task',
  'Bug': 'Bug',
  'User Story': 'Story',
};
const stateColors: Record<string, string> = {
  'In Progress': 'bg-[hsl(var(--info))] text-white',
  'Active': 'bg-[hsl(var(--info))] text-white',
  'Em desenvolvimento': 'bg-[hsl(var(--info))] text-white',
  'Aguardando Teste': 'bg-rose-100 text-rose-700 border border-rose-300',
  'To Do': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'New': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'Done': 'bg-[hsl(var(--success))] text-white',
  'Closed': 'bg-[hsl(var(--success))] text-white',
  'Resolved': 'bg-[hsl(var(--success))] text-white',
};

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--info))',
  'hsl(142, 71%, 45%)',
  'hsl(43, 85%, 46%)',
  'hsl(280, 65%, 60%)',
  'hsl(200, 80%, 50%)',
  'hsl(340, 75%, 55%)',
  'hsl(160, 60%, 45%)',
];

const AVIAO_REGEX = /(^|;)\s*AVIAO\s*(;|$)/i;

function AnimatedNumber({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value == null) return <span className="text-sm font-normal text-muted-foreground">Sem dados</span>;
  return <span>{value}{suffix}</span>;
}

function HeroKpiCard({ label, value, suffix, icon: Icon, description, accent, delay = 0, onClick, isLoading, active }: {
  label: string; value: number | string | null; suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string; accent?: string; delay?: number;
  onClick?: () => void; isLoading?: boolean; active?: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="relative overflow-hidden">
        <div className="p-5">
          <Skeleton className="h-4 w-20 mb-3" />
          <Skeleton className="h-9 w-16 mb-1" />
          <Skeleton className="h-3 w-32" />
        </div>
      </Card>
    );
  }

  return (
    <Card 
      className={`relative overflow-hidden group transition-all duration-500 hover:shadow-xl hover:-translate-y-1 animate-fade-in ${onClick ? 'cursor-pointer' : ''} ${active ? 'ring-2 ring-primary shadow-xl scale-[1.02]' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
    >
      <div className={`absolute top-0 left-0 w-1 h-full ${accent || 'bg-primary'} transition-all duration-300 group-hover:w-1.5`} />
      <div className="p-5 pl-6">
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-2 rounded-xl ${accent ? accent + '/10' : 'bg-primary/10'} transition-transform duration-300 group-hover:scale-110`}>
            <Icon className={`h-4 w-4 ${accent ? accent.replace('bg-', 'text-') : 'text-primary'}`} />
          </div>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{label}</p>
        </div>
        <p className="text-3xl font-black text-foreground tracking-tight">
          {typeof value === 'number' ? value : value ?? <span className="text-sm font-normal text-muted-foreground">—</span>}
          {suffix && <span className="text-lg font-semibold text-muted-foreground ml-1">{suffix}</span>}
        </p>
        {description && <p className="text-[11px] text-muted-foreground/70 mt-1.5">{description}</p>}
      </div>
    </Card>
  );
}

function HoursRankingCard({ title, icon: Icon, data, isLoading, emptyMessage, delay = 0 }: {
  title: string; icon: React.ComponentType<{ className?: string }>;
  data: TimelogAggregation[]; isLoading: boolean; emptyMessage: string; delay?: number;
}) {
  const maxHours = data.length > 0 ? data[0].hours : 1;

  if (isLoading) {
    return (
      <Card className="animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />{title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Timer className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Dados disponíveis após sincronização do TimeLog</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />{title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {data.slice(0, 8).map((item, idx) => (
          <div key={item.name} className="group animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-foreground font-medium truncate max-w-[60%]">{item.name}</span>
              <span className="text-muted-foreground font-mono text-xs">{item.hours}h</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${Math.max(4, (item.hours / maxHours) * 100)}%`,
                  background: CHART_COLORS[idx % CHART_COLORS.length],
                }}
              />
            </div>
          </div>
        ))}
        {data.length > 8 && (
          <p className="text-xs text-muted-foreground/60 text-center pt-1">
            +{data.length - 8} mais
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function FabricaDashboard() {
  const [sprintFilter, setSprintFilter] = useState<string>('__pending__');
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [customActive, setCustomActive] = useState(false);
  const selectedSprintCode = sprintFilter !== 'all' ? extractSprintCodeFromPath(sprintFilter) : null;
  const sprintRange = selectedSprintCode ? getOfficialSprintRange(selectedSprintCode) : null;
  const effectiveRange = customActive && customRange ? customRange : sprintRange;
  const fab = useFabricaKpis(effectiveRange?.from, effectiveRange?.to, customActive ? 'all' : sprintFilter);
  const operational = useDevopsOperationalQueue([
    '03-Em Fila Backlog para Priorizar',
    '05-Em Fila UX-UI',
  ]);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<FabricaItem | null>(null);
  const [fabKpiFilter, setFabKpiFilter] = useState<FabKpiFilter>('all');
  const [expandedPbis, setExpandedPbis] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [searchAutoSwitched, setSearchAutoSwitched] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [collaboratorFilter, setCollaboratorFilter] = useState<string | null>(null);
  const [boardSortField, setBoardSortField] = useState<'transbordo' | null>(null);
  const [boardSortDir, setBoardSortDir] = useState<'asc' | 'desc'>('desc');
  const PAGE_SIZE = 25;

  const localFabItemIds = useMemo(() => fab.allItems.map(i => i.id).filter(Boolean) as number[], [fab.allItems]);
  const { crossSectorResult } = useCrossSectorSearch(search, 'fabrica', localFabItemIds);

  const { minDate, maxDate } = useMemo(
    () => getDateBoundsFromItems(fab.allItems, [(i) => i.created_date, (i) => i.changed_date]),
    [fab.allItems]
  );

  const availableDateKeys = useMemo(
    () => getAvailableDateKeysFromItems(fab.allItems, [(i) => i.created_date, (i) => i.changed_date]),
    [fab.allItems]
  );

  useEffect(() => {
    if (fab.sortedSprints.length === 0) return;
    if (sprintFilter === '__pending__') {
      const officialCurrentCode = getCurrentOfficialSprintCode();
      const currentSprintPath = fab.sortedSprints.find((sp) => extractSprintCodeFromPath(sp) === officialCurrentCode);
      setSprintFilter(currentSprintPath || fab.sortedSprints[fab.sortedSprints.length - 1]);
      return;
    }
    if (sprintFilter === 'all') return;
    if (!fab.sortedSprints.includes(sprintFilter)) {
      const officialCurrentCode = getCurrentOfficialSprintCode();
      const currentSprintPath = fab.sortedSprints.find((sp) => extractSprintCodeFromPath(sp) === officialCurrentCode);
      setSprintFilter(currentSprintPath || fab.sortedSprints[fab.sortedSprints.length - 1]);
    }
  }, [fab.sortedSprints, sprintFilter]);

  // Auto-switch sprint when searching for a task ID that exists in a different sprint
  useEffect(() => {
    if (!search.trim()) {
      if (searchAutoSwitched) setSearchAutoSwitched(null);
      return;
    }
    const q = search.trim();
    // Only auto-switch for numeric ID searches
    const searchId = /^\d+$/.test(q) ? Number(q) : null;
    if (!searchId) return;

    // Check if item exists in current sprint filter
    const inCurrent = sprintFilter === 'all' || fab.items.some(i => i.id === searchId && i.iteration_path === sprintFilter);
    if (inCurrent) return;

    // Find the item across ALL items
    const match = fab.allItems.find(i => i.id === searchId);
    if (match?.iteration_path && fab.sortedSprints.includes(match.iteration_path)) {
      setSearchAutoSwitched(match.iteration_path);
      setSprintFilter(match.iteration_path);
      setPage(0);
    }
  }, [search, fab.allItems, fab.items, fab.sortedSprints, sprintFilter, searchAutoSwitched]);

  const colabChartData = useMemo(() =>
    Object.entries(fab.porColaborador)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 10)
      .map(([name, count]) => ({ name: name.split(' ').slice(0, 2).join(' '), count })),
    [fab.porColaborador]
  );

  const TYPE_COLORS: Record<string, string> = {
    'PBI': 'hsl(var(--primary))',
    'Task': 'hsl(var(--info))',
    'Bug': 'hsl(0, 72%, 51%)',
    'Story': 'hsl(280, 65%, 60%)',
  };

  const typeDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of fab.items) {
      const t = typeLabels[item.work_item_type || ''] || item.work_item_type || 'Outro';
      map[t] = (map[t] || 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [fab.items]);

  const getTypeColor = (typeName: string, idx: number) =>
    TYPE_COLORS[typeName] || CHART_COLORS[idx % CHART_COLORS.length];

  const toggleTypeFilter = (typeName: string) => {
    setTypeFilter(prev => prev === typeName ? null : typeName);
    setPage(0);
  };

  const sprintFilteredItems = useMemo(() => {
    if (sprintFilter === 'all') return fab.items;
    return fab.items.filter(i => i.iteration_path === sprintFilter);
  }, [fab.items, sprintFilter]);

  const sprintTotal = sprintFilteredItems.length;
  const sprintInProgress = sprintFilteredItems.filter(i => isFabricaInProgress(i.state)).length;
  const sprintToDo = sprintFilteredItems.filter(i => isFabricaTodo(i.state)).length;
  const sprintDone = sprintFilteredItems.filter(i => isDone(i.state)).length;
  const sprintAguardandoTeste = sprintFilteredItems.filter(i => i.state === 'Aguardando Teste').length;

  // PBIs sem Task vinculada (anomalia)
  const sprintPbisSemTask = useMemo(() => {
    const childParentIds = new Set(
      sprintFilteredItems
        .filter(i => i.work_item_type === 'Task' && i.parent_id != null)
        .map(i => i.parent_id!)
    );
    return sprintFilteredItems.filter(
      i => (i.work_item_type === 'Product Backlog Item' || i.work_item_type === 'User Story') && i.id != null && !childParentIds.has(i.id)
    );
  }, [sprintFilteredItems]);
  const sprintPbisSemTaskCount = sprintPbisSemTask.length;

  const sprintTransbordoItems = useMemo(() => {
    if (sprintFilter === 'all') return fab.transbordoItems;
    return fab.transbordoItems.filter(i => i.iteration_path === sprintFilter || i.sprintsOverflowed.includes(sprintFilter));
  }, [fab.transbordoItems, sprintFilter]);

  const sprintTransbordoCount = sprintTransbordoItems.length;
  const sprintTransbordoTotal = sprintFilteredItems.filter(
    i => i.work_item_type === 'Product Backlog Item' || i.work_item_type === 'User Story'
  ).length;
  const sprintTransbordoPct = sprintTransbordoTotal > 0
    ? Math.round((sprintTransbordoCount / sprintTransbordoTotal) * 100)
    : 0;

  const sprintAviaoCount = useMemo(() => {
    return sprintFilteredItems.filter(i => {
      if (!i.id) return false;
      const isTrackedType = i.work_item_type === 'Task' || i.work_item_type === 'Product Backlog Item' || i.work_item_type === 'User Story';
      if (!isTrackedType) return false;
      const tags = fab.tagsByWorkItemId[i.id] || '';
      return AVIAO_REGEX.test(tags);
    }).length;
  }, [sprintFilteredItems, fab.tagsByWorkItemId]);

  const pbiHealthIds = useMemo(
    () => sprintFilteredItems
      .filter((i) => i.id && ['Product Backlog Item', 'User Story', 'Bug'].includes(i.work_item_type || ''))
      .map((i) => i.id as number),
    [sprintFilteredItems]
  );

  const pbiHealthBatch = usePbiHealthBatch(pbiHealthIds, pbiHealthIds.length > 0);

  const bottlenecks = usePbiBottlenecks({
    sprintCode: selectedSprintCode,
    dateStart: effectiveRange?.from || null,
    dateEnd: effectiveRange?.to || null,
  });

  const featureSummary = useFeaturePbiSummary({
    sprintCode: selectedSprintCode,
    dateStart: effectiveRange?.from || null,
    dateEnd: effectiveRange?.to || null,
  });

  const backlogPriorizarItems = useMemo(() => {
    return operational.items
      .filter(i => i.query_name === '03-Em Fila Backlog para Priorizar')
      .map((i): FabricaItem => ({
        id: i.work_item_id,
        title: i.title,
        work_item_type: i.work_item_type,
        state: i.state,
        assigned_to_display: i.assigned_to_display,
        priority: i.priority,
        effort: i.effort,
        iteration_path: i.iteration_path,
        created_date: i.created_date,
        changed_date: i.changed_date,
        parent_id: null,
        parent_title: null,
        parent_type: null,
        web_url: i.web_url,
      }));
  }, [operational.items]);

  const uxuiItems = useMemo(() => {
    return operational.items
      .filter(i => i.query_name === '05-Em Fila UX-UI')
      .map((i): FabricaItem => ({
        id: i.work_item_id,
        title: i.title,
        work_item_type: i.work_item_type,
        state: i.state,
        assigned_to_display: i.assigned_to_display,
        priority: i.priority,
        effort: i.effort,
        iteration_path: i.iteration_path,
        created_date: i.created_date,
        changed_date: i.changed_date,
        parent_id: null,
        parent_title: null,
        parent_type: null,
        web_url: i.web_url,
      }));
  }, [operational.items]);

  const filteredFabItems = useMemo(() => {
    let items = sprintFilteredItems;
    switch (fabKpiFilter) {
      case 'in_progress': items = items.filter(i => isFabricaInProgress(i.state)); break;
      case 'todo': items = items.filter(i => isFabricaTodo(i.state)); break;
      case 'done': items = items.filter(i => isDone(i.state)); break;
      case 'aguardando_teste': items = items.filter(i => i.state === 'Aguardando Teste'); break;
      case 'aviao': items = items.filter(i => {
        if (!i.id) return false;
        const tags = fab.tagsByWorkItemId[i.id] || '';
        return AVIAO_REGEX.test(tags);
      }); break;
      case 'sem_task': {
        const childParentIds = new Set(
          sprintFilteredItems
            .filter(i => i.work_item_type === 'Task' && i.parent_id != null)
            .map(i => i.parent_id!)
        );
        items = items.filter(
          i => (i.work_item_type === 'Product Backlog Item' || i.work_item_type === 'User Story') && i.id != null && !childParentIds.has(i.id)
        );
        break;
      }
    }
    if (typeFilter) {
      items = items.filter(i => {
        const t = typeLabels[i.work_item_type || ''] || i.work_item_type || 'Outro';
        return t === typeFilter;
      });
    }
    if (collaboratorFilter) {
      items = items.filter(i => {
        const display = i.assigned_to_display || '';
        const shortName = display.split(' ').slice(0, 2).join(' ');
        return shortName === collaboratorFilter || display === collaboratorFilter;
      });
    }
    return items;
  }, [sprintFilteredItems, fabKpiFilter, fab.tagsByWorkItemId, typeFilter, collaboratorFilter]);

  const { parentRows, childrenMap, orphanRows } = useMemo(() => {
    const q = search.toLowerCase();
    const matchesSearch = (item: FabricaItem) => {
      if (!q) return true;
      return [item.title, item.assigned_to_display, item.state, String(item.id)]
        .some(v => v && String(v).toLowerCase().includes(q));
    };

    const allIds = new Set(filteredFabItems.map(i => i.id));
    const cMap = new Map<number, FabricaItem[]>();
    const parents: FabricaItem[] = [];
    const orphans: FabricaItem[] = [];

    for (const item of filteredFabItems) {
      const isChild = item.work_item_type === 'Task' || item.work_item_type === 'Bug';
      if (isChild && item.parent_id && allIds.has(item.parent_id)) {
        const existing = cMap.get(item.parent_id) || [];
        existing.push(item);
        cMap.set(item.parent_id, existing);
      } else if (isChild && item.parent_id && !allIds.has(item.parent_id)) {
        orphans.push(item);
      } else {
        parents.push(item);
      }
    }

    const filteredParents = parents.filter(p => {
      if (matchesSearch(p)) return true;
      const children = cMap.get(p.id!) || [];
      return children.some(matchesSearch);
    });

    const filteredOrphans = orphans.filter(matchesSearch);

    const filteredCMap = new Map<number, FabricaItem[]>();
    for (const [pid, children] of cMap.entries()) {
      const parent = filteredParents.find(p => p.id === pid);
      if (!parent) continue;
      if (q) {
        const parentMatches = matchesSearch(parent);
        const fc = parentMatches ? children : children.filter(matchesSearch);
        if (fc.length > 0) filteredCMap.set(pid, fc);
      } else {
        filteredCMap.set(pid, children);
      }
    }

    return { parentRows: filteredParents, childrenMap: filteredCMap, orphanRows: filteredOrphans };
  }, [filteredFabItems, search]);

  const transbordoMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of fab.transbordoItems) {
      if (t.id != null) m.set(t.id, t.overflowCount);
    }
    return m;
  }, [fab.transbordoItems]);

  const allTopLevel = useMemo(() => {
    const items = [...parentRows, ...orphanRows];
    if (boardSortField === 'transbordo') {
      items.sort((a, b) => {
        const ta = transbordoMap.get(a.id!) || 0;
        const tb = transbordoMap.get(b.id!) || 0;
        return boardSortDir === 'desc' ? tb - ta : ta - tb;
      });
    }
    return items;
  }, [parentRows, orphanRows, boardSortField, boardSortDir, transbordoMap]);
  const totalPages = Math.max(1, Math.ceil(allTopLevel.length / PAGE_SIZE));
  const pagedTopLevel = allTopLevel.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleExpand = useCallback((id: number) => {
    setExpandedPbis(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleFab = (f: FabKpiFilter) => { setFabKpiFilter(prev => prev === f ? 'all' : f); setPage(0); };

  const toggleBoardSort = (field: 'transbordo') => {
    if (boardSortField === field) {
      setBoardSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setBoardSortField(field);
      setBoardSortDir('desc');
    }
    setPage(0);
  };

  const periodLabel = customActive
    ? 'Custom'
    : (selectedSprintCode ? formatSprintIntervalLabel(selectedSprintCode) : 'Sprint');

  const handleExportCSV = () => exportCSV({
    title: 'Sprint Board', area: 'Fábrica', periodLabel,
    columns: ['id', 'title', 'assigned_to_display', 'state', 'priority', 'iteration_path'],
    rows: fab.items as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Dashboard Fábrica', area: 'Fábrica', periodLabel,
    kpis: [
      { label: 'Total', value: fab.total },
      { label: 'Em Progresso', value: fab.inProgress },
      { label: 'A Fazer', value: fab.toDo },
      { label: 'Finalizados', value: fab.done },
    ],
    columns: ['id', 'title', 'assigned_to_display', 'state', 'priority'],
    rows: fab.items as any[],
  });

  const drawerFields: DrawerField[] = drawerItem ? [
    { label: 'ID', value: drawerItem.id },
    { label: 'Título', value: drawerItem.title },
    { label: 'Tipo', value: drawerItem.work_item_type },
    { label: 'Estado', value: drawerItem.state },
    { label: 'Responsável', value: drawerItem.assigned_to_display },
    { label: 'Prioridade', value: drawerItem.priority != null ? `P${drawerItem.priority}` : '—' },
    { label: 'Criado em', value: drawerItem.created_date ? new Date(drawerItem.created_date).toLocaleString('pt-BR') : '—' },
    { label: 'Alterado em', value: drawerItem.changed_date ? new Date(drawerItem.changed_date).toLocaleString('pt-BR') : '—' },
    ...(drawerItem.parent_title ? [{ label: 'Parent', value: drawerItem.parent_title }] : []),
  ] : [];

  const renderItemCells = (item: FabricaItem, indent = false) => (
    <>
      <TableCell className="font-mono text-xs w-16">
        {item.web_url ? (
          <a href={item.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono" onClick={e => e.stopPropagation()}>{item.id}</a>
        ) : <span>{item.id}</span>}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={`text-xs ${typeColors[item.work_item_type || ''] || ''}`}>
          {typeLabels[item.work_item_type || ''] || item.work_item_type || '—'}
        </Badge>
      </TableCell>
      <TableCell className={`max-w-[350px] truncate text-sm ${indent ? 'pl-8' : ''}`}>
        <div className="flex items-center gap-2">
          {item.id ? (
            <PbiHealthBadge
              status={pbiHealthBatch.healthById.get(item.id)?.health_status}
              compact
              indicatorMode="fabrica-abc"
              className="text-[10px] px-1.5 py-0"
            />
          ) : null}
          <span className="truncate">{item.title || '—'}</span>
        </div>
      </TableCell>
      <TableCell className="text-sm">{item.assigned_to_display || '—'}</TableCell>
      <TableCell>
        <Badge className={`text-xs font-mono ${stateColors[item.state || ''] || ''}`}>
          {item.state === 'To Do' ? 'A Fazer' : item.state === 'Done' ? 'Finalizados' : (item.state || '—')}
        </Badge>
      </TableCell>
      <TableCell>
        {item.priority != null ? <Badge variant="secondary" className="text-xs">P{item.priority}</Badge> : '—'}
      </TableCell>
      <TableCell className="text-center">
        {(() => {
          const count = item.id != null ? transbordoMap.get(item.id) || 0 : 0;
          if (count === 0) return <span className="text-muted-foreground/40">—</span>;
          return (
            <Badge variant={count >= 3 ? 'destructive' : 'secondary'} className="text-xs font-mono">
              {count}
            </Badge>
          );
        })()}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{item.iteration_path || '—'}</TableCell>
    </>
  );

  const filterLabel = (f: FabKpiFilter) => {
    switch (f) {
      case 'all': return 'Todos';
      case 'in_progress': return 'Em Progresso';
      case 'todo': return 'A Fazer';
      case 'done': return 'Finalizados';
      case 'aguardando_teste': return 'Aguardando Teste';
      case 'aviao': return 'Avião';
      case 'sem_task': return 'PBI sem Task';
    }
  };

  return (
    <SectorLayout title="Fábrica" subtitle="Programação — Sprint Board" lastUpdate="" integrations={integrations} areaKey="fabrica" syncFunctions={[
      { name: 'devops-sync-query', label: 'Atualizar Itens Fábrica (Query 08)', payload: { query_id: '557a9643-5049-43a6-b199-e498f39e9e88' } },
      { name: 'devops-sync-all', label: 'Sincronizar Base Geral DevOps (completo)' },
      { name: 'devops-sync-timelog', label: 'Sincronizar TimeLog (Horas)' },
    ]}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <DashboardLastSyncBadge syncedAt={fab.lastSync} status="ok" />
        <div className="flex items-center gap-2 flex-wrap">
          {fab.hasTimeLogs && (
            <Badge variant="outline" className="gap-1 text-xs animate-fade-in">
              <Timer className="h-3 w-3" />
              {Math.round(fab.totalHoursLogged)}h registradas
            </Badge>
          )}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant={fabKpiFilter === 'aviao' ? 'default' : 'secondary'}
                  className={`gap-1 text-xs animate-fade-in cursor-pointer transition-all hover:scale-105 ${fabKpiFilter === 'aviao' ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => toggleFab('aviao')}
                >
                  <Plane className="h-3.5 w-3.5" />
                  AVIÃO na sprint: {sprintAviaoCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[240px]">
                Itens marcados com a tag AVIAO na sprint selecionada. Clique para filtrar.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant={fabKpiFilter === 'aguardando_teste' ? 'default' : 'outline'}
                  className={`gap-1 text-xs animate-fade-in cursor-pointer border-rose-300 text-rose-700 bg-rose-50 transition-all hover:scale-105 ${fabKpiFilter === 'aguardando_teste' ? 'ring-2 ring-primary bg-rose-600 text-white' : ''}`}
                  onClick={() => toggleFab('aguardando_teste')}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Aguardando Teste: {sprintAguardandoTeste}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[280px]">
                Permanece na Fábrica, impacta saúde/gargalo e não entra automaticamente em Qualidade. Clique para filtrar.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {fab.sortedSprints.length > 0 && (
          <Select value={sprintFilter} onValueChange={(v) => { setSprintFilter(v); setCustomActive(false); setFabKpiFilter('all'); setPage(0); }}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Sprint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Sprints</SelectItem>
              {[...fab.sortedSprints].reverse().map(sp => (
                <SelectItem key={sp} value={sp}>{sp.split('\\').pop()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DashboardFilterBar
          preset={customActive ? 'custom' : 'all'}
          onPresetChange={() => { setCustomActive(false); setFabKpiFilter('all'); setPage(0); }}
          presetLabel={customActive ? 'Custom' : 'Sprint'}
          presets={[]}
          dateFrom={effectiveRange?.from}
          dateTo={effectiveRange?.to}
          minDate={minDate}
          maxDate={maxDate}
          availableDateKeys={availableDateKeys}
          onCustomRange={(from, to) => { setCustomRange({ from, to }); setCustomActive(true); setFabKpiFilter('all'); setPage(0); }}
          onExportCSV={handleExportCSV}
          onExportPDF={handleExportPDF}
        />
        {fabKpiFilter !== 'all' && (
          <Badge variant="default" className="gap-1 text-xs cursor-pointer animate-fade-in" onClick={() => setFabKpiFilter('all')}>
            Filtro: {filterLabel(fabKpiFilter)} ✕
          </Badge>
        )}
        {typeFilter && (
          <Badge variant="default" className="gap-1 text-xs cursor-pointer animate-fade-in" onClick={() => setTypeFilter(null)}>
            Tipo: {typeFilter} ✕
          </Badge>
        )}
        {collaboratorFilter && (
          <Badge variant="default" className="gap-1 text-xs cursor-pointer animate-fade-in" onClick={() => setCollaboratorFilter(null)}>
            Colaborador: {collaboratorFilter} ✕
          </Badge>
        )}
      </div>

      {fab.isError ? (
        <DashboardEmptyState variant="error" onRetry={() => fab.refetch()} />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="overview" className="gap-1.5 text-xs">
              <Zap className="h-3.5 w-3.5" />Visão Geral
            </TabsTrigger>
            <TabsTrigger value="timelog" className="gap-1.5 text-xs">
              <Timer className="h-3.5 w-3.5" />Horas (TimeLog)
            </TabsTrigger>
            <TabsTrigger value="transbordo" className="gap-1.5 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />Transbordo
              {sprintTransbordoCount > 0 && (
                <Badge variant={sprintTransbordoPct != null && sprintTransbordoPct > 50 ? 'destructive' : 'secondary'} className="text-[10px] ml-1 px-1.5 py-0">
                  {sprintTransbordoCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="esteira-saude" className="gap-1.5 text-xs">
              <HeartPulse className="h-3.5 w-3.5" />Esteira / Saúde
            </TabsTrigger>
            <TabsTrigger value="gargalos" className="gap-1.5 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />Gargalos
            </TabsTrigger>
            <TabsTrigger value="por-feature" className="gap-1.5 text-xs">
              <Workflow className="h-3.5 w-3.5" />Por Feature
            </TabsTrigger>
            <TabsTrigger value="backlog-priorizar" className="gap-1.5 text-xs">
              <ListTodo className="h-3.5 w-3.5" />Backlog Priorizar
            </TabsTrigger>
            <TabsTrigger value="uxui-fila" className="gap-1.5 text-xs">
              <TrendingUp className="h-3.5 w-3.5" />Fila Design / UX-UI
            </TabsTrigger>
          </TabsList>

          {/* ═══════ TAB: Visão Geral ═══════ */}
          <TabsContent value="overview" className="space-y-5 mt-0">
            {/* Hero KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HeroKpiCard label="Total" value={sprintTotal} icon={ListTodo} isLoading={fab.isLoading} onClick={() => toggleFab('all')} active={fabKpiFilter === 'all'} />
              <HeroKpiCard label="Em Progresso" value={sprintInProgress} icon={Code2} isLoading={fab.isLoading} delay={80} accent="bg-[hsl(var(--info))]" onClick={() => toggleFab('in_progress')} active={fabKpiFilter === 'in_progress'} />
              <HeroKpiCard label="A Fazer" value={sprintToDo} icon={ListTodo} isLoading={fab.isLoading} delay={160} accent="bg-[hsl(43,85%,46%)]" onClick={() => toggleFab('todo')} active={fabKpiFilter === 'todo'} />
              <HeroKpiCard label="Finalizados" value={sprintDone} icon={Bug} isLoading={fab.isLoading} delay={240} accent="bg-[hsl(142,71%,45%)]" onClick={() => toggleFab('done')} active={fabKpiFilter === 'done'} />
              <HeroKpiCard 
                label="PBI sem Task" 
                value={sprintPbisSemTaskCount} 
                icon={AlertTriangle} 
                isLoading={fab.isLoading} 
                delay={320} 
                accent={sprintPbisSemTaskCount > 0 ? 'bg-destructive' : 'bg-[hsl(142,71%,45%)]'}
                description={sprintPbisSemTaskCount > 0 ? 'Anomalia: PBIs sem task vinculada' : 'Todos PBIs possuem tasks'}
                onClick={() => toggleFab('sem_task')} 
                active={fabKpiFilter === 'sem_task'} 
              />

            {/* Corporate KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HeroKpiCard 
                label="Lead Time Médio" 
                value={fab.leadTimeMedio} 
                suffix={fab.leadTimeSource === 'effort' ? ' pts' : 'h'}
                icon={Clock} 
                isLoading={fab.isLoading} 
                delay={300}
                description={fab.leadTimeSource === 'effort' ? 'Effort médio / PBI (DevOps)' : fab.leadTimeSource === 'timelog' ? 'Horas trabalhadas / PBI' : 'Effort / PBI'}
              />
              <HeroKpiCard 
                label="Velocidade Média" 
                value={fab.velocidadeMedia} 
                suffix={fab.velocidadeSource === 'effort' ? ' pts' : 'h'}
                icon={Gauge} 
                isLoading={fab.isLoading} 
                delay={380}
                accent="bg-[hsl(var(--info))]"
                description={fab.velocidadeSource === 'effort' ? `Effort / Sprint (${fab.sprintCount} sprints)` : fab.velocidadeSource === 'timelog' ? `Horas / Sprint (${fab.sprintCount})` : 'Effort ou Horas / Sprint'}
              />
              <HeroKpiCard 
                label="Transbordo" 
                value={sprintTransbordoPct != null ? `${sprintTransbordoPct}%` : null} 
                icon={AlertTriangle} 
                isLoading={fab.isLoading} 
                delay={460}
                accent={sprintTransbordoPct != null && sprintTransbordoPct > 50 ? 'bg-destructive' : 'bg-[hsl(43,85%,46%)]'}
                description={sprintTransbordoCount > 0 ? `${sprintTransbordoCount} de ${sprintTransbordoTotal} itens` : 'Itens não entregues na sprint'}
                onClick={() => sprintTransbordoItems.length > 0 && setActiveTab('transbordo')}
              />
              <HeroKpiCard 
                label="Capacidade" 
                value="Pendente" 
                icon={HelpCircle} 
                isLoading={false} 
                delay={540}
                accent="bg-muted-foreground"
                description="Requer API Capacity do DevOps"
              />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {colabChartData.length > 0 && (
                <Card className="lg:col-span-2 animate-fade-in" style={{ animationDelay: '500ms' }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />Tasks por Colaborador
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={Math.max(200, colabChartData.length * 32)}>
                      <BarChart data={colabChartData} layout="vertical" margin={{ left: 0, right: 16 }} style={{ cursor: 'pointer' }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                        <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={110} />
                        <RechartsTooltip
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                        <Bar
                          dataKey="count"
                          radius={[0, 6, 6, 0]}
                          cursor="pointer"
                          onClick={(data: any) => {
                            if (data?.name) {
                              setCollaboratorFilter(prev => prev === data.name ? null : data.name);
                              setPage(0);
                            }
                          }}
                        >
                          {colabChartData.map((entry, idx) => (
                            <Cell
                              key={idx}
                              fill={collaboratorFilter === entry.name ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.7)'}
                              stroke={collaboratorFilter === entry.name ? 'hsl(var(--foreground))' : 'transparent'}
                              strokeWidth={collaboratorFilter === entry.name ? 2 : 0}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {typeDistribution.length > 0 && (
                <Card className="animate-fade-in" style={{ animationDelay: '600ms' }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />Distribuição por Tipo
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={typeDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                          cursor="pointer"
                          onClick={(_, idx) => toggleTypeFilter(typeDistribution[idx].name)}
                        >
                          {typeDistribution.map((entry, idx) => (
                            <Cell
                              key={idx}
                              fill={getTypeColor(entry.name, idx)}
                              opacity={typeFilter && typeFilter !== entry.name ? 0.3 : 1}
                              stroke={typeFilter === entry.name ? 'hsl(var(--foreground))' : 'transparent'}
                              strokeWidth={typeFilter === entry.name ? 2 : 0}
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-2 justify-center mt-2">
                      {typeDistribution.map((t, idx) => (
                        <div
                          key={t.name}
                          className={`flex items-center gap-1.5 text-xs cursor-pointer rounded-md px-2 py-1 transition-all ${typeFilter === t.name ? 'ring-2 ring-primary bg-muted' : 'hover:bg-muted/50'}`}
                          onClick={() => toggleTypeFilter(t.name)}
                        >
                          <div className="h-2.5 w-2.5 rounded-sm" style={{ background: getTypeColor(t.name, idx) }} />
                          {t.name === 'PBI' ? <Package className="h-3 w-3 text-muted-foreground" /> : t.name === 'Task' ? <ListTodo className="h-3 w-3 text-muted-foreground" /> : t.name === 'Bug' ? <Bug className="h-3 w-3 text-muted-foreground" /> : null}
                          <span className="text-muted-foreground">{t.name}: {t.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sprint Board */}
            {fab.isLoading ? (
              <Card className="overflow-hidden">
                <div className="p-4 border-b border-border"><Skeleton className="h-5 w-40" /></div>
                <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              </Card>
            ) : (
              <Card className="overflow-hidden animate-fade-in">
                <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground text-sm">Sprint Board</h3>
                    <p className="text-xs text-muted-foreground">{filteredFabItems.length} itens • {parentRows.filter(p => childrenMap.has(p.id!)).length} PBIs com tasks</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="hidden md:flex gap-1">
                      {(['all', 'in_progress', 'todo', 'done'] as FabKpiFilter[]).map(f => (
                        <Badge 
                          key={f} 
                          variant={fabKpiFilter === f ? 'default' : 'outline'} 
                          className="cursor-pointer text-xs transition-all"
                          onClick={() => toggleFab(f)}
                        >
                          {filterLabel(f)}
                        </Badge>
                      ))}
                    </div>
                    <div className="relative w-full sm:w-56">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar task..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(0); }}
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                    {searchAutoSwitched && (
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-[10px] gap-1 animate-fade-in">
                          <Search className="h-3 w-3" />
                          Sprint alterada para exibir item #{search}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[10px] px-1.5"
                          onClick={() => {
                            setSearch('');
                            setSearchAutoSwitched(null);
                          }}
                        >
                          <X className="h-3 w-3 mr-0.5" /> Limpar
                        </Button>
                      </div>
                    )}
                    {crossSectorResult && !searchAutoSwitched && (
                      <CrossSectorSearchBanner result={crossSectorResult} />
                    )}
                  </div>
                </div>

                {allTopLevel.length === 0 ? (
                  <div className="p-8 text-center">
                    <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {search ? `Nenhum resultado para "${search}"` : 'Nenhum work item encontrado para o período selecionado.'}
                    </p>
                    {search && (
                      <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setSearch('')}>
                        Limpar busca
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="overflow-auto max-h-[600px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="w-8" />
                            <TableHead className="text-xs font-semibold w-16">ID</TableHead>
                            <TableHead className="text-xs font-semibold">Tipo</TableHead>
                            <TableHead className="text-xs font-semibold">Título</TableHead>
                            <TableHead className="text-xs font-semibold">Colaborador</TableHead>
                            <TableHead className="text-xs font-semibold">Status</TableHead>
                            <TableHead className="text-xs font-semibold">Prior.</TableHead>
                            <TableHead 
                              className="text-xs font-semibold cursor-pointer select-none hover:text-primary transition-colors text-center"
                              onClick={() => toggleBoardSort('transbordo')}
                            >
                              <span className="inline-flex items-center gap-1">
                                Transb.
                                {boardSortField === 'transbordo' && (
                                  <span className="text-primary">{boardSortDir === 'desc' ? '↓' : '↑'}</span>
                                )}
                              </span>
                            </TableHead>
                            <TableHead className="text-xs font-semibold">Sprint</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedTopLevel.map(item => {
                            const children = childrenMap.get(item.id!) || [];
                            const hasChildren = children.length > 0;
                            const isExpanded = expandedPbis.has(item.id!);

                            return (
                              <>{/* Parent row */}
                                <TableRow
                                  key={`p-${item.id!}`}
                                  className={`hover:bg-muted/30 transition-colors cursor-pointer ${hasChildren ? 'font-medium' : ''}`}
                                  onClick={() => setDrawerItem(item)}
                                >
                                  <TableCell className="w-8 px-2">
                                    {hasChildren ? (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                        onClick={e => { e.stopPropagation(); toggleExpand(item.id!); }}
                                      >
                                        {isExpanded
                                          ? <ChevronDown className="h-4 w-4" />
                                          : <div className="flex items-center gap-0.5"><ChevronRight className="h-4 w-4" /><span className="text-[10px] text-muted-foreground">{children.length}</span></div>
                                        }
                                      </Button>
                                    ) : <span className="inline-block w-6" />}
                                  </TableCell>
                                  {renderItemCells(item)}
                                </TableRow>

                                {/* Child rows */}
                                {hasChildren && isExpanded && children.map(child => (
                                  <TableRow
                                    key={`c-${child.id!}`}
                                    className="hover:bg-muted/20 transition-colors cursor-pointer bg-muted/5 border-l-2 border-l-primary/20"
                                    onClick={() => setDrawerItem(child)}
                                  >
                                    <TableCell className="w-8 px-2">
                                      <span className="inline-block w-6 text-center text-muted-foreground/40 text-xs">└</span>
                                    </TableCell>
                                    {renderItemCells(child, true)}
                                  </TableRow>
                                ))}
                              </>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {allTopLevel.length > PAGE_SIZE && (
                      <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                        <span>{allTopLevel.length} itens • Página {page + 1} de {totalPages}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>
            )}
          </TabsContent>

          {/* ═══════ TAB: Horas (TimeLog) ═══════ */}
          <TabsContent value="timelog" className="space-y-5 mt-0">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HeroKpiCard label="Total horas" value={Math.round(fab.totalHoursLogged)} suffix="h" icon={Timer} isLoading={fab.isLoading} />
              <HeroKpiCard label="Dias úteis (≈)" value={fab.totalHoursLogged > 0 ? Math.round(fab.totalHoursLogged / 8) : 0} suffix="d" icon={Clock} isLoading={fab.isLoading} delay={80} accent="bg-[hsl(var(--info))]" />
              <HeroKpiCard label="Colaboradores" value={fab.horasPorColaborador.length} icon={Users} isLoading={fab.isLoading} delay={160} accent="bg-[hsl(142,71%,45%)]" />
              <HeroKpiCard label="Produtos" value={fab.horasPorProduto.length} icon={Package} isLoading={fab.isLoading} delay={240} accent="bg-[hsl(43,85%,46%)]" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <HoursRankingCard
                title="Horas por Produto"
                icon={Package}
                data={fab.horasPorProduto}
                isLoading={fab.isLoading}
                emptyMessage="Nenhum produto identificado"
                delay={400}
              />
              <HoursRankingCard
                title="Horas por Fábrica"
                icon={Building2}
                data={fab.horasPorFabrica}
                isLoading={fab.isLoading}
                emptyMessage="Nenhuma fábrica identificada"
                delay={500}
              />
            </div>

            {fab.horasPorColaborador.length > 0 && (
              <Card className="animate-fade-in" style={{ animationDelay: '600ms' }}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />Distribuição de Horas por Colaborador
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(200, fab.horasPorColaborador.length * 36)}>
                    <BarChart data={fab.horasPorColaborador.slice(0, 12)} layout="vertical" margin={{ left: 0, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" unit="h" />
                      <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={130} />
                      <RechartsTooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(value: number) => [`${value}h`, 'Horas']}
                      />
                      <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══════ TAB: Transbordo ═══════ */}
          <TabsContent value="transbordo" className="space-y-5 mt-0">
            <TransbordoTab
              items={sprintTransbordoItems}
              transbordoPct={sprintTransbordoPct}
              transbordoCount={sprintTransbordoCount}
              realOverflowItemCount={fab.realOverflowItemCount}
              realOverflowCount={fab.realOverflowCount}
              realOverflowPct={fab.realOverflowPct}
              transbordoTotal={sprintTransbordoTotal}
              currentSprint={sprintFilter !== 'all' ? sprintFilter : fab.currentSprint}
              selectedSprint={sprintFilter}
              isLoading={fab.isLoading}
            />
          </TabsContent>

          {/* ═══════ TAB: Esteira / Saúde ═══════ */}
          <TabsContent value="esteira-saude" className="space-y-4 mt-0">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HeroKpiCard label="PBIs monitorados" value={pbiHealthBatch.overview.total} icon={ListTodo} onClick={() => setHealthFilter(prev => prev === 'all' ? 'all' : 'all')} active={healthFilter === 'all'} />
             <HeroKpiCard label="Saudável" value={pbiHealthBatch.overview.verde} icon={HeartPulse} accent="bg-[hsl(142,71%,45%)]" onClick={() => setHealthFilter(prev => prev === 'verde' ? 'all' : 'verde')} active={healthFilter === 'verde'} />
             <HeroKpiCard label="Atenção" value={pbiHealthBatch.overview.amarelo} icon={AlertTriangle} accent="bg-[hsl(43,85%,46%)]" onClick={() => setHealthFilter(prev => prev === 'amarelo' ? 'all' : 'amarelo')} active={healthFilter === 'amarelo'} />
             <HeroKpiCard label="Crítica" value={pbiHealthBatch.overview.vermelho} icon={AlertTriangle} accent="bg-destructive" onClick={() => setHealthFilter(prev => prev === 'vermelho' ? 'all' : 'vermelho')} active={healthFilter === 'vermelho'} />
            </div>
            {healthFilter !== 'all' && (
              <Badge variant="default" className="gap-1 text-xs cursor-pointer animate-fade-in" onClick={() => setHealthFilter('all')}>
                Filtro: {healthFilter === 'verde' ? 'Saudável' : healthFilter === 'amarelo' ? 'Atenção' : 'Crítica'} ✕
              </Badge>
            )}
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-sm">Visão de esteira por item</h3>
                <p className="text-xs text-muted-foreground">Saúde e estágio atual para PBIs/User Story/Bugs da sprint selecionada.</p>
              </div>
              <div className="p-4 space-y-2 max-h-[460px] overflow-auto">
                {sprintFilteredItems
                  .filter((item) => item.id && ['Product Backlog Item', 'User Story', 'Bug'].includes(item.work_item_type || ''))
                  .filter((item) => {
                    if (healthFilter === 'all') return true;
                    const status = pbiHealthBatch.healthById.get(item.id as number)?.health_status;
                    return status === healthFilter;
                  })
                  .slice(0, 60)
                  .map((item) => {
                    const lifecycle = pbiHealthBatch.lifecycleById.get(item.id as number);
                    return (
                      <div 
                        key={`health-${item.id}`} 
                        className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-2 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => setDrawerItem(item)}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">#{item.id} • {item.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            Estágio: {lifecycle?.current_stage || item.state || '—'} • Migrações: {lifecycle?.sprint_migration_count ?? 0} • Overflow: {lifecycle?.overflow_count ?? 0}
                          </p>
                        </div>
                        <PbiHealthBadge status={pbiHealthBatch.healthById.get(item.id as number)?.health_status} indicatorMode="fabrica-abc" />
                      </div>
                    );
                  })}
                {sprintFilteredItems.filter(i => i.id && ['Product Backlog Item', 'User Story', 'Bug'].includes(i.work_item_type || '')).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhum item monitorável na sprint selecionada. Dados de saúde são populados pela sincronização de esteira.</p>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* ═══════ TAB: Gargalos ═══════ */}
          <TabsContent value="gargalos" className="space-y-4 mt-0">
            {bottlenecks.overview && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <HeroKpiCard label="Total monitorados" value={Number(bottlenecks.overview.total_count)} icon={ListTodo} />
                <HeroKpiCard label="Saudável" value={Number(bottlenecks.overview.verde_count)} icon={HeartPulse} accent="bg-[hsl(142,71%,45%)]" />
                <HeroKpiCard label="Atenção" value={Number(bottlenecks.overview.amarelo_count)} icon={AlertTriangle} accent="bg-[hsl(43,85%,46%)]" />
                <HeroKpiCard label="Crítica" value={Number(bottlenecks.overview.vermelho_count)} icon={AlertTriangle} accent="bg-destructive" />
              </div>
            )}
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Resumo de Gargalos da Fábrica</h3>
                  <p className="text-xs text-muted-foreground">Duração por etapa da esteira de produção.</p>
                </div>
                <Badge variant="outline">{bottlenecks.bottlenecks.length} etapas</Badge>
              </div>
              <div className="p-4 space-y-2">
                {bottlenecks.bottlenecks.map((row) => (
                  <div key={`bn-${row.stage_key}`} className="grid grid-cols-1 sm:grid-cols-5 gap-2 rounded-md border border-border/60 p-2 text-xs">
                    <span className="font-medium text-foreground">{row.stage_label}</span>
                    <span className="text-muted-foreground">Média: {row.avg_days_in_stage}d</span>
                    <span className="text-muted-foreground">Máx: {row.max_days_in_stage}d</span>
                    <span className="text-muted-foreground">Em etapa: {row.count_in_stage}</span>
                    <span className="text-muted-foreground">Atraso: {row.count_overtime}</span>
                  </div>
                ))}
                {!bottlenecks.isLoading && bottlenecks.bottlenecks.length === 0 && (
                  <div className="text-center py-8">
                    <AlertTriangle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Sem dados de gargalo para o filtro atual.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Os dados são populados após a sincronização de esteira (pbi_stage_events).</p>
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* ═══════ TAB: Por Feature ═══════ */}
          <TabsContent value="por-feature" className="space-y-4 mt-0">
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Saúde por Feature</h3>
                  <p className="text-xs text-muted-foreground">Agregação por feature/epic para leitura de risco funcional.</p>
                </div>
                <Badge variant="outline">{featureSummary.rows.length} grupos</Badge>
              </div>
              <div className="p-4 space-y-2 max-h-[460px] overflow-auto">
                {featureSummary.rows.slice(0, 80).map((row, idx) => (
                  <div key={`feat-${row.feature_id ?? idx}`} className="rounded-md border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{row.feature_title || 'Sem feature'} {row.epic_title ? `• ${row.epic_title}` : ''}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {row.verde_count > 0 && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px] px-1.5">{row.verde_count}</Badge>}
                        {row.amarelo_count > 0 && <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px] px-1.5">{row.amarelo_count}</Badge>}
                        {row.vermelho_count > 0 && <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px] px-1.5">{row.vermelho_count}</Badge>}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      PBIs: {row.pbi_count} • Bugs: {row.bug_count} 
                      {row.avg_lead_time_days != null ? ` • Lead Time: ${row.avg_lead_time_days}d` : ''}
                      {row.overflow_count > 0 ? ` • Overflow: ${row.overflow_count}` : ''}
                    </p>
                  </div>
                ))}
                {!featureSummary.isLoading && featureSummary.rows.length === 0 && (
                  <div className="text-center py-8">
                    <Workflow className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Sem dados de feature para o período selecionado.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Dados preenchidos automaticamente pela hierarquia do DevOps (Feature → PBI) e saúde da esteira.</p>
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* ═══════ TAB: Backlog Priorizar ═══════ */}
          <TabsContent value="backlog-priorizar" className="space-y-4 mt-0">
            <Card className="overflow-hidden animate-fade-in">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-foreground text-sm">Visão Operacional: Backlog para Priorizar</h3>
                <p className="text-xs text-muted-foreground">Fonte operacional: query 03-Em Fila Backlog para Priorizar (todas as sprints)</p>
              </div>
              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs font-semibold w-16">ID</TableHead>
                      <TableHead className="text-xs font-semibold">Tipo</TableHead>
                      <TableHead className="text-xs font-semibold">Título</TableHead>
                      <TableHead className="text-xs font-semibold">Colaborador</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="text-xs font-semibold">Prior.</TableHead>
                      <TableHead className="text-xs font-semibold text-center">Transb.</TableHead>
                      <TableHead className="text-xs font-semibold">Sprint</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operational.isLoading ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                    ) : backlogPriorizarItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          <p>Nenhum item no backlog para priorizar.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      backlogPriorizarItems.map((item, idx) => (
                        <TableRow key={`bp-${item.id || idx}`} className="cursor-pointer hover:bg-muted/30" onClick={() => setDrawerItem(item)}>
                          {renderItemCells(item)}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* ═══════ TAB: UX-UI Fila ═══════ */}
          <TabsContent value="uxui-fila" className="space-y-4 mt-0">
            <Card className="overflow-hidden animate-fade-in">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-foreground text-sm">Visão Operacional: Fila Design / UX-UI</h3>
                <p className="text-xs text-muted-foreground">Fonte operacional: query 05-Em Fila UX-UI (todas as sprints)</p>
              </div>
              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs font-semibold w-16">ID</TableHead>
                      <TableHead className="text-xs font-semibold">Tipo</TableHead>
                      <TableHead className="text-xs font-semibold">Título</TableHead>
                      <TableHead className="text-xs font-semibold">Colaborador</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="text-xs font-semibold">Prior.</TableHead>
                      <TableHead className="text-xs font-semibold text-center">Transb.</TableHead>
                      <TableHead className="text-xs font-semibold">Sprint</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operational.isLoading ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                    ) : uxuiItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          <p>Nenhum item na fila UX-UI.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      uxuiItems.map((item, idx) => (
                        <TableRow key={`ux-${item.id || idx}`} className="cursor-pointer hover:bg-muted/30" onClick={() => setDrawerItem(item)}>
                          {renderItemCells(item)}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <DashboardDrawer
        open={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        title={drawerItem?.title || undefined}
        subtitle={drawerItem?.work_item_type || undefined}
        fields={drawerFields}
        workItemId={drawerItem?.id}
        workItemType={drawerItem?.work_item_type}
        externalUrl={drawerItem?.web_url}
      />

    </SectorLayout>
  );
}
