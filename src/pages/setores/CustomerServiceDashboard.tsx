import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Layers, Users, Clock, TrendingUp, Package, Eye, Settings2, Upload, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { Integration } from '@/components/setores/SectorIntegrations';

type KpiFilter = 'all' | 'fila' | 'impl_andamento' | 'impl_finalizadas';

const integrations: Integration[] = [
  { name: 'Azure DevOps', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Work Items CS' },
  { name: 'Upload Manual', type: 'database', status: 'up', lastCheck: '', latency: '—', description: 'Implantações & Fila' },
];

const devopsColumns: DataTableColumn<CSKpiItem>[] = [
  { key: 'work_item_id', header: 'ID', className: 'font-mono text-xs w-16', render: r => r.web_url ? (
    <a href={r.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono" onClick={e => e.stopPropagation()}>{r.work_item_id}</a>
  ) : <span>{r.work_item_id || '—'}</span> },
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
  const filters = useDashboardFilters('mes_atual');
  const { devopsItems, implantacoes, totalFilaCS, porResponsavel, implAndamento, implFinalizadas, implTotal, lastSync, isLoading, isError, refetch } = useCustomerServiceKpis(filters.dateFrom, filters.dateTo);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerItem, setDrawerItem] = useState<CSKpiItem | null>(null);
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('all');

  // Import history for compact view in Implantações tab
  const { data: recentBatches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ['manual_import_batches', 'cs_implantacoes_v1', 'compact'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manual_import_batches')
        .select('id, status, total_rows, valid_rows, invalid_rows, imported_at, published_at, manual_import_templates!manual_import_batches_template_id_fkey(key)')
        .order('imported_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).filter((b: any) => b.manual_import_templates?.key === 'cs_implantacoes_v1').slice(0, 5);
    },
    staleTime: 60 * 1000,
  });

  const respChartData = useMemo(() =>
    Object.entries(porResponsavel)
      .sort(([, a], [, b]) => b - a)
      .map(([resp, qtd]) => ({ resp, qtd })),
    [porResponsavel]
  );

  // Apply KPI filter to table data
  const filteredDevops = useMemo(() => {
    if (kpiFilter === 'fila') return devopsItems;
    return devopsItems;
  }, [devopsItems, kpiFilter]);

  const filteredImpl = useMemo(() => {
    const encerradoStatuses = ['finalizado', 'concluído', 'concluido', '8 - encerrado', 'encerrado', '11 - cancelado', 'cancelado'];
    if (kpiFilter === 'impl_andamento') {
      return implantacoes.filter(i => i.status_implantacao && !encerradoStatuses.includes(i.status_implantacao.toLowerCase()));
    }
    if (kpiFilter === 'impl_finalizadas') {
      return implantacoes.filter(i => i.status_implantacao && encerradoStatuses.includes(i.status_implantacao.toLowerCase()));
    }
    return implantacoes;
  }, [implantacoes, kpiFilter]);

  const handleKpiClick = (filter: KpiFilter) => {
    setKpiFilter(prev => prev === filter ? 'all' : filter);
  };

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
    <SectorLayout title="Customer Service" subtitle="Dashboard de Gestão — CS" lastUpdate="" integrations={integrations} templateKey="cs_implantacoes_v1">
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
        <Tabs defaultValue="fila" className="w-full">
          <TabsList className="mb-4 bg-muted/50 p-1">
            <TabsTrigger value="fila" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm" onClick={() => setKpiFilter('all')}>
              <Eye className="h-3.5 w-3.5" />
              Fila CS
            </TabsTrigger>
            <TabsTrigger value="implantacoes" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm" onClick={() => setKpiFilter('all')}>
              <Settings2 className="h-3.5 w-3.5" />
              Implantações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fila" className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <DashboardKpiCard label="Volume Total na Fila" value={totalFilaCS} icon={Layers} isLoading={isLoading} onClick={() => handleKpiClick('fila')} active={kpiFilter === 'fila'} />
              <DashboardKpiCard label="Responsáveis Ativos" value={Object.keys(porResponsavel).length} icon={Users} isLoading={isLoading} delay={80} />
              <DashboardKpiCard label="Implantações Ativas" value={implAndamento} icon={Package} isLoading={isLoading} delay={160} accent="bg-[hsl(199,89%,48%)]" onClick={() => handleKpiClick('impl_andamento')} active={kpiFilter === 'impl_andamento'} />
              <DashboardKpiCard label="Implantações Finalizadas" value={implFinalizadas} icon={TrendingUp} isLoading={isLoading} delay={240} accent="bg-[hsl(142,71%,45%)]" onClick={() => handleKpiClick('impl_finalizadas')} active={kpiFilter === 'impl_finalizadas'} />
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

            {!isLoading && filteredDevops.length === 0 ? (
              <DashboardEmptyState description="Nenhum item na fila CS para o período selecionado." />
            ) : (
              <DashboardDataTable
                title="Fila Operacional CS"
                subtitle={`${filteredDevops.length} itens`}
                columns={devopsColumns}
                data={filteredDevops}
                isLoading={isLoading}
                getRowKey={(r) => String(r.work_item_id ?? Math.random())}
                onRowClick={(r) => setDrawerItem(r)}
                searchPlaceholder="Buscar item..."
              />
            )}
          </TabsContent>

          <TabsContent value="implantacoes" className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <DashboardKpiCard label="Total Implantações" value={implTotal} icon={Package} isLoading={isLoading} onClick={() => handleKpiClick('all')} active={kpiFilter === 'all'} />
              <DashboardKpiCard label="Em Andamento" value={implAndamento} icon={Clock} isLoading={isLoading} delay={80} accent="bg-[hsl(43,85%,46%)]" onClick={() => handleKpiClick('impl_andamento')} active={kpiFilter === 'impl_andamento'} />
              <DashboardKpiCard label="Finalizadas" value={implFinalizadas} icon={TrendingUp} isLoading={isLoading} delay={160} accent="bg-[hsl(142,71%,45%)]" onClick={() => handleKpiClick('impl_finalizadas')} active={kpiFilter === 'impl_finalizadas'} />
            </div>

            {!isLoading && filteredImpl.length === 0 ? (
              <DashboardEmptyState description="Nenhuma implantação para o período selecionado." />
            ) : (
              <DashboardDataTable
                title="Implantações"
                subtitle={`${filteredImpl.length} registros`}
                columns={implColumns}
                data={filteredImpl}
                isLoading={isLoading}
                getRowKey={(r) => `${r.title ?? ''}-${r.created_date ?? ''}`}
                onRowClick={(r) => setDrawerItem(r)}
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
        externalUrl={drawerItem?.web_url}
      />
    </SectorLayout>
  );
}
