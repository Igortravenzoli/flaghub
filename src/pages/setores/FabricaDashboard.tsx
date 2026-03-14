import { useState, useMemo, useCallback } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useFabricaKpis, FabricaItem, TimelogAggregation } from '@/hooks/useFabricaKpis';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Code2, ListTodo, Bug, Users, ChevronRight, ChevronDown, Search, ChevronLeft, 
  Clock, Gauge, AlertTriangle, HelpCircle, Timer, Package, Building2, 
  TrendingUp, BarChart3, Zap
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
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

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--info))',
  'hsl(142, 71%, 45%)',
  'hsl(43, 85%, 46%)',
  'hsl(280, 65%, 60%)',
  'hsl(200, 80%, 50%)',
  'hsl(340, 75%, 55%)',
  'hsl(160, 60%, 45%)',
];

function AnimatedNumber({ value, suffix = '' }: { value: number | null; suffix?: string }) {
  if (value == null) return <span className="text-sm font-normal text-muted-foreground">Sem dados</span>;
  return <span>{value}{suffix}</span>;
}

function HeroKpiCard({ label, value, suffix, icon: Icon, description, accent, delay = 0, onClick, isLoading, active }: {
  label: string; value: number | string | null; suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string; accent?: string; delay?: number;
  onClick?: () => void; isLoading?: boolean; active?: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="relative overflow-hidden">
        <div className="p-5">
          <Skeleton className="h-4 w-20 mb-3" />
          <Skeleton className="h-9 w-16 mb-1" />
          <Skeleton className="h-3 w-32" />
        </div>
      </Card>
    );
  }

  return (
    <Card 
      className={`relative overflow-hidden group transition-all duration-500 hover:shadow-xl hover:-translate-y-1 animate-fade-in ${onClick ? 'cursor-pointer' : ''} ${active ? 'ring-2 ring-primary shadow-xl scale-[1.02]' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
    >
      <div className={`absolute top-0 left-0 w-1 h-full ${accent || 'bg-primary'} transition-all duration-300 group-hover:w-1.5`} />
      <div className="p-5 pl-6">
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-2 rounded-xl ${accent ? accent + '/10' : 'bg-primary/10'} transition-transform duration-300 group-hover:scale-110`}>
            <Icon className={`h-4 w-4 ${accent ? accent.replace('bg-', 'text-') : 'text-primary'}`} />
          </div>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{label}</p>
        </div>
        <p className="text-3xl font-black text-foreground tracking-tight">
          {typeof value === 'number' ? value : value ?? <span className="text-sm font-normal text-muted-foreground">—</span>}
          {suffix && <span className="text-lg font-semibold text-muted-foreground ml-1">{suffix}</span>}
        </p>
        {description && <p className="text-[11px] text-muted-foreground/70 mt-1.5">{description}</p>}
      </div>
    </Card>
  );
}

function HoursRankingCard({ title, icon: Icon, data, isLoading, emptyMessage, delay = 0 }: {
  title: string; icon: React.ComponentType<{ className?: string }>;
  data: TimelogAggregation[]; isLoading: boolean; emptyMessage: string; delay?: number;
}) {
  const maxHours = data.length > 0 ? data[0].hours : 1;

  if (isLoading) {
    return (
      <Card className="animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />{title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Timer className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Dados disponíveis após sincronização do TimeLog</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />{title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {data.slice(0, 8).map((item, idx) => (
          <div key={item.name} className="group animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-foreground font-medium truncate max-w-[60%]">{item.name}</span>
              <span className="text-muted-foreground font-mono text-xs">{item.hours}h</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${Math.max(4, (item.hours / maxHours) * 100)}%`,
                  background: CHART_COLORS[idx % CHART_COLORS.length],
                }}
              />
            </div>
          </div>
        ))}
        {data.length > 8 && (
          <p className="text-xs text-muted-foreground/60 text-center pt-1">
            +{data.length - 8} mais
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function FabricaDashboard() {
  const filters = useDashboardFilters('mes_atual');
  const fab = useFabricaKpis(filters.dateFrom, filters.dateTo);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<FabricaItem | null>(null);
  const [fabKpiFilter, setFabKpiFilter] = useState<FabKpiFilter>('all');
  const [expandedPbis, setExpandedPbis] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [transbordoOpen, setTransbordoOpen] = useState(false);
  const PAGE_SIZE = 25;

  const colabChartData = useMemo(() =>
    Object.entries(fab.porColaborador)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 10)
      .map(([name, count]) => ({ name: name.split(' ').slice(0, 2).join(' '), count })),
    [fab.porColaborador]
  );

  // Pie chart data for work item types
  const typeDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of fab.items) {
      const t = typeLabels[item.work_item_type || ''] || item.work_item_type || 'Outro';
      map[t] = (map[t] || 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [fab.items]);

  const filteredFabItems = useMemo(() => {
    switch (fabKpiFilter) {
      case 'in_progress': return fab.items.filter(i => i.state === 'In Progress' || i.state === 'Active');
      case 'todo': return fab.items.filter(i => i.state === 'To Do' || i.state === 'New');
      case 'done': return fab.items.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved');
      default: return fab.items;
    }
  }, [fab.items, fabKpiFilter]);

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
        {fab.hasTimeLogs && (
          <Badge variant="outline" className="gap-1 text-xs animate-fade-in">
            <Timer className="h-3 w-3" />
            {Math.round(fab.totalHoursLogged)}h registradas
          </Badge>
        )}
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
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="overview" className="gap-1.5 text-xs">
              <Zap className="h-3.5 w-3.5" />Visão Geral
            </TabsTrigger>
            <TabsTrigger value="timelog" className="gap-1.5 text-xs">
              <Timer className="h-3.5 w-3.5" />Horas (TimeLog)
            </TabsTrigger>
            <TabsTrigger value="board" className="gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />Sprint Board
            </TabsTrigger>
          </TabsList>

          {/* ═══════ TAB: Visão Geral ═══════ */}
          <TabsContent value="overview" className="space-y-5 mt-0">
            {/* Hero KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HeroKpiCard label="Total" value={fab.total} icon={ListTodo} isLoading={fab.isLoading} onClick={() => toggleFab('all')} active={fabKpiFilter === 'all'} />
              <HeroKpiCard label="Em Progresso" value={fab.inProgress} icon={Code2} isLoading={fab.isLoading} delay={80} accent="bg-[hsl(var(--info))]" onClick={() => toggleFab('in_progress')} active={fabKpiFilter === 'in_progress'} />
              <HeroKpiCard label="To Do" value={fab.toDo} icon={ListTodo} isLoading={fab.isLoading} delay={160} accent="bg-[hsl(43,85%,46%)]" onClick={() => toggleFab('todo')} active={fabKpiFilter === 'todo'} />
              <HeroKpiCard label="Done" value={fab.done} icon={Bug} isLoading={fab.isLoading} delay={240} accent="bg-[hsl(142,71%,45%)]" onClick={() => toggleFab('done')} active={fabKpiFilter === 'done'} />
            </div>

            {/* Corporate KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HeroKpiCard 
                label="Lead Time Médio" 
                value={fab.leadTimeMedio} 
                suffix={fab.leadTimeSource === 'effort' ? ' pts' : 'h'}
                icon={Clock} 
                isLoading={fab.isLoading} 
                delay={300}
                description={fab.leadTimeSource === 'effort' ? 'Effort médio / PBI (DevOps)' : fab.leadTimeSource === 'timelog' ? 'Horas trabalhadas / PBI' : 'Effort / PBI'}
              />
              <HeroKpiCard 
                label="Velocidade Média" 
                value={fab.velocidadeMedia} 
                suffix={fab.velocidadeSource === 'effort' ? ' pts' : 'h'}
                icon={Gauge} 
                isLoading={fab.isLoading} 
                delay={380}
                accent="bg-[hsl(var(--info))]"
                description={fab.velocidadeSource === 'effort' ? `Effort / Sprint (${fab.sprintCount} sprints)` : fab.velocidadeSource === 'timelog' ? `Horas / Sprint (${fab.sprintCount})` : 'Effort ou Horas / Sprint'}
              />
              <HeroKpiCard 
                label="Transbordo" 
                value={fab.transbordoPct != null ? `${fab.transbordoPct}%` : null} 
                icon={AlertTriangle} 
                isLoading={fab.isLoading} 
                delay={460}
                accent={fab.transbordoPct != null && fab.transbordoPct > 50 ? 'bg-destructive' : 'bg-[hsl(43,85%,46%)]'}
                description={fab.transbordoCount > 0 ? `${fab.transbordoCount} de ${fab.transbordoTotal} itens` : 'Itens não entregues na sprint'}
                onClick={() => fab.transbordoItems.length > 0 && setTransbordoOpen(true)}
              />
              <HeroKpiCard 
                label="Capacidade" 
                value="Pendente" 
                icon={HelpCircle} 
                isLoading={false} 
                delay={540}
                accent="bg-muted-foreground"
                description="Requer API Capacity do DevOps"
              />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Collaborator chart */}
              {colabChartData.length > 0 && (
                <Card className="lg:col-span-2 animate-fade-in" style={{ animationDelay: '500ms' }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />Tasks por Colaborador
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={Math.max(200, colabChartData.length * 32)}>
                      <BarChart data={colabChartData} layout="vertical" margin={{ left: 0, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                        <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={110} />
                        <Tooltip
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Type distribution pie */}
              {typeDistribution.length > 0 && (
                <Card className="animate-fade-in" style={{ animationDelay: '600ms' }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />Distribuição por Tipo
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={typeDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {typeDistribution.map((_, idx) => (
                            <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-2 justify-center mt-2">
                      {typeDistribution.map((t, idx) => (
                        <div key={t.name} className="flex items-center gap-1.5 text-xs">
                          <div className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }} />
                          <span className="text-muted-foreground">{t.name}</span>
                          <span className="font-semibold text-foreground">{t.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ═══════ TAB: Horas (TimeLog) ═══════ */}
          <TabsContent value="timelog" className="space-y-5 mt-0">
            {/* TimeLog hero stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HeroKpiCard label="Total Horas" value={fab.hasTimeLogs ? Math.round(fab.totalHoursLogged) : null} suffix="h" icon={Timer} isLoading={fab.isLoading} accent="bg-primary" description="Soma de horas registradas no TimeLog" />
              <HeroKpiCard label="Colaboradores" value={fab.horasPorColaborador.length || null} icon={Users} isLoading={fab.isLoading} delay={80} accent="bg-[hsl(var(--info))]" description="Com registros no período" />
              <HeroKpiCard label="Produtos" value={fab.horasPorProduto.length || null} icon={Package} isLoading={fab.isLoading} delay={160} accent="bg-[hsl(142,71%,45%)]" description="Identificados via tags do DevOps" />
              <HeroKpiCard label="Clientes" value={fab.horasPorCliente.length || null} icon={Building2} isLoading={fab.isLoading} delay={240} accent="bg-[hsl(43,85%,46%)]" description="Identificados via parent/título" />
            </div>

            {/* Three ranking cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <HoursRankingCard
                title="Horas por Colaborador"
                icon={Users}
                data={fab.horasPorColaborador}
                isLoading={fab.isLoading}
                emptyMessage="Nenhuma hora registrada"
                delay={300}
              />
              <HoursRankingCard
                title="Horas por Produto"
                icon={Package}
                data={fab.horasPorProduto}
                isLoading={fab.isLoading}
                emptyMessage="Nenhum produto identificado"
                delay={400}
              />
              <HoursRankingCard
                title="Horas por Cliente"
                icon={Building2}
                data={fab.horasPorCliente}
                isLoading={fab.isLoading}
                emptyMessage="Nenhum cliente identificado"
                delay={500}
              />
            </div>

            {/* Hours chart (horizontal bars for collaborators) */}
            {fab.horasPorColaborador.length > 0 && (
              <Card className="animate-fade-in" style={{ animationDelay: '600ms' }}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />Distribuição de Horas por Colaborador
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(200, fab.horasPorColaborador.length * 36)}>
                    <BarChart data={fab.horasPorColaborador.slice(0, 12)} layout="vertical" margin={{ left: 0, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" unit="h" />
                      <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={130} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(value: number) => [`${value}h`, 'Horas']}
                      />
                      <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══════ TAB: Sprint Board ═══════ */}
          <TabsContent value="board" className="space-y-4 mt-0">
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
                  <div className="flex items-center gap-2">
                    {/* Quick filter badges */}
                    <div className="hidden md:flex gap-1">
                      {(['all', 'in_progress', 'todo', 'done'] as FabKpiFilter[]).map(f => (
                        <Badge 
                          key={f} 
                          variant={fabKpiFilter === f ? 'default' : 'outline'} 
                          className="cursor-pointer text-xs transition-all"
                          onClick={() => toggleFab(f)}
                        >
                          {f === 'all' ? 'Todos' : f === 'in_progress' ? 'Em Progresso' : f === 'todo' ? 'To Do' : 'Done'}
                        </Badge>
                      ))}
                    </div>
                    <div className="relative w-full sm:w-56">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar task..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(0); }}
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
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
          </TabsContent>
        </Tabs>
      )}

      <DashboardDrawer
        open={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        title={drawerItem?.title || undefined}
        subtitle={drawerItem?.work_item_type || undefined}
        fields={drawerFields}
        externalUrl={drawerItem?.web_url}
      />

      {/* Transbordo Detail Dialog */}
      <Dialog open={transbordoOpen} onOpenChange={setTransbordoOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[hsl(43,85%,46%)]" />
              PBIs Transbordados
            </DialogTitle>
            <DialogDescription>
              Itens em sprints anteriores que não foram finalizados.
            </DialogDescription>
          </DialogHeader>

          {fab.transbordoItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhum item transbordado encontrado.</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-semibold w-16">ID</TableHead>
                    <TableHead className="text-xs font-semibold">Título</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-xs font-semibold">Responsável</TableHead>
                    <TableHead className="text-xs font-semibold text-center w-24">Transbordos</TableHead>
                    <TableHead className="text-xs font-semibold">Sprints</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fab.transbordoItems
                    .sort((a, b) => b.overflowCount - a.overflowCount)
                    .map(item => (
                      <TableRow key={item.id} className="hover:bg-muted/30 animate-fade-in">
                        <TableCell className="font-mono text-xs">
                          {item.web_url ? (
                            <a href={item.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{item.id}</a>
                          ) : item.id}
                        </TableCell>
                        <TableCell className="text-sm max-w-[250px] truncate">{item.title || '—'}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs font-mono ${stateColors[item.state || ''] || ''}`}>{item.state || '—'}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{item.assigned_to_display || '—'}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={item.overflowCount >= 3 ? 'destructive' : 'secondary'}
                            className="text-xs font-bold"
                          >
                            {item.overflowCount}×
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px]">
                          <div className="flex flex-wrap gap-1">
                            {item.sprintsOverflowed.map(sp => {
                              const label = sp.split('\\').pop() || sp;
                              return <Badge key={sp} variant="outline" className="text-[10px] px-1.5 py-0">{label}</Badge>;
                            })}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SectorLayout>
  );
}
