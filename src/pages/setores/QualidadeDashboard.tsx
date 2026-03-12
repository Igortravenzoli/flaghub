import { useState } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useQualidadeKpis, QualidadeItem } from '@/hooks/useQualidadeKpis';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { Badge } from '@/components/ui/badge';
import { FileCheck, Clock, TrendingUp, BarChart3 } from 'lucide-react';
import type { Integration } from '@/components/setores/SectorIntegrations';

const integrations: Integration[] = [
  { name: 'Azure DevOps', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Work Items QA' },
];

const columns: DataTableColumn<QualidadeItem>[] = [
  { key: 'id', header: 'ID', className: 'font-mono text-xs w-16' },
  { key: 'title', header: 'Título', className: 'max-w-[350px] truncate' },
  { key: 'state', header: 'Estado', render: r => <Badge variant="outline" className="text-xs">{r.state || '—'}</Badge> },
  { key: 'assigned_to_display', header: 'Responsável' },
  { key: 'priority', header: 'Prior.', render: r => r.priority != null ? <Badge variant="secondary" className="text-xs">P{r.priority}</Badge> : '—' },
  { key: 'created_date', header: 'Criado', render: r => r.created_date ? new Date(r.created_date).toLocaleDateString('pt-BR') : '—', className: 'text-xs' },
];

export default function QualidadeDashboard() {
  const { items, total, filaQA, emTeste, finalizados, taxaVazao, lastSync, isLoading, isError, refetch } = useQualidadeKpis();
  const filters = useDashboardFilters('mes_atual');
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<QualidadeItem | null>(null);

  const handleExportCSV = () => exportCSV({
    title: 'Qualidade QA', area: 'Qualidade', periodLabel: filters.presetLabel,
    columns: ['id', 'title', 'state', 'assigned_to_display', 'priority', 'created_date'],
    rows: items as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Dashboard Qualidade', area: 'Qualidade', periodLabel: filters.presetLabel,
    kpis: [
      { label: 'Total QA', value: total },
      { label: 'Fila QA (WIP)', value: filaQA },
      { label: 'Taxa Vazão', value: `${taxaVazao}%` },
      { label: 'Finalizados', value: finalizados },
    ],
    columns: ['id', 'title', 'state', 'assigned_to_display', 'priority'],
    rows: items as any[],
  });

  const drawerFields: DrawerField[] = drawerItem ? [
    { label: 'ID', value: drawerItem.id },
    { label: 'Título', value: drawerItem.title },
    { label: 'Tipo', value: drawerItem.work_item_type },
    { label: 'Estado', value: drawerItem.state },
    { label: 'Responsável', value: drawerItem.assigned_to_display },
    { label: 'Prioridade', value: drawerItem.priority != null ? `P${drawerItem.priority}` : '—' },
    { label: 'Criado em', value: drawerItem.created_date ? new Date(drawerItem.created_date).toLocaleString('pt-BR') : '—' },
    { label: 'Alterado em', value: drawerItem.changed_date ? new Date(drawerItem.changed_date).toLocaleString('pt-BR') : '—' },
  ] : [];

  return (
    <SectorLayout title="Qualidade" subtitle="Gestão à Vista — QA" lastUpdate="" integrations={integrations}>
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <DashboardKpiCard label="Total QA" value={total} icon={FileCheck} isLoading={isLoading} />
            <DashboardKpiCard label="Fila QA (WIP)" value={filaQA} icon={Clock} isLoading={isLoading} delay={80} accent="bg-[hsl(43,85%,46%)]" />
            <DashboardKpiCard label="Taxa Vazão QA" value={taxaVazao} suffix="%" icon={TrendingUp} isLoading={isLoading} delay={160} accent="bg-[hsl(142,71%,45%)]" />
            <DashboardKpiCard label="Finalizados" value={finalizados} icon={BarChart3} isLoading={isLoading} delay={240} accent="bg-[hsl(199,89%,48%)]" />
          </div>

          {!isLoading && items.length === 0 ? (
            <DashboardEmptyState description="Nenhum item de qualidade encontrado. Os dados serão exibidos após sync do DevOps." />
          ) : (
            <DashboardDataTable
              title="Itens QA"
              subtitle={`${total} registros`}
              columns={columns}
              data={items}
              isLoading={isLoading}
              getRowKey={(r) => String(r.id ?? Math.random())}
              onRowClick={(r) => setDrawerItem(r)}
              searchPlaceholder="Buscar item QA..."
            />
          )}
        </>
      )}

      <DashboardDrawer
        open={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        title={drawerItem?.title || undefined}
        subtitle={drawerItem?.work_item_type || undefined}
        fields={drawerFields}
      />
    </SectorLayout>
  );
}
