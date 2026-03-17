import { useState, useMemo, useEffect } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useInfraestruturaKpis, InfraItem } from '@/hooks/useInfraestruturaKpis';
import { useSprintFilter } from '@/hooks/useSprintFilter';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Server, Clock, Wrench, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import type { Integration } from '@/components/setores/SectorIntegrations';
import { getAvailableDateKeysFromItems, getDateBoundsFromItems } from '@/lib/dateBounds';
import { extractSprintCodeFromPath, formatSprintIntervalLabel, getCurrentOfficialSprintCode, getOfficialSprintRange } from '@/lib/sprintCalendar';

type InfraKpiFilter = 'all' | 'pendentes' | 'em_andamento' | 'concluidos' | 'melhorias' | 'iso27001' | 'transbordo';

const integrations: Integration[] = [
  { name: 'Azure DevOps', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Work Items Infra' },
];

const columns: DataTableColumn<InfraItem>[] = [
  { key: 'id', header: 'ID', className: 'font-mono text-xs w-16', render: r => r.web_url ? (
    <a href={r.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono" onClick={e => e.stopPropagation()}>{r.id}</a>
  ) : <span>{r.id}</span> },
  { key: 'work_item_type', header: 'Tipo', render: r => <Badge variant="outline" className="text-xs">{r.work_item_type || '—'}</Badge> },
  { key: 'title', header: 'Título', className: 'max-w-[350px] truncate' },
  { key: 'assigned_to_display', header: 'Colaborador' },
  { key: 'state', header: 'Status', render: r => <Badge variant="outline" className="text-xs">{r.state || '—'}</Badge> },
  { key: 'priority', header: 'Prioridade', render: r => r.priority != null ? <Badge variant="secondary" className="text-xs">P{r.priority}</Badge> : '—' },
  { key: 'transbordo_count' as any, header: 'Transbordo', render: r => (r.transbordo_count || 0) > 0 ? <Badge variant="destructive" className="text-xs font-mono">{r.transbordo_count}</Badge> : <span className="text-muted-foreground">—</span> },
  { key: 'iteration_path', header: 'Sprint', className: 'text-xs text-muted-foreground max-w-[150px] truncate', render: r => r.iteration_path ? (r.iteration_path.split('\\').pop() || r.iteration_path) : '—' },
];

export default function InfraestruturaDashboard() {
  const [kpiFilter, setKpiFilter] = useState<InfraKpiFilter>('all');
  const [sprintFilter, setSprintFilter] = useState<string>('all');
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [customActive, setCustomActive] = useState(false);
  const { items, allItems, total, pendentes, emAndamento, concluidos, melhorias, iso27001, transbordo, backlog, dev, lastSync, isLoading, isError } = useInfraestruturaKpis(undefined, undefined, 'all');
  const { sortedSprints } = useSprintFilter(allItems);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<InfraItem | null>(null);

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

  const scoped = useInfraestruturaKpis(effectiveRange.from, effectiveRange.to, sprintFilter === 'all' ? 'all' : sprintFilter);

  const toggleKpi = (f: InfraKpiFilter) => setKpiFilter(prev => prev === f ? 'all' : f);

  const filteredItems = useMemo(() => {
    switch (kpiFilter) {
      case 'pendentes': return scoped.items.filter(i => i.state === 'New' || i.state === 'To Do');
      case 'em_andamento': return scoped.items.filter(i => i.state === 'In Progress' || i.state === 'Active');
      case 'concluidos': return scoped.items.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved');
      case 'melhorias': return scoped.items.filter(i => i.tags?.toUpperCase().includes('MELHORIA'));
      case 'iso27001': return scoped.items.filter(i => i.tags?.toUpperCase().includes('ISO27001') || i.tags?.toUpperCase().includes('ISO'));
      case 'transbordo': return scoped.items.filter(i => (i.transbordo_count || 0) > 0);
      default: return scoped.items;
    }
  }, [scoped.items, kpiFilter]);

  const handleExportCSV = () => exportCSV({
    title: 'Infraestrutura', area: 'Infraestrutura', periodLabel: customActive ? 'Custom' : (selectedSprintCode ? formatSprintIntervalLabel(selectedSprintCode) : 'Sprint'),
    columns: ['id', 'work_item_type', 'title', 'assigned_to_display', 'state', 'priority', 'transbordo_count', 'iteration_path'],
    rows: scoped.items as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Dashboard Infraestrutura', area: 'Infraestrutura', periodLabel: customActive ? 'Custom' : (selectedSprintCode ? formatSprintIntervalLabel(selectedSprintCode) : 'Sprint'),
    kpis: [
      { label: 'Total', value: scoped.total },
      { label: 'Pendentes', value: scoped.pendentes },
      { label: 'Em Andamento', value: scoped.emAndamento },
      { label: 'Melhorias', value: scoped.melhorias },
      { label: 'ISO 27001', value: scoped.iso27001 },
      { label: 'Transbordo', value: scoped.transbordo },
    ],
    columns: ['id', 'work_item_type', 'title', 'assigned_to_display', 'state', 'priority', 'transbordo_count', 'iteration_path'],
    rows: scoped.items as any[],
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <DashboardKpiCard label="Total Atividades" value={scoped.total} icon={Server} isLoading={scoped.isLoading} onClick={() => toggleKpi('all')} active={kpiFilter === 'all'} />
            <DashboardKpiCard label="Pendentes" value={scoped.pendentes} icon={Clock} isLoading={scoped.isLoading} delay={80} accent="bg-[hsl(43,85%,46%)]" onClick={() => toggleKpi('pendentes')} active={kpiFilter === 'pendentes'} />
            <DashboardKpiCard label="Em Andamento" value={scoped.emAndamento} icon={Wrench} isLoading={scoped.isLoading} delay={160} accent="bg-[hsl(var(--info))]" onClick={() => toggleKpi('em_andamento')} active={kpiFilter === 'em_andamento'} />
            <DashboardKpiCard label="Concluídos" value={scoped.concluidos} icon={CheckCircle} isLoading={scoped.isLoading} delay={240} accent="bg-[hsl(142,71%,45%)]" onClick={() => toggleKpi('concluidos')} active={kpiFilter === 'concluidos'} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <DashboardKpiCard label="Melhorias Implementadas" value={scoped.melhorias} icon={Wrench} isLoading={scoped.isLoading} delay={300} accent="bg-[hsl(142,71%,45%)]" onClick={() => toggleKpi('melhorias')} active={kpiFilter === 'melhorias'} />
            <DashboardKpiCard label="Atividades ISO 27001" value={scoped.iso27001} icon={Shield} isLoading={scoped.isLoading} delay={360} accent="bg-[hsl(280,65%,60%)]" onClick={() => toggleKpi('iso27001')} active={kpiFilter === 'iso27001'} />
            <DashboardKpiCard label="Transbordo" value={scoped.transbordo} icon={AlertTriangle} isLoading={scoped.isLoading} delay={420} accent="bg-[hsl(0,84%,60%)]" onClick={() => toggleKpi('transbordo')} active={kpiFilter === 'transbordo'} />
          </div>

          {!isLoading && filteredItems.length === 0 ? (
            <DashboardEmptyState description="Nenhum item de infraestrutura para o período/filtro selecionado." />
          ) : (
            <DashboardDataTable
              title="Atividades Infraestrutura"
              subtitle={`${filteredItems.length} itens • Backlog: ${scoped.backlog} • Dev: ${scoped.dev}`}
              columns={columns}
              data={filteredItems}
              isLoading={scoped.isLoading}
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
