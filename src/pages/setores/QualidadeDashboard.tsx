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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FileCheck, Clock, TrendingUp, BarChart3, RotateCcw, Plane, HeartPulse, Workflow, AlertTriangle, ListTodo, Users } from 'lucide-react';
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
  // Retrabalho tab has its own collaborator filter (default = 4 devs)
  const [reworkCollabMode, setReworkCollabMode] = useState<'default' | 'all' | 'custom'>('default');
  const [reworkCustomCollabs, setReworkCustomCollabs] = useState<Set<string>>(new Set());
  // "base" = atemporal/macro, sem filtro de sprint — para os KPIs do topo
  const base = useQualidadeKpis(undefined, undefined, 'all');
  const { allItems, lastSync, isLoading, isError } = base;

  // Fetch ALL Done items + their qa_return_count from lifecycle summary
  const reworkQuery = useQuery({
    queryKey: ['qualidade', 'rework-done-all'],
    queryFn: async () => {
      const doneStates = ['Done', 'Closed', 'Resolved'];
      // 1) Fetch all done work items (paginated)
      const allDoneItems: any[] = [];
      for (const st of doneStates) {
        let from = 0;
        const PAGE = 1000;
        while (true) {
          const { data } = await supabase
            .from('devops_work_items')
            .select('id, title, work_item_type, state, assigned_to_display, priority, iteration_path, created_date, changed_date, web_url, tags, state_history')
            .eq('state', st)
            .range(from, from + PAGE - 1);
          if (!data || data.length === 0) break;
          allDoneItems.push(...data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
      }
      if (allDoneItems.length === 0) return [];

      // 2) Fetch qa_return_count for those IDs from lifecycle summary
      const ids = allDoneItems.map(w => w.id);
      const retornoMap = new Map<number, number>();
      for (let i = 0; i < ids.length; i += 1000) {
        const chunk = ids.slice(i, i + 1000);
        const { data: lcData } = await (supabase as any)
          .from('pbi_lifecycle_summary')
          .select('work_item_id, qa_return_count')
          .in('work_item_id', chunk);
        for (const row of (lcData || [])) {
          if (row.qa_return_count > 0) {
            retornoMap.set(row.work_item_id, row.qa_return_count);
          }
        }
      }

      // 3) Extract who from QA returned each item to dev (Em Teste → dev state)
      const returnedByMap = new Map<number, string[]>();
      const QA_STATES = new Set(['Em Teste']);
      const DEV_STATES = new Set(['Em desenvolvimento', 'In Progress', 'To Do', 'New', 'Committed', 'Prioritized']);
      for (const w of allDoneItems) {
        if (w.state_history && Array.isArray(w.state_history)) {
          const returners: string[] = [];
          for (let ri = 1; ri < w.state_history.length; ri++) {
            const prev = w.state_history[ri - 1] as any;
            const curr = w.state_history[ri] as any;
            const prevState = prev?.newValue;
            const currNewState = curr?.newValue;
            // Transition: was in "Em Teste" → moved to a dev state
            if (prevState && QA_STATES.has(prevState) && currNewState && DEV_STATES.has(currNewState)) {
              const who = typeof curr?.revisedBy === 'string' ? curr.revisedBy : (curr?.revisedBy?.displayName || curr?.revisedBy?.uniqueName || null);
              if (who && !returners.includes(who)) returners.push(who);
            }
          }
          if (returners.length > 0) returnedByMap.set(w.id, returners);
        }
      }

      return allDoneItems.map((w: any): QualidadeItem => ({
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
        qa_retorno_count: retornoMap.get(w.id) ?? 0,
        returned_by: (returnedByMap.get(w.id) || []).join(', ') || null,
      }));
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
    // Also include done items collaborators for Retrabalho tab
    for (const item of allDoneItems) {
      if (item.assigned_to_display) nameSet.add(item.assigned_to_display);
    }
    return [...nameSet].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allItems, allDoneItems]);

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
    () => allCollaborators.filter(isReworkCollabSelected).length,
    [allCollaborators, isReworkCollabSelected]
  );

  const toggleReworkCollab = useCallback((name: string, checked: boolean) => {
    setReworkCollabMode('custom');
    setReworkCustomCollabs(prev => {
      let next: Set<string>;
      if (reworkCollabMode !== 'custom') {
        next = new Set(allCollaborators.filter(isReworkCollabSelected));
      } else {
        next = new Set(prev);
      }
      if (checked) next.add(name); else next.delete(name);
      return next;
    });
  }, [reworkCollabMode, allCollaborators, isReworkCollabSelected]);

  const filterReworkByCollab = useCallback((items: QualidadeItem[]): QualidadeItem[] => {
    if (reworkCollabMode === 'all') return items;
    return items.filter(i => {
      // Filter by who from QA returned the task (returned_by), not assigned_to
      const returnedBy = i.returned_by;
      if (!returnedBy) return false;
      // returned_by may contain multiple names comma-separated
      const names = returnedBy.split(',').map(n => n.trim());
      return names.some(name => isReworkCollabSelected(name));
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
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              <DashboardKpiCard label="Total QA" value={officialOverview.totalQa} icon={FileCheck} isLoading={base.isLoading} onClick={() => toggleKpi('all')} active={kpiFilter === 'all'} tooltipFormula="COUNT(itens QA no escopo)" tooltipDescription="Total de itens de qualidade no recorte atual." />
              <DashboardKpiCard label="Em Teste" value={officialOverview.emTeste} icon={TrendingUp} isLoading={base.isLoading} delay={80} accent="bg-[hsl(142,71%,45%)]" onClick={() => toggleKpi('em_teste')} active={kpiFilter === 'em_teste'} tooltipFormula="COUNT(state = Em Teste)" tooltipDescription="Itens efetivamente em execução de testes no escopo filtrado." />
              <DashboardKpiCard label="Aguardando Deploy" value={officialOverview.aguardandoDeploy} icon={BarChart3} isLoading={base.isLoading} delay={160} accent="bg-[hsl(199,89%,48%)]" onClick={() => toggleKpi('deploy')} active={kpiFilter === 'deploy'} tooltipFormula="COUNT(state = Aguardando Deploy)" tooltipDescription="Itens já testados e aguardando janela de deploy." />
              <DashboardKpiCard label="Retorno QA" value={officialOverview.itensComRetorno} suffix={officialOverview.totalRetornos > 0 ? ` (${officialOverview.totalRetornos}x)` : ''} icon={RotateCcw} isLoading={base.isLoading} delay={240} accent="bg-[hsl(0,72%,51%)]" onClick={() => toggleKpi('com_retorno')} active={kpiFilter === 'com_retorno'} tooltipFormula="COUNT(itens com qa_retorno_count > 0)" tooltipDescription="Itens que retornaram para nova rodada de testes após a primeira entrada." />
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <DashboardKpiCard label="Aviões testados" value={officialOverview.avioesTestados} icon={Plane} isLoading={base.isLoading} delay={320} accent="bg-[hsl(210,80%,52%)]" onClick={() => toggleKpi('aviao')} active={kpiFilter === 'aviao'} tooltipFormula="COUNT(tags ILIKE '%AVIAO%' AND state IN Testing, Done, Closed, Resolved)" tooltipDescription="Itens com tag AVIAO que já passaram por etapa de teste." />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[240px]">
                    Itens com tag AVIAO em estado de teste ou deploy. Clique para filtrar.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DashboardKpiCard label="Fila Atual" value={officialOverview.filaAtual} icon={Clock} isLoading={base.isLoading} delay={400} accent="bg-[hsl(43,85%,46%)]" tooltipFormula="COUNT(state IN Em Teste, Aguardando Deploy)" tooltipDescription="Fila atual oficial da Qualidade, incluindo itens herdados de sprints passadas." />
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
            {/* Rework-specific collaborator filter */}
            <div className="flex items-center gap-3 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-1 h-8 px-3 text-xs">
                    <Users className="h-3.5 w-3.5" />
                    Responsável ({reworkSelectedCount}/{allCollaborators.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Filtrar por quem encerrou</p>
                  <ScrollArea className="h-[280px]">
                    <div className="space-y-1">
                      {allCollaborators.map(name => {
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
                    </div>
                  </ScrollArea>
                  <div className="border-t mt-2 pt-2 flex gap-1">
                    <Button variant="ghost" size="sm" className="text-xs flex-1 h-7" onClick={() => setReworkCollabMode('all')}>
                      Todos
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs flex-1 h-7" onClick={() => setReworkCollabMode('default')}>
                      Padrão (4 devs)
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              {reworkCollabMode !== 'all' && (
                <Badge variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setReworkCollabMode('all')}>
                  Filtro: {reworkCollabMode === 'default' ? 'Padrão (4 devs)' : `${reworkSelectedCount} selecionados`} ✕
                </Badge>
              )}
            </div>

            {(() => {
              // Filter done items by the active date range + rework-specific collaborator filter
              const rangeFrom = effectiveRange.from;
              const rangeTo = effectiveRange.to;
              const doneItems = filterReworkByCollab(allDoneItems).filter(i => {
                const cd = i.changed_date ? new Date(i.changed_date) : null;
                if (!cd) return false;
                return cd >= rangeFrom && cd <= rangeTo;
              });
              const doneWithRework = doneItems.filter(i => (i.qa_retorno_count ?? 0) > 0);
              const totalDone = doneItems.length;
              const totalReworkItems = doneWithRework.length;
              const totalReworkCycles = doneWithRework.reduce((sum, i) => sum + (i.qa_retorno_count ?? 0), 0);
              const reworkRate = totalDone > 0 ? Math.round((totalReworkItems / totalDone) * 100) : 0;
              const avgCycles = totalReworkItems > 0 ? Math.round((totalReworkCycles / totalReworkItems) * 10) / 10 : 0;
              const sorted = [...doneWithRework].sort((a, b) => (b.qa_retorno_count ?? 0) - (a.qa_retorno_count ?? 0));

              return (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <DashboardKpiCard label="Done (Total)" value={totalDone} icon={FileCheck} isLoading={base.isLoading} />
                    <DashboardKpiCard label="Com Retrabalho" value={totalReworkItems} icon={RotateCcw} accent="bg-[hsl(0,72%,51%)]" isLoading={base.isLoading} delay={80} />
                    <DashboardKpiCard label="Total Ciclos" value={totalReworkCycles} suffix="x" icon={RotateCcw} accent="bg-[hsl(43,85%,46%)]" isLoading={base.isLoading} delay={160} />
                    <DashboardKpiCard label="Taxa Retrabalho" value={`${reworkRate}%`} icon={AlertTriangle} accent={reworkRate > 20 ? 'bg-destructive' : 'bg-[hsl(43,85%,46%)]'} isLoading={base.isLoading} delay={240} />
                    <DashboardKpiCard label="Média Ciclos" value={avgCycles} suffix="x" icon={TrendingUp} isLoading={base.isLoading} delay={320} />
                  </div>

                  {reworkRate > 20 && (
                    <Card className="border-l-4 border-l-destructive p-3">
                      <p className="text-sm text-destructive font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Alerta: {reworkRate}% dos itens Done passaram por retrabalho — indica gargalo no processo Dev→Teste
                      </p>
                    </Card>
                  )}

                  <Card className="overflow-hidden">
                    <div className="p-4 border-b border-border">
                      <h3 className="font-semibold text-sm">Itens Done com Retrabalho (Dev → Teste → Dev)</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        PBIs que retornaram ao desenvolvimento após testes antes de serem entregues. Cada ciclo indica uma passagem adicional por "Em Teste".
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
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {item.returned_by && (
                              <Badge variant="outline" className="text-[10px] gap-1 border-amber-400 text-amber-700 dark:text-amber-400">
                                <RotateCcw className="h-3 w-3" />
                                {item.returned_by.split(',').map(n => n.trim().split(' ').slice(0, 2).join(' ')).join(', ')}
                              </Badge>
                            )}
                            <Badge variant="destructive" className="text-xs font-mono">
                              {item.qa_retorno_count}x retornos
                            </Badge>
                          </div>
                        </div>
                      )) : (
                        <div className="text-center py-8">
                          <RotateCcw className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">Nenhum item Done com retrabalho encontrado.</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">Itens Done sem retorno ao desenvolvimento — processo saudável.</p>
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
