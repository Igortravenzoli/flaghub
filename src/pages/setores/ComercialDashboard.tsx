import { useState } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn, ColumnFilter } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useComercialKpis, ComercialClient, ClientStatusFilter } from '@/hooks/useComercialKpis';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { Users, Building2, Flag, UserCheck, UserX, ShieldBan } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Integration } from '@/components/setores/SectorIntegrations';

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

export default function ComercialDashboard() {
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>('todos');
  const { clients, totalClientes, bandeiras, stats, lastSync, isLoading, isError, refetch } = useComercialKpis(statusFilter);
  const filters = useDashboardFilters('mes_atual');
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerClient, setDrawerClient] = useState<ComercialClient | null>(null);

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

  return (
    <SectorLayout title="Comercial" subtitle="Base de Clientes — Gateway/VDesk" lastUpdate="" integrations={integrations} areaKey="comercial" syncFunctions={[{ name: 'vdesk-sync-base-clientes', label: 'Sincronizar Base de Clientes (VDesk)' }]}>
      <div className="flex items-center justify-between mb-2">
        <DashboardLastSyncBadge syncedAt={lastSync} status="ok" />
      </div>

      <DashboardFilterBar
        preset={filters.preset}
        onPresetChange={filters.setPreset}
        presetLabel={filters.presetLabel}
        onRefresh={() => refetch()}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
      />

      {isError ? (
        <DashboardEmptyState variant="error" onRetry={() => refetch()} />
      ) : (
        <>
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
        </>
      )}

      <DashboardDrawer
        open={!!drawerClient}
        onClose={() => setDrawerClient(null)}
        title={drawerClient?.nome}
        subtitle={drawerClient?.apelido || undefined}
        fields={drawerFields}
      />
    </SectorLayout>
  );
}
