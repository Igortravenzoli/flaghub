import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useHelpdeskKpis, HelpdeskSnapshot } from '@/hooks/useHelpdeskKpis';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { Headphones, Clock, Users, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import type { Integration } from '@/components/setores/SectorIntegrations';

const integrations: Integration[] = [
  { name: 'VDesk Helpdesk API', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Dashboard Helpdesk' },
];

const columns: DataTableColumn<HelpdeskSnapshot>[] = [
  { key: 'id', header: 'ID', className: 'font-mono text-xs w-16' },
  { key: 'periodo_tipo', header: 'Período', render: (r) => <Badge variant="outline" className="text-xs">{r.periodo_tipo || '—'}</Badge> },
  { key: 'consultor', header: 'Consultor', className: 'font-medium' },
  { key: 'total_registros', header: 'Registros', className: 'text-right' },
  { key: 'total_minutos', header: 'Minutos', className: 'text-right' },
  { key: 'collected_at', header: 'Coletado em', render: (r) => r.collected_at ? new Date(r.collected_at).toLocaleString('pt-BR') : '—', className: 'text-xs text-muted-foreground' },
];

export default function HelpdeskDashboard() {
  const { snapshots, totalRegistros, totalHoras, porConsultor, lastSync, isLoading, isError, refetch } = useHelpdeskKpis();
  const filters = useDashboardFilters('mes_atual');
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerSnapshot, setDrawerSnapshot] = useState<HelpdeskSnapshot | null>(null);

  const consultores = Object.keys(porConsultor);

  const handleExportCSV = () => exportCSV({
    title: 'Helpdesk KPIs', area: 'Helpdesk', periodLabel: filters.presetLabel,
    columns: ['id', 'periodo_tipo', 'consultor', 'total_registros', 'total_minutos', 'collected_at'],
    rows: snapshots as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Helpdesk KPIs', area: 'Helpdesk', periodLabel: filters.presetLabel,
    kpis: [
      { label: 'Total Registros', value: totalRegistros },
      { label: 'Total Horas', value: totalHoras },
      { label: 'Consultores', value: consultores.length },
    ],
    columns: ['id', 'periodo_tipo', 'consultor', 'total_registros', 'total_minutos'],
    rows: snapshots as any[],
  });

  const drawerFields: DrawerField[] = drawerSnapshot ? [
    { label: 'ID', value: drawerSnapshot.id },
    { label: 'Período', value: drawerSnapshot.periodo_tipo },
    { label: 'Consultor', value: drawerSnapshot.consultor },
    { label: 'Data Início', value: drawerSnapshot.data_inicio },
    { label: 'Data Fim', value: drawerSnapshot.data_fim },
    { label: 'Total Registros', value: drawerSnapshot.total_registros },
    { label: 'Total Minutos', value: drawerSnapshot.total_minutos },
    { label: 'Coletado em', value: drawerSnapshot.collected_at ? new Date(drawerSnapshot.collected_at).toLocaleString('pt-BR') : '—' },
  ] : [];

  return (
    <SectorLayout title="Helpdesk" subtitle="KPIs de Atendimento — VDesk" lastUpdate="" integrations={integrations}>
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
            <DashboardKpiCard label="Total Registros" value={totalRegistros} icon={FileText} isLoading={isLoading} />
            <DashboardKpiCard label="Total Horas" value={totalHoras} icon={Clock} isLoading={isLoading} delay={80} />
            <DashboardKpiCard label="Consultores" value={consultores.length} icon={Users} isLoading={isLoading} delay={160} />
            <DashboardKpiCard label="Snapshots" value={snapshots.length} icon={Headphones} isLoading={isLoading} delay={240} />
          </div>

          {!isLoading && snapshots.length === 0 ? (
            <DashboardEmptyState description="Nenhum snapshot de helpdesk encontrado. Execute o sync via /admin/sync." />
          ) : (
            <DashboardDataTable
              title="Snapshots Helpdesk"
              subtitle={`${snapshots.length} registros`}
              columns={columns}
              data={snapshots}
              isLoading={isLoading}
              getRowKey={(r) => String(r.id)}
              onRowClick={(r) => setDrawerSnapshot(r)}
              searchPlaceholder="Buscar consultor..."
            />
          )}
        </>
      )}

      <DashboardDrawer
        open={!!drawerSnapshot}
        onClose={() => setDrawerSnapshot(null)}
        title={`Snapshot #${drawerSnapshot?.id}`}
        subtitle={drawerSnapshot?.consultor || undefined}
        fields={drawerFields}
      />
    </SectorLayout>
  );
}
