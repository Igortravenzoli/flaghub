import { useState } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useComercialKpis, ComercialClient } from '@/hooks/useComercialKpis';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { Users, Building2, Flag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
  { key: 'status', header: 'Status', render: (r) => <Badge variant={r.status === 'ativo' ? 'default' : 'secondary'} className="text-xs">{r.status || '—'}</Badge> },
];

export default function ComercialDashboard() {
  const { clients, totalClientes, bandeiras, lastSync, isLoading, isError, refetch } = useComercialKpis();
  const filters = useDashboardFilters('mes_atual');
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerClient, setDrawerClient] = useState<ComercialClient | null>(null);

  const handleExportCSV = () => exportCSV({
    title: 'Clientes Ativos', area: 'Comercial', periodLabel: filters.presetLabel,
    columns: ['id', 'nome', 'apelido', 'bandeira', 'sistemas_label', 'status'],
    rows: clients as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Clientes Ativos', area: 'Comercial', periodLabel: filters.presetLabel,
    kpis: [
      { label: 'Total Clientes Ativos', value: totalClientes },
      { label: 'Bandeiras', value: bandeiras.length },
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

  return (
    <SectorLayout title="Comercial" subtitle="Clientes Ativos — Gateway/VDesk" lastUpdate="" integrations={integrations}>
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <DashboardKpiCard label="Clientes Ativos" value={totalClientes} icon={Users} isLoading={isLoading} />
            <DashboardKpiCard label="Bandeiras" value={bandeiras.length} icon={Flag} isLoading={isLoading} delay={80} />
            <DashboardKpiCard label="Sistemas" value={clients.filter(c => c.sistemas_label).length} icon={Building2} isLoading={isLoading} delay={160} />
          </div>

          {!isLoading && clients.length === 0 ? (
            <DashboardEmptyState description="Nenhum cliente sincronizado ainda. Execute o sync via /admin/sync." />
          ) : (
            <DashboardDataTable
              title="Clientes Ativos"
              subtitle={`${totalClientes} clientes`}
              columns={columns}
              data={clients}
              isLoading={isLoading}
              getRowKey={(r) => r.id}
              onRowClick={(r) => setDrawerClient(r)}
              searchPlaceholder="Buscar cliente..."
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
