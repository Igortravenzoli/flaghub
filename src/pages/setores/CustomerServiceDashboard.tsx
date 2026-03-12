import { useState, useMemo } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useCustomerServiceKpis, CSKpiItem } from '@/hooks/useCustomerServiceKpis';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Layers, Users, Clock, TrendingUp, Package, Eye, Settings2 } from 'lucide-react';
import type { Integration } from '@/components/setores/SectorIntegrations';

const integrations: Integration[] = [
  { name: 'Azure DevOps', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Work Items CS' },
  { name: 'Upload Manual', type: 'database', status: 'up', lastCheck: '', latency: '—', description: 'Implantações & Fila' },
];

const devopsColumns: DataTableColumn<CSKpiItem>[] = [
  { key: 'work_item_id', header: 'ID', className: 'font-mono text-xs w-16' },
  { key: 'title', header: 'Título', className: 'max-w-[300px] truncate' },
  { key: 'state', header: 'Estado', render: r => <Badge variant="outline" className="text-xs">{r.state || '—'}</Badge> },
  { key: 'assigned_to_display', header: 'Responsável' },
  { key: 'priority', header: 'Prior.', render: r => r.priority != null ? <Badge className={`text-xs ${r.priority <= 1 ? 'bg-[hsl(0,84%,60%)] text-white' : r.priority <= 2 ? 'bg-[hsl(43,85%,46%)] text-[hsl(222,47%,11%)]' : 'bg-muted text-muted-foreground'}`}>P{r.priority}</Badge> : '—' },
  { key: 'query_name', header: 'Origem', className: 'text-xs text-muted-foreground max-w-[150px] truncate' },
];

const implColumns: DataTableColumn<CSKpiItem>[] = [
  { key: 'title', header: 'Cliente', className: 'max-w-[200px] truncate font-medium' },
  { key: 'consultor_impl', header: 'Consultor' },
  { key: 'solucao', header: 'Solução' },
  { key: 'status_implantacao', header: 'Status', render: r => <Badge variant="outline" className="text-xs">{r.status_implantacao || '—'}</Badge> },
  { key: 'created_date', header: 'Início', render: r => r.created_date ? new Date(r.created_date).toLocaleDateString('pt-BR') : '—' },
  { key: 'changed_date', header: 'Fim', render: r => r.changed_date ? new Date(r.changed_date).toLocaleDateString('pt-BR') : '—' },
];

export default function CustomerServiceDashboard() {
  const { devopsItems, implantacoes, totalFilaCS, porResponsavel, implAndamento, implFinalizadas, implTotal, lastSync, isLoading, isError, refetch } = useCustomerServiceKpis();
  const filters = useDashboardFilters('mes_atual');
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<CSKpiItem | null>(null);

  const respChartData = useMemo(() =>
    Object.entries(porResponsavel)
      .sort(([, a], [, b]) => b - a)
      .map(([resp, qtd]) => ({ resp, qtd })),
    [porResponsavel]
  );

  const handleExportCSV = () => exportCSV({
    title: 'Fila Customer Service', area: 'Customer Service', periodLabel: filters.presetLabel,
    columns: ['work_item_id', 'title', 'state', 'assigned_to_display', 'priority', 'query_name'],
    rows: devopsItems as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Dashboard Customer Service', area: 'Customer Service', periodLabel: filters.presetLabel,
    kpis: [
      { label: 'Volume Fila CS', value: totalFilaCS },
      { label: 'Implantações em andamento', value: implAndamento },
      { label: 'Implantações finalizadas', value: implFinalizadas },
    ],
    columns: ['work_item_id', 'title', 'state', 'assigned_to_display', 'priority'],
    rows: devopsItems as any[],
  });

  const drawerFields: DrawerField[] = drawerItem ? [
    { label: 'ID', value: drawerItem.work_item_id },
    { label: 'Título', value: drawerItem.title },
    { label: 'Tipo', value: drawerItem.work_item_type },
    { label: 'Estado', value: drawerItem.state },
    { label: 'Responsável', value: drawerItem.assigned_to_display },
    { label: 'Prioridade', value: drawerItem.priority != null ? `P${drawerItem.priority}` : '—' },
    { label: 'Origem', value: drawerItem.source === 'devops_queue' ? drawerItem.query_name : 'Upload Manual' },
    { label: 'Criado em', value: drawerItem.created_date ? new Date(drawerItem.created_date).toLocaleString('pt-BR') : '—' },
    { label: 'Alterado em', value: drawerItem.changed_date ? new Date(drawerItem.changed_date).toLocaleString('pt-BR') : '—' },
    ...(drawerItem.source === 'manual_implantacao' ? [
      { label: 'Consultor', value: drawerItem.consultor_impl },
      { label: 'Solução', value: drawerItem.solucao },
      { label: 'Status Implantação', value: drawerItem.status_implantacao },
    ] : []),
  ] : [];

  return (
    <SectorLayout title="Customer Service" subtitle="Dashboard de Gestão — CS" lastUpdate="" integrations={integrations}>
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
        <Tabs defaultValue="fila" className="w-full">
          <TabsList className="mb-4 bg-muted/50 p-1">
            <TabsTrigger value="fila" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Eye className="h-3.5 w-3.5" />
              Fila CS
            </TabsTrigger>
            <TabsTrigger value="implantacoes" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Settings2 className="h-3.5 w-3.5" />
              Implantações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fila" className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <DashboardKpiCard label="Volume Total na Fila" value={totalFilaCS} icon={Layers} isLoading={isLoading} />
              <DashboardKpiCard label="Responsáveis Ativos" value={Object.keys(porResponsavel).length} icon={Users} isLoading={isLoading} delay={80} />
              <DashboardKpiCard label="Implantações Ativas" value={implAndamento} icon={Package} isLoading={isLoading} delay={160} accent="bg-[hsl(199,89%,48%)]" />
              <DashboardKpiCard label="Implantações Finalizadas" value={implFinalizadas} icon={TrendingUp} isLoading={isLoading} delay={240} accent="bg-[hsl(142,71%,45%)]" />
            </div>

            {/* Volume por Responsável */}
            {respChartData.length > 0 && (
              <Card className="p-5 animate-fade-in">
                <h3 className="font-semibold text-foreground mb-4 text-sm">Volume por Responsável</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={respChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="resp" fontSize={11} stroke="hsl(var(--muted-foreground))" width={120} />
                    <Tooltip />
                    <Bar dataKey="qtd" fill="hsl(43,85%,46%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {!isLoading && devopsItems.length === 0 ? (
              <DashboardEmptyState description="Nenhum item na fila CS. Execute o sync DevOps via /admin/sync." />
            ) : (
              <DashboardDataTable
                title="Fila Operacional CS"
                subtitle={`${devopsItems.length} itens`}
                columns={devopsColumns}
                data={devopsItems}
                isLoading={isLoading}
                getRowKey={(r) => String(r.work_item_id ?? Math.random())}
                onRowClick={(r) => setDrawerItem(r)}
                searchPlaceholder="Buscar item..."
              />
            )}
          </TabsContent>

          <TabsContent value="implantacoes" className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <DashboardKpiCard label="Total Implantações" value={implTotal} icon={Package} isLoading={isLoading} />
              <DashboardKpiCard label="Em Andamento" value={implAndamento} icon={Clock} isLoading={isLoading} delay={80} accent="bg-[hsl(43,85%,46%)]" />
              <DashboardKpiCard label="Finalizadas" value={implFinalizadas} icon={TrendingUp} isLoading={isLoading} delay={160} accent="bg-[hsl(142,71%,45%)]" />
            </div>

            {!isLoading && implantacoes.length === 0 ? (
              <DashboardEmptyState description="Nenhuma implantação registrada. Faça upload via /admin/uploads." />
            ) : (
              <DashboardDataTable
                title="Implantações"
                subtitle={`${implantacoes.length} registros`}
                columns={implColumns}
                data={implantacoes}
                isLoading={isLoading}
                getRowKey={(r) => `${r.title}-${r.created_date}`}
                onRowClick={setDrawerItem}
                searchPlaceholder="Buscar implantação..."
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
