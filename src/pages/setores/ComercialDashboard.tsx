import { useMemo, useState } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn, ColumnFilter } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { PbiHealthBadge } from '@/components/pbi/PbiHealthBadge';
import { useComercialKpis, ComercialClient, ClientStatusFilter } from '@/hooks/useComercialKpis';
import { useDevopsOperationalQueue } from '@/hooks/useDevopsOperationalQueue';
import { usePbiHealthBatch } from '@/hooks/usePbiHealthBatch';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { UserCheck, ShieldBan, HeartPulse, AlertTriangle, Layers, MoreHorizontal, Eye, EyeOff, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getDateBoundsFromItems } from '@/lib/dateBounds';
import { CHART_COLORS } from '@/lib/chartColors';
import type { Integration } from '@/components/setores/SectorIntegrations';
import MovimentacaoTab from '@/components/comercial/MovimentacaoTab';
import { PesquisaTab } from '@/components/comercial/PesquisaTab';
import { PipeDriveTab } from '@/components/comercial/PipeDriveTab';
import MetasTab from '@/components/comercial/MetasTab';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useHubAreas } from '@/hooks/useHubAreas';
import { useHubIsAdmin } from '@/hooks/useHubPermissions';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

const INTERNAL_CLIENT_LIST = [
  { id: 924, label: 'Flag (Outros)' },
  { id: 1528, label: 'Padrao Froneri' },
  { id: 1636, label: 'Qa Flag' },
  { id: 1853, label: 'Suporte Flag' },
] as const;
const INTERNAL_IDS = new Set(INTERNAL_CLIENT_LIST.map(c => c.id));

type HealthFilter = 'all' | 'verde' | 'amarelo' | 'vermelho';

const integrations: Integration[] = [
  { name: 'Flag.Ai.Gateway', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Clientes VDesk' },
];

const columns: DataTableColumn<ComercialClient>[] = [
  { key: 'id', header: 'ID', className: 'font-mono text-xs w-16' },
  { key: 'nome', header: 'Nome', className: 'max-w-[250px] truncate font-medium' },
  { key: 'apelido', header: 'Apelido' },
  { key: 'bandeira', header: 'Bandeira', render: (r) => r.bandeira ? <Badge variant="outline" className="text-xs">{r.bandeira}</Badge> : '—' },
  { key: 'sistemas_label', header: 'Sistemas', className: 'max-w-[200px] truncate text-xs text-muted-foreground' },
  {
    key: 'status', header: 'Status', render: (r) => {
      const s = r.status?.toLowerCase();
      const variant = s === 'ativo' ? 'default' : s === 'bloqueado' ? 'destructive' : 'secondary';
      return <Badge variant={variant} className="text-xs">{r.status || '—'}</Badge>;
    }
  },
];

const tableColumnFilters: ColumnFilter[] = [
  { key: 'nome', label: 'Nome' },
  { key: 'apelido', label: 'Apelido' },
  { key: 'bandeira', label: 'Bandeira' },
  {
    key: 'sistemas_label',
    label: 'Sistemas',
    extractValue: (row: ComercialClient) =>
      row.sistemas_label ? row.sistemas_label.split(',').map((s: string) => s.trim()).filter(Boolean) : null,
  },
  { key: 'status', label: 'Status' },
];

const operationalColumns = [
  {
    key: 'work_item_id',
    header: 'ID',
    className: 'font-mono text-xs w-16',
    render: (row: any) => row.web_url ? (
      <a href={row.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono" onClick={(event) => event.stopPropagation()}>
        {row.work_item_id || '—'}
      </a>
    ) : (row.work_item_id || '—'),
  },
  { key: 'work_item_type', header: 'Tipo', render: (row: any) => <Badge variant="outline" className="text-xs">{row.work_item_type || '—'}</Badge> },
  { key: 'title', header: 'Título', className: 'max-w-[360px] truncate' },
  { key: 'assigned_to_display', header: 'Responsável' },
  { key: 'state', header: 'Status', render: (row: any) => <Badge variant="secondary" className="text-xs">{row.state || '—'}</Badge> },
  { key: 'priority', header: 'Prior.', render: (row: any) => row.priority != null ? `P${row.priority}` : '—' },
  { key: 'iteration_path', header: 'Sprint', className: 'text-xs text-muted-foreground max-w-[180px] truncate', render: (row: any) => row.iteration_path ? (row.iteration_path.split('\\').pop() || row.iteration_path) : '—' },
] as DataTableColumn<any>[];

export default function ComercialDashboard() {
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>('ativo');
  const [activeTab, setActiveTab] = useState('visao-clientes');
  const [selectedBandeira, setSelectedBandeira] = useState<string | null>(null);
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const currentYear = new Date().getFullYear();
  const filters = useDashboardFilters('1y');
  const { clients, allClients, totalClientes, bandeiras, stats, lastSync, isLoading, isError, refetch } = useComercialKpis(statusFilter, filters.dateFrom, filters.dateTo);
  const operational = useDevopsOperationalQueue(['04-Em Fila Comercial']);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerClient, setDrawerClient] = useState<ComercialClient | null>(null);
  const [drawerOperacionalItem, setDrawerOperacionalItem] = useState<any | null>(null);

  const { isOwner } = useHubAreas();
  const isHubAdmin = useHubIsAdmin();
  const canViewValues = isOwner('comercial') || isHubAdmin;
  const [showValues, setShowValues] = useState(false);

  const [tableExpanded, setTableExpanded] = useState(false);
  const [visibleInternalIds, setVisibleInternalIds] = useState<number[]>([]);
  const visibleInternalSet = useMemo(() => new Set(visibleInternalIds), [visibleInternalIds]);
  // displayClients usa allClients (sem filtro de data) para garantir que os 4 internos
  // sejam sempre removidos, mesmo que tenham synced_at antigo fora do período selecionado.
  const displayClients = useMemo(
    () => allClients.filter(c => !INTERNAL_IDS.has(Number(c.id)) || visibleInternalSet.has(Number(c.id))),
    [allClients, visibleInternalSet]
  );
  const hiddenInternalCount = INTERNAL_CLIENT_LIST.length - visibleInternalIds.length;
  const hiddenInternalActiveCount = useMemo(
    () => allClients.filter(c => INTERNAL_IDS.has(Number(c.id)) && !visibleInternalSet.has(Number(c.id))).length,
    [allClients, visibleInternalSet]
  );

  const { minDate, maxDate } = useMemo(
    () => getDateBoundsFromItems(clients, [(c) => c.synced_at]),
    [clients]
  );

  const clientInsights = useMemo(() => {
    const semBandeira = displayClients.filter((client) => !client.bandeira || !client.bandeira.trim()).length;
    const multissistema = displayClients.filter((client) => {
      const systems = client.sistemas_label
        ?.split(',')
        .map((system) => system.trim())
        .filter(Boolean) ?? [];
      return systems.length > 1;
    }).length;
    const mediaSistemas = displayClients.length > 0
      ? Math.round((displayClients.reduce((total, client) => {
          const systems = client.sistemas_label
            ?.split(',')
            .map((system) => system.trim())
            .filter(Boolean) ?? [];
          return total + systems.length;
        }, 0) / displayClients.length) * 10) / 10
      : 0;

    return {
      semBandeira,
      multissistema,
      mediaSistemas,
    };
  }, [displayClients]);

  const sistemasUnicos = useMemo(() => {
    const set = new Set<string>();
    allClients.forEach(c => {
      c.sistemas_label?.split(',').map((s: string) => s.trim()).filter(Boolean).forEach((s: string) => set.add(s));
    });
    return [...set].sort();
  }, [allClients]);

  const sistemaChartData = useMemo(() => {
    const source = (statusFilter === 'todos' || statusFilter === 'ativo')
      ? displayClients.filter(c => c.status?.toLowerCase() === 'ativo')
      : displayClients;
    const target = selectedBandeira ? source.filter(c => (c.bandeira || 'Sem bandeira') === selectedBandeira) : source;
    const map = new Map<string, number>();
    target.forEach(c => {
      const sistemas = c.sistemas_label?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
      if (sistemas.length === 0) {
        map.set('Sem sistema', (map.get('Sem sistema') || 0) + 1);
      } else {
        sistemas.forEach(s => map.set(s, (map.get(s) || 0) + 1));
      }
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [displayClients, statusFilter, selectedBandeira]);

  const operacionalItems = operational.items.filter(i => i.query_name === '04-Em Fila Comercial');
  const pbiHealthIds = useMemo(
    () => operacionalItems
      .filter((item) => item.work_item_id && ['Product Backlog Item', 'User Story', 'Bug'].includes(item.work_item_type || ''))
      .map((item) => item.work_item_id as number),
    [operacionalItems]
  );
  const pbiHealthBatch = usePbiHealthBatch(pbiHealthIds, pbiHealthIds.length > 0);

  const operationalColumnsWithHealth = useMemo<DataTableColumn<any>[]>(() => [
    {
      key: 'health',
      header: 'Saúde',
      className: 'w-20',
      render: (row) => <PbiHealthBadge status={row.work_item_id ? pbiHealthBatch.healthById.get(row.work_item_id)?.health_status : null} compact />,
    },
    ...operationalColumns,
  ], [pbiHealthBatch.healthById]);

  const healthFilteredItems = useMemo(() => {
    if (healthFilter === 'all') return operacionalItems;
    return operacionalItems.filter((item) => item.work_item_id && pbiHealthBatch.healthById.get(item.work_item_id)?.health_status === healthFilter);
  }, [healthFilter, operacionalItems, pbiHealthBatch.healthById]);

  const handleExportCSV = () => exportCSV({
    title: 'Base de Clientes', area: 'Comercial', periodLabel: filters.presetLabel,
    columns: ['id', 'nome', 'apelido', 'bandeira', 'sistemas_label', 'status'],
    rows: displayClients as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Base de Clientes', area: 'Comercial', periodLabel: filters.presetLabel,
    kpis: [
      { label: 'Ativos', value: Math.max(0, stats.ativos - hiddenInternalActiveCount) },
      { label: 'Bloqueados', value: stats.bloqueados },
    ],
    columns: ['id', 'nome', 'apelido', 'bandeira', 'status'],
    rows: displayClients as any[],
  });

  const drawerFields: DrawerField[] = drawerClient ? [
    { label: 'ID', value: drawerClient.id },
    { label: 'Nome', value: drawerClient.nome },
    { label: 'Apelido', value: drawerClient.apelido },
    { label: 'Bandeira', value: drawerClient.bandeira },
    { label: 'Status', value: drawerClient.status },
    { label: 'Sistemas', value: drawerClient.sistemas_label },
    { label: 'Última Sync', value: drawerClient.synced_at ? new Date(drawerClient.synced_at).toLocaleString('pt-BR') : '—' },
  ] : [];

  const handleKpiClick = (filter: ClientStatusFilter) => {
    setStatusFilter(prev => prev === filter ? 'todos' : filter);
  };

  const handleHealthClick = (filter: HealthFilter) => {
    setHealthFilter((prev) => prev === filter ? 'all' : filter);
  };

  return (
    <SectorLayout title="Comercial" subtitle="Base de Clientes — Gateway/VDesk" lastUpdate="" integrations={integrations} areaKey="comercial" syncFunctions={[{ name: 'vdesk-sync-base-clientes', label: 'Sincronizar Base de Clientes (VDesk)' }]}>
      <div className="flex items-center justify-between mb-2">
        <DashboardLastSyncBadge syncedAt={lastSync} status="ok" />
        {canViewValues && (
          <button
            type="button"
            onClick={() => setShowValues(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/60"
            title={showValues ? 'Ocultar valores monetários' : 'Exibir valores monetários'}
          >
            {showValues ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      <DashboardFilterBar
        preset={filters.preset}
        onPresetChange={filters.setPreset}
        presetLabel={filters.presetLabel}
        presetControl="dropdown"
        presetsLabel="Período"
        presets={[
          { value: 'mes_atual', label: 'Mês atual' },
          { value: 'mes_anterior', label: 'Mês anterior' },
          { value: 'jan', label: `Jan ${currentYear}` },
          { value: 'fev', label: `Fev ${currentYear}` },
          { value: 'mar', label: `Mar ${currentYear}` },
          { value: 'abr', label: `Abr ${currentYear}` },
          { value: 'mai', label: `Mai ${currentYear}` },
          { value: 'jun', label: `Jun ${currentYear}` },
          { value: 'jul', label: `Jul ${currentYear}` },
          { value: 'ago', label: `Ago ${currentYear}` },
          { value: 'set', label: `Set ${currentYear}` },
          { value: 'out', label: `Out ${currentYear}` },
          { value: 'nov', label: `Nov ${currentYear}` },
          { value: 'dez', label: `Dez ${currentYear}` },
          { value: 'q1', label: `1º Tri ${currentYear}` },
          { value: 'q2', label: `2º Tri ${currentYear}` },
          { value: 'q3', label: `3º Tri ${currentYear}` },
          { value: 'q4', label: `4º Tri ${currentYear}` },
          { value: '1y', label: `Ano ${currentYear}` },
        ]}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        minDate={minDate}
        maxDate={maxDate}
        onCustomRange={filters.setCustomRange}
        onRefresh={() => refetch()}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
      />

      {isError ? (
        <DashboardEmptyState variant="error" onRetry={() => refetch()} />
      ) : (

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-full overflow-x-auto">
            <TabsList className="bg-transparent p-0 h-auto gap-0.5 flex-shrink-0">
              <TabsTrigger value="visao-clientes" className="text-xs h-8">Visão Clientes</TabsTrigger>
              <TabsTrigger value="ganho-perda" className="text-xs h-8">Ganho/Perda</TabsTrigger>
              <TabsTrigger value="fechamento-comercial" className="text-xs h-8">Fechamento Comercial</TabsTrigger>
              <TabsTrigger value="pesquisa" className="text-xs h-8">Pesquisa Satisfação</TabsTrigger>
              <TabsTrigger value="metas" className="text-xs h-8">Metas</TabsTrigger>
            </TabsList>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition-colors flex-shrink-0 ml-auto
                  ${activeTab === 'esteira-saude'
                    ? 'bg-background shadow-sm text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/60'}`}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  Mais
                  {activeTab === 'esteira-saude' && (
                    <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={() => setActiveTab('esteira-saude')}
                  className={`gap-2 text-xs ${activeTab === 'esteira-saude' ? 'font-medium text-primary' : ''}`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Esteira / Saúde
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <TabsContent value="visao-clientes" className="space-y-4 mt-0">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="grid gap-4 min-h-[340px] xl:grid-rows-[auto_1fr]">
                <Card className="p-5 border transition-colors duration-150">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">BASE DE CLIENTES</p>
                      <p className="text-3xl font-semibold text-foreground font-mono mt-0.5">{isLoading ? '—' : displayClients.length}</p>
                    </div>
                    <UserCheck className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border border-t pt-3 -mx-5 px-5">
                    <button
                      onClick={() => handleKpiClick('ativo')}
                      className={`flex flex-col items-center py-2 rounded-l transition-colors hover:bg-muted/30 ${statusFilter === 'ativo' ? 'bg-primary/5' : ''}`}
                    >
                      <p className="text-2xl font-semibold font-mono">{isLoading ? '—' : Math.max(0, stats.ativos - hiddenInternalActiveCount)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Ativos</p>
                    </button>
                    <button
                      onClick={() => handleKpiClick('bloqueado')}
                      className={`flex flex-col items-center py-2 rounded-r transition-colors hover:bg-muted/30 ${statusFilter === 'bloqueado' ? 'bg-primary/5' : ''}`}
                    >
                      <p className="text-2xl font-semibold text-destructive font-mono">{isLoading ? '—' : stats.bloqueados}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Bloqueados</p>
                    </button>
                  </div>
                </Card>

                <Card className="border bg-card">
                  <div className="grid h-full grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
                    <div className="flex flex-col justify-between px-4 py-4">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Bandeiras ativas</p>
                        <p className="text-2xl font-semibold text-foreground">{isLoading ? '—' : bandeiras.length}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">Cobertura comercial dentro da carteira listada no período</p>
                    </div>

                    <div className="flex flex-col justify-between px-4 py-4">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Multissistema</p>
                        <p className="text-2xl font-semibold text-foreground">{isLoading ? '—' : clientInsights.multissistema}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">Clientes listados com mais de um sistema associado</p>
                    </div>

                    <div className="flex flex-col justify-between px-4 py-4">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sem bandeira</p>
                        <p className={`text-2xl font-semibold ${clientInsights.semBandeira > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {isLoading ? '—' : clientInsights.semBandeira}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {isLoading ? 'Carteira atual' : clientInsights.semBandeira > 0 ? `Média de ${clientInsights.mediaSistemas} sistemas por cliente na carteira atual` : `Carteira limpa, com média de ${clientInsights.mediaSistemas} sistemas por cliente`}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Charts: Bandeira + Sistema */}
              {(() => {
                const ativosClients = (statusFilter === 'todos' || statusFilter === 'ativo')
                  ? displayClients.filter(c => c.status?.toLowerCase() === 'ativo')
                  : [];
                const bandeiraMap = new Map<string, number>();
                ativosClients.forEach(c => {
                  const b = c.bandeira || 'Sem bandeira';
                  bandeiraMap.set(b, (bandeiraMap.get(b) || 0) + 1);
                });
                const bandeiraData = Array.from(bandeiraMap.entries())
                  .map(([name, count]) => ({ name, count }))
                  .sort((a, b) => b.count - a.count);
                const handleBarClick = (data: any) => {
                  if (data?.name) setSelectedBandeira(prev => prev === data.name ? null : data.name);
                };
                return (
                  <div className="space-y-4">
                    {/* Bandeira chart */}
                    <Card className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold">Clientes Ativos por Bandeira</h3>
                          <p className="text-xs text-muted-foreground">{ativosClients.length} clientes · {bandeiraData.length} bandeiras</p>
                        </div>
                        {selectedBandeira && (
                          <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-destructive/20" onClick={() => setSelectedBandeira(null)}>
                            {selectedBandeira} ✕
                          </Badge>
                        )}
                      </div>
                      <div className="h-[190px]">
                        {bandeiraData.length > 0 && !isLoading ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={bandeiraData} margin={{ top: 4, right: 16, bottom: 36, left: 0 }}>
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [v, 'Clientes']} />
                              <Bar dataKey="count" radius={[4, 4, 0, 0]} cursor="pointer" onClick={handleBarClick}>
                                {bandeiraData.map((entry, i) => (
                                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} opacity={selectedBandeira && selectedBandeira !== entry.name ? 0.3 : 1} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados para o período.</div>
                        )}
                      </div>
                    </Card>

                    {/* Sistema chart */}
                    <Card className="p-4 space-y-2">
                      <div>
                        <h3 className="text-sm font-semibold">Clientes por Sistema</h3>
                        <p className="text-xs text-muted-foreground">
                          {selectedBandeira ? `Filtrado por ${selectedBandeira}` : 'Distribuição da carteira ativa por produto'}
                        </p>
                      </div>
                      <div className="h-[190px]">
                        {sistemaChartData.length > 0 && !isLoading ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={sistemaChartData} layout="vertical" margin={{ top: 4, right: 30, bottom: 4, left: 10 }}>
                              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
                              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [v, 'Clientes']} />
                              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
                                {sistemaChartData.map((_, i) => (
                                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados de sistema.</div>
                        )}
                      </div>
                    </Card>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center gap-2 mt-1 mb-1 flex-wrap">
              <span className="text-xs text-muted-foreground">Filtrar:</span>
              <ToggleGroup type="single" value={statusFilter} onValueChange={(v) => setStatusFilter((v || 'todos') as ClientStatusFilter)} size="sm">
                <ToggleGroupItem value="todos" className="text-xs h-7 px-3">Todos</ToggleGroupItem>
                <ToggleGroupItem value="ativo" className="text-xs h-7 px-3">Ativos</ToggleGroupItem>
                <ToggleGroupItem value="bloqueado" className="text-xs h-7 px-3">Bloqueados</ToggleGroupItem>
              </ToggleGroup>
              <div className="ml-auto">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 hover:bg-muted/60 transition-colors"
                    >
                      <Users className="h-3 w-3" />
                      {hiddenInternalCount > 0
                        ? `${hiddenInternalCount} interno${hiddenInternalCount > 1 ? 's' : ''} oculto${hiddenInternalCount > 1 ? 's' : ''}`
                        : 'Internos visíveis'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-3" align="end">
                    <p className="text-[11px] font-semibold mb-2.5 text-muted-foreground uppercase tracking-wider">Clientes Internos</p>
                    <div className="space-y-2">
                      {INTERNAL_CLIENT_LIST.map(({ id, label }) => (
                        <div key={id} className="flex items-center gap-2">
                          <Checkbox
                            id={`internal-${id}`}
                            checked={visibleInternalSet.has(id)}
                            onCheckedChange={(checked) =>
                              setVisibleInternalIds(prev =>
                                checked ? [...prev, id] : prev.filter(i => i !== id)
                              )
                            }
                          />
                          <label htmlFor={`internal-${id}`} className="text-xs cursor-pointer select-none">{label}</label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {(() => {
              const filteredClients = selectedBandeira
                ? displayClients.filter(c => (c.bandeira || 'Sem bandeira') === selectedBandeira)
                : displayClients;
              const count = filteredClients.length;
              return (
                <div>
                  <button
                    type="button"
                    onClick={() => setTableExpanded(prev => !prev)}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors text-sm font-medium text-foreground"
                  >
                    <span>
                      Base de Clientes
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {isLoading ? '…' : `${count} cliente${count !== 1 ? 's' : ''}${selectedBandeira ? ` · ${selectedBandeira}` : ''}${statusFilter !== 'todos' ? ` · ${statusFilter}` : ''}`}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs">{tableExpanded ? '▲ Recolher' : '▼ Expandir'}</span>
                  </button>

                  {tableExpanded && (
                    <div className="mt-2">
                      {!isLoading && count === 0 ? (
                        <DashboardEmptyState description="Nenhum cliente encontrado com o filtro selecionado." />
                      ) : (
                        <DashboardDataTable
                          title="Base de Clientes"
                          subtitle={`${count} clientes${statusFilter !== 'todos' ? ` (${statusFilter})` : ''}${selectedBandeira ? ` • ${selectedBandeira}` : ''}`}
                          columns={columns}
                          data={filteredClients}
                          isLoading={isLoading}
                          getRowKey={(r) => r.id}
                          onRowClick={(r) => setDrawerClient(r)}
                          searchPlaceholder="Buscar cliente..."
                          columnFilters={tableColumnFilters}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </TabsContent>


          <TabsContent value="ganho-perda" className="space-y-4 mt-0">
            <MovimentacaoTab
              canViewValues={canViewValues}
              showValues={showValues}
              bandeiras={bandeiras}
              sistemas={sistemasUnicos}
            />
          </TabsContent>

          <TabsContent value="metas" className="space-y-4 mt-0">
            <MetasTab
              canViewValues={canViewValues}
              showValues={showValues}
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
            />
          </TabsContent>

          <TabsContent value="fechamento-comercial" className="space-y-4 mt-0">
            <PipeDriveTab canViewValues={canViewValues} showValues={showValues} />
          </TabsContent>

          <TabsContent value="esteira-saude" className="space-y-4 mt-0">
            <Card className="p-5 border transition-colors duration-150">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SAÚDE PBI</p>
                  <p className="text-3xl font-semibold text-foreground font-mono mt-0.5">{pbiHealthBatch.isLoading ? '—' : pbiHealthBatch.overview.total}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">PBIs monitorados</p>
                </div>
                <Layers className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div className="grid grid-cols-3 divide-x divide-border border-t pt-3 -mx-5 px-5">
                <button onClick={() => handleHealthClick('verde')} className={`flex flex-col items-center py-2 transition-colors hover:bg-muted/30 ${healthFilter === 'verde' ? 'bg-primary/5' : ''}`}>
                  <p className="text-xl font-semibold font-mono" style={{ color: 'hsl(142,71%,45%)' }}>{pbiHealthBatch.overview.verde}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Saudável</p>
                </button>
                <button onClick={() => handleHealthClick('amarelo')} className={`flex flex-col items-center py-2 transition-colors hover:bg-muted/30 ${healthFilter === 'amarelo' ? 'bg-primary/5' : ''}`}>
                  <p className="text-xl font-semibold font-mono" style={{ color: 'hsl(43,85%,46%)' }}>{pbiHealthBatch.overview.amarelo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Atenção</p>
                </button>
                <button onClick={() => handleHealthClick('vermelho')} className={`flex flex-col items-center py-2 transition-colors hover:bg-muted/30 ${healthFilter === 'vermelho' ? 'bg-primary/5' : ''}`}>
                  <p className="text-xl font-semibold text-destructive font-mono">{pbiHealthBatch.overview.vermelho}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Crítica</p>
                </button>
              </div>
            </Card>

            {healthFilteredItems.length === 0 && !operational.isLoading ? (
              <DashboardEmptyState description="Nenhum item da esteira comercial para o filtro selecionado." />
            ) : (
              <DashboardDataTable
                title="Esteira / Saúde Comercial"
                subtitle={`${healthFilteredItems.length} itens${healthFilter !== 'all' ? ` • filtro ${healthFilter === 'verde' ? 'Saudável' : healthFilter === 'amarelo' ? 'Atenção' : healthFilter === 'vermelho' ? 'Crítica' : healthFilter}` : ''}`}
                columns={operationalColumnsWithHealth}
                data={healthFilteredItems}
                isLoading={pbiHealthBatch.isLoading || operational.isLoading}
                getRowKey={(row) => String(row.work_item_id ?? Math.random())}
                onRowClick={(row) => setDrawerOperacionalItem(row)}
                searchPlaceholder="Buscar item monitorado..."
              />
            )}
          </TabsContent>

          <TabsContent value="pesquisa" className="space-y-4 mt-0">
            <PesquisaTab />
          </TabsContent>
        </Tabs>
      )}

      <DashboardDrawer
        open={!!drawerClient}
        onClose={() => setDrawerClient(null)}
        title={drawerClient?.nome}
        subtitle={drawerClient?.apelido || undefined}
        fields={drawerFields}
      />

      <DashboardDrawer
        open={!!drawerOperacionalItem}
        onClose={() => setDrawerOperacionalItem(null)}
        title={drawerOperacionalItem?.title || undefined}
        subtitle={drawerOperacionalItem?.work_item_type || undefined}
        fields={drawerOperacionalItem ? [
          { label: 'ID', value: drawerOperacionalItem.work_item_id },
          { label: 'Título', value: drawerOperacionalItem.title },
          { label: 'Tipo', value: drawerOperacionalItem.work_item_type },
          { label: 'Estado', value: drawerOperacionalItem.state },
          { label: 'Responsável', value: drawerOperacionalItem.assigned_to_display },
          { label: 'Prioridade', value: drawerOperacionalItem.priority != null ? `P${drawerOperacionalItem.priority}` : '—' },
          { label: 'Sprint', value: drawerOperacionalItem.iteration_path?.split('\\').pop() || '—' },
        ] : []}
        workItemId={drawerOperacionalItem?.work_item_id}
        workItemType={drawerOperacionalItem?.work_item_type}
        externalUrl={drawerOperacionalItem?.web_url}
      />
    </SectorLayout>
  );
}
