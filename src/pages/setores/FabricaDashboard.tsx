import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useFabricaKpis, FabricaItem, TimelogAggregation, KPI_DEFAULT_EXCLUDED_COLLABORATORS, getCollaboratorExclusionKeys, isCollaboratorExcluded, normalizeCollaboratorName, isFabricaInProgress, isFabricaCountableState } from '@/hooks/useFabricaKpis';
import { useTimelogUnificado } from '@/hooks/useTimelogUnificado';
import { useAuth } from '@/hooks/useAuth';
import { useHubIsAdmin } from '@/hooks/useHubPermissions';
import { useHubAreas } from '@/hooks/useHubAreas';
import { PostarParaDevOps } from '@/components/timelog/TimelogSharedComponents';
import { usePbiHealthBatch } from '@/hooks/usePbiHealthBatch';
import { usePbiBottlenecks } from '@/hooks/usePbiBottlenecks';
import { useFeaturePbiSummary } from '@/hooks/useFeaturePbiSummary';
import { useDevopsOperationalQueue } from '@/hooks/useDevopsOperationalQueue';
import { GerenciaTab } from '@/components/fabrica/GerenciaTab';
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
  TrendingUp, BarChart3, Zap, HeartPulse, Workflow, LayoutGrid, MoreHorizontal,
  GitMerge, Loader2, ExternalLink, CheckCircle2, Check, Minus, SendHorizonal,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import type { Integration } from '@/components/setores/SectorIntegrations';
import { extractSprintCodeFromPath, formatSprintIntervalLabel, getCurrentOfficialSprintCode, getOfficialSprintRange } from '@/lib/sprintCalendar';
import { CHART_COLORS, STATE_COLORS, TYPE_COLORS, TYPE_LABELS } from '@/lib/chartColors';

type FabKpiFilter = 'all' | 'in_progress' | 'todo' | 'done' | 'entregue' | 'aguardando_teste' | 'aguardando_deploy' | 'em_teste' | 'em_desenvolvimento' | 'new' | 'aviao' | 'sem_task';
type SemTaskContextFilter = 'all' | 'stc' | 'ctc';
type CollaboratorViewMode = 'tasks' | 'gestor';
type PrevistoFilter = 'previsto' | 'nao_previsto';
type NewEntryReadFilter = 'all' | 'unread' | 'read';

const normalizeState = (state: string | null | undefined): string => (state || '').trim().toLowerCase();
const FABRICA_TODO_STATES = new Set(['to do', 'new']);
const DONE_STATES = new Set(['done', 'closed', 'resolved']);
const ENTREGUE_STATES = new Set(['aguardando teste', 'em teste', 'aguardando deploy']);
const RETORNO_QA_REGEX = /retorno\s*(de)?\s*qa/i;

function isFabricaTodo(state: string | null | undefined): boolean {
  return FABRICA_TODO_STATES.has(normalizeState(state));
}

function isDone(state: string | null | undefined): boolean {
  return DONE_STATES.has(normalizeState(state));
}

function isRemoved(state: string | null | undefined): boolean {
  return normalizeState(state) === 'removed';
}

function isEntregueState(state: string | null | undefined): boolean {
  return ENTREGUE_STATES.has(normalizeState(state));
}

const integrations: Integration[] = [
  { name: 'Azure DevOps API', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Work Items, Sprints' },
  { name: 'DevOps TimeLog', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Horas alocadas (TechsBCN)' },
];

const typeColors = TYPE_COLORS;
const typeLabels = TYPE_LABELS;
const stateColors: Record<string, string> = {
  ...STATE_COLORS,
  'In Progress': 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  'Active': 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  'Em desenvolvimento': 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  'Done': 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  'Closed': 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  'Resolved': 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
};

const AVIAO_REGEX = /(^|;)\s*AVIAO\s*(;|$)/i;

function getItemTags(item: FabricaItem, tagsByWorkItemId: Record<number, string>): string {
  if (item.id && tagsByWorkItemId[item.id]) return tagsByWorkItemId[item.id];
  return item.tags || '';
}

function isNaoPrevistoManagerItem(item: FabricaItem, tagsByWorkItemId: Record<number, string>): boolean {
  if (!isManagerLikeItem(item)) return false;
  if (item.work_item_type === 'Bug') return true;
  const tags = getItemTags(item, tagsByWorkItemId);
  return RETORNO_QA_REGEX.test(tags) || AVIAO_REGEX.test(tags);
}

function isTaskOnlyItem(item: FabricaItem): boolean {
  return item.work_item_type === 'Task';
}

function isManagerLikeItem(item: FabricaItem): boolean {
  return item.work_item_type === 'Product Backlog Item' || item.work_item_type === 'User Story' || item.work_item_type === 'Bug';
}

function matchesCollaboratorSelection(item: FabricaItem, collaboratorName: string | null): boolean {
  if (!collaboratorName) return true;

  const display = item.assigned_to_display || '';
  const shortName = display.split(' ').slice(0, 2).join(' ');

  return shortName === collaboratorName || display === collaboratorName;
}

function formatHoursFromMinutes(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

function formatMinutesAsHoursLabel(minutes: number): string {
  const hours = formatHoursFromMinutes(minutes);
  return `${hours.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}h`;
}

function formatShortDateTime(value: Date): string {
  return `${value.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function DraggableScrollArea({ className, children }: { className?: string; children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ isDragging: boolean; startX: number; startScrollLeft: number }>({
    isDragging: false,
    startX: 0,
    startScrollLeft: 0,
  });

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;

    dragStateRef.current = {
      isDragging: true,
      startX: event.clientX,
      startScrollLeft: el.scrollLeft,
    };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    const drag = dragStateRef.current;
    if (!el || !drag.isDragging) return;

    const deltaX = event.clientX - drag.startX;
    el.scrollLeft = drag.startScrollLeft - deltaX;
  };

  const stopDragging = () => {
    dragStateRef.current.isDragging = false;
  };

  return (
    <div
      ref={containerRef}
      className={`overflow-auto resize-x cursor-grab active:cursor-grabbing ${className || ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopDragging}
      onMouseLeave={stopDragging}
    >
      {children}
    </div>
  );
}

function getFabFilterLabel(f: FabKpiFilter) {
  switch (f) {
    case 'all': return 'Todos';
    case 'in_progress': return 'Em Progresso';
    case 'todo': return 'A Fazer';
    case 'done': return 'Done';
    case 'entregue': return 'Entregue';
    case 'aguardando_teste': return 'Aguardando Teste';
    case 'aguardando_deploy': return 'Aguardando Deploy';
    case 'em_teste': return 'Em Teste';
    case 'em_desenvolvimento': return 'Em Desenvolvimento';
    case 'new': return 'New';
    case 'aviao': return 'Avião';
    case 'sem_task': return 'US/BUG sem Task';
  }
}

function SprintStatusCard({ total, inProgress, toDo, done, entregue, semTask, semTaskNeverChild, semTaskChildDone, semTaskContextFilter, isLoading, fabKpiFilter, toggleFab, toggleSemTaskContext, sprintEndDate }: {
  total: number; inProgress: number; toDo: number; done: number; entregue: number; semTask: number;
  semTaskNeverChild: number; semTaskChildDone: number; semTaskContextFilter: SemTaskContextFilter;
  isLoading: boolean; fabKpiFilter: FabKpiFilter;
  toggleFab: (f: FabKpiFilter) => void;
  toggleSemTaskContext: (context: Exclude<SemTaskContextFilter, 'all'>) => void;
  sprintEndDate?: Date | null;
}) {
  const concluidos = done + entregue;
  const completedPct = total > 0 ? Math.round((concluidos / total) * 100) : 0;
  const donePct = total > 0 ? (done / total) * 100 : 0;
  const entregPct = total > 0 ? (entregue / total) * 100 : 0;
  const inProgressPct = total > 0 ? (inProgress / total) * 100 : 0;
  const todoPct = total > 0 ? (toDo / total) * 100 : 0;
  const remainingItems = Math.max(total - concluidos, 0);
  const daysRemaining = (() => {
    if (!sprintEndDate) return null;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(sprintEndDate.getFullYear(), sprintEndDate.getMonth(), sprintEndDate.getDate());
    return Math.max(0, Math.ceil((endOfDay.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24)));
  })();
  const pacePerDay = daysRemaining != null && daysRemaining > 0 ? remainingItems / daysRemaining : remainingItems;
  const inverseTone = (() => {
    if (remainingItems === 0) return 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20';
    if (daysRemaining != null && daysRemaining <= 2 && remainingItems > 0) return 'text-destructive bg-destructive/10 border-destructive/20';
    if (daysRemaining != null && remainingItems > daysRemaining * 2) return 'text-amber-600 bg-amber-500/10 border-amber-500/20';
    return 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20';
  })();

  const subItems: { key: FabKpiFilter; label: string; value: number; valueColor: string; dotColor: string }[] = [
    { key: 'in_progress', label: 'Em Desenv.', value: inProgress, valueColor: 'text-orange-500/85 dark:text-orange-300/90', dotColor: 'bg-orange-400/90' },
    { key: 'todo',        label: 'To Do',      value: toDo,       valueColor: 'text-red-500/85 dark:text-red-300/90',       dotColor: 'bg-red-400/90' },
    { key: 'entregue',    label: 'Entregue',   value: entregue,   valueColor: 'text-blue-500/85 dark:text-blue-300/90',     dotColor: 'bg-blue-400/90' },
    { key: 'done',        label: 'Done',       value: done,       valueColor: 'text-[hsl(var(--success)/0.85)]',            dotColor: 'bg-[hsl(var(--success)/0.85)]' },
    { key: 'sem_task',    label: 'Pbi s/ Task',value: semTask,    valueColor: semTask > 0 ? 'text-destructive/85' : 'text-muted-foreground', dotColor: semTask > 0 ? 'bg-destructive/85' : 'bg-border' },
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
          {entregue > 0 && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">Done + Entregue</p>
          )}
        </div>
      </div>

      {/* Barra de progresso segmentada */}
      <div className="relative h-2 rounded-full bg-muted overflow-hidden mb-5">
        <div className="absolute left-0 top-0 h-full bg-[hsl(var(--success)/0.85)] transition-all duration-500" style={{ width: `${donePct}%` }} />
        <div className="absolute top-0 h-full bg-blue-400/90 transition-all duration-500" style={{ left: `${donePct}%`, width: `${entregPct}%` }} />
        <div className="absolute top-0 h-full bg-orange-400/90 transition-all duration-500" style={{ left: `${donePct + entregPct}%`, width: `${inProgressPct}%` }} />
        <div className="absolute top-0 h-full bg-red-400/90 transition-all duration-500" style={{ left: `${donePct + entregPct + inProgressPct}%`, width: `${todoPct}%` }} />
      </div>

      <div className={`rounded-md border px-2.5 pt-1.5 pb-1 mb-4 ${inverseTone}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Acomp. Sprint</span>
            <span className="text-[11px] text-muted-foreground truncate">
              {daysRemaining == null
                ? '—'
                : remainingItems === 0
                  ? 'Tudo concluído'
                  : `${remainingItems} restantes · ${sprintEndDate?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`}
            </span>
          </div>
          <span className="text-[11px] font-semibold whitespace-nowrap">
            {daysRemaining == null ? '—' : `${daysRemaining}d · ${pacePerDay.toFixed(1)}/d`}
          </span>
        </div>
        {daysRemaining != null && (
          <div className="mt-1 h-1 rounded-full bg-background/70 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${remainingItems === 0 ? 'bg-emerald-500' : daysRemaining <= 2 ? 'bg-destructive' : 'bg-amber-500'}`}
              style={{ width: `${total > 0 ? Math.min(100, (remainingItems / total) * 100) : 0}%` }}
            />
          </div>
        )}
      </div>

      {/* Sub-items clicáveis */}
      <div className="grid grid-cols-5 gap-1.5 pt-4 border-t border-border">
        {subItems.map(item => {
          const isActive = fabKpiFilter === item.key;
          return (
            <button
              key={item.key}
              onClick={() => toggleFab(item.key)}
              className={`relative min-w-0 text-center p-3 ${item.key === 'sem_task' ? 'pb-6' : ''} rounded-xl border border-border/70 bg-background/85 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isActive ? 'bg-muted/80 border-primary/40 shadow-md' : ''}`}
            >
              <div className="flex items-center justify-center gap-1.5 mb-1.5 min-h-[24px]">
                <div className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.dotColor}`} />
                <span className="min-w-0 whitespace-normal break-words text-[11px] font-medium text-muted-foreground leading-tight text-center">{item.label}</span>
              </div>
              <span className={`text-xl font-bold ${isActive ? 'text-foreground' : item.valueColor}`}>{item.value}</span>
              {item.key === 'sem_task' && item.value > 0 && (
                <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 opacity-70">
                  <button
                    type="button"
                    title="Sem task child"
                    aria-label="Sem task child"
                    onClick={(event) => { event.stopPropagation(); toggleSemTaskContext('stc'); }}
                    className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[10px] leading-none transition-colors ${semTaskContextFilter === 'stc' ? 'text-red-500/75 dark:text-red-300/75' : 'text-red-400/45 dark:text-red-300/45 hover:text-red-400/65 dark:hover:text-red-300/65'}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    title="Com task child em done"
                    aria-label="Com task child em done"
                    onClick={(event) => { event.stopPropagation(); toggleSemTaskContext('ctc'); }}
                    className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[10px] leading-none transition-colors ${semTaskContextFilter === 'ctc' ? 'text-red-500/75 dark:text-red-300/75' : 'text-red-400/45 dark:text-red-300/45 hover:text-red-400/65 dark:hover:text-red-300/65'}`}
                  >
                    <Check className="h-2.5 w-2.5" />
                  </button>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function HoursRankingCard({ title, icon: Icon, data, isLoading, emptyMessage, delay = 0, onItemClick, activeItemName, summaryBadge }: {
  title: string; icon: React.ComponentType<{ className?: string }>;
  data: TimelogAggregation[]; isLoading: boolean; emptyMessage: string; delay?: number;
  onItemClick?: (item: TimelogAggregation) => void;
  activeItemName?: string | null;
  summaryBadge?: string;
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
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />{title}
          </CardTitle>
          {summaryBadge ? (
            <Badge variant="outline" className="text-[10px] whitespace-nowrap">{summaryBadge}</Badge>
          ) : null}
        </div>
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
  const [semTaskContextFilter, setSemTaskContextFilter] = useState<SemTaskContextFilter>('all');
  const [expandedPbis, setExpandedPbis] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [searchAutoSwitched, setSearchAutoSwitched] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');
  const [collaboratorViewMode, setCollaboratorViewMode] = useState<CollaboratorViewMode>('gestor');
  const [previstoFilter, setPrevistoFilter] = useState<PrevistoFilter | null>(null);
  const [collaboratorFilter, setCollaboratorFilter] = useState<string | null>(null);
  const [collaboratorSearch, setCollaboratorSearch] = useState('');
  const [boardSortField, setBoardSortField] = useState<'transbordo' | null>(null);
  const [boardSortDir, setBoardSortDir] = useState<'asc' | 'desc'>('desc');
  const [newEntryReadFilter, setNewEntryReadFilter] = useState<NewEntryReadFilter>('all');
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());
  const [newEntriesReadIds, setNewEntriesReadIds] = useState<Set<number>>(new Set());
  const [isLoadingReadState, setIsLoadingReadState] = useState(true);

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
  const timelogWorkItemIds = useMemo(() => {
    const managerIds = new Set(
      fab.items
        .filter((item) => isManagerLikeItem(item) && item.id != null)
        .map((item) => item.id as number)
    );

    const taskIds = fab.items
      .filter((item) => item.work_item_type === 'Task' && item.id != null && item.parent_id != null && managerIds.has(item.parent_id))
      .map((item) => item.id as number);

    return Array.from(new Set<number>([...managerIds, ...taskIds]));
  }, [fab.items]);

  const timelogTaskScopeSet = useMemo(() => {
    const managerIds = new Set(
      fab.items
        .filter((item) => isManagerLikeItem(item) && item.id != null)
        .map((item) => item.id as number)
    );

    const source = fab.items.filter((item) => item.work_item_type === 'Task' && item.id != null);
    return new Set(
      source
        .filter((item) => item.parent_id != null && managerIds.has(item.parent_id))
        .map((item) => item.id as number)
    );
  }, [fab.items]);

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
    workItemIds: timelogWorkItemIds,
  }), [effectiveRange, timelogWorkItemIds]);

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

    const managerScopedRows = rows.filter((row) => timelogTaskScopeSet.has(row.task_id));

    if (!drilldownTaskIdSet) return managerScopedRows;
    return managerScopedRows.filter((row) => drilldownTaskIdSet.has(row.task_id));
  }, [reconRows, drilldownTaskIdSet, timelogDrilldown.type, timelogDrilldown.userCanonical, timelogTaskScopeSet]);

  const reconTaskMap = useMemo(() => {
    const m = new Map<number, ReconEntry>();
    // 1) Seed com as tasks do setor dentro do recorte atual.
    for (const it of fab.allSprintItems) {
      if (!it.id) continue;
      if (it.work_item_type && it.work_item_type !== 'Task') continue;
      if (isRemoved(it.state)) continue;
      if (!timelogTaskScopeSet.has(it.id)) continue;
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
      if (isRemoved(r.work_item_state)) continue;
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
  }, [scopedReconRows, fab.allSprintItems, drilldownTaskIdSet, timelogTaskScopeSet]);

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

  // Load read entries from Supabase on mount
  useEffect(() => {
    const loadReadEntries = async () => {
      try {
        const { data, error } = await supabase.from('fabrica_read_entries').select('work_item_id').eq('is_read', true);
        if (error) {
          console.error('Failed to load read entries:', error);
          return;
        }
        const ids = (data || []).map(row => row.work_item_id);
        setNewEntriesReadIds(new Set(ids));
      } catch (err) {
        console.error('Error loading read entries:', err);
      } finally {
        setIsLoadingReadState(false);
      }
    };
    loadReadEntries();
  }, []);

  useEffect(() => {
    if (fabKpiFilter !== 'sem_task' && semTaskContextFilter !== 'all') {
      setSemTaskContextFilter('all');
    }
  }, [fabKpiFilter, semTaskContextFilter]);

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

  const selectedCollaboratorsCount = useMemo(
    () => fab.allCollaborators.filter((name) => !isCollaboratorExcluded(name, excludedCollabs)).length,
    [fab.allCollaborators, excludedCollabs]
  );
  const isCollaboratorFilterActive = selectedCollaboratorsCount < fab.allCollaborators.length;

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

  const markLeadCollaborators = useCallback(() => {
    const leadTokens = [
      'alexandre diniz',
      'klelbio',
      'jackson s',
      'fabio h',
    ];

    const isLead = (name: string): boolean => {
      const n = normalizeCollaboratorName(name);
      return leadTokens.some(lead => n === lead || n.startsWith(lead + ' ') || n.includes(lead));
    };

    setExcludedCollabs(() => {
      const next = new Set<string>();

      for (const name of fab.allCollaborators) {
        if (isLead(name)) continue;

        for (const key of getCollaboratorExclusionKeys(name)) {
          next.add(key);
        }
      }

      return next;
    });
  }, [fab.allCollaborators]);

  const unmarkAllCollaborators = useCallback(() => {
    const allExcluded = new Set<string>();
    for (const name of fab.allCollaborators) {
      for (const key of getCollaboratorExclusionKeys(name)) {
        allExcluded.add(key);
      }
    }
    setExcludedCollabs(allExcluded);
  }, [fab.allCollaborators]);

  const togglePrevistoFilter = (value: PrevistoFilter) => {
    setPrevistoFilter(prev => prev === value ? null : value);
    setPage(0);
  };

  const filteredCollaborators = useMemo(() => {
    const q = collaboratorSearch.trim().toLowerCase();
    if (!q) return fab.allCollaborators;
    return fab.allCollaborators.filter((name) => name.toLowerCase().includes(q));
  }, [fab.allCollaborators, collaboratorSearch]);

  const sprintFilteredItems = useMemo(() => {
    if (!isCollaboratorFilterActive) return fab.items;
    // When collaborator filter is active, keep only assigned rows to avoid counting unassigned backlog noise.
    return fab.items.filter((item) => !!item.assigned_to_display);
  }, [fab.items, isCollaboratorFilterActive]);

  const collaboratorScopedItems = useMemo(() => {
    if (!collaboratorFilter) return sprintFilteredItems;

    const matchedParentIds = new Set<number>();

    for (const item of sprintFilteredItems) {
      if (!matchesCollaboratorSelection(item, collaboratorFilter)) continue;

      if (isManagerLikeItem(item) && item.id != null) {
        matchedParentIds.add(item.id);
      }

      if (isTaskOnlyItem(item) && item.parent_id != null) {
        matchedParentIds.add(item.parent_id);
      }
    }

    return sprintFilteredItems.filter((item) => {
      if (matchesCollaboratorSelection(item, collaboratorFilter)) return true;
      return isManagerLikeItem(item) && item.id != null && matchedParentIds.has(item.id);
    });
  }, [sprintFilteredItems, collaboratorFilter]);

  const sprintKpiItems = useMemo(
    () => collaboratorScopedItems.filter((item) => item.count_in_kpi !== false && isManagerLikeItem(item) && isFabricaCountableState(item.state)),
    [collaboratorScopedItems]
  );

  const sprintTotal = sprintKpiItems.length;
  const sprintEntregue = sprintKpiItems.filter(i => isEntregueState(i.state)).length;
  const sprintInProgress = sprintKpiItems.filter(i => isFabricaInProgress(i.state) && !isEntregueState(i.state)).length;
  const sprintToDo = sprintKpiItems.filter(i => isFabricaTodo(i.state)).length;
  const sprintDone = sprintKpiItems.filter(i => isDone(i.state)).length;
  const sprintTaskParentScope = useMemo(() => {
    const itemById = new Map<number, {
      id: number;
      parent_id: number | null;
      state: string | null;
      work_item_type: string | null;
    }>();
    for (const item of fab.allWorkItems || []) {
      if (item.id != null) {
        itemById.set(item.id, {
          id: item.id,
          parent_id: item.parent_id,
          state: item.state,
          work_item_type: item.work_item_type,
        });
      }
    }

    const resolveManagerAncestorId = (startParentId: number): number | null => {
      let currentId: number | null = startParentId;
      const visited = new Set<number>();

      while (currentId != null && !visited.has(currentId)) {
        visited.add(currentId);
        const current = itemById.get(currentId);

        // Se não achar o nó, mantém o vínculo no melhor nível conhecido.
        if (!current) return currentId;
        if (
          current.work_item_type === 'Product Backlog Item' ||
          current.work_item_type === 'User Story' ||
          current.work_item_type === 'Bug'
        ) {
          return currentId;
        }

        currentId = current.parent_id ?? null;
      }

      return null;
    };

    const managerParentIdsWithAnyTask = new Set<number>();
    const managerParentIdsWithOpenTask = new Set<number>();
    for (const item of fab.allWorkItems || []) {
      if (item.work_item_type !== 'Task' || item.parent_id == null || isRemoved(item.state)) continue;

      const managerAncestorId = resolveManagerAncestorId(item.parent_id);
      if (managerAncestorId != null) {
        managerParentIdsWithAnyTask.add(managerAncestorId);
        if (!isDone(item.state)) {
          managerParentIdsWithOpenTask.add(managerAncestorId);
        }
      }
    }

    return {
      managerParentIdsWithAnyTask,
      managerParentIdsWithOpenTask,
    };
  }, [fab.allWorkItems]);

  const sprintPendingManagerItems = useMemo(
    () => collaboratorScopedItems.filter((item) =>
      item.count_in_kpi !== false &&
      isManagerLikeItem(item) &&
      (isFabricaTodo(item.state) || (isFabricaInProgress(item.state) && !isEntregueState(item.state)))
    ),
    [collaboratorScopedItems]
  );

  const sprintPbisSemTaskNeverChildCount = useMemo(
    () => sprintPendingManagerItems.filter((i) => i.id != null && !sprintTaskParentScope.managerParentIdsWithAnyTask.has(i.id)).length,
    [sprintPendingManagerItems, sprintTaskParentScope]
  );

  const sprintPbisSemTaskChildDoneCount = useMemo(
    () => sprintPendingManagerItems.filter((i) => i.id != null && sprintTaskParentScope.managerParentIdsWithAnyTask.has(i.id) && !sprintTaskParentScope.managerParentIdsWithOpenTask.has(i.id)).length,
    [sprintPendingManagerItems, sprintTaskParentScope]
  );

  const sprintManagerItems = useMemo(
    () => collaboratorScopedItems.filter((item) => isManagerLikeItem(item)),
    [collaboratorScopedItems]
  );

  // Itens de gestor (PBI/BUG) sem Task vinculada (anomalia/BO)
  const sprintPbisSemTask = useMemo(() => {
    return sprintPendingManagerItems.filter((i) => {
      if (!isManagerLikeItem(i) || i.id == null) return false;
      if (isDone(i.state)) return false;
      // Cenários gerenciais de desvio:
      // 1) PBI sem nenhuma task filha
      // 2) PBI ativa com tasks filhas, porém todas já encerradas
      if (!sprintTaskParentScope.managerParentIdsWithAnyTask.has(i.id)) return true;
      return !sprintTaskParentScope.managerParentIdsWithOpenTask.has(i.id);
    });
  }, [sprintPendingManagerItems, sprintTaskParentScope]);
  const sprintPbisSemTaskCount = sprintPbisSemTask.length;

  const sprintTransbordoItems = useMemo(() => {
    if (sprintFilter === 'all') return fab.transbordoItems;
    return fab.transbordoItems.filter(i => i.iteration_path === sprintFilter || i.sprintsOverflowed.includes(sprintFilter));
  }, [fab.transbordoItems, sprintFilter]);

  const scopedManagerIds = useMemo(
    () => new Set(collaboratorScopedItems.filter((item) => isManagerLikeItem(item) && item.id != null).map((item) => item.id as number)),
    [collaboratorScopedItems]
  );

  const scopedTransbordoItems = useMemo(
    () => sprintTransbordoItems.filter((item) => item.id != null && scopedManagerIds.has(item.id)),
    [sprintTransbordoItems, scopedManagerIds]
  );

  const sprintTransbordoCount = scopedTransbordoItems.length;
  const sprintTransbordoTotal = collaboratorScopedItems.filter(
    i => i.work_item_type === 'Product Backlog Item' || i.work_item_type === 'User Story'
  ).length;
  const sprintTransbordoPct = sprintTransbordoTotal > 0
    ? Math.round((sprintTransbordoCount / sprintTransbordoTotal) * 100)
    : 0;
  const sprintRealOverflowItemCount = scopedTransbordoItems.filter((item) => item.realOverflowCount > 0).length;
  const sprintRealOverflowCount = scopedTransbordoItems.reduce((sum, item) => sum + item.realOverflowCount, 0);
  const sprintRealOverflowPct = sprintTransbordoTotal > 0
    ? Math.round((sprintRealOverflowItemCount / sprintTransbordoTotal) * 100)
    : 0;

  const pbiHealthIds = useMemo(
    () => collaboratorScopedItems
      .filter((i) => i.id && ['Product Backlog Item', 'User Story', 'Bug'].includes(i.work_item_type || ''))
      .map((i) => i.id as number),
    [collaboratorScopedItems]
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
    let items = collaboratorScopedItems;
    const filterByState = (states: string[]) => {
      const managerMatches = collaboratorScopedItems.filter(
        (i) => isManagerLikeItem(i) && states.includes((i.state || '').trim())
      );
      const managerIds = new Set(managerMatches.map((i) => i.id).filter((id): id is number => id != null));

      return collaboratorScopedItems.filter((i) => {
        if (isManagerLikeItem(i) && i.id != null) return managerIds.has(i.id);
        if (isTaskOnlyItem(i) && i.parent_id != null) return managerIds.has(i.parent_id);
        return false;
      });
    };

    switch (fabKpiFilter) {
      case 'in_progress': items = items.filter(i => isFabricaInProgress(i.state)); break;
      case 'todo': items = items.filter(i => isFabricaTodo(i.state)); break;
      case 'done': items = items.filter(i => isDone(i.state)); break;
      case 'entregue': items = filterByState(['Aguardando Teste', 'Em Teste', 'Aguardando Deploy']); break;
      case 'aguardando_teste': items = filterByState(['Aguardando Teste']); break;
      case 'aguardando_deploy': items = filterByState(['Aguardando Deploy']); break;
      case 'em_teste': items = filterByState(['Em Teste']); break;
      case 'em_desenvolvimento': items = filterByState(['Em desenvolvimento', 'In Progress', 'Active']); break;
      case 'new': items = filterByState(['New']); break;
      case 'aviao': items = items.filter(i => {
        if (!i.id) return false;
        if (!isManagerLikeItem(i)) return false;
        const tags = getItemTags(i, fab.tagsByWorkItemId);
        return AVIAO_REGEX.test(tags);
      }); break;
      case 'sem_task': {
        const pendingManagerIds = new Set(
          collaboratorScopedItems
            .filter((i) =>
              i.count_in_kpi !== false &&
              isManagerLikeItem(i) &&
              (isFabricaTodo(i.state) || (isFabricaInProgress(i.state) && !isEntregueState(i.state)))
            )
            .map((i) => i.id)
            .filter((id): id is number => id != null)
        );

        items = items.filter((i) => {
          if (!isManagerLikeItem(i) || i.id == null || !pendingManagerIds.has(i.id)) return false;

          const isStc = !sprintTaskParentScope.managerParentIdsWithAnyTask.has(i.id);
          const isCtc = sprintTaskParentScope.managerParentIdsWithAnyTask.has(i.id) && !sprintTaskParentScope.managerParentIdsWithOpenTask.has(i.id);

          if (semTaskContextFilter === 'stc') return isStc;
          if (semTaskContextFilter === 'ctc') return isCtc;
          return isStc || isCtc;
        });
        break;
      }
    }
    if (previstoFilter) {
      const managerMatchIds = new Set(
        collaboratorScopedItems
          .filter((i) => isManagerLikeItem(i) && i.id != null)
          .filter((i) => {
            const naoPrevisto = isNaoPrevistoManagerItem(i, fab.tagsByWorkItemId);
            return previstoFilter === 'nao_previsto' ? naoPrevisto : !naoPrevisto;
          })
          .map((i) => i.id as number)
      );

      items = items.filter((i) => {
        if (isManagerLikeItem(i) && i.id != null) return managerMatchIds.has(i.id);
        if (isTaskOnlyItem(i) && i.parent_id != null) return managerMatchIds.has(i.parent_id);
        return false;
      });
    }
    return items;
  }, [collaboratorScopedItems, fabKpiFilter, fab.tagsByWorkItemId, previstoFilter, sprintTaskParentScope, semTaskContextFilter]);

  const itemsById = useMemo(() => {
    const map = new Map<number, FabricaItem>();
    for (const item of collaboratorScopedItems) {
      if (item.id != null) map.set(item.id, item);
    }
    return map;
  }, [collaboratorScopedItems]);

  const sprintStartForNewEntries = useMemo(() => {
    if (selectedSprintCodes.length !== 1) return null;
    const range = getOfficialSprintRange(selectedSprintCodes[0]);
    return range?.from ?? effectiveRange?.from ?? null;
  }, [selectedSprintCodes, effectiveRange]);

  const newEntrySignalsById = useMemo(() => {
    const map = new Map<number, { categoryLabel: string; createdAt: Date }>();
    if (!sprintStartForNewEntries) return map;

    for (const item of filteredFabItems) {
      if (item.id == null || !item.created_date) continue;
      const createdAt = new Date(item.created_date);
      if (Number.isNaN(createdAt.getTime()) || createdAt < sprintStartForNewEntries) continue;

      const baseItem = item.work_item_type === 'Task' && item.parent_id != null
        ? (itemsById.get(item.parent_id) ?? item)
        : item;
      const tags = getItemTags(baseItem, fab.tagsByWorkItemId);
      const isRetornoQa = RETORNO_QA_REGEX.test(tags);
      const isAviao = AVIAO_REGEX.test(tags);
      const isNaoPrevisto = baseItem.work_item_type === 'Bug' || isRetornoQa || isAviao;

      let categoryLabel = 'Novo na sprint';
      if (isRetornoQa) categoryLabel = 'Retorno QA';
      else if (isAviao) categoryLabel = 'Avião';
      else if (isNaoPrevisto) categoryLabel = 'Não previsto';

      map.set(item.id, { categoryLabel, createdAt });
    }
    return map;
  }, [filteredFabItems, sprintStartForNewEntries, itemsById, fab.tagsByWorkItemId]);

  const unreadNewEntryCount = useMemo(() => {
    let count = 0;
    for (const id of newEntrySignalsById.keys()) {
      if (!newEntriesReadIds.has(id)) count += 1;
    }
    return count;
  }, [newEntrySignalsById, newEntriesReadIds]);

  const collaboratorViewItems = useMemo(() => (
    collaboratorScopedItems.filter((item) => {
      if (collaboratorViewMode === 'tasks') {
        return isTaskOnlyItem(item) && !isRemoved(item.state);
      }
      return isManagerLikeItem(item);
    })
  ), [collaboratorScopedItems, collaboratorViewMode]);

  const colabChartData = useMemo(() => {
    const counts = collaboratorViewItems.reduce<Record<string, {
      todo: number;
      in_progress: number;
      entregue: number;
      done: number;
      total: number;
    }>>((acc, item) => {
      if (!item.assigned_to_display) return acc;

      const displayName = item.assigned_to_display || 'Nao atribuido';
      const shortName = displayName.split(' ').slice(0, 2).join(' ');

      const row = acc[shortName] || { todo: 0, in_progress: 0, entregue: 0, done: 0, total: 0 };
      if (isDone(item.state)) row.done += 1;
      else if (isEntregueState(item.state)) row.entregue += 1;
      else if (isFabricaTodo(item.state)) row.todo += 1;
      else row.in_progress += 1;
      row.total += 1;
      acc[shortName] = row;
      return acc;
    }, {});

    return Object.entries(counts)
      .sort(([, a], [, b]) => (b.in_progress + b.todo) - (a.in_progress + a.todo))
      .slice(0, 10)
      .map(([name, status]) => ({
        name,
        ...status,
        concluido_pct: status.total > 0 ? Math.round(((status.done + status.entregue) / status.total) * 100) : 0,
        done_pct: status.total > 0 ? Math.round((status.done / status.total) * 100) : 0,
        entregue_pct: status.total > 0 ? Math.round((status.entregue / status.total) * 100) : 0,
        in_progress_pct: status.total > 0 ? Math.round((status.in_progress / status.total) * 100) : 0,
        todo_pct: status.total > 0 ? Math.round((status.todo / status.total) * 100) : 0,
      }));
  }, [collaboratorViewItems]);

  const renderStatusPctLabel = (statusKey: 'todo' | 'in_progress' | 'entregue' | 'done') => (
    props: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      value?: number | string;
      payload?: Record<string, unknown>;
    }
  ) => {
    const { x = 0, y = 0, width = 0, height = 0, value, payload } = props;
    const pct = Number(value) || 0;
    const absoluteCount = Number(payload?.[statusKey]) || 0;

    // Renderiza o % apenas quando há área útil na barra para manter legibilidade.
    if (pct <= 0 || absoluteCount <= 0 || width < 34 || height < 14 || pct < 14) return null;

    return (
      <text
        x={x + width / 2}
        y={y + height / 2}
        fill="white"
        fontSize={10}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {`${pct}%`}
      </text>
    );
  };

  const collaboratorViewTotal = useMemo(
    () => collaboratorViewItems.length,
    [collaboratorViewItems]
  );

  const collaboratorStatusMix = useMemo(() => {
    const totals = collaboratorViewItems.reduce(
      (acc, item) => {
        if (isDone(item.state)) acc.done += 1;
        else if (isEntregueState(item.state)) acc.entregue += 1;
        else if (isFabricaTodo(item.state)) acc.todo += 1;
        else acc.in_progress += 1;
        return acc;
      },
      { todo: 0, in_progress: 0, entregue: 0, done: 0 }
    );

    const total = collaboratorViewItems.length;
    return {
      ...totals,
      total,
      todoPct: total > 0 ? Math.round((totals.todo / total) * 100) : 0,
      inProgressPct: total > 0 ? Math.round((totals.in_progress / total) * 100) : 0,
      entreguePct: total > 0 ? Math.round((totals.entregue / total) * 100) : 0,
      donePct: total > 0 ? Math.round((totals.done / total) * 100) : 0,
    };
  }, [collaboratorViewItems]);

  const previstoNaoPrevisto = useMemo(() => {
    const managerItems = collaboratorScopedItems.filter((item) => isManagerLikeItem(item) && item.count_in_kpi !== false);
    let previsto = 0;
    let naoPrevisto = 0;
    for (const item of managerItems) {
      if (isNaoPrevistoManagerItem(item, fab.tagsByWorkItemId)) naoPrevisto += 1;
      else previsto += 1;
    }
    const total = previsto + naoPrevisto;
    return {
      previsto,
      naoPrevisto,
      total,
      previstoPct: total > 0 ? Math.round((previsto / total) * 100) : 0,
      naoPrevistoPct: total > 0 ? Math.round((naoPrevisto / total) * 100) : 0,
    };
  }, [collaboratorScopedItems, fab.tagsByWorkItemId]);

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

  const { boardParentRows, boardChildrenMap, boardOrphanRows } = useMemo(() => {
    if (newEntryReadFilter === 'all') {
      return { boardParentRows: parentRows, boardChildrenMap: childrenMap, boardOrphanRows: orphanRows };
    }

    const matchesReadFilter = (item: FabricaItem): boolean => {
      if (item.id == null) return false;
      if (!newEntrySignalsById.has(item.id)) return false;
      const isRead = newEntriesReadIds.has(item.id);
      return newEntryReadFilter === 'read' ? isRead : !isRead;
    };

    const filteredParents: FabricaItem[] = [];
    const filteredChildrenMap = new Map<number, FabricaItem[]>();

    for (const parent of parentRows) {
      const rawChildren = childrenMap.get(parent.id!) || [];
      const filteredChildren = rawChildren.filter(matchesReadFilter);
      if (matchesReadFilter(parent) || filteredChildren.length > 0) {
        filteredParents.push(parent);
        if (filteredChildren.length > 0) filteredChildrenMap.set(parent.id!, filteredChildren);
      }
    }

    const filteredOrphans = orphanRows.filter(matchesReadFilter);
    return {
      boardParentRows: filteredParents,
      boardChildrenMap: filteredChildrenMap,
      boardOrphanRows: filteredOrphans,
    };
  }, [parentRows, childrenMap, orphanRows, newEntryReadFilter, newEntrySignalsById, newEntriesReadIds]);

  const transbordoMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of fab.transbordoItems) {
      if (t.id != null) m.set(t.id, t.overflowCount);
    }
    return m;
  }, [fab.transbordoItems]);

  const allTopLevel = useMemo(() => {
    const items = [...boardParentRows, ...boardOrphanRows];
    if (boardSortField === 'transbordo') {
      items.sort((a, b) => {
        const ta = transbordoMap.get(a.id!) || 0;
        const tb = transbordoMap.get(b.id!) || 0;
        return boardSortDir === 'desc' ? tb - ta : ta - tb;
      });
    }
    return items;
  }, [boardParentRows, boardOrphanRows, boardSortField, boardSortDir, transbordoMap]);
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

  const toggleFab = (f: FabKpiFilter) => {
    setFabKpiFilter((prev) => {
      const next = prev === f ? 'all' : f;
      if (next !== 'sem_task') setSemTaskContextFilter('all');
      return next;
    });
    setPage(0);
  };

  const toggleSemTaskContext = (context: Exclude<SemTaskContextFilter, 'all'>) => {
    setFabKpiFilter('sem_task');
    setSemTaskContextFilter((prev) => prev === context ? 'all' : context);
    setPage(0);
  };

  const isBlockCollapsed = useCallback((blockKey: string) => collapsedBlocks.has(blockKey), [collapsedBlocks]);

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

  const activeTabLabel = useMemo(() => {
    switch (activeTab) {
      case 'overview': return 'Visão Geral';
      case 'timelog': return 'TimeLog';
      case 'backlog-priorizar': return 'Backlog Priorizar';
      case 'uxui-fila': return 'Fila UX-UI';
      case 'qa-return': return 'Retorno QA';
      case 'gerencia': return 'Gerencial';
      default: return activeTab;
    }
  }, [activeTab]);

  const exportFilterContext = useMemo(() => {
    const parts: string[] = [];
    const sprintPart = hasAllSprints
      ? 'Sprints: todas'
      : selectedSprintCodes.length > 0
        ? `Sprints: ${selectedSprintCodes.join(', ')}`
        : 'Sprints: sem seleção';

    parts.push(`Aba: ${activeTabLabel}`);
    parts.push(sprintPart);

    if (fabKpiFilter !== 'all') {
      const semTaskContextLabel = semTaskContextFilter === 'stc' ? ' (STC)' : semTaskContextFilter === 'ctc' ? ' (CTC)' : '';
      parts.push(`Filtro KPI: ${getFabFilterLabel(fabKpiFilter)}${fabKpiFilter === 'sem_task' ? semTaskContextLabel : ''}`);
    }
    if (previstoFilter) parts.push(`Visão: ${previstoFilter === 'previsto' ? 'Previsto' : 'Não Previsto'}`);
    if (collaboratorFilter) parts.push(`Colaborador: ${collaboratorFilter}`);
    if (search.trim()) parts.push(`Busca: ${search.trim()}`);
    if (activeTab === 'timelog') {
      const sources = [showVdesk ? 'Vdesk' : null, showDevops ? 'DevOps' : null].filter(Boolean).join(' + ');
      parts.push(`Fontes: ${sources || 'nenhuma'}`);
      if (reconFilter !== 'all') parts.push(`Reconciliação: ${reconFilter}`);
      if (timelogDrilldown.type !== 'none' && timelogDrilldown.key) {
        parts.push(`Drilldown: ${timelogDrilldown.type} (${timelogDrilldown.key})`);
      }
    }
    parts.push(`Colaboradores ativos: ${selectedCollaboratorsCount}/${fab.allCollaborators.length}`);

    return parts.join(' • ');
  }, [
    hasAllSprints,
    selectedSprintCodes,
    activeTabLabel,
    fabKpiFilter,
    previstoFilter,
    collaboratorFilter,
    search,
    activeTab,
    showVdesk,
    showDevops,
    reconFilter,
    timelogDrilldown.type,
    timelogDrilldown.key,
    selectedCollaboratorsCount,
    fab.allCollaborators.length,
    semTaskContextFilter,
  ]);

  const toWorkItemExportRow = useCallback((item: FabricaItem) => ({
    id: item.id,
    title: item.title,
    work_item_type: item.work_item_type,
    assigned_to_display: item.assigned_to_display,
    state: item.state,
    priority: item.priority,
    effort: item.effort,
    iteration_path: item.iteration_path,
    parent_id: item.parent_id,
    parent_title: item.parent_title,
    web_url: item.web_url,
  }), []);

  const exportConfig = useMemo(() => {
    const effectivePeriodLabel = `${periodLabel} • ${exportFilterContext}`;

    if (activeTab === 'timelog') {
      return {
        title: timelogDrilldown.type === 'collaborator' && timelogDrilldown.key
          ? `TimeLog - ${timelogDrilldown.key}`
          : 'TimeLog',
        periodLabel: effectivePeriodLabel,
        columns: ['task_id', 'titulo', 'estado', 'responsavel', 'usuarios_apontamento', 'primeira_data_log', 'ultima_data_log', 'os_amostra', 'horas_devops', 'horas_vdesk', 'gap_horas', 'gap_direcao', 'status_reconciliacao'],
        rows: timelogExportRows,
        kpis: [
          { label: 'Tasks no escopo', value: timelogExportRows.length },
          { label: 'Horas DevOps', value: formatMinutesAsHoursLabel(timelogTotals.devopsMinutes) },
          { label: 'Horas Vdesk', value: formatMinutesAsHoursLabel(timelogTotals.vdeskMinutes) },
          { label: 'Gap absoluto', value: formatMinutesAsHoursLabel(timelogTotals.gapMinutes) },
        ],
      };
    }

    if (activeTab === 'backlog-priorizar') {
      return {
        title: 'Backlog para Priorizar',
        periodLabel: effectivePeriodLabel,
        columns: ['id', 'title', 'work_item_type', 'assigned_to_display', 'state', 'priority', 'effort', 'iteration_path', 'web_url'],
        rows: backlogPriorizarItems.map(toWorkItemExportRow),
        kpis: [{ label: 'Itens na fila', value: backlogPriorizarItems.length }],
      };
    }

    if (activeTab === 'uxui-fila') {
      return {
        title: 'Fila Design / UX-UI',
        periodLabel: effectivePeriodLabel,
        columns: ['id', 'title', 'work_item_type', 'assigned_to_display', 'state', 'priority', 'effort', 'iteration_path', 'web_url'],
        rows: uxuiItems.map(toWorkItemExportRow),
        kpis: [{ label: 'Itens na fila', value: uxuiItems.length }],
      };
    }

    if (activeTab === 'qa-return') {
      return {
        title: 'Retorno QA',
        periodLabel: effectivePeriodLabel,
        columns: ['work_item_id', 'work_item_title', 'work_item_type', 'sprint_code', 'assigned_to_display', 'days_since_return', 'alert_status', 'detected_at', 'transition_date', 'web_url'],
        rows: qaReturnKpis.openItems.map((item) => ({
          work_item_id: item.work_item_id,
          work_item_title: item.work_item_title,
          work_item_type: item.work_item_type,
          sprint_code: item.sprint_code,
          assigned_to_display: item.assigned_to_display,
          days_since_return: item.days_since_return,
          alert_status: item.alert_status,
          detected_at: item.detected_at,
          transition_date: item.transition_date,
          web_url: item.web_url,
        })),
        kpis: [
          { label: 'Retornos em aberto', value: qaReturnKpis.openItems.length },
          { label: 'Retornos no período', value: qaReturnKpis.summary?.total_events ?? 0 },
        ],
      };
    }

    const overviewRows = filteredFabItems.map(toWorkItemExportRow);
    return {
      title: 'Visão Geral',
      periodLabel: effectivePeriodLabel,
      columns: ['id', 'title', 'work_item_type', 'assigned_to_display', 'state', 'priority', 'effort', 'iteration_path', 'parent_id', 'parent_title', 'web_url'],
      rows: overviewRows,
      kpis: [
        { label: 'Itens exportados', value: overviewRows.length },
        { label: 'Filtro KPI', value: getFabFilterLabel(fabKpiFilter) },
        { label: 'Sprints selecionadas', value: hasAllSprints ? 'Todas' : selectedSprintCodes.length || 0 },
      ],
    };
  }, [
    periodLabel,
    exportFilterContext,
    activeTab,
    timelogDrilldown.type,
    timelogDrilldown.key,
    timelogExportRows,
    timelogTotals.devopsMinutes,
    timelogTotals.vdeskMinutes,
    timelogTotals.gapMinutes,
    backlogPriorizarItems,
    toWorkItemExportRow,
    uxuiItems,
    qaReturnKpis.openItems,
    qaReturnKpis.summary?.total_events,
    filteredFabItems,
    fabKpiFilter,
    hasAllSprints,
    selectedSprintCodes.length,
  ]);

  const handleExportCSV = () => {
    exportCSV({
      title: exportConfig.title,
      area: 'Fábrica',
      periodLabel: exportConfig.periodLabel,
      columns: exportConfig.columns,
      rows: exportConfig.rows,
    });
  };

  const handleExportPDF = () => {
    exportPDF({
      title: exportConfig.title,
      area: 'Fábrica',
      periodLabel: exportConfig.periodLabel,
      kpis: exportConfig.kpis,
      columns: exportConfig.columns,
      rows: exportConfig.rows,
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

  const toggleNewEntryRead = useCallback(async (itemId: number) => {
    const isCurrentlyRead = newEntriesReadIds.has(itemId);
    const newIsRead = !isCurrentlyRead;
    
    // Optimistic update
    setNewEntriesReadIds((prev) => {
      const next = new Set(prev);
      if (newIsRead) next.add(itemId);
      else next.delete(itemId);
      return next;
    });

    // Persist to Supabase
    try {
      const { error } = await supabase.from('fabrica_read_entries').upsert(
        { work_item_id: itemId, is_read: newIsRead },
        { onConflict: 'work_item_id' }
      );
      if (error) {
        console.error('Failed to update read state:', error);
        // Revert optimistic update on error
        setNewEntriesReadIds((prev) => {
          const next = new Set(prev);
          if (isCurrentlyRead) next.add(itemId);
          else next.delete(itemId);
          return next;
        });
      }
    } catch (err) {
      console.error('Error updating read state:', err);
    }
  }, []);

  const markUnreadChildrenAsRead = useCallback(async (childrenIds: number[]) => {
    // Optimistic update
    setNewEntriesReadIds((prev) => {
      const next = new Set(prev);
      for (const childId of childrenIds) {
        next.add(childId);
      }
      return next;
    });

    // Persist to Supabase
    try {
      const { error } = await supabase.from('fabrica_read_entries').upsert(
        childrenIds.map(id => ({ work_item_id: id, is_read: true })),
        { onConflict: 'work_item_id' }
      );
      if (error) {
        console.error('Failed to mark children as read:', error);
        // Revert optimistic update on error
        setNewEntriesReadIds((prev) => {
          const next = new Set(prev);
          for (const childId of childrenIds) {
            next.delete(childId);
          }
          return next;
        });
      }
    } catch (err) {
      console.error('Error marking children as read:', err);
    }
  }, []);

  const renderItemCells = (item: FabricaItem, indent = false, hasUnreadDescendant = false, unreadChildrenIds: number[] = []) => {
    const entrySignal = item.id != null ? newEntrySignalsById.get(item.id) : null;
    const isRead = item.id != null ? newEntriesReadIds.has(item.id) : false;
    const showUnreadDescendantBadge = !entrySignal && hasUnreadDescendant;

    return (
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
        <div className="flex items-start gap-2">
          {item.id ? (
            <PbiHealthBadge
              status={pbiHealthBatch.healthById.get(item.id)?.health_status}
              compact
              indicatorMode="fabrica-abc"
              className="text-[10px] px-1.5 py-0"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <span className={`truncate block ${(entrySignal && !isRead) || showUnreadDescendantBadge ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}`}>{item.title || '—'}</span>
            {(entrySignal || showUnreadDescendantBadge) && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {entrySignal ? (
                  <>
                    <Badge variant="outline" className={`text-[10px] font-medium ${isRead ? 'bg-muted text-muted-foreground border-border' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40'}`}>
                      {isRead ? 'Lido' : 'Novo'}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                      {entrySignal.categoryLabel}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      Inclusão: {formatShortDateTime(entrySignal.createdAt)}
                    </span>
                    {item.id != null && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleNewEntryRead(item.id!);
                        }}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        {isRead ? 'Marcar não lido' : 'Marcar lido'}
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40">
                      Contém não lido (task)
                    </Badge>
                    {unreadChildrenIds.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          markUnreadChildrenAsRead(unreadChildrenIds);
                        }}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Marcar {unreadChildrenIds.length} como lido
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-sm">{item.assigned_to_display || '—'}</TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={`text-[11px] font-medium ${stateColors[item.state || ''] || 'bg-muted text-muted-foreground border border-border'}`}
        >
          {item.state === 'To Do' ? 'A Fazer' : item.state === 'Done' ? 'Done' : (item.state || '—')}
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
      <TableCell className="text-xs text-muted-foreground min-w-[140px] whitespace-nowrap">
        {item.iteration_path ? (item.iteration_path.split('\\').pop() || item.iteration_path) : '—'}
      </TableCell>
    </>
    );
  };

  const filterLabel = (f: FabKpiFilter) => getFabFilterLabel(f);

  const renderSectionToggle = (blockKey: string, label: string) => {
    const collapsed = isBlockCollapsed(blockKey);
    return (
      <div className="flex justify-start items-center gap-1">
        {collapsed ? (
          <span className="text-[10px] text-muted-foreground/80">{label}</span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={() => toggleBlockCollapse(blockKey)}
          title={collapsed ? 'Expandir seção' : 'Minimizar seção'}
          aria-label={collapsed ? 'Expandir seção' : 'Minimizar seção'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>
    );
  };

  return (
    <SectorLayout title="Fábrica" subtitle="Programação — Sprint Board" lastUpdate="" integrations={integrations} areaKey="fabrica" syncFunctions={[
      { name: 'devops-sync-query', label: 'Atualizar Itens Fábrica (Query 08)', payload: { query_id: '557a9643-5049-43a6-b199-e498f39e9e88' } },
      { name: 'devops-sync-all', label: 'Sincronizar Base Geral DevOps (completo)' },
      { name: 'devops-sync-timelog', label: 'Sincronizar TimeLog (Horas)' },
    ]}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <DashboardLastSyncBadge syncedAt={fab.lastSync} status="ok" />
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
            <PopoverContent className="w-80 p-3" align="start">
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Colaboradores contabilizados</p>
                  <Input
                    value={collaboratorSearch}
                    onChange={(e) => setCollaboratorSearch(e.target.value)}
                    placeholder="Pesquisar colaborador..."
                    className="h-8 text-xs"
                  />
                </div>
                <ScrollArea className="h-[240px] rounded-md border border-border/60 p-1">
                <div className="space-y-1">
                  {filteredCollaborators.map(name => {
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
                <div className="border-t pt-2 grid grid-cols-3 gap-1">
                  <Button variant="ghost" size="sm" className="text-[11px] h-8 px-2" onClick={markAllCollaborators}>
                    Marcar todos
                  </Button>
                  <Button variant="ghost" size="sm" className="text-[11px] h-8 px-2" onClick={unmarkAllCollaborators}>
                    Desmarcar todos
                  </Button>
                  <Button variant="ghost" size="sm" className="text-[11px] h-8 px-2" onClick={markLeadCollaborators}>
                    Marcar Leads
                  </Button>
                </div>
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
          <Badge
            variant="default"
            className="gap-1 text-xs cursor-pointer animate-fade-in"
            onClick={() => { setFabKpiFilter('all'); setSemTaskContextFilter('all'); }}
          >
            Filtro: {filterLabel(fabKpiFilter)}{fabKpiFilter === 'sem_task' && semTaskContextFilter !== 'all' ? ` ${semTaskContextFilter.toUpperCase()}` : ''} ✕
          </Badge>
        )}
        {previstoFilter && (
          <Badge variant="default" className="gap-1 text-xs cursor-pointer animate-fade-in" onClick={() => setPrevistoFilter(null)}>
            Visão: {previstoFilter === 'previsto' ? 'Previsto' : 'Não Previsto'} ✕
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
              <TabsTrigger value="qa-return" className="gap-1.5 text-xs h-8">
                <AlertTriangle className="h-3.5 w-3.5" />Retorno QA
              </TabsTrigger>
              <TabsTrigger value="gerencia" className="gap-1.5 text-xs h-8">
                <BarChart3 className="h-3.5 w-3.5" />Gerencial
              </TabsTrigger>
            </TabsList>

            {/* Tabs secundárias no dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition-colors flex-shrink-0 ml-auto
                  ${['backlog-priorizar','uxui-fila'].includes(activeTab)
                    ? 'bg-background shadow-sm text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/60'}`}>
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  Mais
                  {['backlog-priorizar','uxui-fila'].includes(activeTab) && (
                    <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
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
            {renderSectionToggle('overview_scope', 'Itens no escopo')}
            {!isBlockCollapsed('overview_scope') && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <SprintStatusCard
                  total={sprintTotal}
                  inProgress={sprintInProgress}
                  toDo={sprintToDo}
                  done={sprintDone}
                  entregue={sprintEntregue}
                  semTask={sprintPbisSemTaskCount}
                  semTaskNeverChild={sprintPbisSemTaskNeverChildCount}
                  semTaskChildDone={sprintPbisSemTaskChildDoneCount}
                  semTaskContextFilter={semTaskContextFilter}
                  isLoading={fab.isLoading}
                  fabKpiFilter={fabKpiFilter}
                  toggleFab={toggleFab}
                  toggleSemTaskContext={toggleSemTaskContext}
                  sprintEndDate={effectiveRange?.to || null}
                />

                {colabChartData.length > 0 ? (
                  <Card className="animate-fade-in" style={{ animationDelay: '500ms' }}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary" />Visão colaborador
                        </CardTitle>
                        <div className="inline-flex rounded-md border border-border overflow-hidden shrink-0">
                          <button
                            type="button"
                            onClick={() => setCollaboratorViewMode('gestor')}
                            className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${collaboratorViewMode === 'gestor' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
                          >
                            PBI/BUG
                          </button>
                          <button
                            type="button"
                            onClick={() => setCollaboratorViewMode('tasks')}
                            className={`px-2.5 py-1 text-[11px] font-medium transition-colors border-l border-border ${collaboratorViewMode === 'tasks' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
                          >
                            Tasks
                          </button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Itens nesta visão colaborador</span>
                        <span className="font-medium text-foreground">{collaboratorViewTotal}</span>
                      </div>
                      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                        <span className="text-red-500/85">To Do {collaboratorStatusMix.todoPct}%</span>
                        <span className="text-orange-500/85">Em Desenv. {collaboratorStatusMix.inProgressPct}%</span>
                        <span className="text-blue-500/85">Entregue {collaboratorStatusMix.entreguePct}%</span>
                        <span className="text-[hsl(var(--success)/0.85)]">Done {collaboratorStatusMix.donePct}%</span>
                      </div>
                      <ResponsiveContainer width="100%" height={Math.max(200, colabChartData.length * 32)}>
                        <BarChart data={colabChartData} layout="vertical" margin={{ left: 0, right: 16 }} style={{ cursor: 'pointer' }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                          <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                          <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={110} />
                          <RechartsTooltip
                            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                            labelStyle={{ color: 'hsl(var(--foreground))' }}
                            formatter={(value: number, key: string, ctx: { payload?: { total?: number } }) => {
                              const labelMap: Record<string, string> = {
                                todo: 'To Do',
                                in_progress: 'Em Desenvolvimento',
                                entregue: 'Entregue',
                                done: 'Done',
                              };
                              const total = ctx?.payload?.total || 0;
                              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                              return [`${value} (${pct}%)`, labelMap[key] || key];
                            }}
                          />
                          <Bar dataKey="todo" stackId="collab-status" fill="#f87171" radius={[0, 0, 0, 0]} cursor="pointer" onClick={(data: { name?: string } | undefined) => {
                            if (data?.name) {
                              setCollaboratorFilter(prev => prev === data.name ? null : data.name);
                              setPage(0);
                            }
                          }}>
                            <LabelList dataKey="todo_pct" content={renderStatusPctLabel('todo')} />
                          </Bar>
                          <Bar dataKey="in_progress" stackId="collab-status" fill="#fb923c" radius={[0, 0, 0, 0]} cursor="pointer" onClick={(data: { name?: string } | undefined) => {
                            if (data?.name) {
                              setCollaboratorFilter(prev => prev === data.name ? null : data.name);
                              setPage(0);
                            }
                          }}>
                            <LabelList dataKey="in_progress_pct" content={renderStatusPctLabel('in_progress')} />
                          </Bar>
                          <Bar dataKey="entregue" stackId="collab-status" fill="#60a5fa" radius={[0, 0, 0, 0]} cursor="pointer" onClick={(data: { name?: string } | undefined) => {
                            if (data?.name) {
                              setCollaboratorFilter(prev => prev === data.name ? null : data.name);
                              setPage(0);
                            }
                          }}>
                            <LabelList dataKey="entregue_pct" content={renderStatusPctLabel('entregue')} />
                          </Bar>
                          <Bar
                            dataKey="done"
                            stackId="collab-status"
                            fill="hsl(var(--success) / 0.85)"
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
                                fill={collaboratorFilter === entry.name ? 'hsl(var(--success) / 0.9)' : 'hsl(var(--success) / 0.75)'}
                                stroke={collaboratorFilter === entry.name ? 'hsl(var(--foreground))' : 'transparent'}
                                strokeWidth={collaboratorFilter === entry.name ? 2 : 0}
                              />
                            ))}
                            <LabelList
                              dataKey="total"
                              position="right"
                              offset={8}
                              className="fill-foreground"
                              fontSize={11}
                            />
                            <LabelList dataKey="done_pct" content={renderStatusPctLabel('done')} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="p-6">
                    <p className="text-xs text-muted-foreground">Sem dados para a visão colaborador no filtro atual.</p>
                  </Card>
                )}

                {previstoNaoPrevisto.total > 0 ? (
                  <Card className="p-6 animate-fade-in" style={{ animationDelay: '600ms' }}>
                    <p className="text-xs font-medium text-muted-foreground mb-4">VISÃO PREVISTO X NÃO PREVISTO</p>
                    <div className="relative">
                      <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-border" />
                      <button
                        type="button"
                        onClick={() => togglePrevistoFilter('previsto')}
                        className={`relative z-10 w-full text-left flex items-center justify-between py-3 hover:bg-muted/20 rounded-lg px-2 -mx-2 transition-colors ${previstoFilter === 'previsto' ? 'bg-primary/10' : ''}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-primary/10">
                            <TrendingUp className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">Previsto</p>
                            <p className="text-[11px] text-muted-foreground/70">Itens priorizados do escopo</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-semibold text-foreground">{previstoNaoPrevisto.previsto}</span>
                          <p className="text-[11px] text-muted-foreground">{previstoNaoPrevisto.previstoPct}%</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => togglePrevistoFilter('nao_previsto')}
                        className={`relative z-10 w-full text-left flex items-center justify-between py-3 hover:bg-muted/20 rounded-lg px-2 -mx-2 transition-colors ${previstoFilter === 'nao_previsto' ? 'bg-primary/10' : ''}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-amber-500/10">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">Não Previsto</p>
                            <p className="text-[11px] text-muted-foreground/70">Bug, Retorno QA ou Avião</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-semibold text-foreground">{previstoNaoPrevisto.naoPrevisto}</span>
                          <p className="text-[11px] text-muted-foreground">{previstoNaoPrevisto.naoPrevistoPct}%</p>
                        </div>
                      </button>
                    </div>
                    <div className="mt-3 text-[11px] text-muted-foreground">
                      Total monitorado nesta visão: <span className="font-medium text-foreground">{previstoNaoPrevisto.total}</span>
                    </div>
                  </Card>
                ) : (
                  <Card className="p-6">
                    <p className="text-xs text-muted-foreground">Sem itens para visão previsto/não previsto no filtro atual.</p>
                  </Card>
                )}
              </div>
            )}
            {/* Sprint Board */}
            {renderSectionToggle('overview_sprint_board', 'Sprint Board')}
            {!isBlockCollapsed('overview_sprint_board') && (
              fab.isLoading ? (
                <Card className="overflow-hidden">
                  <div className="p-4 border-b border-border"><Skeleton className="h-5 w-40" /></div>
                  <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                </Card>
              ) : (
                <Card className="overflow-hidden animate-fade-in">
                <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                      Sprint Board
                      {unreadNewEntryCount > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300">
                          {unreadNewEntryCount} novas não lidas
                        </Badge>
                      )}
                    </h3>
                    <p className="text-xs text-muted-foreground">{allTopLevel.length} itens exibidos • {boardParentRows.filter(p => boardChildrenMap.has(p.id!)).length} PBIs com tasks</p>
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
                    <div className="inline-flex rounded-md border border-border overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => { setNewEntryReadFilter('all'); setPage(0); }}
                        className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${newEntryReadFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => { setNewEntryReadFilter('unread'); setPage(0); }}
                        className={`px-2.5 py-1 text-[11px] font-medium transition-colors border-l border-border ${newEntryReadFilter === 'unread' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
                      >
                        Não lidos
                      </button>
                      <button
                        type="button"
                        onClick={() => { setNewEntryReadFilter('read'); setPage(0); }}
                        className={`px-2.5 py-1 text-[11px] font-medium transition-colors border-l border-border ${newEntryReadFilter === 'read' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
                      >
                        Lidos
                      </button>
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
                    <DraggableScrollArea className="max-h-[600px]">
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
                            <TableHead className="text-xs font-semibold min-w-[140px]">Sprint</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedTopLevel.map(item => {
                            const children = boardChildrenMap.get(item.id!) || [];
                            const hasChildren = children.length > 0;
                            const isExpanded = expandedPbis.has(item.id!);
                            const parentIsUnreadNew = item.id != null && newEntrySignalsById.has(item.id) && !newEntriesReadIds.has(item.id);
                            const unreadChildrenIds = children
                              .filter((child) => child.id != null && newEntrySignalsById.has(child.id) && !newEntriesReadIds.has(child.id))
                              .map((child) => child.id!)
                              .filter((id) => id > 0);
                            const parentHasUnreadChild = unreadChildrenIds.length > 0;

                            return (
                              <>{/* Parent row */}
                                <TableRow
                                  key={`p-${item.id!}`}
                                  className={`hover:bg-muted/30 transition-colors cursor-pointer ${hasChildren ? 'font-medium' : ''} ${(parentIsUnreadNew || parentHasUnreadChild) ? 'bg-amber-500/10 border-l-2 border-l-amber-500/70' : ''}`}
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
                                  {renderItemCells(item, false, parentHasUnreadChild, unreadChildrenIds)}
                                </TableRow>

                                {/* Child rows */}
                                {hasChildren && isExpanded && children.map(child => {
                                  const childIsUnreadNew = child.id != null && newEntrySignalsById.has(child.id) && !newEntriesReadIds.has(child.id);
                                  return (
                                    <TableRow
                                      key={`c-${child.id!}`}
                                      className={`hover:bg-muted/20 transition-colors cursor-pointer bg-muted/5 border-l-2 ${childIsUnreadNew ? 'border-l-amber-500/70 bg-amber-500/10' : 'border-l-primary/20'}`}
                                      onClick={() => setDrawerItem(child)}
                                    >
                                      <TableCell className="w-8 px-2">
                                        <span className="inline-block w-6 text-center text-muted-foreground/40 text-xs">└</span>
                                      </TableCell>
                                      {renderItemCells(child, true)}
                                    </TableRow>
                                  );
                                })}
                              </>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </DraggableScrollArea>

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
              )
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
                summaryBadge={fab.hasTimeLogs ? `${Math.round(fab.totalHoursLogged)}h registradas` : undefined}
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
                    <DraggableScrollArea className="max-h-[260px] border rounded-md">
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
                    </DraggableScrollArea>
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


          {/* ═══════ TAB: Backlog Priorizar ═══════ */}
          <TabsContent value="backlog-priorizar" className="space-y-4 mt-0">
            <Card className="overflow-hidden animate-fade-in">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-foreground text-sm">Visão Operacional: Backlog para Priorizar</h3>
                <p className="text-xs text-muted-foreground">Fonte operacional: query 03-Em Fila Backlog para Priorizar (todas as sprints)</p>
              </div>
              <DraggableScrollArea className="max-h-[600px]">
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
              </DraggableScrollArea>
            </Card>
          </TabsContent>

          {/* ═══════ TAB: UX-UI Fila ═══════ */}
          <TabsContent value="uxui-fila" className="space-y-4 mt-0">
            <Card className="overflow-hidden animate-fade-in">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-foreground text-sm">Visão Operacional: Fila Design / UX-UI</h3>
                <p className="text-xs text-muted-foreground">Fonte operacional: query 05-Em Fila UX-UI (todas as sprints)</p>
              </div>
              <DraggableScrollArea className="max-h-[600px]">
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
              </DraggableScrollArea>
            </Card>
          </TabsContent>

          {/* ═══════ TAB: Retorno QA ═══════ */}
          <TabsContent value="qa-return" className="space-y-4 mt-0">
            <QaReturnTab items={qaReturnKpis.openItems} isLoading={qaReturnKpis.isLoading} />
          </TabsContent>

          {/* ═══════ TAB: Gerência ═══════ */}
          <TabsContent value="gerencia" className="space-y-4 mt-0">
            <GerenciaTab
              items={collaboratorScopedItems}
              allItems={fab.allItems}
              sortedSprints={fab.sortedSprints}
              isLoading={fab.isLoading}
              selectedSprintCodes={selectedSprintCodes}
              hasAllSprints={hasAllSprints}
              transbordoSummary={{
                count: sprintTransbordoCount,
                total: sprintTransbordoTotal,
                pct: sprintTransbordoPct,
                realOverflowItemCount: sprintRealOverflowItemCount,
                realOverflowCount: sprintRealOverflowCount,
                realOverflowPct: sprintRealOverflowPct,
              }}
              healthOverview={pbiHealthBatch.overview}
              bottlenecks={bottlenecks.bottlenecks}
              featureRows={featureSummary.rows}
              performance={{
                leadTimeMedio: fab.leadTimeMedio,
                leadTimeSource: fab.leadTimeSource,
                velocidadeMedia: fab.velocidadeMedia,
                velocidadeSource: fab.velocidadeSource,
                sprintCount: fab.sprintCount,
                isLoading: fab.isLoading,
              }}
              risks={{
                transbordoPct: sprintTransbordoPct,
                transbordoCount: sprintTransbordoCount,
                transbordoTotal: sprintTransbordoTotal,
                qaOpen: qaReturnKpis.summary?.open_events ?? 0,
                qaTotal: qaReturnKpis.summary?.total_events ?? 0,
                qaAvg: qaReturnKpis.summary?.avg_days_open ?? null,
                qaMax: qaReturnKpis.summary?.max_days_open ?? null,
                onQaClick: () => setActiveTab('qa-return'),
              }}
            />
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
