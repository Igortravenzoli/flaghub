import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useQualidadeKpis, QualidadeItem } from '@/hooks/useQualidadeKpis';
import { usePbiHealthBatch } from '@/hooks/usePbiHealthBatch';
import { usePbiBottlenecks } from '@/hooks/usePbiBottlenecks';
import { useFeaturePbiSummary } from '@/hooks/useFeaturePbiSummary';
import { PbiHealthBadge } from '@/components/pbi/PbiHealthBadge';
import { useSprintFilter } from '@/hooks/useSprintFilter';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { useCrossSectorSearch } from '@/hooks/useCrossSectorSearch';
import { CrossSectorSearchBanner } from '@/components/dashboard/CrossSectorSearchBanner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FileCheck, Clock, TrendingUp, BarChart3, RotateCcw, Plane, HeartPulse, Workflow, AlertTriangle, ListTodo, Users, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { Integration } from '@/components/setores/SectorIntegrations';
import { getAvailableDateKeysFromItems, getDateBoundsFromItems } from '@/lib/dateBounds';
import { extractSprintCodeFromPath, formatSprintIntervalLabel, getCurrentOfficialSprintCode, getOfficialSprintRange } from '@/lib/sprintCalendar';

type QaKpiFilter = 'all' | 'em_teste' | 'deploy' | 'com_retorno' | 'aviao';

/** Default QA collaborator patterns — only these are pre-selected */
const QA_DEFAULT_COLLAB_PATTERNS = [
  'carlos r',
  'rodrigues',
  'mauricio',
  'thiago',
  'thales',
];

function normalizeQaName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function isQaDefaultCollab(name: string): boolean {
  const n = normalizeQaName(name);
  return QA_DEFAULT_COLLAB_PATTERNS.some(p => n.includes(p));
}
type QaHealthFilter = 'all' | 'verde' | 'amarelo' | 'vermelho';

const integrations: Integration[] = [
  { name: 'Azure DevOps', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Work Items QA' },
];

const QUALITY_TEST_STATES = new Set(['Em Teste', 'Aguardando Deploy']);
const QUALITY_TESTING_STATES = new Set(['Em Teste']);
const QUALITY_DEPLOY_STATES = new Set(['Aguardando Deploy']);

const columns: DataTableColumn<QualidadeItem>[] = [
  { key: 'id', header: 'ID', className: 'font-mono text-xs w-16', render: r => r.web_url ? (
    <a href={r.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono" onClick={e => e.stopPropagation()}>
      {r.id}
    </a>
  ) : <span>{r.id}</span> },
  { key: 'work_item_type', header: 'Tipo', render: r => <Badge variant="outline" className="text-xs">{r.work_item_type || '—'}</Badge> },
  { key: 'title', header: 'Título', className: 'max-w-[350px] truncate' },
  { key: 'assigned_to_display', header: 'Colaborador' },
  { key: 'state', header: 'Estado', render: r => <Badge variant="outline" className="text-xs">{r.state || '—'}</Badge> },
  { key: 'priority', header: 'Prioridade', render: r => r.priority != null ? <Badge variant="secondary" className="text-xs">P{r.priority}</Badge> : '—' },
  { key: 'iteration_path', header: 'Sprint', className: 'text-xs text-muted-foreground max-w-[120px] truncate', render: r => r.iteration_path ? (r.iteration_path.split('\\').pop() || r.iteration_path) : '—' },
  { 
    key: 'qa_retorno_count' as any, 
    header: 'Retorno QA', 
    render: r => {
      const count = r.qa_retorno_count ?? 0;
      if (count === 0) return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <Badge variant="destructive" className="text-xs font-mono">
          {count}x
        </Badge>
      );
    },
    className: 'text-center w-24'
  },
  { key: 'created_date', header: 'Criado', render: r => r.created_date ? new Date(r.created_date).toLocaleDateString('pt-BR') : '—', className: 'text-xs' },
];

export default function QualidadeDashboard() {
  const [kpiFilter, setKpiFilter] = useState<QaKpiFilter>('all');
  const [healthFilter, setHealthFilter] = useState<QaHealthFilter>('all');
  const [sprintFilter, setSprintFilter] = useState<string>('all');
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [customActive, setCustomActive] = useState(false);
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
  const [collabMode, setCollabMode] = useState<'default' | 'all' | 'custom'>('all');
  const [customSelectedCollabs, setCustomSelectedCollabs] = useState<Set<string>>(new Set());
  // Retrabalho tab has its own collaborator filter
  const [reworkCollabMode, setReworkCollabMode] = useState<'default' | 'all' | 'custom'>('all');
  const [reworkCustomCollabs, setReworkCustomCollabs] = useState<Set<string>>(new Set());
  const [reworkMinCount, setReworkMinCount] = useState<number>(1);
  // "base" = atemporal/macro, sem filtro de sprint — para os KPIs do topo
  const base = useQualidadeKpis(undefined, undefined, 'all');
  const { allItems, lastSync, isLoading, isError } = base;

  // ── States classification for rework detection ──
  // QA states: states that represent "in testing"
  const QA_ORIGIN_STATES = useMemo(() => new Set([
    'Em Teste', 'In Test', 'Testing', 'em teste',
  ]), []);
  // DEV destination states: states that represent "returned to development"
  const DEV_DEST_STATES = useMemo(() => new Set([
    'Em desenvolvimento', 'Em Desenvolvimento', 'In Progress', 'In Development',
    'To Do', 'New', 'Committed', 'Prioritized', 'Active', 'Approved',
    'em desenvolvimento', 'in progress',
  ]), []);
  // Done/closed states
  const DONE_STATES = useMemo(() => new Set([
    'Done', 'Closed', 'Resolved', 'done', 'closed', 'resolved',
  ]), []);

  // Fetch ALL Done items + compute rework from state_history directly
  const reworkQuery = useQuery({
    queryKey: ['qualidade', 'rework-done-v3'],
    queryFn: async () => {
      const DONE_STATES = ['Done', 'Closed', 'Resolved'];
      const PAGE = 1000;

      // Count first, then fetch all pages in parallel — eliminates serial while(true) loop
      const { count } = await supabase
        .from('devops_work_items')
        .select('id', { count: 'exact', head: true })
        .in('state', DONE_STATES);

      if (!count || count === 0) return [];

      const pages = Math.ceil(count / PAGE);
      const results = await Promise.all(
        Array.from({ length: pages }, (_, i) =>
          supabase
            .from('devops_work_items')
            .select('id, title, work_item_type, state, assigned_to_display, priority, iteration_path, created_date, changed_date, web_url, tags, state_history')
            .in('state', DONE_STATES)
            .range(i * PAGE, (i + 1) * PAGE - 1)
        )
      );
      const allDoneItems = results.flatMap(r => r.data || []);
      if (allDoneItems.length === 0) return [];

      // QA origin state set (case-insensitive matching via normalized)
      const qaOriginNorm = new Set(['em teste', 'in test', 'testing']);
      // Dev destination state set
      const devDestNorm = new Set([
        'em desenvolvimento', 'in progress', 'in development',
        'to do', 'new', 'committed', 'prioritized', 'active', 'approved',
      ]);

      return allDoneItems.map((w: any): QualidadeItem => {
        let totalRetornoQa = 0;
        let ultimoResponsavel: string | null = null;
        let ultimoRetornoEm: string | null = null;
        let ultimoEstadoDestino: string | null = null;

        if (w.state_history && Array.isArray(w.state_history)) {
          for (const entry of w.state_history) {
            const oldVal = (entry?.oldValue || '').toLowerCase().trim();
            const newVal = (entry?.newValue || '').toLowerCase().trim();
            // Detect: leaving a QA state and going to a DEV state
            if (qaOriginNorm.has(oldVal) && devDestNorm.has(newVal)) {
              totalRetornoQa++;
              // revisedBy is the person who performed this transition (QA person returning)
              const who = typeof entry?.revisedBy === 'string'
                ? entry.revisedBy
                : (entry?.revisedBy?.displayName || entry?.revisedBy?.uniqueName || null);
              if (who) ultimoResponsavel = who;
              if (entry?.revisedDate) ultimoRetornoEm = entry.revisedDate;
              // Store the original-case newValue
              ultimoEstadoDestino = entry?.newValue || null;
            }
          }
        }

        return {
          id: w.id,
          title: w.title,
          work_item_type: w.work_item_type,
          state: w.state,
          assigned_to_display: w.assigned_to_display,
          priority: w.priority,
          tags: w.tags,
          created_date: w.created_date,
          changed_date: w.changed_date,
          iteration_path: w.iteration_path,
          web_url: w.web_url,
          qa_retorno_count: totalRetornoQa,
          returned_by: ultimoResponsavel,
          ultimo_responsavel_retorno_qa: ultimoResponsavel,
          ultimo_retorno_qa_em: ultimoRetornoEm,
          ultimo_estado_destino_retorno: ultimoEstadoDestino,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });
  const allDoneItems = reworkQuery.data || [];
  const { sortedSprints } = useSprintFilter(allItems);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<QualidadeItem | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [tableSearch, setTableSearch] = useState('');

  const localItemIds = useMemo(() => allItems.map(i => i.id).filter(Boolean) as number[], [allItems]);
  const { crossSectorResult } = useCrossSectorSearch(tableSearch, 'qualidade', localItemIds);
  const crossSectorBanner = crossSectorResult ? <CrossSectorSearchBanner result={crossSectorResult} /> : null;
  const handleTableSearchChange = useCallback((s: string) => setTableSearch(s), []);

  // ── Collaborator filter logic ──
  const allCollaborators = useMemo(() => {
    const nameSet = new Set<string>();
    for (const item of allItems) {
      if (item.assigned_to_display) nameSet.add(item.assigned_to_display);
    }
    for (const item of allDoneItems) {
      if (item.assigned_to_display) nameSet.add(item.assigned_to_display);
    }
    return [...nameSet].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allItems, allDoneItems]);

  // Separate list for rework tab: LAST person who returned each task from QA → Dev
  const reworkReturners = useMemo(() => {
    const nameSet = new Set<string>();
    for (const item of allDoneItems) {
      if (item.ultimo_responsavel_retorno_qa) {
        nameSet.add(item.ultimo_responsavel_retorno_qa);
      }
    }
    return [...nameSet].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allDoneItems]);

  const isCollabSelected = useCallback((name: string): boolean => {
    if (collabMode === 'all') return true;
    if (collabMode === 'default') return isQaDefaultCollab(name);
    return customSelectedCollabs.has(name);
  }, [collabMode, customSelectedCollabs]);

  const selectedCollabCount = useMemo(
    () => allCollaborators.filter(isCollabSelected).length,
    [allCollaborators, isCollabSelected]
  );

  const toggleCollab = useCallback((name: string, checked: boolean) => {
    setCollabMode('custom');
    setCustomSelectedCollabs(prev => {
      // If switching from default/all to custom, seed with current selection
      let next: Set<string>;
      if (collabMode !== 'custom') {
        next = new Set(allCollaborators.filter(isCollabSelected));
      } else {
        next = new Set(prev);
      }
      if (checked) {
        next.add(name);
      } else {
        next.delete(name);
      }
      return next;
    });
  }, [collabMode, allCollaborators, isCollabSelected]);

  const filterByCollab = useCallback((items: QualidadeItem[]): QualidadeItem[] => {
    if (collabMode === 'all') return items;
    return items.filter(i => {
      const name = i.assigned_to_display;
      if (!name) return false;
      return isCollabSelected(name);
    });
  }, [collabMode, isCollabSelected]);

  const { minDate, maxDate } = useMemo(
    () => getDateBoundsFromItems(allItems, [(i) => i.created_date, (i) => i.changed_date]),
    [allItems]
  );

  const availableDateKeys = useMemo(
    () => getAvailableDateKeysFromItems(allItems, [(i) => i.created_date, (i) => i.changed_date]),
    [allItems]
  );

  useEffect(() => {
    if (sortedSprints.length === 0) return;
    if (sprintFilter === '__pending__') {
      const officialCurrentCode = getCurrentOfficialSprintCode();
      const currentSprintPath = sortedSprints.find((sp) => extractSprintCodeFromPath(sp) === officialCurrentCode);
      setSprintFilter(currentSprintPath || sortedSprints[sortedSprints.length - 1]);
      return;
    }
    if (sprintFilter === 'all') return;
    if (!sortedSprints.includes(sprintFilter)) {
      const officialCurrentCode = getCurrentOfficialSprintCode();
      const currentSprintPath = sortedSprints.find((sp) => extractSprintCodeFromPath(sp) === officialCurrentCode);
      setSprintFilter(currentSprintPath || sortedSprints[sortedSprints.length - 1]);
    }
  }, [sortedSprints, sprintFilter]);

  const selectedSprintCode = sprintFilter !== 'all' ? extractSprintCodeFromPath(sprintFilter) : null;
  const sprintRange = selectedSprintCode ? getOfficialSprintRange(selectedSprintCode) : null;
  const effectiveRange = customActive && customRange
    ? customRange
    : sprintRange || { from: minDate || new Date(), to: maxDate || new Date() };

  const scoped = useQualidadeKpis(effectiveRange.from, effectiveRange.to, sprintFilter === 'all' ? 'all' : sprintFilter);

  // Health batch IDs from the enriched items (atemporal for macro KPIs, scoped for table)
  const basePbiHealthIds = useMemo(
    () => base.enrichedItems
      .filter((i) => i.id && ['Product Backlog Item', 'User Story', 'Bug'].includes(i.work_item_type || ''))
      .map((i) => i.id as number),
    [base.enrichedItems]
  );

  const scopedPbiHealthIds = useMemo(
    () => scoped.items
      .filter((i) => i.id && ['Product Backlog Item', 'User Story', 'Bug'].includes(i.work_item_type || ''))
      .map((i) => i.id as number),
    [scoped.items]
  );

  const pbiHealthBatch = usePbiHealthBatch(
    [...new Set([...basePbiHealthIds, ...scopedPbiHealthIds])],
    basePbiHealthIds.length > 0 || scopedPbiHealthIds.length > 0
  );

  const bottlenecks = usePbiBottlenecks({
    sector: 'qualidade',
    sprintCode: selectedSprintCode,
    dateStart: effectiveRange.from,
    dateEnd: effectiveRange.to,
  });

  const featureSummary = useFeaturePbiSummary({
    sector: 'qualidade',
    sprintCode: selectedSprintCode,
    dateStart: effectiveRange.from,
    dateEnd: effectiveRange.to,
  });

  const toggleKpi = (f: QaKpiFilter) => setKpiFilter(prev => prev === f ? 'all' : f);

  // KPIs macro são atemporais → ao clicar, filtrar a partir de base (enrichedItems)
  // Quando sprint está selecionado, filtrar scoped.items
  // Apply collaborator filter to the source items
  const kpiSourceItems = useMemo(() => {
    const raw = sprintFilter === 'all' ? base.enrichedItems : scoped.items;
    return filterByCollab(raw);
  }, [sprintFilter, base.enrichedItems, scoped.items, filterByCollab]);

  // Rework tab collaborator filter
  const isReworkCollabSelected = useCallback((name: string): boolean => {
    if (reworkCollabMode === 'all') return true;
    if (reworkCollabMode === 'default') return isQaDefaultCollab(name);
    return reworkCustomCollabs.has(name);
  }, [reworkCollabMode, reworkCustomCollabs]);

  const reworkSelectedCount = useMemo(
    () => reworkReturners.filter(isReworkCollabSelected).length,
    [reworkReturners, isReworkCollabSelected]
  );

  const toggleReworkCollab = useCallback((name: string, checked: boolean) => {
    setReworkCollabMode('custom');
    setReworkCustomCollabs(prev => {
      let next: Set<string>;
      if (reworkCollabMode !== 'custom') {
        next = new Set(reworkReturners.filter(isReworkCollabSelected));
      } else {
        next = new Set(prev);
      }
      if (checked) next.add(name); else next.delete(name);
      return next;
    });
  }, [reworkCollabMode, reworkReturners, isReworkCollabSelected]);

  const filterReworkByCollab = useCallback((items: QualidadeItem[]): QualidadeItem[] => {
    if (reworkCollabMode === 'all') return items;
    return items.filter(i => {
      // Filter by LAST person who returned from QA to dev
      const who = i.ultimo_responsavel_retorno_qa;
      if (!who) return false;
      return isReworkCollabSelected(who);
    });
  }, [reworkCollabMode, isReworkCollabSelected]);

  const filteredItems = useMemo(() => {
    const source = kpiSourceItems;
    switch (kpiFilter) {
      case 'em_teste': return source.filter(i => QUALITY_TESTING_STATES.has(i.state || ''));
      case 'deploy': return source.filter(i => QUALITY_DEPLOY_STATES.has(i.state || ''));
      case 'com_retorno': return source.filter(i => (i.qa_retorno_count ?? 0) > 0);
      case 'aviao': return source.filter(i => (i.tags || '').toUpperCase().includes('AVIAO') && QUALITY_TEST_STATES.has(i.state || ''));
      default: return source;
    }
  }, [kpiSourceItems, kpiFilter]);

  const healthFilteredItems = useMemo(() => {
    if (healthFilter === 'all') return kpiSourceItems;
    return kpiSourceItems.filter((item) => item.id && pbiHealthBatch.healthById.get(item.id)?.health_status === healthFilter);
  }, [healthFilter, pbiHealthBatch.healthById, kpiSourceItems]);

  const tableColumns = useMemo<DataTableColumn<QualidadeItem>[]>(() => [
    {
      key: 'health',
      header: 'Saúde',
      className: 'w-24',
      render: (r) => <PbiHealthBadge status={r.id ? pbiHealthBatch.healthById.get(r.id)?.health_status : null} compact />,
    },
    ...columns,
  ], [pbiHealthBatch.healthById]);

  const filterLabel = (f: QaKpiFilter) => {
    switch (f) {
      case 'all': return 'Todos';
      case 'em_teste': return 'Em Teste';
      case 'deploy': return 'Aguardando Deploy';
      case 'com_retorno': return 'Com Retorno QA';
      case 'aviao': return 'Aviões';
    }
  };

  const healthFilterLabel = (f: QaHealthFilter) => {
    switch (f) {
      case 'all': return 'Todos';
      case 'verde': return 'Saudável';
      case 'amarelo': return 'Atenção';
      case 'vermelho': return 'Crítica';
    }
  };

  const handleExportCSV = () => exportCSV({
    title: 'Qualidade QA', area: 'Qualidade', periodLabel: customActive ? 'Custom' : (selectedSprintCode ? formatSprintIntervalLabel(selectedSprintCode) : 'Sprint'),
    columns: ['id', 'work_item_type', 'title', 'assigned_to_display', 'state', 'priority', 'iteration_path', 'qa_retorno_count', 'created_date'],
    rows: filteredItems as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Dashboard Qualidade', area: 'Qualidade', periodLabel: customActive ? 'Custom' : (selectedSprintCode ? formatSprintIntervalLabel(selectedSprintCode) : 'Sprint'),
    kpis: [
      { label: 'Total QA', value: base.total },
      { label: 'Fila QA (Atual)', value: base.filaAtual },
      { label: 'Taxa Vazão', value: `${base.taxaVazao}%` },
      { label: 'Aguardando Deploy', value: base.aguardandoDeploy },
      { label: 'Retorno QA', value: `${base.itensComRetorno} (${base.totalRetornos}x)` },
    ],
    columns: ['id', 'work_item_type', 'title', 'assigned_to_display', 'state', 'priority', 'iteration_path', 'qa_retorno_count'],
    rows: filteredItems as any[],
  });

  const drawerFields: DrawerField[] = drawerItem ? [
    { label: 'ID', value: drawerItem.id },
    { label: 'Título', value: drawerItem.title },
    { label: 'Tipo', value: drawerItem.work_item_type },
    { label: 'Estado', value: drawerItem.state },
    { label: 'Responsável', value: drawerItem.assigned_to_display },
    { label: 'Prioridade', value: drawerItem.priority != null ? `P${drawerItem.priority}` : '—' },
    { label: 'Retorno QA', value: (drawerItem.qa_retorno_count ?? 0) > 0 
      ? `${drawerItem.qa_retorno_count}x retornos para testes` 
      : 'Nenhum retorno' },
    { label: 'Criado em', value: drawerItem.created_date ? new Date(drawerItem.created_date).toLocaleString('pt-BR') : '—' },
    { label: 'Alterado em', value: drawerItem.changed_date ? new Date(drawerItem.changed_date).toLocaleString('pt-BR') : '—' },
  ] : [];

  // KPIs: when sprint is selected, show scoped data; when 'all', show base (atemporal)
  // Recompute KPI overview from collaborator-filtered items
  const officialOverview = useMemo(() => {
    const items = kpiSourceItems;
    const emTeste = items.filter(i => QUALITY_TESTING_STATES.has(i.state || '')).length;
    const aguardandoDeploy = items.filter(i => QUALITY_DEPLOY_STATES.has(i.state || '')).length;
    const itensComRetorno = items.filter(i => (i.qa_retorno_count ?? 0) > 0).length;
    const totalRetornos = items.reduce((sum, i) => sum + (i.qa_retorno_count ?? 0), 0);
    const avioesTestados = items.filter(i => {
      const hasAviaoTag = (i.tags || '').toUpperCase().includes('AVIAO');
      const testedState = QUALITY_TEST_STATES.has(i.state || '');
      return hasAviaoTag && testedState;
    }).length;
    const filaAtual = items.filter(i => QUALITY_TEST_STATES.has(i.state || '')).length;
    return {
      totalQa: items.length,
      emTeste,
      aguardandoDeploy,
      itensComRetorno,
      totalRetornos,
      avioesTestados,
      filaAtual,
    };
  }, [kpiSourceItems]);

  return (
    <SectorLayout title="Qualidade" subtitle="Gestão à Vista — QA" lastUpdate="" integrations={integrations} areaKey="qualidade" syncFunctions={[{ name: 'devops-sync-qualidade', label: 'Sincronizar Fila Atual da Qualidade' }]}>
      <div className="flex items-center justify-between mb-2">
        <DashboardLastSyncBadge syncedAt={lastSync} status="ok" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {sortedSprints.length > 0 && (
          <Select value={sprintFilter} onValueChange={(v) => { setSprintFilter(v); setCustomActive(false); setKpiFilter('all'); }}>
            <SelectTrigger className="w-[220px] h-8 text-xs">
              <SelectValue placeholder="Sprint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as sprints</SelectItem>
              {[...sortedSprints].reverse().map(sp => (
                <SelectItem key={sp} value={sp}>{sp.split('\\').pop()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {/* Collaborator multi-select filter */}
        {allCollaborators.length > 0 && (
          <Popover open={collaboratorsOpen} onOpenChange={setCollaboratorsOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1 h-8 px-3 text-xs">
                <Users className="h-3.5 w-3.5" />
                Colaboradores ({selectedCollabCount}/{allCollaborators.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Colaboradores contabilizados</p>
              <ScrollArea className="h-[280px]">
                <div className="space-y-1">
                  {allCollaborators.map(name => {
                    const checked = isCollabSelected(name);
                    return (
                      <label key={name} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleCollab(name, v === true)}
                        />
                        <span className="truncate">{name}</span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="border-t mt-2 pt-2 flex gap-1">
                <Button variant="ghost" size="sm" className="text-xs flex-1 h-7" onClick={() => setCollabMode('all')}>
                  Todos
                </Button>
                <Button variant="ghost" size="sm" className="text-xs flex-1 h-7" onClick={() => setCollabMode('default')}>
                  Padrão (4 devs)
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
        <DashboardFilterBar
          preset={customActive ? 'custom' : 'all'}
          onPresetChange={() => { setCustomActive(false); setKpiFilter('all'); }}
          presetLabel={customActive ? 'Custom' : 'Sprint'}
          presets={[]}
          dateFrom={effectiveRange.from}
          dateTo={effectiveRange.to}
          minDate={minDate}
          maxDate={maxDate}
          availableDateKeys={availableDateKeys}
          onCustomRange={(from, to) => { setCustomRange({ from, to }); setCustomActive(true); setKpiFilter('all'); }}
          onExportCSV={handleExportCSV}
          onExportPDF={handleExportPDF}
        />
        {kpiFilter !== 'all' && (
          <Badge variant="default" className="gap-1 text-xs cursor-pointer animate-fade-in" onClick={() => setKpiFilter('all')}>
            Filtro: {filterLabel(kpiFilter)} ✕
          </Badge>
        )}
      </div>

      {isError ? (
        <DashboardEmptyState variant="error" onRetry={() => scoped.refetch()} />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="overview" className="gap-1.5 text-xs"><FileCheck className="h-3.5 w-3.5" />Visão Geral</TabsTrigger>
            <TabsTrigger value="retrabalho" className="gap-1.5 text-xs"><RotateCcw className="h-3.5 w-3.5" />Retrabalho</TabsTrigger>
            <TabsTrigger value="esteira-saude" className="gap-1.5 text-xs"><HeartPulse className="h-3.5 w-3.5" />Esteira / Saúde</TabsTrigger>
            <TabsTrigger value="gargalos" className="gap-1.5 text-xs"><AlertTriangle className="h-3.5 w-3.5" />Gargalos</TabsTrigger>
            <TabsTrigger value="por-feature" className="gap-1.5 text-xs"><Workflow className="h-3.5 w-3.5" />Por Feature</TabsTrigger>
          </TabsList>

          {/* ═══════ TAB: Visão Geral ═══════ */}
          <TabsContent value="overview" className="space-y-4 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Bloco Fila QA */}
              {base.isLoading ? (
                <Card className="p-6"><Skeleton className="h-3 w-24 mb-4" /><Skeleton className="h-9 w-20 mb-2" /><Skeleton className="h-2 w-full rounded-full mb-4" /><div className="grid grid-cols-3 gap-2 pt-4 border-t border-border">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-12 w-full rounded-lg"/>)}</div></Card>
              ) : (
                <Card className="p-6">
                  <p className="text-xs font-medium text-muted-foreground mb-4">FILA QA</p>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Total no escopo</p>
                      <span className="text-4xl font-bold text-foreground">{officialOverview.totalQa}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Fila ativa</p>
                      <span className="text-2xl font-semibold text-[hsl(43,85%,46%)]">{officialOverview.filaAtual}</span>
                    </div>
                  </div>
                  {/* Barra: emTeste | aguardandoDeploy | restante */}
                  {(() => {
                    const total = officialOverview.totalQa || 1;
                    const testePct = (officialOverview.emTeste / total) * 100;
                    const deployPct = (officialOverview.aguardandoDeploy / total) * 100;
                    return (
                      <div className="relative h-2 rounded-full bg-muted overflow-hidden mb-5">
                        <div className="absolute left-0 top-0 h-full bg-[hsl(142,71%,45%)] transition-all duration-500" style={{ width: `${testePct}%` }} />
                        <div className="absolute top-0 h-full bg-[hsl(199,89%,48%)] transition-all duration-500" style={{ left: `${testePct}%`, width: `${deployPct}%` }} />
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border">
                    {[
                      { key: 'all' as QaKpiFilter, label: 'Total QA', value: officialOverview.totalQa, dotColor: 'bg-primary' },
                      { key: 'em_teste' as QaKpiFilter, label: 'Em Teste', value: officialOverview.emTeste, dotColor: 'bg-[hsl(142,71%,45%)]' },
                      { key: 'deploy' as QaKpiFilter, label: 'Ag. Deploy', value: officialOverview.aguardandoDeploy, dotColor: 'bg-[hsl(199,89%,48%)]' },
                    ].map(item => (
                      <button key={item.key} onClick={() => toggleKpi(item.key)}
                        className={`text-left p-2 rounded-lg transition-colors hover:bg-muted/50 focus-visible:outline-none ${kpiFilter === item.key ? 'bg-muted' : ''}`}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <div className={`h-1.5 w-1.5 rounded-full ${item.dotColor}`} />
                          <span className="text-[11px] font-medium text-muted-foreground">{item.label}</span>
                        </div>
                        <span className={`text-xl font-bold ${kpiFilter === item.key ? 'text-foreground' : 'text-foreground'}`}>{item.value}</span>
                      </button>
                    ))}
                  </div>
                </Card>
              )}

              {/* Bloco Qualidade */}
              {base.isLoading ? (
                <Card className="p-6"><Skeleton className="h-3 w-20 mb-4" /><Skeleton className="h-14 w-full mb-3" /><Skeleton className="h-14 w-full" /></Card>
              ) : (
                <Card className="p-6">
                  <p className="text-xs font-medium text-muted-foreground mb-4">QUALIDADE</p>
                  <div className="space-y-0 divide-y divide-border">
                    <button onClick={() => toggleKpi('com_retorno')}
                      className={`w-full text-left flex items-center justify-between py-3 rounded-lg px-2 -mx-2 transition-colors hover:bg-muted/20 ${kpiFilter === 'com_retorno' ? 'bg-muted' : ''}`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg ${officialOverview.itensComRetorno > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                          <RotateCcw className={`h-3.5 w-3.5 ${officialOverview.itensComRetorno > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Retorno QA</p>
                          <p className="text-[11px] text-muted-foreground/70">itens que voltaram para testes</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-2xl font-semibold ${officialOverview.itensComRetorno > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {officialOverview.itensComRetorno}
                        </span>
                        {officialOverview.totalRetornos > 0 && (
                          <p className="text-[11px] text-muted-foreground">{officialOverview.totalRetornos} ciclos</p>
                        )}
                      </div>
                    </button>
                    <button onClick={() => toggleKpi('aviao')}
                      className={`w-full text-left flex items-center justify-between py-3 rounded-lg px-2 -mx-2 transition-colors hover:bg-muted/20 ${kpiFilter === 'aviao' ? 'bg-muted' : ''}`}>
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-[hsl(210,80%,52%)]/10">
                          <Plane className="h-3.5 w-3.5 text-[hsl(210,80%,52%)]" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Aviões testados</p>
                          <p className="text-[11px] text-muted-foreground/70">itens AVIAO em testes ou deploy</p>
                        </div>
                      </div>
                      <span className="text-2xl font-semibold text-foreground">{officialOverview.avioesTestados}</span>
                    </button>
                  </div>
                </Card>
              )}
            </div>


            {!isLoading && filteredItems.length === 0 ? (
              <DashboardEmptyState description={`Nenhum item de qualidade para o filtro "${filterLabel(kpiFilter)}" no período selecionado.`} />
            ) : (
              <DashboardDataTable
                title="Fila da Qualidade"
                subtitle={`${filteredItems.length} registros${kpiFilter !== 'all' ? ` • Filtro: ${filterLabel(kpiFilter)}` : ''}${sprintFilter !== 'all' ? ` • Sprint: ${sprintFilter.split('\\').pop()}` : ' • Todas as sprints'}`}
                columns={tableColumns}
                data={filteredItems}
                isLoading={base.isLoading}
                getRowKey={(r) => String(r.id ?? Math.random())}
                onRowClick={(r) => setDrawerItem(r)}
                searchPlaceholder="Buscar item da fila de QA..."
                onSearchChange={handleTableSearchChange}
                searchBanner={crossSectorBanner}
              />
            )}
          </TabsContent>

          {/* ═══════ TAB: Retrabalho ═══════ */}
          <TabsContent value="retrabalho" className="space-y-4 mt-0">
            {/* Rework filters row */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Collaborator filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-1 h-8 px-3 text-xs">
                    <Users className="h-3.5 w-3.5" />
                    Último retorno por ({reworkSelectedCount}/{reworkReturners.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Último responsável pelo retorno QA→Dev</p>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-1">
                      {reworkReturners.map(name => {
                        const checked = isReworkCollabSelected(name);
                        return (
                          <label key={name} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => toggleReworkCollab(name, v === true)}
                            />
                            <span className="truncate">{name}</span>
                          </label>
                        );
                      })}
                      {reworkReturners.length === 0 && (
                        <p className="text-xs text-muted-foreground px-2 py-4 text-center">Nenhum retorno QA encontrado no histórico.</p>
                      )}
                    </div>
                  </ScrollArea>
                  <div className="border-t mt-2 pt-2 flex gap-1">
                    <Button variant="ghost" size="sm" className="text-xs flex-1 h-7" onClick={() => setReworkCollabMode('all')}>
                      Todos
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs flex-1 h-7" onClick={() => setReworkCollabMode('default')}>
                      Padrão QA
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Min return count filter */}
              <Select value={String(reworkMinCount)} onValueChange={(v) => setReworkMinCount(Number(v))}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Retornos mín." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Todos</SelectItem>
                  <SelectItem value="1">1+ retorno</SelectItem>
                  <SelectItem value="2">2+ retornos</SelectItem>
                  <SelectItem value="3">3+ retornos</SelectItem>
                </SelectContent>
              </Select>

              {reworkCollabMode !== 'all' && (
                <Badge variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setReworkCollabMode('all')}>
                  Filtro: {reworkCollabMode === 'default' ? 'Padrão QA' : `${reworkSelectedCount} selecionados`} ✕
                </Badge>
              )}
            </div>

            {(() => {
              // All done items with rework (historical, not limited by date for the main view)
              const allWithRework = allDoneItems.filter(i => (i.qa_retorno_count ?? 0) >= reworkMinCount);
              // Apply collaborator filter
              const collabFiltered = filterReworkByCollab(allWithRework);
              // Optionally apply date range for date-scoped KPIs
              const rangeFrom = effectiveRange.from;
              const rangeTo = effectiveRange.to;
              const dateFiltered = collabFiltered.filter(i => {
                const cd = i.changed_date ? new Date(i.changed_date) : null;
                return cd && cd >= rangeFrom && cd <= rangeTo;
              });

              const totalDoneInRange = filterReworkByCollab(allDoneItems).filter(i => {
                const cd = i.changed_date ? new Date(i.changed_date) : null;
                return cd && cd >= rangeFrom && cd <= rangeTo;
              }).length;
              const totalReworkItems = dateFiltered.length;
              const totalReworkCycles = dateFiltered.reduce((sum, i) => sum + (i.qa_retorno_count ?? 0), 0);
              const reworkRate = totalDoneInRange > 0 ? Math.round((totalReworkItems / totalDoneInRange) * 100) : 0;
              const avgCycles = totalReworkItems > 0 ? Math.round((totalReworkCycles / totalReworkItems) * 10) / 10 : 0;
              const sorted = [...dateFiltered].sort((a, b) => (b.qa_retorno_count ?? 0) - (a.qa_retorno_count ?? 0));

              // Chart: ranking of returners (top 15)
              const returnerCountMap = new Map<string, number>();
              for (const item of dateFiltered) {
                const who = item.ultimo_responsavel_retorno_qa;
                if (who) returnerCountMap.set(who, (returnerCountMap.get(who) || 0) + 1);
              }
              const rankingData = [...returnerCountMap.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 15)
                .map(([name, count]) => ({
                  name: name.split(' ').slice(0, 2).join(' '),
                  fullName: name,
                  tasks: count,
                }));

              // Chart: distribution by return count
              const distMap = new Map<number, number>();
              for (const item of dateFiltered) {
                const c = item.qa_retorno_count ?? 0;
                distMap.set(c, (distMap.get(c) || 0) + 1);
              }
              const distributionData = [...distMap.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([count, qty]) => ({
                  retornos: `${count}x`,
                  quantidade: qty,
                }));

              const CHART_COLORS = [
                'hsl(var(--primary))',
                'hsl(0, 72%, 51%)',
                'hsl(43, 85%, 46%)',
                'hsl(199, 89%, 48%)',
                'hsl(142, 71%, 45%)',
                'hsl(280, 67%, 50%)',
              ];

              return (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <DashboardKpiCard label="Done (Período)" value={totalDoneInRange} icon={FileCheck} isLoading={reworkQuery.isLoading} />
                    <DashboardKpiCard label={`Com ${reworkMinCount}+ Retorno(s)`} value={totalReworkItems} icon={RotateCcw} accent="bg-destructive" isLoading={reworkQuery.isLoading} delay={80} />
                    <DashboardKpiCard label="Total Ciclos" value={totalReworkCycles} suffix="x" icon={RotateCcw} accent="bg-[hsl(43,85%,46%)]" isLoading={reworkQuery.isLoading} delay={160} />
                    <DashboardKpiCard label="Taxa Retrabalho" value={`${reworkRate}%`} icon={AlertTriangle} accent={reworkRate > 20 ? 'bg-destructive' : 'bg-[hsl(43,85%,46%)]'} isLoading={reworkQuery.isLoading} delay={240} />
                    <DashboardKpiCard label="Média Ciclos" value={avgCycles} suffix="x" icon={TrendingUp} isLoading={reworkQuery.isLoading} delay={320} />
                  </div>

                  {reworkRate > 20 && (
                    <Card className="border-l-4 border-l-destructive p-3">
                      <p className="text-sm text-destructive font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Alerta: {reworkRate}% dos itens Done passaram por retrabalho — indica gargalo no processo Dev→Teste
                      </p>
                    </Card>
                  )}

                  {/* Charts row */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Ranking: tasks retornadas por colaborador */}
                    <Card className="p-4">
                      <h3 className="font-semibold text-sm mb-3">Ranking — Último retorno QA→Dev por colaborador</h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        Colaboradores de teste que realizaram o último retorno ao desenvolvimento em cada task encerrada.
                      </p>
                      {rankingData.length > 0 ? (
                        <ChartContainer config={{ tasks: { label: 'Tasks', color: 'hsl(var(--primary))' } }} className="h-[260px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={rankingData} layout="vertical" margin={{ left: 10, right: 16, top: 4, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                              <XAxis type="number" allowDecimals={false} className="text-xs" />
                              <YAxis dataKey="name" type="category" width={110} className="text-xs" tick={{ fontSize: 11 }} />
                              <ChartTooltip content={<ChartTooltipContent />} />
                              <Bar dataKey="tasks" radius={[0, 4, 4, 0]} maxBarSize={24}>
                                {rankingData.map((_, idx) => (
                                  <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </ChartContainer>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-8">Sem dados para o período.</p>
                      )}
                    </Card>

                    {/* Distribution by return count */}
                    <Card className="p-4">
                      <h3 className="font-semibold text-sm mb-3">Distribuição por Quantidade de Retornos QA</h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        Quantas tasks tiveram 1x, 2x, 3x+ retornos ao desenvolvimento.
                      </p>
                      {distributionData.length > 0 ? (
                        <ChartContainer config={{ quantidade: { label: 'Tasks', color: 'hsl(var(--primary))' } }} className="h-[260px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={distributionData} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                              <XAxis dataKey="retornos" className="text-xs" />
                              <YAxis allowDecimals={false} className="text-xs" />
                              <ChartTooltip content={<ChartTooltipContent />} />
                              <Bar dataKey="quantidade" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                {distributionData.map((_, idx) => (
                                  <Cell key={idx} fill={CHART_COLORS[Math.min(idx, CHART_COLORS.length - 1)]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </ChartContainer>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-8">Sem dados para o período.</p>
                      )}
                    </Card>
                  </div>

                  {/* List of tasks with rework */}
                  <Card className="overflow-hidden">
                    <div className="p-4 border-b border-border">
                      <h3 className="font-semibold text-sm">Tasks Encerradas com Retrabalho ({reworkMinCount}+ retornos QA→Dev)</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Histórico de tasks que saíram de "Em Teste" e voltaram para desenvolvimento antes de serem entregues.
                        O responsável exibido é quem realizou a <strong>última</strong> devolução ao desenvolvimento.
                      </p>
                    </div>
                    <div className="p-4 space-y-2 max-h-[500px] overflow-auto">
                      {sorted.length > 0 ? sorted.map(item => (
                        <div
                          key={`rework-${item.id}`}
                          className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => setDrawerItem(item)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] flex-shrink-0">{item.work_item_type || '—'}</Badge>
                              {item.web_url ? (
                                <a href={item.web_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium truncate text-primary hover:underline" onClick={e => e.stopPropagation()}>
                                  #{item.id} • {item.title}
                                </a>
                              ) : (
                                <p className="text-sm font-medium truncate">#{item.id} • {item.title}</p>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {item.assigned_to_display || 'Sem responsável'}
                              {item.iteration_path ? ` • ${item.iteration_path.split('\\').pop()}` : ''}
                              {item.ultimo_retorno_qa_em ? ` • Último retorno: ${new Date(item.ultimo_retorno_qa_em).toLocaleDateString('pt-BR')}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {item.ultimo_responsavel_retorno_qa && (
                              <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/50 text-amber-700 dark:text-amber-400">
                                <RotateCcw className="h-3 w-3" />
                                {item.ultimo_responsavel_retorno_qa.split(' ').slice(0, 2).join(' ')}
                              </Badge>
                            )}
                            {item.ultimo_estado_destino_retorno && (
                              <Badge variant="outline" className="text-[10px]">
                                → {item.ultimo_estado_destino_retorno}
                              </Badge>
                            )}
                            <Badge variant="destructive" className="text-xs font-mono">
                              {item.qa_retorno_count}x
                            </Badge>
                          </div>
                        </div>
                      )) : (
                        <div className="text-center py-8">
                          <RotateCcw className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">Nenhum item Done com retrabalho encontrado para os filtros atuais.</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">Processo saudável — ou ajuste o filtro de retornos mínimos e período.</p>
                        </div>
                      )}
                    </div>
                  </Card>
                </>
              );
            })()}
          </TabsContent>

          {/* ═══════ TAB: Esteira / Saúde ═══════ */}
          <TabsContent value="esteira-saude" className="space-y-4 mt-0">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <DashboardKpiCard label="PBIs monitorados" value={pbiHealthBatch.overview.total} icon={FileCheck} isLoading={pbiHealthBatch.isLoading} onClick={() => setHealthFilter('all')} active={healthFilter === 'all'} />
              <DashboardKpiCard label="Saudável" value={pbiHealthBatch.overview.verde} icon={HeartPulse} accent="bg-[hsl(142,71%,45%)]" isLoading={pbiHealthBatch.isLoading} onClick={() => setHealthFilter((prev) => prev === 'verde' ? 'all' : 'verde')} active={healthFilter === 'verde'} />
              <DashboardKpiCard label="Atenção" value={pbiHealthBatch.overview.amarelo} icon={AlertTriangle} accent="bg-[hsl(43,85%,46%)]" isLoading={pbiHealthBatch.isLoading} onClick={() => setHealthFilter((prev) => prev === 'amarelo' ? 'all' : 'amarelo')} active={healthFilter === 'amarelo'} />
              <DashboardKpiCard label="Crítica" value={pbiHealthBatch.overview.vermelho} icon={AlertTriangle} accent="bg-destructive" isLoading={pbiHealthBatch.isLoading} onClick={() => setHealthFilter((prev) => prev === 'vermelho' ? 'all' : 'vermelho')} active={healthFilter === 'vermelho'} />
            </div>

            <Card className="overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-sm">Itens na esteira de Qualidade</h3>
                <p className="text-xs text-muted-foreground">Saúde e estado de cada item. {healthFilter !== 'all' ? `Filtro ativo: ${healthFilterLabel(healthFilter)}.` : 'Clique nos KPIs para filtrar.'}</p>
              </div>
              <div className="p-4 space-y-2 max-h-[460px] overflow-auto">
                {healthFilteredItems.length > 0 ? healthFilteredItems
                  .slice(0, 80)
                  .map((item) => {
                    const lifecycle = item.id ? pbiHealthBatch.lifecycleById.get(item.id) : null;
                    const health = item.id ? pbiHealthBatch.healthById.get(item.id)?.health_status : null;
                    return (
                      <div 
                        key={`qa-health-${item.id}`} 
                        className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-2 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => setDrawerItem(item)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] flex-shrink-0">{item.work_item_type || '—'}</Badge>
                            <p className="text-sm font-medium truncate">#{item.id} • {item.title}</p>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {item.state || '—'} • {item.assigned_to_display || 'Sem responsável'}
                            {lifecycle ? ` • Estágio: ${lifecycle.current_stage || '—'}` : ''}
                            {(item.qa_retorno_count ?? 0) > 0 ? ` • Retorno QA: ${item.qa_retorno_count}x` : ''}
                          </p>
                        </div>
                        <PbiHealthBadge status={health} />
                      </div>
                    );
                  }) : (
                  <div className="text-center py-8">
                    <HeartPulse className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhum item na fila de qualidade para o filtro selecionado.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Dados de saúde são populados pela sincronização de esteira.</p>
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* ═══════ TAB: Gargalos ═══════ */}
          <TabsContent value="gargalos" className="space-y-4 mt-0">
            {bottlenecks.overview && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <DashboardKpiCard label="Total monitorados" value={Number(bottlenecks.overview.total_count)} icon={ListTodo} />
                <DashboardKpiCard label="Saudável" value={Number(bottlenecks.overview.verde_count)} icon={HeartPulse} accent="bg-[hsl(142,71%,45%)]" />
                <DashboardKpiCard label="Atenção" value={Number(bottlenecks.overview.amarelo_count)} icon={AlertTriangle} accent="bg-[hsl(43,85%,46%)]" />
                <DashboardKpiCard label="Crítica" value={Number(bottlenecks.overview.vermelho_count)} icon={AlertTriangle} accent="bg-destructive" />
              </div>
            )}
            <Card className="p-3 border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20 mb-2">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p>
                  <span className="font-semibold text-foreground">O que é esta análise?</span>{' '}
                  O painel de gargalos mostra quanto tempo os itens permanecem em cada etapa da esteira de qualidade.
                  Valores altos de <strong>Média</strong> indicam lentidão; <strong>Atraso</strong> alto aponta itens que ultrapassaram os limites aceitáveis (ex: Qualidade &gt;5d = atenção, &gt;10d = crítico).
                </p>
              </div>
            </Card>

            <Card className="p-4 space-y-2">
              <h3 className="font-semibold text-sm">Gargalos de Qualidade</h3>
              <TooltipProvider>
                {bottlenecks.bottlenecks.map((row) => (
                  <div key={`qa-bn-${row.stage_key}`} className="grid grid-cols-1 sm:grid-cols-5 gap-2 rounded-md border border-border/60 p-2 text-xs">
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
                        <p className="text-xs">Itens que ultrapassaram o limite de dias aceitável para esta etapa (ex: Qualidade &gt;5d = atenção, &gt;10d = crítico).</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </TooltipProvider>
              {!bottlenecks.isLoading && bottlenecks.bottlenecks.length === 0 && (
                <div className="text-center py-8">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Sem gargalos para o período selecionado.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Os dados são populados após a sincronização de esteira (pbi_stage_events).</p>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ═══════ TAB: Por Feature ═══════ */}
          <TabsContent value="por-feature" className="space-y-4 mt-0">
            <Card className="p-4 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">Distribuição por Feature</h3>
                <Badge variant="outline">{featureSummary.rows.length} grupos</Badge>
              </div>
              {featureSummary.rows.slice(0, 80).map((row, idx) => (
                <div key={`qa-feature-${row.feature_id ?? idx}`} className="rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{row.feature_title || 'Sem feature'} {row.epic_title ? `• ${row.epic_title}` : ''}</p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {row.verde_count > 0 && <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300 text-[10px] px-1.5">✅ {row.verde_count}</Badge>}
                      {row.amarelo_count > 0 && <Badge className="bg-amber-100 text-amber-700 border border-amber-300 text-[10px] px-1.5">⚠️ {row.amarelo_count}</Badge>}
                      {row.vermelho_count > 0 && <Badge className="bg-red-100 text-red-700 border border-red-300 text-[10px] px-1.5">🔴 {row.vermelho_count}</Badge>}
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
                  <p className="text-sm text-muted-foreground">Sem dados de feature para o filtro atual.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Dados preenchidos automaticamente pela hierarquia do DevOps (Feature → PBI) e saúde da esteira.</p>
                </div>
              )}
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
