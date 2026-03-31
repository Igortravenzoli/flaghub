import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useCustomerServiceKpis, CSKpiItem } from '@/hooks/useCustomerServiceKpis';
import { usePbiHealthBatch } from '@/hooks/usePbiHealthBatch';
import { useSprintFilter } from '@/hooks/useSprintFilter';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { PbiHealthBadge } from '@/components/pbi/PbiHealthBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { Layers, Users, Clock, TrendingUp, Package, Eye, Settings2, HeartPulse, AlertTriangle, Timer, ArrowRight, Target } from 'lucide-react';
import type { Integration } from '@/components/setores/SectorIntegrations';
import { getDateBoundsFromItems } from '@/lib/dateBounds';

type KpiFilter = 'all' | 'fila' | 'impl_andamento' | 'impl_finalizadas' | 'aprovacao_cs' | 'customer_service';
type HealthFilter = 'all' | 'verde' | 'amarelo' | 'vermelho';

const integrations: Integration[] = [
  { name: 'Azure DevOps', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Work Items CS' },
  { name: 'Upload Manual', type: 'database', status: 'up', lastCheck: '', latency: '—', description: 'Implantações & Fila' },
];

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR');
}

function fmtDateStr(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR');
}

/** Alert badge for aging */
function AgingBadge({ level }: { level: 'none' | 'warning' | 'critical' | undefined }) {
  if (!level || level === 'none') return <span className="text-muted-foreground text-xs">OK</span>;
  if (level === 'critical') return <Badge className="bg-destructive text-destructive-foreground text-[10px]">Crítico</Badge>;
  return <Badge className="bg-[hsl(43,85%,46%)] text-[hsl(222,47%,11%)] text-[10px]">Atenção</Badge>;
}

const PIE_COLORS = [
  'hsl(199,89%,48%)', 'hsl(43,85%,46%)', 'hsl(142,71%,45%)',
  'hsl(262,83%,58%)', 'hsl(0,84%,60%)', 'hsl(174,58%,40%)',
  'hsl(29,80%,50%)', 'hsl(340,75%,55%)',
];

const devopsColumns: DataTableColumn<CSKpiItem>[] = [
  { key: 'work_item_id', header: 'ID', className: 'font-mono text-xs w-16', render: r => r.web_url ? (
    <a href={r.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono" onClick={e => e.stopPropagation()}>{r.work_item_id}</a>
  ) : <span>{r.work_item_id || '—'}</span> },
  { key: 'title', header: 'Título', className: 'max-w-[200px] truncate' },
  { key: 'product', header: 'Produto', className: 'text-xs', render: r => r.product ? <Badge variant="outline" className="text-xs">{r.product}</Badge> : <span className="text-muted-foreground text-xs">—</span> },
  { key: 'state', header: 'Estado', render: r => <Badge variant="outline" className="text-xs">{r.state || '—'}</Badge> },
  { key: 'assigned_to_display', header: 'Responsável', className: 'max-w-[120px] truncate' },
  { key: 'priority', header: 'P', className: 'w-10', render: r => r.priority != null ? <Badge className={`text-xs ${r.priority <= 1 ? 'bg-[hsl(0,84%,60%)] text-white' : r.priority <= 2 ? 'bg-[hsl(43,85%,46%)] text-[hsl(222,47%,11%)]' : 'bg-muted text-muted-foreground'}`}>P{r.priority}</Badge> : '—' },
  { key: 'effort', header: 'Esf.', className: 'text-center w-10', render: r => r.effort != null ? <span className="text-sm font-mono">{r.effort}</span> : <span className="text-muted-foreground text-xs">0</span> },
  { key: 'dataAberturaVdesk' as any, header: 'Vdesk', className: 'text-xs w-20', render: r => <span className="text-xs">{fmtDate(r.dataAberturaVdesk)}</span> },
  { key: 'dataInclusaoDevops' as any, header: 'Devops', className: 'text-xs w-20', render: r => <span className="text-xs">{fmtDate(r.dataInclusaoDevops)}</span> },
  { key: 'aging' as any, header: 'Aging', className: 'text-center w-14', render: r => <span className="font-mono text-xs">{r.aging?.agingTotal != null ? `${r.aging.agingTotal}d` : '—'}</span> },
  { key: 'alert' as any, header: 'Alerta', className: 'w-16', render: r => <AgingBadge level={r.aging?.alertLevel} /> },
];

const implColumns: DataTableColumn<CSKpiItem>[] = [
  { key: 'title', header: 'Cliente', className: 'max-w-[200px] truncate font-medium' },
  { key: 'consultor_impl', header: 'Consultor' },
  { key: 'solucao', header: 'Solução' },
  { key: 'status_implantacao', header: 'Status', render: r => <Badge variant="outline" className="text-xs">{r.status_implantacao || '—'}</Badge> },
  { key: 'created_date', header: 'Início', render: r => fmtDateStr(r.created_date) },
  { key: 'changed_date', header: 'Fim', render: r => fmtDateStr(r.changed_date) },
];

export default function CustomerServiceDashboard() {
  const filters = useDashboardFilters('all');
  const [sprintFilter, setSprintFilter] = useState<string>('__pending__');
  const { devopsItems, allItems, implantacoes, totalFilaCS, porResponsavel, implAndamento, implFinalizadas, implTotal, lastSync, isLoading, isError, refetch } = useCustomerServiceKpis(filters.dateFrom, filters.dateTo, sprintFilter);
  const allDevopsItems = allItems.filter(i => i.source === 'devops_queue');
  const { sortedSprints, currentSprint } = useSprintFilter(allDevopsItems.map(i => ({ iteration_path: i.iteration_path || null })));

  useEffect(() => {
    if (sprintFilter === '__pending__' && currentSprint) {
      setSprintFilter(currentSprint);
    }
  }, [currentSprint, sprintFilter]);

  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<CSKpiItem | null>(null);
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('all');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const [activeTab, setActiveTab] = useState<'fila' | 'implantacoes' | 'saude' | 'monitoramento'>('fila');
  const { minDate, maxDate } = useMemo(
    () => getDateBoundsFromItems(allItems, [(i) => i.created_date, (i) => i.changed_date, (i) => i.data_referencia]),
    [allItems]
  );

  const pbiHealthIds = useMemo(
    () => devopsItems
      .filter((i) => i.work_item_id && ['Product Backlog Item', 'User Story', 'Bug'].includes(i.work_item_type || ''))
      .map((i) => i.work_item_id as number),
    [devopsItems]
  );

  const pbiHealthBatch = usePbiHealthBatch(pbiHealthIds, pbiHealthIds.length > 0);

  const devopsColumnsWithHealth = useMemo<DataTableColumn<CSKpiItem>[]>(() => [
    {
      key: 'health',
      header: 'Saúde',
      className: 'w-14',
      render: (r) => <PbiHealthBadge status={r.work_item_id ? pbiHealthBatch.healthById.get(r.work_item_id)?.health_status : null} compact />,
    },
    ...devopsColumns,
  ], [pbiHealthBatch.healthById]);

  // Release 3 — Computed metrics
  const alertCounts = useMemo(() => {
    let warning = 0, critical = 0;
    for (const item of devopsItems) {
      if (item.aging?.alertLevel === 'warning') warning++;
      if (item.aging?.alertLevel === 'critical') critical++;
    }
    return { warning, critical, total: warning + critical };
  }, [devopsItems]);

  const inBacklogCount = useMemo(() => devopsItems.filter(i => i.inBacklog).length, [devopsItems]);

  // State-based KPI counts
  const aprovacaoCSCount = useMemo(() => devopsItems.filter(i => {
    const s = (i.state || '').toLowerCase();
    return s.includes('aprovação') || s.includes('aprovacao');
  }).length, [devopsItems]);

  const customerServiceCount = useMemo(() => devopsItems.filter(i => {
    const s = (i.state || '').toLowerCase();
    return s.includes('customer service') || s.includes('cs');
  }).length, [devopsItems]);

  // Product chart data (Fila CS)
  const productChartData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of devopsItems) {
      const p = i.product || 'Sem produto';
      map[p] = (map[p] || 0) + 1;
    }
    return Object.entries(map).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }));
  }, [devopsItems]);

  // Charts — by solution (implantacoes)
  const solucaoChartData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of implantacoes) {
      const s = i.solucao || 'Não informado';
      map[s] = (map[s] || 0) + 1;
    }
    return Object.entries(map).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }));
  }, [implantacoes]);

  // Implantacoes product chart (from solucao field)
  const implProductChartData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of implantacoes) {
      const p = i.solucao || 'Sem produto';
      map[p] = (map[p] || 0) + 1;
    }
    return Object.entries(map).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }));
  }, [implantacoes]);

  // Charts — by consultant
  const consultorChartData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of implantacoes) {
      const c = i.consultor_impl || 'Não atribuído';
      map[c] = (map[c] || 0) + 1;
    }
    return Object.entries(map).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }));
  }, [implantacoes]);

  // Aging distribution for chart
  const agingDistribution = useMemo(() => {
    const buckets = { '0-7d': 0, '8-14d': 0, '15-30d': 0, '31-60d': 0, '60d+': 0 };
    for (const item of devopsItems) {
      const days = item.aging?.agingTotal;
      if (days == null) continue;
      if (days <= 7) buckets['0-7d']++;
      else if (days <= 14) buckets['8-14d']++;
      else if (days <= 30) buckets['15-30d']++;
      else if (days <= 60) buckets['31-60d']++;
      else buckets['60d+']++;
    }
    return Object.entries(buckets).map(([range, count]) => ({ range, count }));
  }, [devopsItems]);

  const { data: recentBatches = [] } = useQuery({
    queryKey: ['manual_import_batches', 'cs_implantacoes_v1', 'compact'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manual_import_batches')
        .select('id, status, total_rows, valid_rows, invalid_rows, imported_at, published_at, manual_import_templates!manual_import_batches_template_id_fkey(key)')
        .order('imported_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).filter((b: any) => b.manual_import_templates?.key === 'cs_implantacoes_v1').slice(0, 5);
    },
    staleTime: 60 * 1000,
  });

  const respChartData = useMemo(() =>
    Object.entries(porResponsavel)
      .sort(([, a], [, b]) => b - a)
      .map(([resp, qtd]) => ({ resp, qtd })),
    [porResponsavel]
  );

  const filteredDevops = useMemo(() => {
    if (kpiFilter === 'aprovacao_cs') return devopsItems.filter(i => {
      const s = (i.state || '').toLowerCase();
      return s.includes('aprovação') || s.includes('aprovacao');
    });
    if (kpiFilter === 'customer_service') return devopsItems.filter(i => {
      const s = (i.state || '').toLowerCase();
      return s.includes('customer service') || s.includes('cs');
    });
    return devopsItems;
  }, [devopsItems, kpiFilter]);

  const filteredImpl = useMemo(() => {
    const encerradoStatuses = ['finalizado', 'concluído', 'concluido', '8 - encerrado', 'encerrado', '11 - cancelado', 'cancelado'];
    if (kpiFilter === 'impl_andamento') return implantacoes.filter(i => i.status_implantacao && !encerradoStatuses.includes(i.status_implantacao.toLowerCase()));
    if (kpiFilter === 'impl_finalizadas') return implantacoes.filter(i => i.status_implantacao && encerradoStatuses.includes(i.status_implantacao.toLowerCase()));
    return implantacoes;
  }, [implantacoes, kpiFilter]);

  const filteredHealthItems = useMemo(() => {
    if (healthFilter === 'all') return devopsItems;
    return devopsItems.filter((item) => item.work_item_id && pbiHealthBatch.healthById.get(item.work_item_id)?.health_status === healthFilter);
  }, [devopsItems, healthFilter, pbiHealthBatch.healthById]);

  const criticalItems = useMemo(
    () => devopsItems.filter((item) => item.work_item_id && pbiHealthBatch.healthById.get(item.work_item_id)?.health_status === 'vermelho'),
    [devopsItems, pbiHealthBatch.healthById]
  );

  const handleKpiClick = (filter: KpiFilter) => setKpiFilter(prev => prev === filter ? 'all' : filter);
  const handleHealthClick = (filter: HealthFilter) => setHealthFilter((prev) => prev === filter ? 'all' : filter);

  const handleExportCSV = () => exportCSV({
    title: 'Fila Customer Service', area: 'Customer Service', periodLabel: filters.presetLabel,
    columns: ['work_item_id', 'title', 'product', 'state', 'assigned_to_display', 'priority', 'effort', 'query_name'],
    rows: devopsItems as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Dashboard Customer Service', area: 'Customer Service', periodLabel: filters.presetLabel,
    kpis: [
      { label: 'Volume Fila CS', value: totalFilaCS },
      { label: 'Implantações em andamento', value: implAndamento },
      { label: 'Implantações finalizadas', value: implFinalizadas },
      { label: 'Alertas de atraso', value: alertCounts.total },
    ],
    columns: ['work_item_id', 'title', 'state', 'assigned_to_display', 'priority', 'effort'],
    rows: devopsItems as any[],
  });

  // Build drawer fields with timeline (Release 2)
  const drawerFields: DrawerField[] = drawerItem ? [
    { label: 'ID', value: drawerItem.work_item_id },
    { label: 'Título', value: drawerItem.title },
    { label: 'Tipo', value: drawerItem.work_item_type },
    { label: 'Estado', value: drawerItem.state },
    { label: 'Responsável', value: drawerItem.assigned_to_display },
    { label: 'Prioridade', value: drawerItem.priority != null ? `P${drawerItem.priority}` : '—' },
    { label: 'Esforço', value: drawerItem.effort != null ? String(drawerItem.effort) : '0' },
    { label: 'Produto', value: drawerItem.product || '—' },
    { label: 'Tags', value: drawerItem.tags || '—' },
    { label: 'Origem', value: drawerItem.source === 'devops_queue' ? drawerItem.query_name : 'Upload Manual' },
    { label: 'Criado em', value: drawerItem.created_date ? new Date(drawerItem.created_date).toLocaleString('pt-BR') : '—' },
    { label: 'Alterado em', value: drawerItem.changed_date ? new Date(drawerItem.changed_date).toLocaleString('pt-BR') : '—' },
    ...(drawerItem.source === 'manual_implantacao' ? [
      { label: 'Consultor', value: drawerItem.consultor_impl },
      { label: 'Solução', value: drawerItem.solucao },
      { label: 'Status Implantação', value: drawerItem.status_implantacao },
    ] : []),
    // Release 2 — Timeline section
    ...(drawerItem.source === 'devops_queue' ? [
      { label: '── Timeline ──', value: '' },
      { label: 'Data Abertura Vdesk', value: fmtDate(drawerItem.dataAberturaVdesk) },
      { label: 'Data Inclusão Devops', value: fmtDate(drawerItem.dataInclusaoDevops) },
      { label: 'No Backlog (Lantim)', value: drawerItem.inBacklog ? 'Sim' : 'Não' },
      { label: 'Saiu do CS', value: drawerItem.leftCS ? 'Sim' : 'Não' },
      { label: 'Lead Vdesk → Devops', value: drawerItem.aging?.leadTimeVdeskToDevops != null ? `${drawerItem.aging.leadTimeVdeskToDevops} dias` : '—' },
      { label: 'Lead Devops → Agora', value: drawerItem.aging?.leadTimeDevopsToNow != null ? `${drawerItem.aging.leadTimeDevopsToNow} dias` : '—' },
      { label: 'Aging Total', value: drawerItem.aging?.agingTotal != null ? `${drawerItem.aging.agingTotal} dias` : '—' },
      { label: 'Status Alerta', value: (
        <AgingBadge level={drawerItem.aging?.alertLevel} />
      ) },
    ] : []),
    // RN03 — Description
    ...(drawerItem.description ? [{
      label: 'Descrição',
      value: (
        <div className="max-h-[300px] overflow-y-auto rounded-md bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
          {stripHtml(drawerItem.description)}
        </div>
      ),
    }] : []),
  ] : [];

  return (
    <SectorLayout title="Customer Service" subtitle="Dashboard de Gestão — CS" lastUpdate="" integrations={integrations} templateKey="cs_implantacoes_v1" areaKey="customer-service" syncFunctions={[{ name: 'devops-sync-all', label: 'Sincronizar Work Items (DevOps)' }]}>
      <div className="flex items-center justify-between mb-2">
        <DashboardLastSyncBadge syncedAt={lastSync} status="ok" />
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-muted/50 rounded-lg p-1.5">
        <DashboardFilterBar
          preset={filters.preset}
          onPresetChange={(p) => { filters.setPreset(p); setKpiFilter('all'); }}
          presetLabel={filters.presetLabel}
          presetControl="chips"
          presets={[
            { value: 'all', label: 'Todos' },
            { value: '7d', label: '7d' },
            { value: '30d', label: '30d' },
            { value: '90d', label: '90d' },
          ]}
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          minDate={minDate}
          maxDate={maxDate}
          onCustomRange={filters.setCustomRange}
          onExportCSV={handleExportCSV}
          onExportPDF={handleExportPDF}
          showRangeBadge={false}
        />
        {sortedSprints.length > 0 && (
          <>
            <div className="w-px h-6 bg-border" />
            <Select value={sprintFilter} onValueChange={(v) => setSprintFilter(v)}>
              <SelectTrigger className="w-[180px] h-7 text-xs border-none bg-transparent shadow-none">
                <SelectValue placeholder="Sprint" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Sprints</SelectItem>
                {[...sortedSprints].reverse().map(sp => (
                  <SelectItem key={sp} value={sp}>{sp.split('\\').pop()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {isError ? (
        <DashboardEmptyState variant="error" onRetry={() => refetch()} />
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="mb-4 bg-muted/50 p-1">
            <TabsTrigger value="fila" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm" onClick={() => setKpiFilter('all')}>
              <Eye className="h-3.5 w-3.5" />
              Fila CS
            </TabsTrigger>
            <TabsTrigger value="implantacoes" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm" onClick={() => setKpiFilter('all')}>
              <Settings2 className="h-3.5 w-3.5" />
              Implantações
            </TabsTrigger>
            <TabsTrigger value="saude" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm" onClick={() => setKpiFilter('all')}>
              <HeartPulse className="h-3.5 w-3.5" />
              Esteira / Saúde
            </TabsTrigger>
            <TabsTrigger value="monitoramento" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Target className="h-3.5 w-3.5" />
              Monitoramento
            </TabsTrigger>
          </TabsList>

          {/* ═══ TAB: FILA CS ═══ */}
          <TabsContent value="fila" className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
              <DashboardKpiCard label="Volume Fila" value={totalFilaCS} icon={Layers} isLoading={isLoading} onClick={() => handleKpiClick('fila')} active={kpiFilter === 'fila'} />
              <DashboardKpiCard label="Aprovação CS" value={aprovacaoCSCount} icon={Target} isLoading={isLoading} delay={60} accent="bg-[hsl(199,89%,48%)]" onClick={() => handleKpiClick('aprovacao_cs')} active={kpiFilter === 'aprovacao_cs'} />
              <DashboardKpiCard label="Customer Service" value={customerServiceCount} icon={Users} isLoading={isLoading} delay={80} accent="bg-[hsl(174,58%,40%)]" onClick={() => handleKpiClick('customer_service')} active={kpiFilter === 'customer_service'} />
              <DashboardKpiCard label="Responsáveis" value={Object.keys(porResponsavel).length} icon={Users} isLoading={isLoading} delay={100} />
              <DashboardKpiCard label="No Backlog" value={inBacklogCount} icon={ArrowRight} isLoading={isLoading} delay={120} accent="bg-[hsl(262,83%,58%)]" />
              <DashboardKpiCard label="Alertas Atraso" value={alertCounts.total} icon={AlertTriangle} isLoading={isLoading} delay={160} accent={alertCounts.critical > 0 ? 'bg-destructive' : 'bg-[hsl(43,85%,46%)]'} />
              <DashboardKpiCard label="Impl. Ativas" value={implAndamento} icon={Package} isLoading={isLoading} delay={200} accent="bg-[hsl(199,89%,48%)]" onClick={() => { setActiveTab('implantacoes'); handleKpiClick('impl_andamento'); }} />
            </div>

            {respChartData.length > 0 && (
              <Card className="p-5 animate-fade-in">
                <h3 className="font-semibold text-foreground mb-4 text-sm">Volume por Responsável</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={respChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="resp" fontSize={11} stroke="hsl(var(--muted-foreground))" width={120} />
                    <RechartsTooltip />
                    <Bar dataKey="qtd" fill="hsl(43,85%,46%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Product counter chart */}
            {productChartData.length > 0 && (
              <Card className="p-5 animate-fade-in">
                <h3 className="font-semibold text-foreground mb-4 text-sm">Contador por Produto</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={productChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" fontSize={10} stroke="hsl(var(--muted-foreground))" angle={-25} textAnchor="end" height={60} />
                    <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <RechartsTooltip />
                    <Bar dataKey="value" fill="hsl(174,58%,40%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {!isLoading && filteredDevops.length === 0 ? (
              <DashboardEmptyState description="Nenhum item na fila CS para o período selecionado." />
            ) : (
              <DashboardDataTable
                title="Fila Operacional CS"
                subtitle={`${filteredDevops.length} itens${alertCounts.total > 0 ? ` • ${alertCounts.critical} críticos, ${alertCounts.warning} atenção` : ''}`}
                columns={devopsColumnsWithHealth}
                data={filteredDevops}
                isLoading={isLoading}
                getRowKey={(r) => String(r.work_item_id ?? Math.random())}
                onRowClick={(r) => setDrawerItem(r)}
                searchPlaceholder="Buscar item..."
              />
            )}
          </TabsContent>

          {/* ═══ TAB: ESTEIRA / SAÚDE ═══ */}
          <TabsContent value="saude" className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <DashboardKpiCard label="PBIs monitorados" value={pbiHealthBatch.overview.total} icon={Layers} isLoading={pbiHealthBatch.isLoading} onClick={() => handleHealthClick('all')} active={healthFilter === 'all'} />
              <DashboardKpiCard label="Saudável" value={pbiHealthBatch.overview.verde} icon={HeartPulse} isLoading={pbiHealthBatch.isLoading} accent="bg-[hsl(142,71%,45%)]" onClick={() => handleHealthClick('verde')} active={healthFilter === 'verde'} />
              <DashboardKpiCard label="Atenção" value={pbiHealthBatch.overview.amarelo} icon={Clock} isLoading={pbiHealthBatch.isLoading} accent="bg-[hsl(43,85%,46%)]" onClick={() => handleHealthClick('amarelo')} active={healthFilter === 'amarelo'} />
              <DashboardKpiCard label="Crítica" value={pbiHealthBatch.overview.vermelho} icon={AlertTriangle} isLoading={pbiHealthBatch.isLoading} accent="bg-destructive" onClick={() => handleHealthClick('vermelho')} active={healthFilter === 'vermelho'} />
            </div>

            <Card className="p-4 space-y-2">
              <h3 className="font-semibold text-sm">Itens críticos da fila CS</h3>
              {criticalItems.slice(0, 40).map((item) => (
                <div key={`cs-red-${item.work_item_id}`} className="flex items-center justify-between gap-2 rounded-md border border-border/60 p-2 cursor-pointer hover:bg-muted/30" onClick={() => setDrawerItem(item)}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">#{item.work_item_id} • {item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.state || '—'} • {item.assigned_to_display || 'Sem responsável'}{item.aging?.agingTotal != null ? ` • ${item.aging.agingTotal}d aging` : ''}</p>
                  </div>
                  <PbiHealthBadge status="vermelho" />
                </div>
              ))}
              {!pbiHealthBatch.isLoading && criticalItems.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum item crítico para o filtro atual.</p>
              )}
            </Card>

            {!pbiHealthBatch.isLoading && filteredHealthItems.length === 0 ? (
              <DashboardEmptyState description="Nenhum item monitorado na fila CS para o filtro de saúde selecionado." />
            ) : (
              <DashboardDataTable
                title="Esteira / Saúde CS"
                subtitle={`${filteredHealthItems.length} itens monitorados${healthFilter !== 'all' ? ` • filtro ${healthFilter}` : ''}`}
                columns={devopsColumnsWithHealth}
                data={filteredHealthItems}
                isLoading={pbiHealthBatch.isLoading}
                getRowKey={(r) => String(r.work_item_id ?? Math.random())}
                onRowClick={(r) => setDrawerItem(r)}
                searchPlaceholder="Buscar item monitorado..."
              />
            )}
          </TabsContent>

          {/* ═══ TAB: IMPLANTAÇÕES ═══ */}
          <TabsContent value="implantacoes" className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <DashboardKpiCard label="Total Implantações" value={implTotal} icon={Package} isLoading={isLoading} onClick={() => handleKpiClick('all')} active={kpiFilter === 'all'} />
              <DashboardKpiCard label="Em Andamento" value={implAndamento} icon={Clock} isLoading={isLoading} delay={80} accent="bg-[hsl(43,85%,46%)]" onClick={() => handleKpiClick('impl_andamento')} active={kpiFilter === 'impl_andamento'} />
              <DashboardKpiCard label="Finalizadas" value={implFinalizadas} icon={TrendingUp} isLoading={isLoading} delay={160} accent="bg-[hsl(142,71%,45%)]" onClick={() => handleKpiClick('impl_finalizadas')} active={kpiFilter === 'impl_finalizadas'} />
            </div>

            {!isLoading && filteredImpl.length === 0 ? (
              <DashboardEmptyState description="Nenhuma implantação para o período selecionado." />
            ) : (
              <DashboardDataTable
                title="Implantações"
                subtitle={`${filteredImpl.length} registros`}
                columns={implColumns}
                data={filteredImpl}
                isLoading={isLoading}
                getRowKey={(r) => `${r.title ?? ''}-${r.created_date ?? ''}`}
                onRowClick={(r) => setDrawerItem(r)}
                searchPlaceholder="Buscar implantação..."
              />
            )}
          </TabsContent>

          {/* ═══ TAB: MONITORAMENTO (Release 3) ═══ */}
          <TabsContent value="monitoramento" className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <DashboardKpiCard label="Alertas Críticos" value={alertCounts.critical} icon={AlertTriangle} isLoading={isLoading} accent="bg-destructive" />
              <DashboardKpiCard label="Alertas Atenção" value={alertCounts.warning} icon={Timer} isLoading={isLoading} accent="bg-[hsl(43,85%,46%)]" />
              <DashboardKpiCard label="No Backlog" value={inBacklogCount} icon={ArrowRight} isLoading={isLoading} accent="bg-[hsl(262,83%,58%)]" />
              <DashboardKpiCard label="Saíram do CS" value={devopsItems.filter(i => i.leftCS).length} icon={TrendingUp} isLoading={isLoading} accent="bg-[hsl(142,71%,45%)]" />
            </div>

            {/* Aging distribution chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-5">
                <h3 className="font-semibold text-sm mb-4">Distribuição de Aging (dias)</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={agingDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="range" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <RechartsTooltip />
                    <Bar dataKey="count" fill="hsl(199,89%,48%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {solucaoChartData.length > 0 && (
                <Card className="p-5">
                  <h3 className="font-semibold text-sm mb-4">Implantações por Solução</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={solucaoChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                        {solucaoChartData.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </div>

            {/* Consultant workload */}
            {consultorChartData.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-sm mb-4">Carga por Consultor (Implantações)</h3>
                <ResponsiveContainer width="100%" height={Math.max(180, consultorChartData.length * 32)}>
                  <BarChart data={consultorChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={130} />
                    <RechartsTooltip />
                    <Bar dataKey="value" fill="hsl(262,83%,58%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Delayed items list */}
            {alertCounts.total > 0 && (
              <Card className="p-4 space-y-2">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Itens com Atraso ({alertCounts.total})
                </h3>
                {devopsItems
                  .filter(i => i.aging?.alertLevel && i.aging.alertLevel !== 'none')
                  .sort((a, b) => (b.aging?.agingTotal ?? 0) - (a.aging?.agingTotal ?? 0))
                  .slice(0, 50)
                  .map((item) => (
                    <div key={`alert-${item.work_item_id}`} className="flex items-center justify-between gap-2 rounded-md border border-border/60 p-2 cursor-pointer hover:bg-muted/30" onClick={() => setDrawerItem(item)}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">#{item.work_item_id} • {item.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.assigned_to_display || 'Sem responsável'}
                          {item.aging?.leadTimeVdeskToDevops != null ? ` • Vdesk→Devops: ${item.aging.leadTimeVdeskToDevops}d` : ''}
                          {item.aging?.agingTotal != null ? ` • Total: ${item.aging.agingTotal}d` : ''}
                        </p>
                      </div>
                      <AgingBadge level={item.aging?.alertLevel} />
                    </div>
                  ))}
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      <DashboardDrawer
        open={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        title={drawerItem?.title || undefined}
        subtitle={drawerItem?.work_item_type || undefined}
        fields={drawerFields}
        workItemId={drawerItem?.work_item_id}
        workItemType={drawerItem?.work_item_type}
        externalUrl={drawerItem?.web_url}
      />
    </SectorLayout>
  );
}
