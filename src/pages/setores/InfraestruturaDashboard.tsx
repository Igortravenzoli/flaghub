import { useState } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useInfraestruturaKpis, InfraItem } from '@/hooks/useInfraestruturaKpis';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { Badge } from '@/components/ui/badge';
import { Server, Clock, Wrench, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import type { Integration } from '@/components/setores/SectorIntegrations';

const integrations: Integration[] = [
  { name: 'Azure DevOps', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Work Items Infra' },
];

const columns: DataTableColumn<InfraItem>[] = [
  { key: 'id', header: 'ID', className: 'font-mono text-xs w-16' },
  { key: 'title', header: 'Atividade', className: 'max-w-[350px] truncate' },
  { key: 'assigned_to_display', header: 'Responsável' },
  { key: 'state', header: 'Status', render: r => <Badge variant="outline" className="text-xs">{r.state || '—'}</Badge> },
  { key: 'priority', header: 'Prior.', render: r => r.priority != null ? <Badge variant="secondary" className="text-xs">P{r.priority}</Badge> : '—' },
  { key: 'tags', header: 'Tags', className: 'text-xs text-muted-foreground max-w-[150px] truncate' },
];

export default function InfraestruturaDashboard() {
  const { items, total, pendentes, emAndamento, concluidos, melhorias, iso27001, transbordo, backlog, dev, lastSync, isLoading, isError, refetch } = useInfraestruturaKpis();
  const filters = useDashboardFilters('mes_atual');
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<InfraItem | null>(null);

  const handleExportCSV = () => exportCSV({
    title: 'Infraestrutura', area: 'Infraestrutura', periodLabel: filters.presetLabel,
    columns: ['id', 'title', 'assigned_to_display', 'state', 'priority', 'tags'],
    rows: items as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Dashboard Infraestrutura', area: 'Infraestrutura', periodLabel: filters.presetLabel,
    kpis: [
      { label: 'Total', value: total },
      { label: 'Pendentes', value: pendentes },
      { label: 'Em Andamento', value: emAndamento },
      { label: 'Melhorias', value: melhorias },
      { label: 'ISO 27001', value: iso27001 },
      { label: 'Transbordo', value: transbordo },
    ],
    columns: ['id', 'title', 'assigned_to_display', 'state', 'tags'],
    rows: items as any[],
  });

  const drawerFields: DrawerField[] = drawerItem ? [
    { label: 'ID', value: drawerItem.id },
    { label: 'Título', value: drawerItem.title },
    { label: 'Tipo', value: drawerItem.work_item_type },
    { label: 'Estado', value: drawerItem.state },
    { label: 'Responsável', value: drawerItem.assigned_to_display },
    { label: 'Prioridade', value: drawerItem.priority != null ? `P${drawerItem.priority}` : '—' },
    { label: 'Tags', value: drawerItem.tags },
    { label: 'Esforço', value: drawerItem.effort != null ? `${drawerItem.effort}h` : '—' },
    { label: 'Criado em', value: drawerItem.created_date ? new Date(drawerItem.created_date).toLocaleString('pt-BR') : '—' },
    { label: 'Alterado em', value: drawerItem.changed_date ? new Date(drawerItem.changed_date).toLocaleString('pt-BR') : '—' },
  ] : [];

  return (
    <SectorLayout title="Infraestrutura" subtitle="Atividades, Melhorias e Monitoramento" lastUpdate="" integrations={integrations}>
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <DashboardKpiCard label="Total Atividades" value={total} icon={Server} isLoading={isLoading} />
            <DashboardKpiCard label="Pendentes" value={pendentes} icon={Clock} isLoading={isLoading} delay={80} accent="bg-[hsl(43,85%,46%)]" />
            <DashboardKpiCard label="Em Andamento" value={emAndamento} icon={Wrench} isLoading={isLoading} delay={160} accent="bg-[hsl(var(--info))]" />
            <DashboardKpiCard label="Concluídos" value={concluidos} icon={CheckCircle} isLoading={isLoading} delay={240} accent="bg-[hsl(142,71%,45%)]" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <DashboardKpiCard label="Melhorias Implementadas" value={melhorias} icon={Wrench} isLoading={isLoading} delay={300} accent="bg-[hsl(142,71%,45%)]" />
            <DashboardKpiCard label="Atividades ISO 27001" value={iso27001} icon={Shield} isLoading={isLoading} delay={360} accent="bg-[hsl(280,65%,60%)]" />
            <DashboardKpiCard label="Transbordo" value={transbordo} icon={AlertTriangle} isLoading={isLoading} delay={420} accent="bg-[hsl(0,84%,60%)]" />
          </div>

          {!isLoading && items.length === 0 ? (
            <DashboardEmptyState description="Nenhum item de infraestrutura encontrado. Os dados serão exibidos após sync do DevOps com sector='infraestrutura'." />
          ) : (
            <DashboardDataTable
              title="Atividades Infraestrutura"
              subtitle={`${total} itens • Backlog: ${backlog} • Dev: ${dev}`}
              columns={columns}
              data={items}
              isLoading={isLoading}
              getRowKey={(r) => r.id || Math.random()}
              onRowClick={setDrawerItem}
              searchPlaceholder="Buscar atividade..."
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
