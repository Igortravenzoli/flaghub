import { useState, useMemo, useCallback, useEffect } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useFabricaKpis, FabricaItem, TimelogAggregation, KPI_DEFAULT_EXCLUDED_COLLABORATORS, getCollaboratorExclusionKeys, isCollaboratorExcluded, normalizeCollaboratorName } from '@/hooks/useFabricaKpis';
import { useTimelogUnificado } from '@/hooks/useTimelogUnificado';
import { useAuth } from '@/hooks/useAuth';
import { useHubIsAdmin } from '@/hooks/useHubPermissions';
import { useHubAreas } from '@/hooks/useHubAreas';
import { PostarParaDevOps } from '@/components/timelog/TimelogSharedComponents';
import { usePbiHealthBatch } from '@/hooks/usePbiHealthBatch';
import { usePbiBottlenecks } from '@/hooks/usePbiBottlenecks';
import { useFeaturePbiSummary } from '@/hooks/useFeaturePbiSummary';
import { useDevopsOperationalQueue } from '@/hooks/useDevopsOperationalQueue';
import { TransbordoTab } from '@/components/fabrica/TransbordoTab';
import { SprintBoardTab } from '@/components/fabrica/SprintBoardTab';
import { QaReturnCard } from '@/components/fabrica/QaReturnCard';
import { QaReturnTab } from '@/components/fabrica/QaReturnTab';
import { useQaReturnKpis } from '@/hooks/useQaReturnKpis';
import { PbiHealthBadge } from '@/components/pbi/PbiHealthBadge';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { useCrossSectorSearch } from '@/hooks/useCrossSectorSearch';
import { CrossSectorSearchBanner } from '@/components/dashboard/CrossSectorSearchBanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getAvailableDateKeysFromItems, getDateBoundsFromItems } from '@/lib/dateBounds';
import {
  Code2, ListTodo, Bug, Users, ChevronRight, ChevronDown, Search, ChevronLeft, X,
  Clock, Gauge, AlertTriangle, Timer, Package, Building2,
  TrendingUp, BarChart3, Zap, Plane, HeartPulse, Workflow, LayoutGrid, MoreHorizontal,
  GitMerge, Loader2, ExternalLink, CheckCircle2, Minus, SendHorizonal,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { Integration } from '@/components/setores/SectorIntegrations';
import { extractSprintCodeFromPath, formatSprintIntervalLabel, getCurrentOfficialSprintCode, getOfficialSprintRange } from '@/lib/sprintCalendar';
import { CHART_COLORS, STATE_COLORS, TYPE_COLORS, TYPE_LABELS } from '@/lib/chartColors';

type FabKpiFilter = 'all' | 'in_progress' | 'todo' | 'done' | 'aguardando_teste' | 'aguardando_deploy' | 'em_teste' | 'em_desenvolvimento' | 'new' | 'aviao' | 'sem_task';
type HealthFilter = 'all' | 'verde' | 'amarelo' | 'vermelho';
type DetailedStatusKey = 'aguardando_deploy' | 'aguardando_teste' | 'done' | 'em_desenvolvimento' | 'em_teste' | 'new' | 'aviao';
type DetailedScopeMode = 'gestor' | 'tasks';

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

const typeColors = TYPE_COLORS;
const typeLabels = TYPE_LABELS;
const stateColors = STATE_COLORS;

const AVIAO_REGEX = /(^|;)\s*AVIAO\s*(;|$)/i;
const TAG_AGUARDANDO_DEPLOY_REGEX = /(^|;)\s*(AGUARDANDO\s*DEPLOY|DEPLOY)\s*(;|$)/i;
const TAG_AGUARDANDO_TESTE_REGEX = /(^|;)\s*(AGUARDANDO\s*TESTE|QA\s*PENDENTE)\s*(;|$)/i;
const TAG_EM_TESTE_REGEX = /(^|;)\s*(EM\s*TESTE|TESTE|TESTING|IN\s*TEST)\s*(;|$)/i;
const TAG_EM_DESENVOLVIMENTO_REGEX = /(^|;)\s*(EM\s*DESENVOLVIMENTO|DESENVOLVIMENTO|IN\s*PROGRESS|ACTIVE|DEV)\s*(;|$)/i;
const TAG_DONE_REGEX = /(^|;)\s*(DONE|RESOLVED|CLOSED|FINALIZADO)\s*(;|$)/i;
const TAG_NEW_REGEX = /(^|;)\s*(NEW|TODO|TO\s*DO|BACKLOG)\s*(;|$)/i;

function getItemTags(item: FabricaItem, tagsByWorkItemId: Record<number, string>): string {
  if (item.id && tagsByWorkItemId[item.id]) return tagsByWorkItemId[item.id];
  return item.tags || '';
}

function isTaskLikeItem(item: FabricaItem): boolean {
  return item.work_item_type === 'Task' || item.work_item_type === 'Bug';
}

function isTaskOnlyItem(item: FabricaItem): boolean {
  return item.work_item_type === 'Task';
}

function isManagerLikeItem(item: FabricaItem): boolean {
  return item.work_item_type === 'Product Backlog Item' || item.work_item_type === 'User Story' || item.work_item_type === 'Bug';
}

function getDetailedStatusKey(item: FabricaItem, tagsByWorkItemId: Record<number, string>): Exclude<DetailedStatusKey, 'aviao'> | null {
  const state = (item.state || '').trim();
  const tags = getItemTags(item, tagsByWorkItemId);

  if (state === 'Aguardando Deploy' || TAG_AGUARDANDO_DEPLOY_REGEX.test(tags)) return 'aguardando_deploy';
  if (state === 'Em Teste' || TAG_EM_TESTE_REGEX.test(tags)) return 'em_teste';
  if (state === 'Aguardando Teste' || TAG_AGUARDANDO_TESTE_REGEX.test(tags)) return 'aguardando_teste';
  if (DONE_STATES.has(state) || TAG_DONE_REGEX.test(tags)) return 'done';
  if (FABRICA_IN_PROGRESS_STATES.has(state) || TAG_EM_DESENVOLVIMENTO_REGEX.test(tags)) return 'em_desenvolvimento';
  if (state === 'New' || TAG_NEW_REGEX.test(tags)) return 'new';

  return null;
}

function formatHoursFromMinutes(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

function formatMinutesAsHoursLabel(minutes: number): string {
  const hours = formatHoursFromMinutes(minutes);
  return `${hours.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}h`;
}

function AnimatedNumber({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value == null) return <span className="text-sm font-normal text-muted-foreground">Sem dados</span>;
  return <span>{value}{suffix}</span>;
}

function HeroKpiCard({ label, value, suffix, icon: Icon, description, accent, onClick, isLoading, active, tooltipFormula, tooltipDescription }: {
  label: string; value: number | string | null; suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string; accent?: string;
  onClick?: () => void; isLoading?: boolean; active?: boolean;
  tooltipFormula?: string; tooltipDescription?: string;
}) {
  const hasTooltip = Boolean(tooltipFormula || tooltipDescription);

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-3 w-20 mb-3" />
        <Skeleton className="h-7 w-16 mb-2" />
        <Skeleton className="h-3 w-32" />
      </Card>
    );
  }

  const iconColor = accent ? accent.replace('bg-', 'text-') : 'text-primary';
  const iconBg = accent ? `${accent}/10` : 'bg-primary/10';

  return (
    <Card
      className={`p-5 transition-colors duration-150 ${onClick ? 'cursor-pointer hover:bg-muted/30' : ''} ${active ? 'border-primary bg-primary/5' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-lg ${iconBg}`}>
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        </div>
        {hasTooltip ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-xs font-medium text-muted-foreground underline decoration-dotted cursor-help">{label}</p>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="max-w-md text-xs leading-relaxed">
                <p className="font-semibold mb-1">{label}</p>
                {tooltipFormula && <p className="mb-1"><span className="font-medium">Fórmula:</span> {tooltipFormula}</p>}
                {tooltipDescription && <p><span className="font-medium">Descrição:</span> {tooltipDescription}</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
        )}
      </div>
      <p className="text-2xl font-semibold text-foreground tracking-tight">
        {typeof value === 'number' ? value : value ?? <span className="text-sm font-normal text-muted-foreground">—</span>}
        {suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
      </p>
      {description && <p className="text-[11px] text-muted-foreground/60 mt-1">{description}</p>}
    </Card>
  );
}

function SprintStatusCard({ total, inProgress, toDo, done, semTask, isLoading, fabKpiFilter, toggleFab }: {
  total: number; inProgress: number; toDo: number; done: number; semTask: number;
  isLoading: boolean; fabKpiFilter: FabKpiFilter;
  toggleFab: (f: FabKpiFilter) => void;
}) {
  const completedPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const donePct = total > 0 ? (done / total) * 100 : 0;
  const inProgressPct = total > 0 ? (inProgress / total) * 100 : 0;
  const todoPct = total > 0 ? (toDo / total) * 100 : 0;

  const subItems: { key: FabKpiFilter; label: string; value: number; valueColor: string; dotColor: string }[] = [
    { key: 'in_progress', label: 'Em Progresso', value: inProgress, valueColor: 'text-[hsl(var(--info))]', dotColor: 'bg-[hsl(var(--info))]' },
    { key: 'todo',        label: 'A Fazer',      value: toDo,       valueColor: 'text-amber-600 dark:text-amber-400', dotColor: 'bg-amber-400' },
    { key: 'done',        label: 'Finalizados',  value: done,       valueColor: 'text-[hsl(var(--success))]', dotColor: 'bg-[hsl(var(--success))]' },
    { key: 'sem_task',    label: 'PBI/BUG sem Task', value: semTask, valueColor: semTask > 0 ? 'text-destructive' : 'text-muted-foreground', dotColor: semTask > 0 ? 'bg-destructive' : 'bg-border' },
  ];

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex justify-between mb-5">
          <div><Skeleton className="h-3 w-24 mb-2" /><Skeleton className="h-9 w-16" /></div>
          <div className="text-right"><Skeleton className="h-3 w-20 mb-2" /><Skeleton className="h-7 w-10 ml-auto" /></div>
        </div>
        <Skeleton className="h-2 w-full rounded-full mb-5" />
        <div className="grid grid-cols-4 gap-2 pt-4 border-t border-border">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">ITENS NO ESCOPO</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-foreground">{total}</span>
            <span className="text-sm text-muted-foreground">itens</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-muted-foreground mb-1">CONCLUÍDO</p>
          <span className={`text-2xl font-semibold ${completedPct > 0 ? 'text-[hsl(var(--success))]' : 'text-muted-foreground'}`}>
            {completedPct}%
          </span>
        </div>
      </div>

      {/* Barra de progresso segmentada */}
      <div className="relative h-2 rounded-full bg-muted overflow-hidden mb-5">
        <div className="absolute left-0 top-0 h-full bg-[hsl(var(--success))] transition-all duration-500" style={{ width: `${donePct}%` }} />
        <div className="absolute top-0 h-full bg-[hsl(var(--info))] transition-all duration-500" style={{ left: `${donePct}%`, width: `${inProgressPct}%` }} />
        <div className="absolute top-0 h-full bg-amber-400 transition-all duration-500" style={{ left: `${donePct + inProgressPct}%`, width: `${todoPct}%` }} />
      </div>

      {/* Sub-items clicáveis */}
      <div className="grid grid-cols-4 gap-2 pt-4 border-t border-border">
        {subItems.map(item => {
          const isActive = fabKpiFilter === item.key;
          return (
            <button
              key={item.key}
              onClick={() => toggleFab(item.key)}
              className={`text-left p-3 rounded-lg transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isActive ? 'bg-muted' : ''}`}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className={`h-1.5 w-1.5 rounded-full ${item.dotColor}`} />
                <span className="text-[11px] font-medium text-muted-foreground leading-none">{item.label}</span>
              </div>
              <span className={`text-xl font-bold ${isActive ? 'text-foreground' : item.valueColor}`}>{item.value}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function HoursRankingCard({ title, icon: Icon, data, isLoading, emptyMessage, delay = 0, onItemClick, activeItemName }: {
  title: string; icon: React.ComponentType<{ className?: string }>;
  data: TimelogAggregation[]; isLoading: boolean; emptyMessage: string; delay?: number;
  onItemClick?: (item: TimelogAggregation) => void;
  activeItemName?: string | null;
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
        {data.slice(0, 8).map((item, idx) => {
          const isActive = activeItemName === item.name;
          return (
            <button
              key={item.name}
              type="button"
              className={`group animate-fade-in w-full text-left rounded-md px-1 py-1 transition-colors ${onItemClick ? 'cursor-pointer hover:bg-muted/50' : ''} ${isActive ? 'ring-1 ring-primary bg-muted/40' : ''}`}
              style={{ animationDelay: `${idx * 50}ms` }}
              onClick={() => onItemClick?.(item)}
            >
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
            </button>
          );
        })}
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
  const [sprintSelection, setSprintSelection] = useState<string[]>(['__pending__']);
  const [sprintsOpen, setSprintsOpen] = useState(false);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [customActive, setCustomActive] = useState(false);
  const [excludedCollabs, setExcludedCollabs] = useState<Set<string>>(() => {
    const fallback = new Set(KPI_DEFAULT_EXCLUDED_COLLABORATORS);
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = window.localStorage.getItem('fabrica.excluded-collabs.v1');
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return fallback;
      return new Set(parsed.filter((v): v is string => typeof v === 'string'));
    } catch {
      return fallback;
    }
  });
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
  const hasAllSprints = sprintSelection.includes('all');
  const selectedSprintPaths = useMemo(
    () => sprintSelection.filter((s) => s !== 'all' && s !== '__pending__'),
    [sprintSelection]
  );
  const selectedSprintCodes = useMemo(
    () => selectedSprintPaths.map((sp) => extractSprintCodeFromPath(sp)).filter((code): code is string => !!code),
    [selectedSprintPaths]
  );
  const selectedSprintCode = selectedSprintCodes.length === 1 ? selectedSprintCodes[0] : null;
  const sprintRange = useMemo(() => {
    if (hasAllSprints || selectedSprintCodes.length === 0) return null;
    const ranges = selectedSprintCodes
      .map((code) => getOfficialSprintRange(code))
      .filter((r): r is { from: Date; to: Date } => !!r);
    if (ranges.length === 0) return null;
    const from = new Date(Math.min(...ranges.map((r) => r.from.getTime())));
    const to = new Date(Math.max(...ranges.map((r) => r.to.getTime())));
    return { from, to };
  }, [hasAllSprints, selectedSprintCodes]);
  const effectiveRange = customActive && customRange ? customRange : sprintRange;
  const sprintParamForKpis: string | string[] = customActive
    ? 'all'
    : hasAllSprints
      ? 'all'
      : selectedSprintPaths.length <= 1
        ? (selectedSprintPaths[0] ?? 'all')
        : selectedSprintPaths;
  const sprintFilter = hasAllSprints || selectedSprintPaths.length !== 1
    ? 'all'
    : selectedSprintPaths[0];
  const fab = useFabricaKpis(effectiveRange?.from, effectiveRange?.to, sprintParamForKpis, undefined, excludedCollabs);
  const operational = useDevopsOperationalQueue([
    '03-Em Fila Backlog para Priorizar',
    '05-Em Fila UX-UI',
  ]);
  const qaReturnKpis = useQaReturnKpis(selectedSprintCode);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<FabricaItem | null>(null);
  const [fabKpiFilter, setFabKpiFilter] = useState<FabKpiFilter>('all');
  const [expandedPbis, setExpandedPbis] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [searchAutoSwitched, setSearchAutoSwitched] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');
  const [detailedScopeMode, setDetailedScopeMode] = useState<DetailedScopeMode>('gestor');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [collaboratorFilter, setCollaboratorFilter] = useState<string | null>(null);
  const [boardSortField, setBoardSortField] = useState<'transbordo' | null>(null);
  const [boardSortDir, setBoardSortDir] = useState<'asc' | 'desc'>('desc');
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());

  const toggleBlockCollapse = (blockKey: string) => {
    setCollapsedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockKey)) next.delete(blockKey);
      else next.add(blockKey);
      return next;
    });
  };

  const PAGE_SIZE = 25;

  const localFabItemIds = useMemo(() => fab.allSprintItems.map(i => i.id).filter(Boolean) as number[], [fab.allSprintItems]);
  const { crossSectorResult } = useCrossSectorSearch(search, 'fabrica', localFabItemIds);

  // ── Admin & reconciliation ───────────────────────────────────────────────
  const { isAdmin: isAuthAdmin } = useAuth();
  const isHubAdmin = useHubIsAdmin();
  const isAdmin = isAuthAdmin || isHubAdmin;
  const { isOwner } = useHubAreas();
  const isFabricaOwner = isOwner('fabrica');
  // Owners do setor tambem podem nivelar/gerenciar timelog
  const canManageTimelog = isAdmin || isFabricaOwner;

  const reconFilters = useMemo(() => ({
    dateFrom: effectiveRange?.from?.toISOString?.()?.slice(0, 10) ?? undefined,
    dateTo:   effectiveRange?.to?.toISOString?.()?.slice(0, 10)   ?? undefined,
    workItemIds: localFabItemIds,
  }), [effectiveRange, localFabItemIds]);

  const { data: reconRows = [], isLoading: reconLoading } = useTimelogUnificado(reconFilters);

  // per-task aggregated map: seeded with ALL Tasks do setor (mesmo sem apontamento)
  // e enriquecido com vdesk/devops minutos. status recomputado a partir dos totais.
  type ReconEntry = {
    title: string;
    state: string | null;
    assignedTo: string | null;
    url: string | null;
    status: 'match' | 'only_vdesk' | 'only_devops' | 'divergent' | 'no_log';
    vdeskMin: number;
    devopsMin: number;
  };
  type ReconFilter = 'all' | ReconEntry['status'] | 'bo_sem_apontamento';
  const [reconFilter, setReconFilter] = useState<ReconFilter>('all');
  const [timelogDrilldown, setTimelogDrilldown] = useState<{ type: 'none' | 'fabrica' | 'collaborator'; key: string | null; taskIds: number[]; userCanonical: string | null }>({
    type: 'none',
    key: null,
    taskIds: [],
    userCanonical: null,
  });

  const drilldownTaskIdSet = useMemo(() => {
    if (timelogDrilldown.type === 'none') return null;
    return new Set(timelogDrilldown.taskIds);
  }, [timelogDrilldown]);

  const scopedReconRows = useMemo(() => {
    const rows = timelogDrilldown.type === 'collaborator' && timelogDrilldown.userCanonical
      ? reconRows.filter((row) => row.user_canonical === timelogDrilldown.userCanonical)
      : reconRows;

    if (!drilldownTaskIdSet) return rows;
    return rows.filter((row) => drilldownTaskIdSet.has(row.task_id));
  }, [reconRows, drilldownTaskIdSet, timelogDrilldown.type, timelogDrilldown.userCanonical]);

  const reconTaskMap = useMemo(() => {
    const m = new Map<number, ReconEntry>();
    // 1) Seed com as tasks do setor dentro do recorte atual.
    for (const it of fab.allSprintItems) {
      if (!it.id) continue;
      if (it.work_item_type && it.work_item_type !== 'Task') continue;
      if (drilldownTaskIdSet && !drilldownTaskIdSet.has(it.id)) continue;
      m.set(it.id, {
        title: it.title ?? `#${it.id}`,
        state: it.state,
        assignedTo: it.assigned_to_display,
        url: it.web_url,
        status: 'no_log',
        vdeskMin: 0,
        devopsMin: 0,
      });
    }
    // 2) Somar minutos das linhas da view (recon)
    for (const r of scopedReconRows) {
      let entry = m.get(r.task_id);
      if (!entry) {
        entry = {
          title: r.work_item_title ?? `#${r.task_id}`,
          state: r.work_item_state ?? null,
          assignedTo: null,
          url: r.work_item_url ?? null,
          status: 'no_log',
          vdeskMin: 0,
          devopsMin: 0,
        };
        m.set(r.task_id, entry);
      }
      entry.vdeskMin += r.minutes_vdesk ?? 0;
      entry.devopsMin += r.minutes_devops ?? 0;
    }
    // 3) Recomputa status (tolerancia = max(15min, 5%))
    for (const e of m.values()) {
      if (e.vdeskMin === 0 && e.devopsMin === 0) { e.status = 'no_log'; continue; }
      if (e.vdeskMin === 0) { e.status = 'only_devops'; continue; }
      if (e.devopsMin === 0) { e.status = 'only_vdesk'; continue; }
      const gap = Math.abs(e.vdeskMin - e.devopsMin);
      const tol = Math.max(15, Math.max(e.vdeskMin, e.devopsMin) * 0.05);
      e.status = gap <= tol ? 'match' : 'divergent';
    }
    return m;
  }, [scopedReconRows, fab.allSprintItems, drilldownTaskIdSet]);

  const reconEntriesScoped = useMemo(() => {
    return Array.from(reconTaskMap.entries());
  }, [reconTaskMap]);

  const reconStatusCounts = useMemo(() => {
    const counts: Record<string, number> = { match: 0, only_vdesk: 0, only_devops: 0, divergent: 0, no_log: 0 };
    for (const [, v] of reconEntriesScoped) {
      counts[v.status] = (counts[v.status] ?? 0) + 1;
    }
    return counts;
  }, [reconEntriesScoped]);

  const boSemApontamentoCount = useMemo(() => {
    return reconEntriesScoped.filter(([, entry]) => entry.status === 'no_log' && !isFabricaTodo(entry.state)).length;
  }, [reconEntriesScoped]);

  const filteredReconEntries = useMemo(() => {
    const arr = reconEntriesScoped;
    if (reconFilter === 'bo_sem_apontamento') {
      return arr.filter(([, entry]) => entry.status === 'no_log' && !isFabricaTodo(entry.state));
    }
    if (reconFilter === 'all') return arr;
    return arr.filter(([, v]) => v.status === reconFilter);
  }, [reconEntriesScoped, reconFilter]);

  // ── Timelog tab: source filters + merged data ────────────────────────────
  const [showVdesk, setShowVdesk] = useState(true);
  const [showDevops, setShowDevops] = useState(true);
  const [nivelamentoOpen, setNivelamentoOpen] = useState(false);

  const collaboratorTaskScopeMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    const add = (name: string, ids: number[]) => {
      const set = map.get(name) ?? new Set<number>();
      for (const id of ids) set.add(id);
      map.set(name, set);
    };
    if (showDevops) {
      for (const [name, ids] of Object.entries(fab.collaboratorTaskIdsDevops || {})) {
        add(name, ids);
      }
    }
    if (showVdesk) {
      for (const [name, ids] of Object.entries(fab.collaboratorTaskIdsVdesk || {})) {
        add(name, ids);
      }
    }
    return map;
  }, [fab.collaboratorTaskIdsDevops, fab.collaboratorTaskIdsVdesk, showDevops, showVdesk]);

  const fabricaTaskScopeMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const row of fab.horasPorFabricaScope || []) {
      map.set(row.displayName, row.taskIds);
    }
    return map;
  }, [fab.horasPorFabricaScope]);

  const horasPorFabricaData = useMemo(
    () => (fab.horasPorFabricaScope || []).map((row) => ({
      name: row.displayName,
      hours: row.hours,
      minutes: row.minutes,
    })),
    [fab.horasPorFabricaScope]
  );

  const timelogScopeTaskIds = useMemo(
    () => reconEntriesScoped.map(([taskId]) => taskId),
    [reconEntriesScoped]
  );

  const timelogExportMetaByTask = useMemo(() => {
    const map = new Map<number, {
      users: Set<string>;
      firstLogDate: string | null;
      lastLogDate: string | null;
      sampleOs: Set<string>;
    }>();

    for (const row of scopedReconRows) {
      const entry = map.get(row.task_id) ?? {
        users: new Set<string>(),
        firstLogDate: null,
        lastLogDate: null,
        sampleOs: new Set<string>(),
      };

      if (row.user_canonical) entry.users.add(row.user_canonical);
      if (row.num_os_sample) entry.sampleOs.add(row.num_os_sample);
      if (!entry.firstLogDate || row.log_date < entry.firstLogDate) entry.firstLogDate = row.log_date;
      if (!entry.lastLogDate || row.log_date > entry.lastLogDate) entry.lastLogDate = row.log_date;
      map.set(row.task_id, entry);
    }

    return map;
  }, [scopedReconRows]);

  const timelogExportRows = useMemo(() => {
    return filteredReconEntries.map(([taskId, entry]) => {
      const meta = timelogExportMetaByTask.get(taskId);
      return {
        task_id: taskId,
        titulo: entry.title,
        estado: entry.state ?? '',
        responsavel: entry.assignedTo ?? '',
        usuarios_apontamento: meta ? Array.from(meta.users).join(' | ') : '',
        primeira_data_log: meta?.firstLogDate ?? '',
        ultima_data_log: meta?.lastLogDate ?? '',
        os_amostra: meta ? Array.from(meta.sampleOs).join(' | ') : '',
        horas_devops: formatHoursFromMinutes(entry.devopsMin),
        horas_vdesk: formatHoursFromMinutes(entry.vdeskMin),
        gap_horas: formatHoursFromMinutes(Math.abs(entry.vdeskMin - entry.devopsMin)),
        gap_direcao: entry.vdeskMin === entry.devopsMin ? 'OK' : entry.vdeskMin > entry.devopsMin ? 'Vdesk > DevOps' : 'DevOps > Vdesk',
        status_reconciliacao: entry.status,
      };
    });
  }, [filteredReconEntries, timelogExportMetaByTask]);

  const timelogTotals = useMemo(() => {
    return filteredReconEntries.reduce((acc, [, entry]) => {
      acc.devopsMinutes += entry.devopsMin;
      acc.vdeskMinutes += entry.vdeskMin;
      acc.gapMinutes += Math.abs(entry.vdeskMin - entry.devopsMin);
      return acc;
    }, { devopsMinutes: 0, vdeskMinutes: 0, gapMinutes: 0 });
  }, [filteredReconEntries]);

  // Merge VDESK + DevOps collaborators by canonical name
  const mergedCollaboradores = useMemo(() => {
    const map = new Map<string, { name: string; vdesk: number; devops: number }>();
    if (showVdesk) {
      for (const c of fab.horasVdeskPorColaborador) {
        const e = map.get(c.name) ?? { name: c.name, vdesk: 0, devops: 0 };
        e.vdesk += c.hours;
        map.set(c.name, e);
      }
    }
    if (showDevops) {
      for (const c of fab.horasPorColaborador) {
        const e = map.get(c.name) ?? { name: c.name, vdesk: 0, devops: 0 };
        e.devops += c.hours;
        map.set(c.name, e);
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.vdesk + b.devops) - (a.vdesk + a.devops));
  }, [fab.horasVdeskPorColaborador, fab.horasPorColaborador, showVdesk, showDevops]);

  const { minDate, maxDate } = useMemo(
    () => getDateBoundsFromItems(fab.allItems, [(i) => i.created_date, (i) => i.changed_date]),
    [fab.allItems]
  );

  const availableDateKeys = useMemo(
    () => getAvailableDateKeysFromItems(fab.allItems, [(i) => i.created_date, (i) => i.changed_date]),
    [fab.allItems]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('fabrica.excluded-collabs.v1', JSON.stringify(Array.from(excludedCollabs)));
  }, [excludedCollabs]);

  useEffect(() => {
    if (fab.sortedSprints.length === 0) return;
    if (sprintSelection.includes('__pending__')) {
      const officialCurrentCode = getCurrentOfficialSprintCode();
      const currentSprintPath = fab.sortedSprints.find((sp) => extractSprintCodeFromPath(sp) === officialCurrentCode);
      setSprintSelection([currentSprintPath || fab.sortedSprints[fab.sortedSprints.length - 1]]);
      return;
    }
    if (hasAllSprints) return;
    const cleaned = selectedSprintPaths.filter((sp) => fab.sortedSprints.includes(sp));
    if (cleaned.length === 0) {
      const officialCurrentCode = getCurrentOfficialSprintCode();
      const currentSprintPath = fab.sortedSprints.find((sp) => extractSprintCodeFromPath(sp) === officialCurrentCode);
      setSprintSelection([currentSprintPath || fab.sortedSprints[fab.sortedSprints.length - 1]]);
      return;
    }
    if (cleaned.length !== selectedSprintPaths.length) {
      setSprintSelection(cleaned);
    }
  }, [fab.sortedSprints, sprintSelection, selectedSprintPaths, hasAllSprints]);

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
    const inCurrent = sprintFilter === 'all' || selectedSprintPaths.some((sp) => fab.items.some(i => i.id === searchId && i.iteration_path === sp));
    if (inCurrent) return;

    // Find the item across ALL items
    const match = fab.allItems.find(i => i.id === searchId);
    if (match?.iteration_path && fab.sortedSprints.includes(match.iteration_path)) {
      setSearchAutoSwitched(match.iteration_path);
      setSprintSelection((prev) => {
        if (prev.includes('all')) return prev;
        const base = prev.filter((v) => v !== '__pending__');
        return base.includes(match.iteration_path!) ? base : [...base, match.iteration_path!];
      });
      setPage(0);
    }
  }, [search, fab.allItems, fab.items, fab.sortedSprints, sprintFilter, searchAutoSwitched, selectedSprintPaths]);

  const colabChartData = useMemo(() =>
    Object.entries(fab.porColaborador)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 10)
      .map(([name, count]) => ({ name: name.split(' ').slice(0, 2).join(' '), count })),
    [fab.porColaborador]
  );

  const selectedCollaboratorsCount = useMemo(
    () => fab.allCollaborators.filter((name) => !isCollaboratorExcluded(name, excludedCollabs)).length,
    [fab.allCollaborators, excludedCollabs]
  );

  const selectedSprintsCount = hasAllSprints ? fab.sortedSprints.length : selectedSprintPaths.length;

  const setSprintIncluded = useCallback((sprintPath: string, include: boolean) => {
    setSprintSelection((prev) => {
      const base = prev.filter((v) => v !== '__pending__' && v !== 'all');
      const next = new Set(base);
      if (include) next.add(sprintPath);
      else next.delete(sprintPath);

      if (next.size === 0) return ['all'];
      return Array.from(next);
    });
    setCustomActive(false);
    setFabKpiFilter('all');
    setPage(0);
  }, []);

  const setCollaboratorIncluded = useCallback((name: string, include: boolean) => {
    const normalized = normalizeCollaboratorName(name);
    const exclusionKeys = getCollaboratorExclusionKeys(name);

    setExcludedCollabs((prev) => {
      const next = new Set(prev);

      exclusionKeys.forEach((key) => next.delete(key));

      if (!include && normalized) {
        next.add(normalized);
      }

      return next;
    });
  }, []);

  const markAllCollaborators = useCallback(() => {
    setExcludedCollabs(new Set());
  }, []);

  const unmarkAllCollaborators = useCallback(() => {
    const allExcluded = new Set<string>();
    for (const name of fab.allCollaborators) {
      for (const key of getCollaboratorExclusionKeys(name)) {
        allExcluded.add(key);
      }
    }
    setExcludedCollabs(allExcluded);
  }, [fab.allCollaborators]);

  const TYPE_COLORS: Record<string, string> = {
    'PBI': 'hsl(var(--primary))',
    'Task': 'hsl(var(--info))',
    'Bug': 'hsl(0, 72%, 51%)',
    'Story': 'hsl(280, 65%, 60%)',
  };

  const getTypeColor = (typeName: string, idx: number) =>
    TYPE_COLORS[typeName] || CHART_COLORS[idx % CHART_COLORS.length];

  const toggleTypeFilter = (typeName: string) => {
    setTypeFilter(prev => prev === typeName ? null : typeName);
    setPage(0);
  };

  const sprintFilteredItems = useMemo(() => fab.items, [fab.items]);

  const sprintKpiItems = useMemo(
    () => sprintFilteredItems.filter((item) => item.count_in_kpi !== false && isManagerLikeItem(item)),
    [sprintFilteredItems]
  );

  const typeDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of sprintFilteredItems) {
      const t = typeLabels[item.work_item_type || ''] || item.work_item_type || 'Outro';
      map[t] = (map[t] || 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [sprintFilteredItems]);

  const sprintTotal = sprintKpiItems.length;
  const sprintInProgress = sprintKpiItems.filter(i => isFabricaInProgress(i.state)).length;
  const sprintToDo = sprintKpiItems.filter(i => isFabricaTodo(i.state)).length;
  const sprintDone = sprintKpiItems.filter(i => isDone(i.state)).length;
  const sprintAguardandoTeste = sprintFilteredItems.filter(i => i.state === 'Aguardando Teste').length;

  const sprintTaskItems = useMemo(
    () => sprintFilteredItems.filter((item) => isTaskOnlyItem(item)),
    [sprintFilteredItems]
  );

  const sprintManagerItems = useMemo(
    () => sprintFilteredItems.filter((item) => isManagerLikeItem(item)),
    [sprintFilteredItems]
  );

  // Itens de gestor (PBI/BUG) sem Task vinculada (anomalia/BO)
  const sprintPbisSemTask = useMemo(() => {
    const childParentIds = new Set(
      sprintFilteredItems
        .filter(i => i.work_item_type === 'Task' && i.parent_id != null)
        .map(i => i.parent_id!)
    );
    return sprintFilteredItems.filter((i) => isManagerLikeItem(i) && i.id != null && !childParentIds.has(i.id));
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
  const sprintRealOverflowItemCount = sprintTransbordoItems.filter((item) => item.realOverflowCount > 0).length;
  const sprintRealOverflowCount = sprintTransbordoItems.reduce((sum, item) => sum + item.realOverflowCount, 0);
  const sprintRealOverflowPct = sprintTransbordoTotal > 0
    ? Math.round((sprintRealOverflowItemCount / sprintTransbordoTotal) * 100)
    : 0;

  const sprintAviaoCount = useMemo(() => {
    const source = detailedScopeMode === 'gestor' ? sprintManagerItems : sprintTaskItems;
    return source.filter(i => {
      if (!i.id) return false;
      const tags = getItemTags(i, fab.tagsByWorkItemId);
      return AVIAO_REGEX.test(tags);
    }).length;
  }, [detailedScopeMode, sprintManagerItems, sprintTaskItems, fab.tagsByWorkItemId]);

  const sprintDetailedStatuses = useMemo(() => {
    const counts: Record<Exclude<DetailedStatusKey, 'aviao'>, number> = {
      aguardando_deploy: 0,
      aguardando_teste: 0,
      done: 0,
      em_desenvolvimento: 0,
      em_teste: 0,
      new: 0,
    };

    const source = detailedScopeMode === 'gestor' ? sprintManagerItems : sprintTaskItems;

    for (const item of source) {
      const key = getDetailedStatusKey(item, fab.tagsByWorkItemId);
      if (!key) continue;
      counts[key] += 1;
    }

    return [
      { key: 'aguardando_deploy' as FabKpiFilter, label: 'Aguardando Deploy', stateColor: 'Aguardando Deploy', count: counts.aguardando_deploy },
      { key: 'aguardando_teste' as FabKpiFilter, label: 'Aguardando Teste', stateColor: 'Aguardando Teste', count: counts.aguardando_teste },
      { key: 'done' as FabKpiFilter, label: 'Done', stateColor: 'Done', count: counts.done },
      { key: 'em_desenvolvimento' as FabKpiFilter, label: 'Em Desenvolvimento', stateColor: 'Em desenvolvimento', count: counts.em_desenvolvimento },
      { key: 'em_teste' as FabKpiFilter, label: 'Em Teste', stateColor: 'Em Teste', count: counts.em_teste },
      { key: 'new' as FabKpiFilter, label: 'New', stateColor: 'New', count: counts.new },
      { key: 'aviao' as FabKpiFilter, label: 'Aviões na Sprint', stateColor: 'Active', count: sprintAviaoCount },
    ];
  }, [detailedScopeMode, sprintManagerItems, sprintTaskItems, fab.tagsByWorkItemId, sprintAviaoCount]);

  const pbiHealthIds = useMemo(
    () => sprintFilteredItems
      .filter((i) => i.id && ['Product Backlog Item', 'User Story', 'Bug'].includes(i.work_item_type || ''))
      .map((i) => i.id as number),
    [sprintFilteredItems]
  );

  const pbiHealthBatch = usePbiHealthBatch(pbiHealthIds, pbiHealthIds.length > 0);
  const collaboratorAwareHealthOverview = pbiHealthBatch.overview;

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
    const filterByDetailedStatus = (statusKey: Exclude<DetailedStatusKey, 'aviao'>) => {
      if (detailedScopeMode === 'tasks') {
        return sprintFilteredItems.filter((i) => isTaskOnlyItem(i) && getDetailedStatusKey(i, fab.tagsByWorkItemId) === statusKey);
      }

      const managerMatches = sprintFilteredItems.filter(
        (i) => isManagerLikeItem(i) && getDetailedStatusKey(i, fab.tagsByWorkItemId) === statusKey
      );
      const managerIds = new Set(managerMatches.map((i) => i.id).filter((id): id is number => id != null));

      return sprintFilteredItems.filter((i) => {
        if (isManagerLikeItem(i)) {
          return managerIds.has(i.id as number);
        }
        if (isTaskOnlyItem(i) && i.parent_id != null) {
          return managerIds.has(i.parent_id);
        }
        return false;
      });
    };

    switch (fabKpiFilter) {
      case 'in_progress': items = items.filter(i => isFabricaInProgress(i.state)); break;
      case 'todo': items = items.filter(i => isFabricaTodo(i.state)); break;
      case 'done': items = items.filter(i => isDone(i.state)); break;
      case 'aguardando_teste': items = filterByDetailedStatus('aguardando_teste'); break;
      case 'aguardando_deploy': items = filterByDetailedStatus('aguardando_deploy'); break;
      case 'em_teste': items = filterByDetailedStatus('em_teste'); break;
      case 'em_desenvolvimento': items = filterByDetailedStatus('em_desenvolvimento'); break;
      case 'new': items = filterByDetailedStatus('new'); break;
      case 'aviao': items = items.filter(i => {
        if (!i.id) return false;
        if (detailedScopeMode === 'tasks' && !isTaskOnlyItem(i)) return false;
        if (detailedScopeMode === 'gestor' && !isManagerLikeItem(i)) return false;
        const tags = getItemTags(i, fab.tagsByWorkItemId);
        return AVIAO_REGEX.test(tags);
      }); break;
      case 'sem_task': {
        const childParentIds = new Set(
          sprintFilteredItems
            .filter(i => i.work_item_type === 'Task' && i.parent_id != null)
            .map(i => i.parent_id!)
        );
        items = items.filter(
          i => isManagerLikeItem(i) && i.id != null && !childParentIds.has(i.id)
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
  }, [sprintFilteredItems, fabKpiFilter, fab.tagsByWorkItemId, detailedScopeMode, typeFilter, collaboratorFilter]);

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

  const handleExportCSV = () => {
    if (activeTab === 'timelog') {
      exportCSV({
        title: timelogDrilldown.type === 'collaborator' && timelogDrilldown.key
          ? `TimeLog - ${timelogDrilldown.key}`
          : 'TimeLog',
        area: 'Fábrica',
        periodLabel,
        columns: ['task_id', 'titulo', 'estado', 'responsavel', 'usuarios_apontamento', 'primeira_data_log', 'ultima_data_log', 'os_amostra', 'horas_devops', 'horas_vdesk', 'gap_horas', 'gap_direcao', 'status_reconciliacao'],
        rows: timelogExportRows,
      });
      return;
    }

    exportCSV({
      title: 'Sprint Board', area: 'Fábrica', periodLabel,
      columns: ['id', 'title', 'assigned_to_display', 'state', 'priority', 'iteration_path'],
      rows: fab.items.map((item) => ({
        id: item.id,
        title: item.title,
        assigned_to_display: item.assigned_to_display,
        state: item.state,
        priority: item.priority,
        iteration_path: item.iteration_path,
      })),
    });
  };

  const handleExportPDF = () => {
    if (activeTab === 'timelog') {
      exportPDF({
        title: timelogDrilldown.type === 'collaborator' && timelogDrilldown.key
          ? `TimeLog - ${timelogDrilldown.key}`
          : 'TimeLog',
        area: 'Fábrica',
        periodLabel,
        kpis: [
          { label: 'Tasks no escopo', value: timelogExportRows.length },
          { label: 'Horas DevOps', value: formatMinutesAsHoursLabel(timelogTotals.devopsMinutes) },
          { label: 'Horas Vdesk', value: formatMinutesAsHoursLabel(timelogTotals.vdeskMinutes) },
          { label: 'Gap absoluto', value: formatMinutesAsHoursLabel(timelogTotals.gapMinutes) },
        ],
        columns: ['task_id', 'titulo', 'estado', 'responsavel', 'usuarios_apontamento', 'horas_devops', 'horas_vdesk', 'gap_horas', 'status_reconciliacao'],
        rows: timelogExportRows,
      });
      return;
    }

    exportPDF({
      title: 'Dashboard Fábrica', area: 'Fábrica', periodLabel,
      kpis: [
        { label: 'Total', value: fab.total },
        { label: 'Em Progresso', value: fab.inProgress },
        { label: 'A Fazer', value: fab.toDo },
        { label: 'Finalizados', value: fab.done },
      ],
      columns: ['id', 'title', 'assigned_to_display', 'state', 'priority'],
      rows: fab.items.map((item) => ({
        id: item.id,
        title: item.title,
        assigned_to_display: item.assigned_to_display,
        state: item.state,
        priority: item.priority,
      })),
    });
  };

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
      case 'aguardando_deploy': return 'Aguardando Deploy';
      case 'em_teste': return 'Em Teste';
      case 'em_desenvolvimento': return 'Em Desenvolvimento';
      case 'new': return 'New';
      case 'aviao': return 'Avião';
      case 'sem_task': return 'PBI/BUG sem Task';
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
          <Popover open={sprintsOpen} onOpenChange={setSprintsOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1 h-8 px-3 text-xs">
                <GitMerge className="h-3.5 w-3.5" />
                Sprints ({selectedSprintsCount}/{fab.sortedSprints.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start">
              <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Sprints no escopo</p>
              <ScrollArea className="h-[280px]">
                <div className="space-y-1">
                  {[...fab.sortedSprints].reverse().map((sp) => {
                    const isChecked = hasAllSprints || selectedSprintPaths.includes(sp);
                    return (
                      <label key={sp} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => setSprintIncluded(sp, checked === true)}
                        />
                        <span className="truncate">{sp.split('\\').pop()}</span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="border-t mt-2 pt-2 flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs flex-1 h-7"
                  onClick={() => {
                    setSprintSelection(['all']);
                    setCustomActive(false);
                    setFabKpiFilter('all');
                    setPage(0);
                  }}
                >
                  Marcar todos
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs flex-1 h-7"
                  onClick={() => {
                    const officialCurrentCode = getCurrentOfficialSprintCode();
                    const currentSprintPath = fab.sortedSprints.find((sp) => extractSprintCodeFromPath(sp) === officialCurrentCode);
                    setSprintSelection([currentSprintPath || fab.sortedSprints[fab.sortedSprints.length - 1]]);
                    setCustomActive(false);
                    setFabKpiFilter('all');
                    setPage(0);
                  }}
                >
                  Sprint atual
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
        {/* Collaborator multi-select filter */}
        {fab.allCollaborators.length > 0 && (
          <Popover open={collaboratorsOpen} onOpenChange={setCollaboratorsOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1 h-8 px-3 text-xs">
                <Users className="h-3.5 w-3.5" />
                Colaboradores ({selectedCollaboratorsCount}/{fab.allCollaborators.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Colaboradores contabilizados</p>
              <ScrollArea className="h-[280px]">
                <div className="space-y-1">
                  {fab.allCollaborators.map(name => {
                    const isChecked = !isCollaboratorExcluded(name, excludedCollabs);
                    return (
                      <label key={name} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            setCollaboratorIncluded(name, checked === true);
                          }}
                        />
                        <span className="truncate">{name}</span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="border-t mt-2 pt-2 flex gap-1">
                <Button variant="ghost" size="sm" className="text-xs flex-1 h-7" onClick={markAllCollaborators}>
                  Marcar todos
                </Button>
                <Button variant="ghost" size="sm" className="text-xs flex-1 h-7" onClick={unmarkAllCollaborators}>
                  Desmarcar todos
                </Button>
                <Button variant="ghost" size="sm" className="text-xs flex-1 h-7" onClick={() => setExcludedCollabs(new Set(KPI_DEFAULT_EXCLUDED_COLLABORATORS))}>
                  Padrão
                </Button>
              </div>
            </PopoverContent>
          </Popover>
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
          {/* Tabs primárias visíveis + dropdown para secundárias */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-full overflow-x-auto">
            <TabsList className="bg-transparent p-0 h-auto gap-0.5 flex-shrink-0">
              <TabsTrigger value="overview" className="gap-1.5 text-xs h-8">
                <Zap className="h-3.5 w-3.5" />Visão Geral
              </TabsTrigger>
              <TabsTrigger value="timelog" className="gap-1.5 text-xs h-8">
                <Timer className="h-3.5 w-3.5" />TimeLog
              </TabsTrigger>
              <TabsTrigger value="transbordo" className="gap-1.5 text-xs h-8">
                <AlertTriangle className="h-3.5 w-3.5" />Transbordo
                {sprintTransbordoCount > 0 && (
                  <Badge variant={sprintTransbordoPct != null && sprintTransbordoPct > 50 ? 'destructive' : 'secondary'} className="text-[10px] ml-0.5 px-1 py-0">
                    {sprintTransbordoCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="sprint-board" className="gap-1.5 text-xs h-8">
                <LayoutGrid className="h-3.5 w-3.5" />Sprint Board
              </TabsTrigger>
              <TabsTrigger value="qa-return" className="gap-1.5 text-xs h-8">
                <AlertTriangle className="h-3.5 w-3.5" />Retorno QA
              </TabsTrigger>
              <TabsTrigger value="esteira-saude" className="gap-1.5 text-xs h-8">
                <HeartPulse className="h-3.5 w-3.5" />Saúde
              </TabsTrigger>
            </TabsList>

            {/* Tabs secundárias no dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition-colors flex-shrink-0 ml-auto
                  ${['gargalos','por-feature','backlog-priorizar','uxui-fila'].includes(activeTab)
                    ? 'bg-background shadow-sm text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/60'}`}>
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  Mais
                  {['gargalos','por-feature','backlog-priorizar','uxui-fila'].includes(activeTab) && (
                    <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setActiveTab('gargalos')} className={`gap-2 text-xs ${activeTab === 'gargalos' ? 'font-medium text-primary' : ''}`}>
                  <AlertTriangle className="h-3.5 w-3.5" />Gargalos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('por-feature')} className={`gap-2 text-xs ${activeTab === 'por-feature' ? 'font-medium text-primary' : ''}`}>
                  <Workflow className="h-3.5 w-3.5" />Por Feature
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('backlog-priorizar')} className={`gap-2 text-xs ${activeTab === 'backlog-priorizar' ? 'font-medium text-primary' : ''}`}>
                  <ListTodo className="h-3.5 w-3.5" />Backlog Priorizar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('uxui-fila')} className={`gap-2 text-xs ${activeTab === 'uxui-fila' ? 'font-medium text-primary' : ''}`}>
                  <TrendingUp className="h-3.5 w-3.5" />Fila Design / UX-UI
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* ═══════ TAB: Visão Geral ═══════ */}
          <TabsContent value="overview" className="space-y-4 mt-0">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Sprint Status consolidado */}
              <SprintStatusCard
                total={sprintTotal}
                inProgress={sprintInProgress}
                toDo={sprintToDo}
                done={sprintDone}
                semTask={sprintPbisSemTaskCount}
                isLoading={fab.isLoading}
                fabKpiFilter={fabKpiFilter}
                toggleFab={toggleFab}
              />

              <Card className="p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-xs font-medium text-muted-foreground">STATUS DETALHADOS</p>
                  <div className="inline-flex rounded-md border border-border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setDetailedScopeMode('gestor')}
                      className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${detailedScopeMode === 'gestor' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
                    >
                      Gestor (PBI/BUG)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailedScopeMode('tasks')}
                      className={`px-2.5 py-1 text-[11px] font-medium transition-colors border-l border-border ${detailedScopeMode === 'tasks' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
                    >
                      Tasks
                    </button>
                  </div>
                </div>
                {detailedScopeMode === 'gestor' && (
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Contagem primária em PBI/BUG com exploração das tasks filhas ao aplicar filtro.
                  </p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {sprintDetailedStatuses.map((status) => {
                    const isActive = fabKpiFilter === status.key;
                    return (
                      <button
                        key={status.label}
                        type="button"
                        onClick={() => toggleFab(status.key)}
                        className={`rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/40 ${isActive ? 'border-primary ring-1 ring-primary/40 bg-primary/5' : 'border-border bg-muted/20'}`}
                      >
                        <Badge variant="outline" className={`mb-2 text-[10px] ${stateColors[status.stateColor] || ''}`}>
                          {status.label}
                        </Badge>
                        <div className="text-xl font-semibold leading-none">{status.count}</div>
                      </button>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* Performance + Riscos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Performance */}
              {fab.isLoading ? (
                <Card className="p-6"><Skeleton className="h-3 w-24 mb-5" /><Skeleton className="h-14 w-full mb-3" /><Skeleton className="h-14 w-full" /></Card>
              ) : (
                <Card className="p-6">
                  <p className="text-xs font-medium text-muted-foreground mb-4">PERFORMANCE</p>
                  <div className="space-y-0 divide-y divide-border">
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-primary/10">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Lead Time Médio</p>
                          <p className="text-[11px] text-muted-foreground/70">
                            {fab.leadTimeSource === 'effort' ? 'Effort médio / PBI' : fab.leadTimeSource === 'timelog' ? 'Horas trabalhadas / PBI' : 'Effort / PBI'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-semibold text-foreground">
                          {fab.leadTimeMedio ?? <span className="text-muted-foreground text-base">—</span>}
                        </span>
                        {fab.leadTimeMedio != null && (
                          <span className="text-xs text-muted-foreground ml-1">{fab.leadTimeSource === 'effort' ? 'pts' : 'h'}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-[hsl(var(--info))]/10">
                          <Gauge className="h-3.5 w-3.5 text-[hsl(var(--info))]" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Velocidade Média</p>
                          <p className="text-[11px] text-muted-foreground/70">
                            {fab.velocidadeSource === 'effort' ? `Effort / Sprint (${fab.sprintCount} sprints)` : fab.velocidadeSource === 'timelog' ? `Horas / Sprint (${fab.sprintCount})` : 'Effort ou Horas / Sprint'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-semibold text-foreground">
                          {fab.velocidadeMedia ?? <span className="text-muted-foreground text-base">—</span>}
                        </span>
                        {fab.velocidadeMedia != null && (
                          <span className="text-xs text-muted-foreground ml-1">{fab.velocidadeSource === 'effort' ? 'pts' : 'h'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Riscos */}
              {fab.isLoading || qaReturnKpis.isLoading ? (
                <Card className="p-6"><Skeleton className="h-3 w-16 mb-5" /><Skeleton className="h-14 w-full mb-3" /><Skeleton className="h-14 w-full" /></Card>
              ) : (() => {
                const transbordoHigh = sprintTransbordoPct != null && sprintTransbordoPct > 50;
                const qaOpen = qaReturnKpis.summary?.open_events ?? 0;
                const qaTotal = qaReturnKpis.summary?.total_events ?? 0;
                const qaAvg = qaReturnKpis.summary?.avg_days_open;
                const qaMax = qaReturnKpis.summary?.max_days_open;
                return (
                  <Card className="p-6">
                    <p className="text-xs font-medium text-muted-foreground mb-4">RISCOS</p>
                    <div className="space-y-0 divide-y divide-border">
                      <button
                        className="w-full text-left flex items-center justify-between py-3 hover:bg-muted/20 rounded-lg px-2 -mx-2 transition-colors"
                        onClick={() => sprintTransbordoItems.length > 0 && setActiveTab('transbordo')}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`p-1.5 rounded-lg ${transbordoHigh ? 'bg-destructive/10' : 'bg-amber-500/10'}`}>
                            <AlertTriangle className={`h-3.5 w-3.5 ${transbordoHigh ? 'text-destructive' : 'text-amber-500'}`} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">Transbordo</p>
                            <p className="text-[11px] text-muted-foreground/70">
                              {sprintTransbordoCount > 0 ? `${sprintTransbordoCount} de ${sprintTransbordoTotal} itens` : 'Itens não entregues na sprint'}
                            </p>
                          </div>
                        </div>
                        <span className={`text-2xl font-semibold ${transbordoHigh ? 'text-destructive' : sprintTransbordoPct != null && sprintTransbordoPct > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                          {sprintTransbordoPct != null ? `${sprintTransbordoPct}%` : '—'}
                        </span>
                      </button>
                      <button
                        className="w-full text-left flex items-start justify-between py-3 hover:bg-muted/20 rounded-lg px-2 -mx-2 transition-colors"
                        onClick={() => setActiveTab('qa-return')}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`p-1.5 rounded-lg ${qaOpen > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                            <AlertTriangle className={`h-3.5 w-3.5 ${qaOpen > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">Retorno QA</p>
                            <p className="text-[11px] text-muted-foreground/70">{qaTotal} total no período</p>
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <div className="flex items-baseline gap-1.5 justify-end">
                            <span className="text-2xl font-semibold text-foreground">{qaTotal}</span>
                            {qaOpen > 0 && (
                              <span className="text-sm font-medium text-destructive">{qaOpen} abertos</span>
                            )}
                          </div>
                          {qaOpen > 0 && (qaAvg != null || qaMax != null) && (
                            <div className="flex gap-3 justify-end">
                              {qaAvg != null && (
                                <span className="text-[11px] text-muted-foreground">méd. {qaAvg.toFixed(1)}d</span>
                              )}
                              {qaMax != null && (
                                <span className={`text-[11px] font-medium ${qaMax > 14 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  máx. {qaMax}d
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  </Card>
                );
              })()}
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
                          onClick={(data: { name?: string } | undefined) => {
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
            <div className="grid grid-cols-1 gap-4">
              <HoursRankingCard
                title="Horas por Fábrica (DevOps)"
                icon={Building2}
                data={horasPorFabricaData}
                isLoading={fab.isLoading}
                emptyMessage="Nenhuma fábrica identificada"
                delay={500}
                activeItemName={timelogDrilldown.type === 'fabrica' ? timelogDrilldown.key : null}
                onItemClick={(item) => {
                  const taskIds = fabricaTaskScopeMap.get(item.name) || [];
                  setTimelogDrilldown((prev) => {
                    if (prev.type === 'fabrica' && prev.key === item.name) {
                      return { type: 'none', key: null, taskIds: [], userCanonical: null };
                    }
                    return { type: 'fabrica', key: item.name, taskIds, userCanonical: null };
                  });
                  setReconFilter('all');
                }}
              />
            </div>

            {/* ── Reconciliação + Horas por Colaborador (lado a lado) ───── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Reconciliação Vdesk ↔ Devops */}
              <Card className="animate-fade-in border-l-4 border-l-purple-400 lg:col-span-3" style={{ animationDelay: '600ms' }}>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <GitMerge className="h-4 w-4 text-purple-500" />
                    Reconciliação Vdesk ↔ Devops
                    {reconLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
                    {fab.vdeskMatchRate !== null && (
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        Cobertura ≈ {fab.vdeskMatchRate}%
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {timelogDrilldown.type !== 'none' && (
                    <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                      <Badge variant="outline" className="text-[10px]">
                        {timelogDrilldown.type === 'fabrica' ? 'Filtro por Fábrica' : 'Filtro por Colaborador'}
                      </Badge>
                      <span className="truncate text-muted-foreground">{timelogDrilldown.key}</span>
                      <span className="ml-auto text-muted-foreground">{timelogDrilldown.taskIds.length} tasks</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={() => setTimelogDrilldown({ type: 'none', key: null, taskIds: [], userCanonical: null })}
                      >
                        Limpar
                      </Button>
                    </div>
                  )}
                  {timelogDrilldown.type === 'collaborator' && timelogDrilldown.userCanonical && (
                    <p className="text-[11px] text-muted-foreground">
                      A reconciliação e o export usam apenas os apontamentos do colaborador selecionado.
                    </p>
                  )}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {[
                      { key: 'all',         label: 'Todas',           color: 'text-foreground bg-muted/50 border-border' },
                      { key: 'match',       label: 'Sincronizados',   color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800' },
                      { key: 'only_vdesk',  label: 'Só Vdesk',        color: 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800' },
                      { key: 'divergent',   label: 'Divergentes',     color: 'text-red-600 bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800' },
                      { key: 'no_log',      label: 'Sem apontamento', color: 'text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700' },
                      { key: 'bo_sem_apontamento', label: 'BO sem apont.', color: 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800' },
                    ].map(({ key, label, color }) => {
                      const isActive = reconFilter === key;
                      const count = key === 'all'
                        ? reconEntriesScoped.length
                        : key === 'bo_sem_apontamento'
                          ? boSemApontamentoCount
                        : (reconStatusCounts[key] ?? 0);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setReconFilter(key as typeof reconFilter)}
                          className={`rounded-lg border p-2 text-center transition hover:brightness-95 ${color} ${isActive ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
                          title={isActive ? 'Clique novamente em Todas para limpar o filtro' : `Filtrar por: ${label}`}
                        >
                          <div className="text-xl font-bold leading-none">{count}</div>
                          <div className="text-[10px] font-medium mt-1">{label}</div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Regra BO: task fora de To Do/New sem apontamento de horas.
                  </p>

                  {filteredReconEntries.length > 0 && (
                    <div className="overflow-x-auto max-h-[260px] overflow-y-auto border rounded-md">
                      <table className="w-full text-xs">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="text-left px-2 py-1.5 font-medium">Task</th>
                            <th className="text-left px-2 py-1.5 font-medium">Título</th>
                            <th className="text-left px-2 py-1.5 font-medium">Dono</th>
                            <th className="text-left px-2 py-1.5 font-medium">Estado</th>
                            <th className="text-right px-2 py-1.5 font-medium">Vdesk</th>
                            <th className="text-right px-2 py-1.5 font-medium">Devops</th>
                            <th className="text-right px-2 py-1.5 font-medium">Gap</th>
                            <th className="text-center px-2 py-1.5 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {filteredReconEntries.slice(0, 100).map(([taskId, entry]) => {
                            const gapMin = entry.vdeskMin - entry.devopsMin;
                            const isBoSemApontamento = entry.status === 'no_log' && !isFabricaTodo(entry.state);
                            const statusColors: Record<string, string> = {
                              match: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
                              only_vdesk: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
                              only_devops: 'bg-blue-500/10 text-blue-700 border-blue-500/30',
                              divergent: 'bg-red-500/10 text-red-700 border-red-500/30',
                              no_log: 'bg-slate-400/10 text-slate-600 border-slate-400/30',
                            };
                            const statusLabels: Record<string, string> = {
                              match: 'OK', only_vdesk: 'Vdesk', only_devops: 'Devops', divergent: 'Divergente', no_log: 'Sem apont.',
                            };
                            const h = (m: number) => m >= 60 ? `${Math.floor(m/60)}h${m%60>0?` ${m%60}m`:''}` : `${m}m`;
                            return (
                              <tr key={taskId} className="hover:bg-muted/30">
                                <td className="px-2 py-1 font-mono">
                                  {entry.url ? (
                                    <a
                                      href={entry.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-primary hover:underline"
                                    >
                                      #{taskId}
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  ) : (
                                    <>#{taskId}</>
                                  )}
                                </td>
                                <td className="px-2 py-1 max-w-[180px] truncate text-muted-foreground" title={entry.title}>{entry.title}</td>
                                <td className="px-2 py-1 max-w-[110px] truncate" title={entry.assignedTo ?? ''}>{entry.assignedTo ?? <span className="text-muted-foreground">—</span>}</td>
                                <td className="px-2 py-1">{entry.state ? <Badge variant="outline" className="text-[10px]">{entry.state}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                                <td className="px-2 py-1 text-right font-mono">{entry.vdeskMin > 0 ? h(entry.vdeskMin) : '—'}</td>
                                <td className="px-2 py-1 text-right font-mono">{entry.devopsMin > 0 ? h(entry.devopsMin) : '—'}</td>
                                <td className={`px-2 py-1 text-right font-mono ${gapMin > 30 ? 'text-red-600' : gapMin < -30 ? 'text-blue-600' : 'text-muted-foreground'}`}>
                                  {gapMin === 0 ? <Minus className="h-3 w-3 inline" /> : (gapMin > 0 ? '+' : '') + h(Math.abs(gapMin))}
                                </td>
                                <td className="px-2 py-1 text-center">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] ${isBoSemApontamento ? 'bg-red-500/10 text-red-700 border-red-500/30' : (statusColors[entry.status] ?? '')}`}
                                  >
                                    {isBoSemApontamento ? 'BO sem apont.' : (statusLabels[entry.status] ?? entry.status)}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {filteredReconEntries.length > 100 && (
                        <p className="text-center text-xs text-muted-foreground py-2">
                          +{filteredReconEntries.length - 100} tarefas — filtre por sprint ou status para refinar
                        </p>
                      )}
                    </div>
                  )}
                  {filteredReconEntries.length === 0 && !reconLoading && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      {reconFilter === 'all' ? 'Sem tarefas para o período seleccionado.' : 'Nenhuma tarefa neste status.'}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Horas por Colaborador (chart compacto) */}
              <Card className="animate-fade-in border-l-4 border-l-primary lg:col-span-2" style={{ animationDelay: '700ms' }}>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Horas por Colaborador
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] mt-1">
                    <label className="inline-flex items-center gap-1 cursor-pointer select-none">
                      <input type="checkbox" checked={showVdesk} onChange={(e) => setShowVdesk(e.target.checked)} className="h-3 w-3 accent-emerald-500" />
                      <span className="h-2 w-2 rounded-sm bg-emerald-500 inline-block" />
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">Vdesk</span>
                    </label>
                    <label className="inline-flex items-center gap-1 cursor-pointer select-none">
                      <input type="checkbox" checked={showDevops} onChange={(e) => setShowDevops(e.target.checked)} className="h-3 w-3 accent-blue-500" />
                      <span className="h-2 w-2 rounded-sm bg-blue-400 inline-block" />
                      <span className="text-blue-600 dark:text-blue-400 font-medium">Devops</span>
                    </label>
                  </div>
                </CardHeader>
                <CardContent>
                  {mergedCollaboradores.length === 0 || (!showVdesk && !showDevops) ? (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      {(!showVdesk && !showDevops) ? 'Selecione ao menos uma fonte.' : 'Sem dados.'}
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.min(320, Math.max(180, mergedCollaboradores.slice(0, 8).length * 32))}>
                      <BarChart data={mergedCollaboradores.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 0 }} style={{ cursor: 'pointer' }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" fontSize={10} stroke="hsl(var(--muted-foreground))" unit="h" />
                        <YAxis type="category" dataKey="name" fontSize={10} stroke="hsl(var(--muted-foreground))" width={110} />
                        <RechartsTooltip
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '11px' }}
                          formatter={(value: number, name: string) => [`${value}h`, name === 'vdesk' ? 'Vdesk' : 'Devops']}
                        />
                        {showVdesk && (
                          <Bar
                            dataKey="vdesk"
                            stackId="horas"
                            fill="hsl(142,71%,45%)"
                            radius={showDevops ? [0, 0, 0, 0] : [0, 4, 4, 0]}
                            onClick={(payload: unknown) => {
                              const data = payload as { name?: string };
                              if (!data?.name) return;
                              const taskIds = collaboratorTaskScopeMap.get(data.name) ? Array.from(collaboratorTaskScopeMap.get(data.name)!) : [];
                              setTimelogDrilldown((prev) => {
                                if (prev.type === 'collaborator' && prev.key === data.name) {
                                  return { type: 'none', key: null, taskIds: [], userCanonical: null };
                                }
                                return { type: 'collaborator', key: data.name, taskIds, userCanonical: data.name };
                              });
                              setReconFilter('all');
                            }}
                          />
                        )}
                        {showDevops && (
                          <Bar
                            dataKey="devops"
                            stackId="horas"
                            fill="hsl(210,90%,60%)"
                            radius={[0, 4, 4, 0]}
                            onClick={(payload: unknown) => {
                              const data = payload as { name?: string };
                              if (!data?.name) return;
                              const taskIds = collaboratorTaskScopeMap.get(data.name) ? Array.from(collaboratorTaskScopeMap.get(data.name)!) : [];
                              setTimelogDrilldown((prev) => {
                                if (prev.type === 'collaborator' && prev.key === data.name) {
                                  return { type: 'none', key: null, taskIds: [], userCanonical: null };
                                }
                                return { type: 'collaborator', key: data.name, taskIds, userCanonical: data.name };
                              });
                              setReconFilter('all');
                            }}
                          />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Nivelamento Horas Vdesk → Devops (admin OU owner do setor) ── */}
            {canManageTimelog && (              <Card className="border-orange-400/20 bg-orange-500/5">
                <CardHeader
                  className="pb-2 pt-4 cursor-pointer select-none"
                  onClick={() => setNivelamentoOpen(o => !o)}
                >
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <SendHorizonal className="h-4 w-4 text-orange-500" />
                    Nivelamento Horas Vdesk → Devops
                    <ChevronRight className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${nivelamentoOpen ? 'rotate-90' : ''}`} />
                  </CardTitle>
                </CardHeader>
                {nivelamentoOpen && (
                  <CardContent>
                    <PostarParaDevOps vdeskLogs={fab.scopedVdeskLogs} taskScopeIds={timelogScopeTaskIds} />
                  </CardContent>
                )}
              </Card>
            )}
          </TabsContent>

          {/* ═══════ TAB: Transbordo ═══════ */}
          <TabsContent value="transbordo" className="space-y-5 mt-0">
            <TransbordoTab
              items={sprintTransbordoItems}
              transbordoPct={sprintTransbordoPct}
              transbordoCount={sprintTransbordoCount}
              realOverflowItemCount={sprintRealOverflowItemCount}
              realOverflowCount={sprintRealOverflowCount}
              realOverflowPct={sprintRealOverflowPct}
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
            {collaboratorAwareHealthOverview && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <HeroKpiCard label="Total monitorados" value={collaboratorAwareHealthOverview.total} icon={ListTodo} />
                <HeroKpiCard label="Saudável" value={collaboratorAwareHealthOverview.verde} icon={HeartPulse} accent="bg-[hsl(142,71%,45%)]" />
                <HeroKpiCard label="Atenção" value={collaboratorAwareHealthOverview.amarelo} icon={AlertTriangle} accent="bg-[hsl(43,85%,46%)]" />
                <HeroKpiCard label="Crítica" value={collaboratorAwareHealthOverview.vermelho} icon={AlertTriangle} accent="bg-destructive" />
              </div>
            )}

            <Card className="p-3 border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p>
                  <span className="font-semibold text-foreground">O que é esta análise?</span>{' '}
                  O painel de gargalos mostra quanto tempo os itens permanecem em cada etapa da esteira (Backlog → Design → Fábrica → Qualidade → Deploy).
                  Valores altos de <strong>Média</strong> indicam lentidão no processo; <strong>Atraso</strong> alto aponta itens que ultrapassaram os limites aceitáveis (ex: Fábrica &gt;14d = atenção, &gt;21d = crítico).
                </p>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Resumo de Gargalos da Fábrica</h3>
                  <p className="text-xs text-muted-foreground">Duração por etapa da esteira de produção.</p>
                </div>
                <Badge variant="outline">{bottlenecks.bottlenecks.length} etapas</Badge>
              </div>
              <TooltipProvider>
                <div className="p-4 space-y-2">
                  {bottlenecks.bottlenecks.map((row) => (
                    <div key={`bn-${row.stage_key}`} className="grid grid-cols-1 sm:grid-cols-5 gap-2 rounded-md border border-border/60 p-2 text-xs">
                      <span className="font-medium text-foreground">{row.stage_label}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground cursor-help underline decoration-dotted underline-offset-2">Média: {row.avg_days_in_stage}d</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px]">
                          <p className="text-xs">Tempo médio (dias) que os itens permanecem nesta etapa. Valores altos indicam lentidão no processo.</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground cursor-help underline decoration-dotted underline-offset-2">Máx: {row.max_days_in_stage}d</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px]">
                          <p className="text-xs">Maior tempo (dias) que um item ficou nesta etapa. Outliers indicam itens travados.</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground cursor-help underline decoration-dotted underline-offset-2">Em etapa: {row.count_in_stage}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px]">
                          <p className="text-xs">Quantidade de itens atualmente nesta etapa. Volume alto pode indicar gargalo de capacidade.</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground cursor-help underline decoration-dotted underline-offset-2">Atraso: {row.count_overtime}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px]">
                          <p className="text-xs">Itens que ultrapassaram o limite de dias aceitável para esta etapa (ex: Fábrica &gt;14d = atenção, &gt;21d = crítico).</p>
                        </TooltipContent>
                      </Tooltip>
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
              </TooltipProvider>
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

          {/* ═══════ TAB: Sprint Board ═══════ */}
          <TabsContent value="sprint-board" className="space-y-4 mt-0">
            <SprintBoardTab
              allItems={sprintFilteredItems}
              sortedSprints={fab.sortedSprints}
              isLoading={fab.isLoading}
            />
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

          {/* ═══════ TAB: Retorno QA ═══════ */}
          <TabsContent value="qa-return" className="space-y-4 mt-0">
            <QaReturnTab items={qaReturnKpis.openItems} isLoading={qaReturnKpis.isLoading} />
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
