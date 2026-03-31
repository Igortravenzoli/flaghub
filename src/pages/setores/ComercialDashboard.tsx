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
import { UserCheck, ShieldBan, HeartPulse, AlertTriangle, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { getDateBoundsFromItems } from '@/lib/dateBounds';
import type { Integration } from '@/components/setores/SectorIntegrations';
import { MovimentacaoTab } from '@/components/comercial/MovimentacaoTab';
import { PesquisaTab } from '@/components/comercial/PesquisaTab';
import { PipeDriveTab } from '@/components/comercial/PipeDriveTab';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

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
  const [activeTab, setActiveTab] = useState('kpi-oficial');
  const [selectedBandeira, setSelectedBandeira] = useState<string | null>(null);
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const currentYear = new Date().getFullYear();
  const filters = useDashboardFilters('1y');
  const { clients, totalClientes, bandeiras, stats, lastSync, isLoading, isError, refetch } = useComercialKpis(statusFilter, filters.dateFrom, filters.dateTo);
  const operational = useDevopsOperationalQueue(['04-Em Fila Comercial']);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerClient, setDrawerClient] = useState<ComercialClient | null>(null);
  const [drawerOperacionalItem, setDrawerOperacionalItem] = useState<any | null>(null);

  const { minDate, maxDate } = useMemo(
    () => getDateBoundsFromItems(clients, [(c) => c.synced_at]),
    [clients]
  );

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
    rows: clients as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Base de Clientes', area: 'Comercial', periodLabel: filters.presetLabel,
    kpis: [
      { label: 'Ativos', value: stats.ativos },
      { label: 'Bloqueados', value: stats.bloqueados },
    ],
    columns: ['id', 'nome', 'apelido', 'bandeira', 'status'],
    rows: clients as any[],
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
    <SectorLayout title="Comercial" subtitle="Base de Clientes — Gateway/VDesk" lastUpdate="" integrations={integrations} templateKey="comercial_movimentacao_v1" areaKey="comercial" syncFunctions={[{ name: 'vdesk-sync-base-clientes', label: 'Sincronizar Base de Clientes (VDesk)' }]}>
      <div className="flex items-center justify-between mb-2">
        <DashboardLastSyncBadge syncedAt={lastSync} status="ok" />
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
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="kpi-oficial" className="text-xs">KPI Oficial</TabsTrigger>
            <TabsTrigger value="operacional" className="text-xs">Esteira</TabsTrigger>
            <TabsTrigger value="esteira-saude" className="text-xs">Esteira / Saúde</TabsTrigger>
            <TabsTrigger value="movimentacao" className="text-xs">Movimentação</TabsTrigger>
            <TabsTrigger value="pesquisa" className="text-xs">Pesquisa Satisfação</TabsTrigger>
            <TabsTrigger value="pipedrive" className="text-xs">PipeDrive</TabsTrigger>
          </TabsList>

          <TabsContent value="kpi-oficial" className="space-y-4 mt-0">
            <div className="grid grid-cols-2 gap-4">
              <DashboardKpiCard
                label="Ativos"
                value={stats.ativos}
                icon={UserCheck}
                isLoading={isLoading}
                active={statusFilter === 'ativo'}
                onClick={() => handleKpiClick('ativo')}
              />
              <DashboardKpiCard
                label="Bloqueados"
                value={stats.bloqueados}
                icon={ShieldBan}
                isLoading={isLoading}
                delay={80}
                active={statusFilter === 'bloqueado'}
                onClick={() => handleKpiClick('bloqueado')}
              />
            </div>

            {/* Chart: Clientes Ativos por Bandeira */}
            {(() => {
              const ativosClients = (statusFilter === 'todos' || statusFilter === 'ativo')
                ? clients.filter(c => c.status?.toLowerCase() === 'ativo')
                : [];
              const bandeiraMap = new Map<string, number>();
              ativosClients.forEach(c => {
                const b = c.bandeira || 'Sem bandeira';
                bandeiraMap.set(b, (bandeiraMap.get(b) || 0) + 1);
              });
              const chartData = Array.from(bandeiraMap.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);
              const COLORS = [
                'hsl(var(--primary))',
                'hsl(var(--accent))',
                'hsl(var(--muted-foreground))',
                'hsl(210, 70%, 55%)',
                'hsl(160, 60%, 45%)',
                'hsl(30, 80%, 55%)',
                'hsl(280, 60%, 55%)',
                'hsl(0, 65%, 55%)',
              ];
              const handleBarClick = (data: any) => {
                if (data?.name) {
                  setSelectedBandeira(prev => prev === data.name ? null : data.name);
                }
              };
              return chartData.length > 0 && !isLoading ? (
                <Card className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Clientes Ativos por Bandeira</h3>
                      <p className="text-xs text-muted-foreground">{ativosClients.length} clientes ativos em {chartData.length} bandeiras</p>
                    </div>
                    {selectedBandeira && (
                      <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-destructive/20" onClick={() => setSelectedBandeira(null)}>
                        {selectedBandeira} ✕
                      </Badge>
                    )}
                  </div>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 40, left: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          formatter={(value: number) => [value, 'Clientes']}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]} cursor="pointer" onClick={handleBarClick}>
                          {chartData.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={COLORS[i % COLORS.length]}
                              opacity={selectedBandeira && selectedBandeira !== entry.name ? 0.3 : 1}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              ) : null;
            })()}

            <div className="flex items-center gap-2 mt-1 mb-1">
              <span className="text-xs text-muted-foreground">Filtrar:</span>
              <ToggleGroup type="single" value={statusFilter} onValueChange={(v) => setStatusFilter((v || 'todos') as ClientStatusFilter)} size="sm">
                <ToggleGroupItem value="todos" className="text-xs h-7 px-3">Todos</ToggleGroupItem>
                <ToggleGroupItem value="ativo" className="text-xs h-7 px-3">Ativos</ToggleGroupItem>
                <ToggleGroupItem value="bloqueado" className="text-xs h-7 px-3">Bloqueados</ToggleGroupItem>
              </ToggleGroup>
            </div>

            {(() => {
              const filteredClients = selectedBandeira
                ? clients.filter(c => (c.bandeira || 'Sem bandeira') === selectedBandeira)
                : clients;
              const count = filteredClients.length;
              return !isLoading && count === 0 ? (
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
              );
            })()}
          </TabsContent>

          <TabsContent value="operacional" className="space-y-4 mt-0">
            <Card className="overflow-hidden">
              <div className="p-4 border-b">
                <h3 className="font-semibold text-sm">Fila Comercial (Operacional)</h3>
                <p className="text-xs text-muted-foreground">Fonte operacional: query 04-Em Fila Comercial</p>
              </div>
              <div className="p-4">
                {operacionalItems.length === 0 && !operational.isLoading ? (
                  <DashboardEmptyState description="Sem itens operacionais no momento." />
                ) : (
                  <DashboardDataTable
                    title="Fila Comercial"
                    subtitle={`${operacionalItems.length} itens em acompanhamento operacional`}
                    columns={operationalColumnsWithHealth}
                    data={operacionalItems}
                    isLoading={operational.isLoading}
                    getRowKey={(row) => String(row.work_item_id ?? Math.random())}
                    onRowClick={(row) => setDrawerOperacionalItem(row)}
                    searchPlaceholder="Buscar item comercial..."
                  />
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="esteira-saude" className="space-y-4 mt-0">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <DashboardKpiCard label="PBIs monitorados" value={pbiHealthBatch.overview.total} icon={Layers} isLoading={pbiHealthBatch.isLoading} onClick={() => handleHealthClick('all')} active={healthFilter === 'all'} />
              <DashboardKpiCard label="Saudável" value={pbiHealthBatch.overview.verde} icon={HeartPulse} isLoading={pbiHealthBatch.isLoading} accent="bg-[hsl(142,71%,45%)]" onClick={() => handleHealthClick('verde')} active={healthFilter === 'verde'} />
              <DashboardKpiCard label="Atenção" value={pbiHealthBatch.overview.amarelo} icon={AlertTriangle} isLoading={pbiHealthBatch.isLoading} accent="bg-[hsl(43,85%,46%)]" onClick={() => handleHealthClick('amarelo')} active={healthFilter === 'amarelo'} />
              <DashboardKpiCard label="Crítica" value={pbiHealthBatch.overview.vermelho} icon={AlertTriangle} isLoading={pbiHealthBatch.isLoading} accent="bg-destructive" onClick={() => handleHealthClick('vermelho')} active={healthFilter === 'vermelho'} />
            </div>

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

          <TabsContent value="movimentacao" className="space-y-4 mt-0">
            <MovimentacaoTab dateFrom={filters.dateFrom} dateTo={filters.dateTo} />
          </TabsContent>

          <TabsContent value="pesquisa" className="space-y-4 mt-0">
            <PesquisaTab />
          </TabsContent>

          <TabsContent value="pipedrive" className="space-y-4 mt-0">
            <PipeDriveTab />
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
