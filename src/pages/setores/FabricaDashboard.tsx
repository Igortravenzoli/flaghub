import { useState, useMemo, useCallback } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useFabricaKpis, FabricaItem } from '@/hooks/useFabricaKpis';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Code2, ListTodo, Bug, Users, ChevronRight, ChevronDown, Search, ChevronLeft, Clock, Gauge, AlertTriangle, HelpCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { Integration } from '@/components/setores/SectorIntegrations';

type FabKpiFilter = 'all' | 'in_progress' | 'todo' | 'done';

const integrations: Integration[] = [
  { name: 'Azure DevOps API', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Work Items, Sprints' },
  { name: 'DevOps TimeLog', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Horas alocadas (TechsBCN)' },
];

const typeColors: Record<string, string> = {
  'Product Backlog Item': 'bg-primary/15 text-primary border-primary/30',
  'Task': 'bg-accent text-accent-foreground',
  'Bug': 'bg-destructive/15 text-destructive border-destructive/30',
  'User Story': 'bg-[hsl(var(--info))]/15 text-[hsl(var(--info))]',
};
const typeLabels: Record<string, string> = {
  'Product Backlog Item': 'PBI',
  'Task': 'Task',
  'Bug': 'Bug',
  'User Story': 'Story',
};
const stateColors: Record<string, string> = {
  'In Progress': 'bg-[hsl(var(--info))] text-white',
  'Active': 'bg-[hsl(var(--info))] text-white',
  'To Do': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'New': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'Done': 'bg-[hsl(var(--success))] text-white',
  'Closed': 'bg-[hsl(var(--success))] text-white',
  'Resolved': 'bg-[hsl(var(--success))] text-white',
};

export default function FabricaDashboard() {
  const filters = useDashboardFilters('mes_atual');
  const fab = useFabricaKpis(filters.dateFrom, filters.dateTo);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<FabricaItem | null>(null);
  const [fabKpiFilter, setFabKpiFilter] = useState<FabKpiFilter>('all');
  const [expandedPbis, setExpandedPbis] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const colabChartData = useMemo(() =>
    Object.entries(fab.porColaborador)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name: name.split(' ').slice(0, 2).join(' '), count })),
    [fab.porColaborador]
  );

  const filteredFabItems = useMemo(() => {
    switch (fabKpiFilter) {
      case 'in_progress': return fab.items.filter(i => i.state === 'In Progress' || i.state === 'Active');
      case 'todo': return fab.items.filter(i => i.state === 'To Do' || i.state === 'New');
      case 'done': return fab.items.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved');
      default: return fab.items;
    }
  }, [fab.items, fabKpiFilter]);

  // Build hierarchy: PBIs (parents) with their children
  const { parentRows, childrenMap, orphanRows } = useMemo(() => {
    const q = search.toLowerCase();
    const matchesSearch = (item: FabricaItem) => {
      if (!q) return true;
      return [item.title, item.assigned_to_display, item.state, String(item.id)]
        .some(v => v && String(v).toLowerCase().includes(q));
    };

    const allIds = new Set(filteredFabItems.map(i => i.id));
    const cMap = new Map<number, FabricaItem[]>();
    const parents: FabricaItem[] = [];
    const orphans: FabricaItem[] = [];

    for (const item of filteredFabItems) {
      const isChild = item.work_item_type === 'Task' || item.work_item_type === 'Bug';
      if (isChild && item.parent_id && allIds.has(item.parent_id)) {
        const existing = cMap.get(item.parent_id) || [];
        existing.push(item);
        cMap.set(item.parent_id, existing);
      } else if (isChild && item.parent_id && !allIds.has(item.parent_id)) {
        orphans.push(item);
      } else {
        parents.push(item);
      }
    }

    const filteredParents = parents.filter(p => {
      if (matchesSearch(p)) return true;
      const children = cMap.get(p.id!) || [];
      return children.some(matchesSearch);
    });

    const filteredOrphans = orphans.filter(matchesSearch);

    const filteredCMap = new Map<number, FabricaItem[]>();
    for (const [pid, children] of cMap.entries()) {
      const parent = filteredParents.find(p => p.id === pid);
      if (!parent) continue;
      if (q) {
        const parentMatches = matchesSearch(parent);
        const fc = parentMatches ? children : children.filter(matchesSearch);
        if (fc.length > 0) filteredCMap.set(pid, fc);
      } else {
        filteredCMap.set(pid, children);
      }
    }

    return { parentRows: filteredParents, childrenMap: filteredCMap, orphanRows: filteredOrphans };
  }, [filteredFabItems, search]);

  const allTopLevel = useMemo(() => [...parentRows, ...orphanRows], [parentRows, orphanRows]);
  const totalPages = Math.max(1, Math.ceil(allTopLevel.length / PAGE_SIZE));
  const pagedTopLevel = allTopLevel.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleExpand = useCallback((id: number) => {
    setExpandedPbis(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleFab = (f: FabKpiFilter) => { setFabKpiFilter(prev => prev === f ? 'all' : f); setPage(0); };

  const handleExportCSV = () => exportCSV({
    title: 'Sprint Board', area: 'Fábrica', periodLabel: filters.presetLabel,
    columns: ['id', 'title', 'assigned_to_display', 'state', 'priority', 'iteration_path'],
    rows: fab.items as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Dashboard Fábrica', area: 'Fábrica', periodLabel: filters.presetLabel,
    kpis: [
      { label: 'Total', value: fab.total },
      { label: 'Em Progresso', value: fab.inProgress },
      { label: 'To Do', value: fab.toDo },
      { label: 'Done', value: fab.done },
    ],
    columns: ['id', 'title', 'assigned_to_display', 'state', 'priority'],
    rows: fab.items as any[],
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
    ...(drawerItem.parent_title ? [{ label: 'Parent', value: drawerItem.parent_title }] : []),
  ] : [];

  const renderItemCells = (item: FabricaItem, indent = false) => (
    <>
      <TableCell className="font-mono text-xs w-16">
        {item.web_url ? (
          <a href={item.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono" onClick={e => e.stopPropagation()}>{item.id}</a>
        ) : <span>{item.id}</span>}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={`text-xs ${typeColors[item.work_item_type || ''] || ''}`}>
          {typeLabels[item.work_item_type || ''] || item.work_item_type || '—'}
        </Badge>
      </TableCell>
      <TableCell className={`max-w-[350px] truncate text-sm ${indent ? 'pl-8' : ''}`}>
        {item.title || '—'}
      </TableCell>
      <TableCell className="text-sm">{item.assigned_to_display || '—'}</TableCell>
      <TableCell>
        <Badge className={`text-xs font-mono ${stateColors[item.state || ''] || ''}`}>{item.state || '—'}</Badge>
      </TableCell>
      <TableCell>
        {item.priority != null ? <Badge variant="secondary" className="text-xs">P{item.priority}</Badge> : '—'}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{item.iteration_path || '—'}</TableCell>
    </>
  );

  return (
    <SectorLayout title="Fábrica" subtitle="Programação — Sprint Board" lastUpdate="" integrations={integrations} areaKey="fabrica" syncFunctions={[{ name: 'devops-sync-all', label: 'Sincronizar Work Items (DevOps)' }, { name: 'devops-sync-timelog', label: 'Sincronizar TimeLog (Horas)' }]}>
      <div className="flex items-center justify-between mb-2">
        <DashboardLastSyncBadge syncedAt={fab.lastSync} status="ok" />
      </div>

      <DashboardFilterBar
        preset={filters.preset}
        onPresetChange={(p) => { filters.setPreset(p); setFabKpiFilter('all'); setPage(0); }}
        presetLabel={filters.presetLabel}
        onRefresh={() => fab.refetch()}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
      />

      {fab.isError ? (
        <DashboardEmptyState variant="error" onRetry={() => fab.refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <DashboardKpiCard label="Total Tasks" value={fab.total} icon={ListTodo} isLoading={fab.isLoading} onClick={() => toggleFab('all')} active={fabKpiFilter === 'all'} />
            <DashboardKpiCard label="Em Progresso" value={fab.inProgress} icon={Code2} isLoading={fab.isLoading} delay={80} accent="bg-[hsl(var(--info))]" onClick={() => toggleFab('in_progress')} active={fabKpiFilter === 'in_progress'} />
            <DashboardKpiCard label="To Do" value={fab.toDo} icon={ListTodo} isLoading={fab.isLoading} delay={160} accent="bg-[hsl(43,85%,46%)]" onClick={() => toggleFab('todo')} active={fabKpiFilter === 'todo'} />
            <DashboardKpiCard label="Done" value={fab.done} icon={Bug} isLoading={fab.isLoading} delay={240} accent="bg-[hsl(142,71%,45%)]" onClick={() => toggleFab('done')} active={fabKpiFilter === 'done'} />
          </div>

          {/* Corporate KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4 animate-fade-in">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Clock className="h-4 w-4 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground font-medium">Lead Time Médio</p>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {fab.isLoading ? '—' : fab.leadTimeMedio != null ? `${fab.leadTimeMedio}h` : <span className="text-sm font-normal text-muted-foreground">Sem dados de horas</span>}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Horas trabalhadas / PBI</p>
            </Card>

            <Card className="p-4 animate-fade-in" style={{ animationDelay: '80ms' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-xl bg-[hsl(var(--info))]/10">
                  <Gauge className="h-4 w-4 text-[hsl(var(--info))]" />
                </div>
                <p className="text-xs text-muted-foreground font-medium">Velocidade Média</p>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {fab.isLoading ? '—' : fab.velocidadeMedia != null ? `${fab.velocidadeMedia}h` : <span className="text-sm font-normal text-muted-foreground">Sem dados de horas</span>}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Horas / Sprint{fab.sprintCount > 0 ? ` (${fab.sprintCount} sprints)` : ''}</p>
            </Card>

            <Card className="p-4 animate-fade-in" style={{ animationDelay: '160ms' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-xl bg-[hsl(43,85%,46%)]/10">
                  <AlertTriangle className="h-4 w-4 text-[hsl(43,85%,46%)]" />
                </div>
                <p className="text-xs text-muted-foreground font-medium">Transbordo</p>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {fab.isLoading ? '—' : fab.transbordoPct != null ? `${fab.transbordoPct}%` : <span className="text-sm font-normal text-muted-foreground">Sem dados</span>}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Não entregues na sprint planejada</p>
            </Card>

            <Card className="p-4 animate-fade-in opacity-60" style={{ animationDelay: '240ms' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-xl bg-muted">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground font-medium">Capacidade Plan. vs Util.</p>
              </div>
              <p className="text-sm font-normal text-muted-foreground">Pendente</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Requer API Capacity do DevOps</p>
            </Card>
          </div>

          {colabChartData.length > 0 && (
            <Card className="p-5 animate-fade-in">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />Tasks por Colaborador
              </h3>
              <ResponsiveContainer width="100%" height={Math.max(200, colabChartData.length * 32)}>
                <BarChart data={colabChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={120} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {fab.isLoading ? (
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-border"><Skeleton className="h-5 w-40" /></div>
              <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            </Card>
          ) : allTopLevel.length === 0 ? (
            <DashboardEmptyState description="Nenhum work item encontrado para o período selecionado." />
          ) : (
            <Card className="overflow-hidden animate-fade-in">
              <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground text-sm">Sprint Board</h3>
                  <p className="text-xs text-muted-foreground">{filteredFabItems.length} itens • {parentRows.filter(p => childrenMap.has(p.id!)).length} PBIs com tasks</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar task..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(0); }}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              </div>

              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-8" />
                      <TableHead className="text-xs font-semibold w-16">ID</TableHead>
                      <TableHead className="text-xs font-semibold">Tipo</TableHead>
                      <TableHead className="text-xs font-semibold">Título</TableHead>
                      <TableHead className="text-xs font-semibold">Colaborador</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="text-xs font-semibold">Prior.</TableHead>
                      <TableHead className="text-xs font-semibold">Sprint</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedTopLevel.map(item => {
                      const children = childrenMap.get(item.id!) || [];
                      const hasChildren = children.length > 0;
                      const isExpanded = expandedPbis.has(item.id!);

                      return (
                        <>{/* Parent row */}
                          <TableRow
                            key={`p-${item.id!}`}
                            className={`hover:bg-muted/30 transition-colors cursor-pointer ${hasChildren ? 'font-medium' : ''}`}
                            onClick={() => setDrawerItem(item)}
                          >
                            <TableCell className="w-8 px-2">
                              {hasChildren ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                  onClick={e => { e.stopPropagation(); toggleExpand(item.id!); }}
                                >
                                  {isExpanded
                                    ? <ChevronDown className="h-4 w-4" />
                                    : <div className="flex items-center gap-0.5"><ChevronRight className="h-4 w-4" /><span className="text-[10px] text-muted-foreground">{children.length}</span></div>
                                  }
                                </Button>
                              ) : <span className="inline-block w-6" />}
                            </TableCell>
                            {renderItemCells(item)}
                          </TableRow>

                          {/* Child rows */}
                          {hasChildren && isExpanded && children.map(child => (
                            <TableRow
                              key={`c-${child.id!}`}
                              className="hover:bg-muted/20 transition-colors cursor-pointer bg-muted/5 border-l-2 border-l-primary/20"
                              onClick={() => setDrawerItem(child)}
                            >
                              <TableCell className="w-8 px-2">
                                <span className="inline-block w-6 text-center text-muted-foreground/40 text-xs">└</span>
                              </TableCell>
                              {renderItemCells(child, true)}
                            </TableRow>
                          ))}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {allTopLevel.length > PAGE_SIZE && (
                <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <span>{allTopLevel.length} itens • Página {page + 1} de {totalPages}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
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
