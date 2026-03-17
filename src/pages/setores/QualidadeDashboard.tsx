import { useState, useMemo, useEffect } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useQualidadeKpis, QualidadeItem } from '@/hooks/useQualidadeKpis';
import { useSprintFilter } from '@/hooks/useSprintFilter';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileCheck, Clock, TrendingUp, BarChart3, RotateCcw, Plane } from 'lucide-react';
import type { Integration } from '@/components/setores/SectorIntegrations';
import { getAvailableDateKeysFromItems, getDateBoundsFromItems } from '@/lib/dateBounds';
import { extractSprintCodeFromPath, formatSprintIntervalLabel, getCurrentOfficialSprintCode, getOfficialSprintRange } from '@/lib/sprintCalendar';

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
  { key: 'work_item_type', header: 'Tipo', render: r => <Badge variant="outline" className="text-xs">{r.work_item_type || '—'}</Badge> },
  { key: 'title', header: 'Título', className: 'max-w-[350px] truncate' },
  { key: 'assigned_to_display', header: 'Colaborador' },
  { key: 'state', header: 'Estado', render: r => <Badge variant="outline" className="text-xs">{r.state || '—'}</Badge> },
  { key: 'priority', header: 'Prioridade', render: r => r.priority != null ? <Badge variant="secondary" className="text-xs">P{r.priority}</Badge> : '—' },
  { key: 'transbordo_count' as any, header: 'Transbordo', render: r => /TRANSBORDO/i.test(r.tags || '') ? <Badge variant="destructive" className="text-xs">1</Badge> : <span className="text-muted-foreground">—</span>, className: 'text-center w-20' },
  { key: 'iteration_path', header: 'Sprint', className: 'text-xs text-muted-foreground max-w-[120px] truncate', render: r => r.iteration_path ? (r.iteration_path.split('\\').pop() || r.iteration_path) : '—' },
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
  const [kpiFilter, setKpiFilter] = useState<QaKpiFilter>('all');
  const [sprintFilter, setSprintFilter] = useState<string>('all');
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [customActive, setCustomActive] = useState(false);
  const base = useQualidadeKpis(undefined, undefined, 'all');
  const { allItems, lastSync, isLoading, isError } = base;
  const { sortedSprints } = useSprintFilter(allItems);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<QualidadeItem | null>(null);

  const { minDate, maxDate } = useMemo(
    () => getDateBoundsFromItems(allItems, [(i) => i.created_date, (i) => i.changed_date]),
    [allItems]
  );

  const availableDateKeys = useMemo(
    () => getAvailableDateKeysFromItems(allItems, [(i) => i.created_date, (i) => i.changed_date]),
    [allItems]
  );

  useEffect(() => {
    if (sortedSprints.length === 0) return;
    if (sprintFilter !== 'all' && sortedSprints.includes(sprintFilter)) return;

    const officialCurrentCode = getCurrentOfficialSprintCode();
    const currentSprintPath = sortedSprints.find((sp) => extractSprintCodeFromPath(sp) === officialCurrentCode);
    setSprintFilter(currentSprintPath || sortedSprints[sortedSprints.length - 1]);
  }, [sortedSprints, sprintFilter]);

  const selectedSprintCode = sprintFilter !== 'all' ? extractSprintCodeFromPath(sprintFilter) : null;
  const sprintRange = selectedSprintCode ? getOfficialSprintRange(selectedSprintCode) : null;
  const effectiveRange = customActive && customRange
    ? customRange
    : sprintRange || { from: minDate || new Date(), to: maxDate || new Date() };

  const scoped = useQualidadeKpis(effectiveRange.from, effectiveRange.to, sprintFilter === 'all' ? 'all' : sprintFilter);

  const toggleKpi = (f: QaKpiFilter) => setKpiFilter(prev => prev === f ? 'all' : f);

  const filteredItems = useMemo(() => {
    switch (kpiFilter) {
      case 'fila_qa': return scoped.items.filter(i => i.state === 'New' || i.state === 'To Do' || i.state === 'Active');
      case 'finalizados': return scoped.items.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved');
      case 'com_retorno': return scoped.items.filter(i => (i.qa_retorno_count ?? 0) > 0);
      default: return scoped.items;
    }
  }, [scoped.items, kpiFilter]);

  const handleExportCSV = () => exportCSV({
    title: 'Qualidade QA', area: 'Qualidade', periodLabel: customActive ? 'Custom' : (selectedSprintCode ? formatSprintIntervalLabel(selectedSprintCode) : 'Sprint'),
    columns: ['id', 'work_item_type', 'title', 'assigned_to_display', 'state', 'priority', 'iteration_path', 'qa_retorno_count', 'created_date'],
    rows: scoped.items as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Dashboard Qualidade', area: 'Qualidade', periodLabel: customActive ? 'Custom' : (selectedSprintCode ? formatSprintIntervalLabel(selectedSprintCode) : 'Sprint'),
    kpis: [
      { label: 'Total QA', value: scoped.total },
      { label: 'Fila QA (WIP)', value: scoped.filaQA },
      { label: 'Taxa Vazão', value: `${scoped.taxaVazao}%` },
      { label: 'Finalizados', value: scoped.finalizados },
      { label: 'Retorno QA', value: `${scoped.itensComRetorno} (${scoped.totalRetornos}x)` },
    ],
    columns: ['id', 'work_item_type', 'title', 'assigned_to_display', 'state', 'priority', 'iteration_path', 'qa_retorno_count'],
    rows: scoped.items as any[],
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
    <SectorLayout title="Qualidade" subtitle="Gestão à Vista — QA" lastUpdate="" integrations={integrations} areaKey="qualidade" syncFunctions={[{ name: 'devops-sync-all', label: 'Sincronizar Work Items (DevOps)' }]}>
      <div className="flex items-center justify-between mb-2">
        <DashboardLastSyncBadge syncedAt={lastSync} status="ok" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {sortedSprints.length > 0 && (
          <Select value={sprintFilter} onValueChange={(v) => { setSprintFilter(v); setCustomActive(false); setKpiFilter('all'); }}>
            <SelectTrigger className="w-[220px] h-8 text-xs">
              <SelectValue placeholder="Sprint" />
            </SelectTrigger>
            <SelectContent>
              {[...sortedSprints].reverse().map(sp => (
                <SelectItem key={sp} value={sp}>{sp.split('\\').pop()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DashboardFilterBar
          preset={customActive ? 'custom' : 'all'}
          onPresetChange={() => { setCustomActive(false); setKpiFilter('all'); }}
          presetLabel={customActive ? 'Custom' : 'Sprint'}
          presets={[]}
          dateFrom={effectiveRange.from}
          dateTo={effectiveRange.to}
          minDate={minDate}
          maxDate={maxDate}
          availableDateKeys={availableDateKeys}
          onCustomRange={(from, to) => { setCustomRange({ from, to }); setCustomActive(true); setKpiFilter('all'); }}
          onExportCSV={handleExportCSV}
          onExportPDF={handleExportPDF}
        />
      </div>

      {isError ? (
        <DashboardEmptyState variant="error" onRetry={() => scoped.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <DashboardKpiCard label="Total QA" value={scoped.total} icon={FileCheck} isLoading={scoped.isLoading} onClick={() => toggleKpi('all')} active={kpiFilter === 'all'} />
            <DashboardKpiCard label="Fila QA (WIP)" value={scoped.filaQA} icon={Clock} isLoading={scoped.isLoading} delay={80} accent="bg-[hsl(43,85%,46%)]" onClick={() => toggleKpi('fila_qa')} active={kpiFilter === 'fila_qa'} />
            <DashboardKpiCard label="Taxa Vazão QA" value={scoped.taxaVazao} suffix="%" icon={TrendingUp} isLoading={scoped.isLoading} delay={160} accent="bg-[hsl(142,71%,45%)]" />
            <DashboardKpiCard label="Finalizados" value={scoped.finalizados} icon={BarChart3} isLoading={scoped.isLoading} delay={240} accent="bg-[hsl(199,89%,48%)]" onClick={() => toggleKpi('finalizados')} active={kpiFilter === 'finalizados'} />
            <DashboardKpiCard 
              label="Retorno QA" 
              value={scoped.itensComRetorno} 
              suffix={scoped.totalRetornos > 0 ? ` (${scoped.totalRetornos}x)` : ''} 
              icon={RotateCcw} 
              isLoading={scoped.isLoading} 
              delay={320} 
              accent="bg-[hsl(0,72%,51%)]" 
              onClick={() => toggleKpi('com_retorno')} 
              active={kpiFilter === 'com_retorno'} 
            />
            <DashboardKpiCard label="Aviões testados" value={scoped.avioesTestados} icon={Plane} isLoading={scoped.isLoading} delay={360} accent="bg-[hsl(210,80%,52%)]" />
          </div>

          {!isLoading && filteredItems.length === 0 ? (
            <DashboardEmptyState description="Nenhum item de qualidade para o período/filtro selecionado." />
          ) : (
            <DashboardDataTable
              title="Itens QA"
              subtitle={`${filteredItems.length} registros${kpiFilter === 'com_retorno' ? ' com retorno' : ''}`}
              columns={columns}
              data={filteredItems}
              isLoading={scoped.isLoading}
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
