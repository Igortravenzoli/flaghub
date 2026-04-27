import { useState, useMemo, useEffect, useCallback } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useInfraestruturaKpis, InfraItem } from '@/hooks/useInfraestruturaKpis';
import { usePbiHealthBatch } from '@/hooks/usePbiHealthBatch';
import { useSprintFilter } from '@/hooks/useSprintFilter';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { useCrossSectorSearch } from '@/hooks/useCrossSectorSearch';
import { CrossSectorSearchBanner } from '@/components/dashboard/CrossSectorSearchBanner';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PbiHealthBadge } from '@/components/pbi/PbiHealthBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Server, Clock, Wrench, Shield, AlertTriangle, CheckCircle, HeartPulse, Workflow } from 'lucide-react';
import type { Integration } from '@/components/setores/SectorIntegrations';
import { getAvailableDateKeysFromItems, getDateBoundsFromItems } from '@/lib/dateBounds';
import { extractSprintCodeFromPath, formatSprintIntervalLabel, getCurrentOfficialSprintCode, getOfficialSprintRange } from '@/lib/sprintCalendar';

type InfraKpiFilter = 'all' | 'pendentes' | 'em_andamento' | 'concluidos' | 'melhorias' | 'iso27001' | 'transbordo' | 'migracoes';
type InfraHealthFilter = 'all' | 'verde' | 'amarelo' | 'vermelho';

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
  { key: 'sprint_migration_count' as any, header: 'Trocas Sprint', render: r => (r.sprint_migration_count || 0) > 0 ? <Badge variant="secondary" className="text-xs font-mono">{r.sprint_migration_count}</Badge> : <span className="text-muted-foreground">—</span> },
  { key: 'transbordo_count' as any, header: 'Transbordo', render: r => (r.transbordo_count || 0) > 0 ? <Badge variant="destructive" className="text-xs font-mono">{r.transbordo_count}</Badge> : <span className="text-muted-foreground">—</span> },
  { key: 'iteration_path', header: 'Sprint', className: 'text-xs text-muted-foreground max-w-[150px] truncate', render: r => r.iteration_path ? (r.iteration_path.split('\\').pop() || r.iteration_path) : '—' },
];

export default function InfraestruturaDashboard() {
  const [kpiFilter, setKpiFilter] = useState<InfraKpiFilter>('all');
  const [healthFilter, setHealthFilter] = useState<InfraHealthFilter>('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [sprintFilter, setSprintFilter] = useState<string>('__pending__');
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [customActive, setCustomActive] = useState(false);
  const { items, allItems, total, pendentes, emAndamento, concluidos, melhorias, iso27001, sprintMigracoes, transbordo, backlog, dev, lastSync, isLoading, isError } = useInfraestruturaKpis(undefined, undefined, 'all');
  const { sortedSprints } = useSprintFilter(allItems);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<InfraItem | null>(null);
  const [tableSearch, setTableSearch] = useState('');

  const localItemIds = useMemo(() => allItems.map(i => i.id).filter(Boolean) as number[], [allItems]);
  const { crossSectorResult } = useCrossSectorSearch(tableSearch, 'infraestrutura', localItemIds);
  const crossSectorBanner = crossSectorResult ? <CrossSectorSearchBanner result={crossSectorResult} /> : null;
  const handleTableSearchChange = useCallback((s: string) => setTableSearch(s), []);
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
    if (sprintFilter === '__pending__') {
      const officialCurrentCode = getCurrentOfficialSprintCode();
      const currentSprintPath = sortedSprints.find((sp) => extractSprintCodeFromPath(sp) === officialCurrentCode);
      setSprintFilter(currentSprintPath || sortedSprints[sortedSprints.length - 1]);
      return;
    }
    if (sprintFilter === 'all') return;
    if (!sortedSprints.includes(sprintFilter)) {
      const officialCurrentCode = getCurrentOfficialSprintCode();
      const currentSprintPath = sortedSprints.find((sp) => extractSprintCodeFromPath(sp) === officialCurrentCode);
      setSprintFilter(currentSprintPath || sortedSprints[sortedSprints.length - 1]);
    }
  }, [sortedSprints, sprintFilter]);

  const selectedSprintCode = sprintFilter !== 'all' ? extractSprintCodeFromPath(sprintFilter) : null;
  const sprintRange = selectedSprintCode ? getOfficialSprintRange(selectedSprintCode) : null;
  const effectiveRange = customActive && customRange
    ? customRange
    : sprintRange || { from: minDate || new Date(), to: maxDate || new Date() };

  const scoped = useInfraestruturaKpis(effectiveRange.from, effectiveRange.to, sprintFilter === 'all' ? 'all' : sprintFilter);
  const pbiHealthIds = useMemo(
    () => scoped.items.filter((i) => i.id && ['Product Backlog Item', 'User Story', 'Bug'].includes(i.work_item_type || '')).map((i) => i.id as number),
    [scoped.items]
  );
  const pbiHealthBatch = usePbiHealthBatch(pbiHealthIds, pbiHealthIds.length > 0);

  const toggleKpi = (f: InfraKpiFilter) => setKpiFilter(prev => prev === f ? 'all' : f);
  const toggleHealth = (f: InfraHealthFilter) => setHealthFilter(prev => prev === f ? 'all' : f);

  const filteredItems = useMemo(() => {
    switch (kpiFilter) {
      case 'pendentes': return scoped.items.filter(i => i.state === 'New' || i.state === 'To Do');
      case 'em_andamento': return scoped.items.filter(i => i.state === 'In Progress' || i.state === 'Active');
      case 'concluidos': return scoped.items.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved');
      case 'melhorias': return scoped.items.filter(i => i.tags?.toUpperCase().includes('MELHORIA'));
      case 'iso27001': return scoped.items.filter(i => i.tags?.toUpperCase().includes('ISO27001') || i.tags?.toUpperCase().includes('ISO'));
      case 'transbordo': return scoped.items.filter(i => (i.transbordo_count || 0) > 0);
      case 'migracoes': return scoped.items.filter(i => (i.sprint_migration_count || 0) > 0);
      default: return scoped.items;
    }
  }, [scoped.items, kpiFilter]);

  const healthFilteredItems = useMemo(() => {
    if (healthFilter === 'all') return scoped.items;
    return scoped.items.filter((item) => item.id && pbiHealthBatch.healthById.get(item.id)?.health_status === healthFilter);
  }, [healthFilter, pbiHealthBatch.healthById, scoped.items]);

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
      { label: 'Trocas de Sprint', value: scoped.sprintMigracoes },
      { label: 'Transbordo', value: scoped.transbordo },
    ],
    columns: ['id', 'work_item_type', 'title', 'assigned_to_display', 'state', 'priority', 'sprint_migration_count', 'transbordo_count', 'iteration_path'],
    rows: scoped.items as any[],
  });

  const drawerFields: DrawerField[] = drawerItem ? [
    { label: 'ID', value: drawerItem.id },
    { label: 'Título', value: drawerItem.title },
    { label: 'Tipo', value: drawerItem.work_item_type },
    { label: 'Estado', value: drawerItem.state },
    { label: 'Responsável', value: drawerItem.assigned_to_display },
    { label: 'Prioridade', value: drawerItem.priority != null ? `P${drawerItem.priority}` : '—' },
    { label: 'Trocas de sprint', value: drawerItem.sprint_migration_count ?? 0 },
    { label: 'Transbordo real', value: drawerItem.real_overflow_count ?? drawerItem.transbordo_count ?? 0 },
    { label: 'Tags', value: drawerItem.tags },
    { label: 'Esforço', value: drawerItem.effort != null ? `${drawerItem.effort}h` : '—' },
    { label: 'Criado em', value: drawerItem.created_date ? new Date(drawerItem.created_date).toLocaleString('pt-BR') : '—' },
    { label: 'Alterado em', value: drawerItem.changed_date ? new Date(drawerItem.changed_date).toLocaleString('pt-BR') : '—' },
  ] : [];

  return (
    <SectorLayout title="Infraestrutura" subtitle="Atividades, Melhorias e Monitoramento" lastUpdate="" integrations={integrations} areaKey="infraestrutura" syncFunctions={[{ name: 'devops-sync-query', label: 'Atualizar query 07-Infraestrutura', payload: { wiql_id: 'e6af59bf-64c5-4bf5-b926-d5039e9222f2', query_name: '07-Infraestrutura', sector: 'infraestrutura' } }, { name: 'devops-sync-all', label: 'Sincronizar base DevOps', payload: { sector: 'infraestrutura' } }]}>
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
              <SelectItem value="all">Todas as Sprints</SelectItem>
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="overview" className="gap-1.5 text-xs"><Server className="h-3.5 w-3.5" />Visão Geral</TabsTrigger>
            <TabsTrigger value="esteira-saude" className="gap-1.5 text-xs"><HeartPulse className="h-3.5 w-3.5" />Esteira / Saúde</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bloco Status Sprint */}
            {scoped.isLoading ? (
              <Card className="p-6"><Skeleton className="h-3 w-28 mb-4" /><Skeleton className="h-9 w-20 mb-2" /><Skeleton className="h-2 w-full rounded-full mb-5" /><div className="grid grid-cols-3 gap-2 pt-4 border-t border-border">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-12 w-full rounded-lg"/>)}</div></Card>
            ) : (
              <Card className="p-6">
                <p className="text-xs font-medium text-muted-foreground mb-4">STATUS SPRINT</p>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Total de atividades</p>
                    <span className="text-4xl font-bold text-foreground">{scoped.total}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Concluídas</p>
                    <span className={`text-2xl font-semibold ${scoped.concluidos > 0 ? 'text-[hsl(142,71%,45%)]' : 'text-muted-foreground'}`}>
                      {scoped.total > 0 ? Math.round((scoped.concluidos / scoped.total) * 100) : 0}%
                    </span>
                  </div>
                </div>
                {(() => {
                  const total = scoped.total || 1;
                  const conclPct = (scoped.concluidos / total) * 100;
                  const andPct = (scoped.emAndamento / total) * 100;
                  return (
                    <div className="relative h-2 rounded-full bg-muted overflow-hidden mb-5">
                      <div className="absolute left-0 top-0 h-full bg-[hsl(142,71%,45%)] transition-all duration-500" style={{ width: `${conclPct}%` }} />
                      <div className="absolute top-0 h-full bg-[hsl(var(--info))] transition-all duration-500" style={{ left: `${conclPct}%`, width: `${andPct}%` }} />
                    </div>
                  );
                })()}
                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border">
                  {[
                    { key: 'em_andamento' as InfraKpiFilter, label: 'Em Andamento', value: scoped.emAndamento, dotColor: 'bg-[hsl(var(--info))]' },
                    { key: 'pendentes' as InfraKpiFilter, label: 'Pendentes', value: scoped.pendentes, dotColor: 'bg-amber-400' },
                    { key: 'concluidos' as InfraKpiFilter, label: 'Concluídos', value: scoped.concluidos, dotColor: 'bg-[hsl(142,71%,45%)]' },
                  ].map(item => (
                    <button key={item.key} onClick={() => toggleKpi(item.key)}
                      className={`text-left p-2 rounded-lg transition-colors hover:bg-muted/50 focus-visible:outline-none ${kpiFilter === item.key ? 'bg-muted' : ''}`}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div className={`h-1.5 w-1.5 rounded-full ${item.dotColor}`} />
                        <span className="text-[11px] font-medium text-muted-foreground">{item.label}</span>
                      </div>
                      <span className="text-xl font-bold text-foreground">{item.value}</span>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {/* Bloco Iniciativas & Riscos */}
            {scoped.isLoading ? (
              <Card className="p-6"><Skeleton className="h-3 w-36 mb-4" /><div className="grid grid-cols-2 gap-3">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-20 w-full rounded-lg"/>)}</div></Card>
            ) : (
              <Card className="p-6">
                <p className="text-xs font-medium text-muted-foreground mb-4">INICIATIVAS & RISCOS</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'melhorias' as InfraKpiFilter, label: 'Melhorias', value: scoped.melhorias, icon: Wrench, dotColor: 'bg-[hsl(142,71%,45%)]', iconBg: 'bg-[hsl(142,71%,45%)]/10', iconColor: 'text-[hsl(142,71%,45%)]' },
                    { key: 'iso27001' as InfraKpiFilter, label: 'ISO 27001', value: scoped.iso27001, icon: Shield, dotColor: 'bg-[hsl(280,65%,60%)]', iconBg: 'bg-[hsl(280,65%,60%)]/10', iconColor: 'text-[hsl(280,65%,60%)]' },
                    { key: 'migracoes' as InfraKpiFilter, label: 'Trocas Sprint', value: scoped.sprintMigracoes, icon: Workflow, dotColor: 'bg-[hsl(210,80%,52%)]', iconBg: 'bg-[hsl(210,80%,52%)]/10', iconColor: 'text-[hsl(210,80%,52%)]' },
                    { key: 'transbordo' as InfraKpiFilter, label: 'Transbordo', value: scoped.transbordo, icon: AlertTriangle, dotColor: scoped.transbordo > 0 ? 'bg-destructive' : 'bg-muted-foreground', iconBg: scoped.transbordo > 0 ? 'bg-destructive/10' : 'bg-muted', iconColor: scoped.transbordo > 0 ? 'text-destructive' : 'text-muted-foreground' },
                  ].map(item => {
                    const Icon = item.icon;
                    return (
                      <button key={item.key} onClick={() => toggleKpi(item.key)}
                        className={`text-left p-3 rounded-lg border border-border transition-colors hover:bg-muted/30 focus-visible:outline-none ${kpiFilter === item.key ? 'border-primary bg-primary/5' : ''}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`p-1 rounded-md ${item.iconBg}`}>
                            <Icon className={`h-3 w-3 ${item.iconColor}`} />
                          </div>
                          <span className="text-[11px] font-medium text-muted-foreground">{item.label}</span>
                        </div>
                        <span className="text-2xl font-bold text-foreground">{item.value}</span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            )}
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
              onSearchChange={handleTableSearchChange}
              searchBanner={crossSectorBanner}
            />
          )}
          </TabsContent>

          <TabsContent value="esteira-saude" className="space-y-4 mt-0">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <DashboardKpiCard label="Itens monitorados" value={pbiHealthBatch.overview.total} icon={Server} isLoading={pbiHealthBatch.isLoading} onClick={() => toggleHealth('all')} active={healthFilter === 'all'} />
              <DashboardKpiCard label="Saudável" value={pbiHealthBatch.overview.verde} icon={HeartPulse} isLoading={pbiHealthBatch.isLoading} accent="bg-[hsl(142,71%,45%)]" onClick={() => toggleHealth('verde')} active={healthFilter === 'verde'} />
              <DashboardKpiCard label="Atenção" value={pbiHealthBatch.overview.amarelo} icon={AlertTriangle} isLoading={pbiHealthBatch.isLoading} accent="bg-[hsl(43,85%,46%)]" onClick={() => toggleHealth('amarelo')} active={healthFilter === 'amarelo'} />
              <DashboardKpiCard label="Crítica" value={pbiHealthBatch.overview.vermelho} icon={AlertTriangle} isLoading={pbiHealthBatch.isLoading} accent="bg-destructive" onClick={() => toggleHealth('vermelho')} active={healthFilter === 'vermelho'} />
            </div>

            {!isLoading && healthFilteredItems.length === 0 ? (
              <DashboardEmptyState description="Nenhum item monitorável na esteira de Infraestrutura para o filtro selecionado." />
            ) : (
              <DashboardDataTable
                title="Esteira / Saúde Infraestrutura"
                subtitle={`${healthFilteredItems.length} itens monitorados${healthFilter !== 'all' ? ` • filtro ${healthFilter === 'verde' ? 'Saudável' : healthFilter === 'amarelo' ? 'Atenção' : healthFilter === 'vermelho' ? 'Crítica' : healthFilter}` : ''}`}
                columns={[
                  { key: 'health', header: 'Saúde', className: 'w-20', render: (row: InfraItem) => <PbiHealthBadge status={row.id ? pbiHealthBatch.healthById.get(row.id)?.health_status : null} compact /> },
                  ...columns,
                ]}
                data={healthFilteredItems}
                isLoading={pbiHealthBatch.isLoading}
                getRowKey={(r) => String(r.id ?? Math.random())}
                onRowClick={(r) => setDrawerItem(r)}
                searchPlaceholder="Buscar item monitorado..."
              />
            )}
          </TabsContent>
        </Tabs>
      )}

      <DashboardDrawer
        open={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        title={drawerItem?.title || undefined}
        subtitle={drawerItem?.work_item_type || undefined}
        fields={drawerFields}
        workItemId={drawerItem?.id}
        workItemType={drawerItem?.work_item_type}
        externalUrl={drawerItem?.web_url}
      />
    </SectorLayout>
  );
}
