import { useState, useMemo } from 'react';
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

type InfraKpiFilter = 'all' | 'pendentes' | 'em_andamento' | 'concluidos' | 'melhorias' | 'iso27001' | 'transbordo';

const integrations: Integration[] = [
  { name: 'Azure DevOps', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Work Items Infra' },
];

const columns: DataTableColumn<InfraItem>[] = [
  { key: 'id', header: 'ID', className: 'font-mono text-xs w-16', render: r => r.web_url ? (
    <a href={r.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono" onClick={e => e.stopPropagation()}>{r.id}</a>
  ) : <span>{r.id}</span> },
  { key: 'title', header: 'Atividade', className: 'max-w-[350px] truncate' },
  { key: 'assigned_to_display', header: 'Responsável' },
  { key: 'state', header: 'Status', render: r => <Badge variant="outline" className="text-xs">{r.state || '—'}</Badge> },
  { key: 'priority', header: 'Prior.', render: r => r.priority != null ? <Badge variant="secondary" className="text-xs">P{r.priority}</Badge> : '—' },
  { key: 'tags', header: 'Tags', className: 'text-xs text-muted-foreground max-w-[150px] truncate' },
];

export default function InfraestruturaDashboard() {
  const filters = useDashboardFilters('mes_atual');
  const { items, total, pendentes, emAndamento, concluidos, melhorias, iso27001, transbordo, backlog, dev, lastSync, isLoading, isError, refetch } = useInfraestruturaKpis(filters.dateFrom, filters.dateTo);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<InfraItem | null>(null);
  const [kpiFilter, setKpiFilter] = useState<InfraKpiFilter>('all');

  const toggleKpi = (f: InfraKpiFilter) => setKpiFilter(prev => prev === f ? 'all' : f);

  const filteredItems = useMemo(() => {
    switch (kpiFilter) {
      case 'pendentes': return items.filter(i => i.state === 'New' || i.state === 'To Do');
      case 'em_andamento': return items.filter(i => i.state === 'In Progress' || i.state === 'Active');
      case 'concluidos': return items.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved');
      case 'melhorias': return items.filter(i => i.tags?.toUpperCase().includes('MELHORIA'));
      case 'iso27001': return items.filter(i => i.tags?.toUpperCase().includes('ISO27001') || i.tags?.toUpperCase().includes('ISO'));
      case 'transbordo': return items.filter(i => i.tags?.toUpperCase().includes('TRANSBORDO'));
      default: return items;
    }
  }, [items, kpiFilter]);

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
    <SectorLayout title="Infraestrutura" subtitle="Atividades, Melhorias e Monitoramento" lastUpdate="" integrations={integrations} areaKey="infraestrutura" syncFunctions={[{ name: 'devops-sync-all', label: 'Sincronizar Work Items (DevOps)' }]}>
      <div className="flex items-center justify-between mb-2">
        <DashboardLastSyncBadge syncedAt={lastSync} status="ok" />
      </div>

      <DashboardFilterBar
        preset={filters.preset}
        onPresetChange={(p) => { filters.setPreset(p); setKpiFilter('all'); }}
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
            <DashboardKpiCard label="Total Atividades" value={total} icon={Server} isLoading={isLoading} onClick={() => toggleKpi('all')} active={kpiFilter === 'all'} />
            <DashboardKpiCard label="Pendentes" value={pendentes} icon={Clock} isLoading={isLoading} delay={80} accent="bg-[hsl(43,85%,46%)]" onClick={() => toggleKpi('pendentes')} active={kpiFilter === 'pendentes'} />
            <DashboardKpiCard label="Em Andamento" value={emAndamento} icon={Wrench} isLoading={isLoading} delay={160} accent="bg-[hsl(var(--info))]" onClick={() => toggleKpi('em_andamento')} active={kpiFilter === 'em_andamento'} />
            <DashboardKpiCard label="Concluídos" value={concluidos} icon={CheckCircle} isLoading={isLoading} delay={240} accent="bg-[hsl(142,71%,45%)]" onClick={() => toggleKpi('concluidos')} active={kpiFilter === 'concluidos'} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <DashboardKpiCard label="Melhorias Implementadas" value={melhorias} icon={Wrench} isLoading={isLoading} delay={300} accent="bg-[hsl(142,71%,45%)]" onClick={() => toggleKpi('melhorias')} active={kpiFilter === 'melhorias'} />
            <DashboardKpiCard label="Atividades ISO 27001" value={iso27001} icon={Shield} isLoading={isLoading} delay={360} accent="bg-[hsl(280,65%,60%)]" onClick={() => toggleKpi('iso27001')} active={kpiFilter === 'iso27001'} />
            <DashboardKpiCard label="Transbordo" value={transbordo} icon={AlertTriangle} isLoading={isLoading} delay={420} accent="bg-[hsl(0,84%,60%)]" onClick={() => toggleKpi('transbordo')} active={kpiFilter === 'transbordo'} />
          </div>

          {!isLoading && filteredItems.length === 0 ? (
            <DashboardEmptyState description="Nenhum item de infraestrutura para o período/filtro selecionado." />
          ) : (
            <DashboardDataTable
              title="Atividades Infraestrutura"
              subtitle={`${filteredItems.length} itens • Backlog: ${backlog} • Dev: ${dev}`}
              columns={columns}
              data={filteredItems}
              isLoading={isLoading}
              getRowKey={(r) => String(r.id ?? Math.random())}
              onRowClick={(r) => setDrawerItem(r)}
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
        externalUrl={drawerItem?.web_url}
      />
    </SectorLayout>
  );
}
