import { useState, useMemo } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useFabricaKpis, FabricaItem } from '@/hooks/useFabricaKpis';
import { useInfraestruturaKpis, InfraItem } from '@/hooks/useInfraestruturaKpis';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Code2, ListTodo, Bug, AlertTriangle, Users, Server, Wrench, Shield, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { Integration } from '@/components/setores/SectorIntegrations';

type FabKpiFilter = 'all' | 'in_progress' | 'todo' | 'done';
type InfraKpiFilter = 'all' | 'pendentes' | 'em_andamento' | 'melhorias' | 'iso27001' | 'transbordo';

const integrations: Integration[] = [
  { name: 'Azure DevOps API', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Work Items, Sprints' },
];

const fabricaColumns: DataTableColumn<FabricaItem>[] = [
  { key: 'id', header: 'ID', className: 'font-mono text-xs w-16' },
  { key: 'title', header: 'Task', className: 'max-w-[350px] truncate' },
  { key: 'assigned_to_display', header: 'Colaborador' },
  { key: 'state', header: 'Status', render: r => {
    const colors: Record<string, string> = {
      'In Progress': 'bg-[hsl(var(--info))] text-white',
      'Active': 'bg-[hsl(var(--info))] text-white',
      'To Do': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
      'New': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
      'Done': 'bg-[hsl(var(--success))] text-white',
      'Closed': 'bg-[hsl(var(--success))] text-white',
      'Resolved': 'bg-[hsl(var(--success))] text-white',
    };
    return <Badge className={`text-xs font-mono ${colors[r.state || ''] || ''}`}>{r.state || '—'}</Badge>;
  }},
  { key: 'priority', header: 'Prior.', render: r => r.priority != null ? <Badge variant="secondary" className="text-xs">P{r.priority}</Badge> : '—' },
  { key: 'iteration_path', header: 'Sprint', className: 'text-xs text-muted-foreground max-w-[120px] truncate' },
];

const infraColumns: DataTableColumn<InfraItem>[] = [
  { key: 'id', header: 'ID', className: 'font-mono text-xs w-16' },
  { key: 'title', header: 'Atividade', className: 'max-w-[350px] truncate' },
  { key: 'assigned_to_display', header: 'Responsável' },
  { key: 'state', header: 'Status', render: r => <Badge variant="outline" className="text-xs">{r.state || '—'}</Badge> },
  { key: 'tags', header: 'Tags', className: 'text-xs text-muted-foreground max-w-[150px] truncate' },
];

export default function FabricaDashboard() {
  const filters = useDashboardFilters('mes_atual');
  const fab = useFabricaKpis(filters.dateFrom, filters.dateTo);
  const infra = useInfraestruturaKpis(filters.dateFrom, filters.dateTo);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<(FabricaItem | InfraItem) & { web_url?: string } | null>(null);
  const [fabKpiFilter, setFabKpiFilter] = useState<FabKpiFilter>('all');
  const [infraKpiFilter, setInfraKpiFilter] = useState<InfraKpiFilter>('all');

  const colabChartData = useMemo(() =>
    Object.entries(fab.porColaborador)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name: name.split(' ').slice(0, 2).join(' '), count })),
    [fab.porColaborador]
  );

  // Filtered fab items
  const filteredFabItems = useMemo(() => {
    switch (fabKpiFilter) {
      case 'in_progress': return fab.items.filter(i => i.state === 'In Progress' || i.state === 'Active');
      case 'todo': return fab.items.filter(i => i.state === 'To Do' || i.state === 'New');
      case 'done': return fab.items.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved');
      default: return fab.items;
    }
  }, [fab.items, fabKpiFilter]);

  // Filtered infra items
  const filteredInfraItems = useMemo(() => {
    switch (infraKpiFilter) {
      case 'pendentes': return infra.items.filter(i => i.state === 'New' || i.state === 'To Do');
      case 'em_andamento': return infra.items.filter(i => i.state === 'In Progress' || i.state === 'Active');
      case 'melhorias': return infra.items.filter(i => i.tags?.toUpperCase().includes('MELHORIA'));
      case 'iso27001': return infra.items.filter(i => i.tags?.toUpperCase().includes('ISO27001') || i.tags?.toUpperCase().includes('ISO'));
      case 'transbordo': return infra.items.filter(i => i.tags?.toUpperCase().includes('TRANSBORDO'));
      default: return infra.items;
    }
  }, [infra.items, infraKpiFilter]);

  const toggleFab = (f: FabKpiFilter) => setFabKpiFilter(prev => prev === f ? 'all' : f);
  const toggleInfra = (f: InfraKpiFilter) => setInfraKpiFilter(prev => prev === f ? 'all' : f);

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
    { label: 'ID', value: (drawerItem as any).id },
    { label: 'Título', value: drawerItem.title },
    { label: 'Tipo', value: drawerItem.work_item_type },
    { label: 'Estado', value: drawerItem.state },
    { label: 'Responsável', value: drawerItem.assigned_to_display },
    { label: 'Prioridade', value: drawerItem.priority != null ? `P${drawerItem.priority}` : '—' },
    { label: 'Criado em', value: drawerItem.created_date ? new Date(drawerItem.created_date).toLocaleString('pt-BR') : '—' },
    { label: 'Alterado em', value: drawerItem.changed_date ? new Date(drawerItem.changed_date).toLocaleString('pt-BR') : '—' },
    ...('parent_title' in drawerItem && drawerItem.parent_title ? [{ label: 'Parent', value: drawerItem.parent_title }] : []),
  ] : [];

  const isLoading = fab.isLoading || infra.isLoading;
  const isError = fab.isError || infra.isError;

  return (
    <SectorLayout title="Fábrica" subtitle="Programação + Infraestrutura" lastUpdate="" integrations={integrations}>
      <div className="flex items-center justify-between mb-2">
        <DashboardLastSyncBadge syncedAt={fab.lastSync} status="ok" />
      </div>

      <DashboardFilterBar
        preset={filters.preset}
        onPresetChange={(p) => { filters.setPreset(p); setFabKpiFilter('all'); setInfraKpiFilter('all'); }}
        presetLabel={filters.presetLabel}
        onRefresh={() => { fab.refetch(); infra.refetch(); }}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
      />

      {isError ? (
        <DashboardEmptyState variant="error" onRetry={() => { fab.refetch(); infra.refetch(); }} />
      ) : (
        <Tabs defaultValue="programacao" className="w-full">
          <TabsList className="mb-4 bg-muted/50 p-1">
            <TabsTrigger value="programacao" className="gap-1.5" onClick={() => setFabKpiFilter('all')}><Code2 className="h-3.5 w-3.5" />Programação</TabsTrigger>
            <TabsTrigger value="infraestrutura" className="gap-1.5" onClick={() => setInfraKpiFilter('all')}><Server className="h-3.5 w-3.5" />Infraestrutura</TabsTrigger>
          </TabsList>

          <TabsContent value="programacao" className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <DashboardKpiCard label="Total Tasks" value={fab.total} icon={ListTodo} isLoading={fab.isLoading} onClick={() => toggleFab('all')} active={fabKpiFilter === 'all'} />
              <DashboardKpiCard label="Em Progresso" value={fab.inProgress} icon={Code2} isLoading={fab.isLoading} delay={80} accent="bg-[hsl(var(--info))]" onClick={() => toggleFab('in_progress')} active={fabKpiFilter === 'in_progress'} />
              <DashboardKpiCard label="To Do" value={fab.toDo} icon={ListTodo} isLoading={fab.isLoading} delay={160} accent="bg-[hsl(43,85%,46%)]" onClick={() => toggleFab('todo')} active={fabKpiFilter === 'todo'} />
              <DashboardKpiCard label="Done" value={fab.done} icon={Bug} isLoading={fab.isLoading} delay={240} accent="bg-[hsl(142,71%,45%)]" onClick={() => toggleFab('done')} active={fabKpiFilter === 'done'} />
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

            {!fab.isLoading && filteredFabItems.length === 0 ? (
              <DashboardEmptyState description="Nenhum work item encontrado para o período selecionado." />
            ) : (
              <DashboardDataTable
                title="Sprint Board"
                subtitle={`${filteredFabItems.length} tasks`}
                columns={fabricaColumns}
                data={filteredFabItems}
                isLoading={fab.isLoading}
                getRowKey={(r) => r.id || Math.random()}
                onRowClick={(r) => setDrawerItem(r as any)}
                searchPlaceholder="Buscar task..."
              />
            )}
          </TabsContent>

          <TabsContent value="infraestrutura" className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <DashboardKpiCard label="Total" value={infra.total} icon={Server} isLoading={infra.isLoading} onClick={() => toggleInfra('all')} active={infraKpiFilter === 'all'} />
              <DashboardKpiCard label="Pendentes" value={infra.pendentes} icon={Clock} isLoading={infra.isLoading} delay={80} accent="bg-[hsl(43,85%,46%)]" onClick={() => toggleInfra('pendentes')} active={infraKpiFilter === 'pendentes'} />
              <DashboardKpiCard label="Em Andamento" value={infra.emAndamento} icon={Wrench} isLoading={infra.isLoading} delay={160} accent="bg-[hsl(var(--info))]" onClick={() => toggleInfra('em_andamento')} active={infraKpiFilter === 'em_andamento'} />
              <DashboardKpiCard label="Melhorias" value={infra.melhorias} icon={Wrench} isLoading={infra.isLoading} delay={240} accent="bg-[hsl(142,71%,45%)]" onClick={() => toggleInfra('melhorias')} active={infraKpiFilter === 'melhorias'} />
              <DashboardKpiCard label="ISO 27001" value={infra.iso27001} icon={Shield} isLoading={infra.isLoading} delay={320} accent="bg-[hsl(280,65%,60%)]" onClick={() => toggleInfra('iso27001')} active={infraKpiFilter === 'iso27001'} />
              <DashboardKpiCard label="Transbordo" value={infra.transbordo} icon={AlertTriangle} isLoading={infra.isLoading} delay={400} accent="bg-[hsl(0,84%,60%)]" onClick={() => toggleInfra('transbordo')} active={infraKpiFilter === 'transbordo'} />
            </div>

            {!infra.isLoading && filteredInfraItems.length === 0 ? (
              <DashboardEmptyState description="Nenhum item de infraestrutura para o período/filtro selecionado." />
            ) : (
              <DashboardDataTable
                title="Atividades Infraestrutura"
                subtitle={`${filteredInfraItems.length} itens`}
                columns={infraColumns}
                data={filteredInfraItems}
                isLoading={infra.isLoading}
                getRowKey={(r) => r.id || Math.random()}
                onRowClick={(r) => setDrawerItem(r as any)}
                searchPlaceholder="Buscar atividade..."
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
      />
    </SectorLayout>
  );
}
