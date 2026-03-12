import { useState, useMemo } from 'react';
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
import { FileCheck, Clock, TrendingUp, BarChart3, RotateCcw } from 'lucide-react';
import type { Integration } from '@/components/setores/SectorIntegrations';

type QaKpiFilter = 'all' | 'fila_qa' | 'finalizados' | 'com_retorno';

const integrations: Integration[] = [
  { name: 'Azure DevOps', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Work Items QA' },
];

const columns: DataTableColumn<QualidadeItem>[] = [
  { key: 'id', header: 'ID', className: 'font-mono text-xs w-16', render: r => r.web_url ? (
    <a href={r.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono" onClick={e => e.stopPropagation()}>
      {r.id}
    </a>
  ) : <span>{r.id}</span> },
  { key: 'title', header: 'Título', className: 'max-w-[350px] truncate' },
  { key: 'state', header: 'Estado', render: r => <Badge variant="outline" className="text-xs">{r.state || '—'}</Badge> },
  { key: 'assigned_to_display', header: 'Responsável' },
  { key: 'priority', header: 'Prior.', render: r => r.priority != null ? <Badge variant="secondary" className="text-xs">P{r.priority}</Badge> : '—' },
  { 
    key: 'qa_retorno_count' as any, 
    header: 'Retorno QA', 
    render: r => {
      const count = r.qa_retorno_count ?? 0;
      if (count === 0) return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <Badge variant="destructive" className="text-xs font-mono">
          {count}x
        </Badge>
      );
    },
    className: 'text-center w-24'
  },
  { key: 'created_date', header: 'Criado', render: r => r.created_date ? new Date(r.created_date).toLocaleDateString('pt-BR') : '—', className: 'text-xs' },
];

export default function QualidadeDashboard() {
  const filters = useDashboardFilters('mes_atual');
  const { items, total, filaQA, emTeste, finalizados, taxaVazao, totalRetornos, itensComRetorno, taxaRetorno, lastSync, isLoading, isError, refetch } = useQualidadeKpis(filters.dateFrom, filters.dateTo);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<QualidadeItem | null>(null);
  const [kpiFilter, setKpiFilter] = useState<QaKpiFilter>('all');

  const toggleKpi = (f: QaKpiFilter) => setKpiFilter(prev => prev === f ? 'all' : f);

  const filteredItems = useMemo(() => {
    switch (kpiFilter) {
      case 'fila_qa': return items.filter(i => i.state === 'New' || i.state === 'To Do' || i.state === 'Active');
      case 'finalizados': return items.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved');
      case 'com_retorno': return items.filter(i => (i.qa_retorno_count ?? 0) > 0);
      default: return items;
    }
  }, [items, kpiFilter]);

  const handleExportCSV = () => exportCSV({
    title: 'Qualidade QA', area: 'Qualidade', periodLabel: filters.presetLabel,
    columns: ['id', 'title', 'state', 'assigned_to_display', 'priority', 'qa_retorno_count', 'created_date'],
    rows: items as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Dashboard Qualidade', area: 'Qualidade', periodLabel: filters.presetLabel,
    kpis: [
      { label: 'Total QA', value: total },
      { label: 'Fila QA (WIP)', value: filaQA },
      { label: 'Taxa Vazão', value: `${taxaVazao}%` },
      { label: 'Finalizados', value: finalizados },
      { label: 'Retorno QA', value: `${itensComRetorno} (${totalRetornos}x)` },
    ],
    columns: ['id', 'title', 'state', 'assigned_to_display', 'priority', 'qa_retorno_count'],
    rows: items as any[],
  });

  const drawerFields: DrawerField[] = drawerItem ? [
    { label: 'ID', value: drawerItem.id },
    { label: 'Título', value: drawerItem.title },
    { label: 'Tipo', value: drawerItem.work_item_type },
    { label: 'Estado', value: drawerItem.state },
    { label: 'Responsável', value: drawerItem.assigned_to_display },
    { label: 'Prioridade', value: drawerItem.priority != null ? `P${drawerItem.priority}` : '—' },
    { label: 'Retorno QA', value: (drawerItem.qa_retorno_count ?? 0) > 0 
      ? `${drawerItem.qa_retorno_count}x retornos para testes` 
      : 'Nenhum retorno' },
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <DashboardKpiCard label="Total QA" value={total} icon={FileCheck} isLoading={isLoading} onClick={() => toggleKpi('all')} active={kpiFilter === 'all'} />
            <DashboardKpiCard label="Fila QA (WIP)" value={filaQA} icon={Clock} isLoading={isLoading} delay={80} accent="bg-[hsl(43,85%,46%)]" onClick={() => toggleKpi('fila_qa')} active={kpiFilter === 'fila_qa'} />
            <DashboardKpiCard label="Taxa Vazão QA" value={taxaVazao} suffix="%" icon={TrendingUp} isLoading={isLoading} delay={160} accent="bg-[hsl(142,71%,45%)]" />
            <DashboardKpiCard label="Finalizados" value={finalizados} icon={BarChart3} isLoading={isLoading} delay={240} accent="bg-[hsl(199,89%,48%)]" onClick={() => toggleKpi('finalizados')} active={kpiFilter === 'finalizados'} />
            <DashboardKpiCard 
              label="Retorno QA" 
              value={itensComRetorno} 
              suffix={totalRetornos > 0 ? ` (${totalRetornos}x)` : ''} 
              icon={RotateCcw} 
              isLoading={isLoading} 
              delay={320} 
              accent="bg-[hsl(0,72%,51%)]" 
              onClick={() => toggleKpi('com_retorno')} 
              active={kpiFilter === 'com_retorno'} 
            />
          </div>

          {!isLoading && filteredItems.length === 0 ? (
            <DashboardEmptyState description="Nenhum item de qualidade para o período/filtro selecionado." />
          ) : (
            <DashboardDataTable
              title="Itens QA"
              subtitle={`${filteredItems.length} registros${kpiFilter === 'com_retorno' ? ' com retorno' : ''}`}
              columns={columns}
              data={filteredItems}
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
        externalUrl={drawerItem?.web_url}
        externalLabel="Abrir no DevOps"
      />
    </SectorLayout>
  );
}
