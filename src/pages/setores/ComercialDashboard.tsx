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
import { Users, UserCheck, UserX, ShieldBan, HeartPulse, AlertTriangle, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { getDateBoundsFromItems } from '@/lib/dateBounds';
import type { Integration } from '@/components/setores/SectorIntegrations';

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
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>('todos');
  const [activeTab, setActiveTab] = useState('kpi-oficial');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const filters = useDashboardFilters('30d');
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
      { label: 'Total Clientes', value: stats.total },
      { label: 'Ativos', value: stats.ativos },
      { label: 'Inativos', value: stats.inativos },
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
    <SectorLayout title="Comercial" subtitle="Base de Clientes — Gateway/VDesk" lastUpdate="" integrations={integrations} areaKey="comercial" syncFunctions={[{ name: 'vdesk-sync-base-clientes', label: 'Sincronizar Base de Clientes (VDesk)' }]}>
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
          { value: '7d', label: '7d' },
          { value: '30d', label: '30d' },
          { value: '90d', label: '90d' },
          { value: '6m', label: '6m' },
          { value: '1y', label: '1a' },
          { value: 'all', label: 'Todos' },
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
            <TabsTrigger value="operacional" className="text-xs">Visão Operacional</TabsTrigger>
            <TabsTrigger value="esteira-saude" className="text-xs">Esteira / Saúde</TabsTrigger>
          </TabsList>

          <TabsContent value="kpi-oficial" className="space-y-4 mt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <DashboardKpiCard
                label="Total Clientes"
                value={stats.total}
                icon={Users}
                isLoading={isLoading}
              />
              <DashboardKpiCard
                label="Ativos"
                value={stats.ativos}
                icon={UserCheck}
                isLoading={isLoading}
                delay={80}
                active={statusFilter === 'ativo'}
                onClick={() => handleKpiClick('ativo')}
              />
              <DashboardKpiCard
                label="Inativos"
                value={stats.inativos}
                icon={UserX}
                isLoading={isLoading}
                delay={160}
                active={statusFilter === 'inativo'}
                onClick={() => handleKpiClick('inativo')}
              />
              <DashboardKpiCard
                label="Bloqueados"
                value={stats.bloqueados}
                icon={ShieldBan}
                isLoading={isLoading}
                delay={240}
                active={statusFilter === 'bloqueado'}
                onClick={() => handleKpiClick('bloqueado')}
              />
            </div>

            <div className="flex items-center gap-2 mt-1 mb-1">
              <span className="text-xs text-muted-foreground">Filtrar:</span>
              <ToggleGroup type="single" value={statusFilter} onValueChange={(v) => setStatusFilter((v || 'todos') as ClientStatusFilter)} size="sm">
                <ToggleGroupItem value="todos" className="text-xs h-7 px-3">Todos</ToggleGroupItem>
                <ToggleGroupItem value="ativo" className="text-xs h-7 px-3">Ativos</ToggleGroupItem>
                <ToggleGroupItem value="inativo" className="text-xs h-7 px-3">Inativos</ToggleGroupItem>
                <ToggleGroupItem value="bloqueado" className="text-xs h-7 px-3">Bloqueados</ToggleGroupItem>
              </ToggleGroup>
            </div>

            {!isLoading && clients.length === 0 ? (
              <DashboardEmptyState description="Nenhum cliente encontrado com o filtro selecionado." />
            ) : (
              <DashboardDataTable
                title="Base de Clientes"
                subtitle={`${totalClientes} clientes${statusFilter !== 'todos' ? ` (${statusFilter})` : ''}`}
                columns={columns}
                data={clients}
                isLoading={isLoading}
                getRowKey={(r) => r.id}
                onRowClick={(r) => setDrawerClient(r)}
                searchPlaceholder="Buscar cliente..."
                columnFilters={tableColumnFilters}
              />
            )}
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
