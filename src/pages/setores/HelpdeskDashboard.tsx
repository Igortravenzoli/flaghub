import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { useHelpdeskKpis, ConsultorKpi, RegistroPorGrupo, TipoChamadoKpi } from '@/hooks/useHelpdeskKpis';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { Headphones, Clock, Users, FileText, Monitor, Flag, UserCheck, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { Integration } from '@/components/setores/SectorIntegrations';

const integrations: Integration[] = [
  { name: 'VDesk Helpdesk API', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Dashboard Helpdesk' },
];

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(210, 70%, 55%)',
  'hsl(280, 60%, 55%)',
  'hsl(30, 80%, 55%)',
];

type ActiveView = 'consultores' | 'sistemas' | 'bandeiras' | 'clientes' | 'tipos' | 'chamados' | null;

export default function HelpdeskDashboard() {
  const kpis = useHelpdeskKpis();
  const filters = useDashboardFilters('mes_atual');
  const { exportCSV, exportPDF } = useDashboardExport();
  const [activeView, setActiveView] = useState<ActiveView>(null);
  const [drawerItem, setDrawerItem] = useState<any>(null);

  const {
    registrosPorConsultor, tipoChamadoTempoMedio, registrosPorSistema,
    registrosPorBandeira, registrosPorCliente, ocorrenciasPorTipo,
    totalRegistros, totalHoras, horasDiaTotal, totalConsultores,
    lastSync, isLoading, isError, refetch,
  } = kpis;

  const handleKpiClick = (view: ActiveView) => {
    setActiveView(prev => prev === view ? null : view);
  };

  const handleExportCSV = () => exportCSV({
    title: 'Helpdesk KPIs', area: 'Helpdesk', periodLabel: filters.presetLabel,
    columns: ['nome', 'quantidade', 'totalMinutos'],
    rows: registrosPorConsultor as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Helpdesk KPIs', area: 'Helpdesk', periodLabel: filters.presetLabel,
    kpis: [
      { label: 'Total Registros', value: totalRegistros },
      { label: 'Total Horas', value: totalHoras },
      { label: 'Consultores', value: totalConsultores },
    ],
    columns: ['nome', 'totalRegistros', 'totalMinutos'],
    rows: registrosPorConsultor as any[],
  });

  // Determine which table data to show
  const getActiveTableData = () => {
    switch (activeView) {
      case 'consultores': return { data: registrosPorConsultor, title: 'Registros por Consultor' };
      case 'sistemas': return { data: registrosPorSistema, title: 'Registros por Sistema' };
      case 'bandeiras': return { data: registrosPorBandeira, title: 'Registros por Bandeira' };
      case 'clientes': return { data: registrosPorCliente, title: 'Registros por Cliente' };
      case 'tipos': return { data: ocorrenciasPorTipo, title: 'Ocorrências por Tipo' };
      case 'chamados': return { data: tipoChamadoTempoMedio, title: 'Tipo de Chamado x Tempo Médio' };
      default: return { data: registrosPorConsultor, title: 'Registros por Consultor' };
    }
  };

  const { data: tableData, title: tableTitle } = getActiveTableData();

  const consultorColumns: DataTableColumn<ConsultorKpi>[] = [
    { key: 'nome', header: 'Consultor', className: 'font-medium' },
    { key: 'totalRegistros', header: 'Registros', className: 'text-right' },
    { key: 'totalMinutos', header: 'Minutos', className: 'text-right', render: (r) => `${r.totalMinutos}` },
  ];

  const grupoColumns: DataTableColumn<RegistroPorGrupo>[] = [
    { key: 'nome', header: 'Nome', className: 'font-medium' },
    { key: 'quantidade', header: 'Quantidade', className: 'text-right' },
  ];

  const tipoColumns: DataTableColumn<TipoChamadoKpi>[] = [
    { key: 'tipo', header: 'Tipo', className: 'font-medium' },
    { key: 'quantidade', header: 'Quantidade', className: 'text-right' },
    { key: 'tempoMedio', header: 'Tempo Médio (min)', className: 'text-right', render: (r) => `${r.tempoMedio.toFixed(1)}` },
  ];

  const drawerFields: DrawerField[] = drawerItem ? Object.entries(drawerItem).map(([key, value]) => ({
    label: key, value: String(value ?? '—'),
  })) : [];

  const hasData = totalRegistros > 0 || registrosPorConsultor.length > 0;

  return (
    <SectorLayout title="Helpdesk" subtitle="KPIs de Atendimento — VDesk" lastUpdate="" integrations={integrations}>
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
      ) : !isLoading && !hasData ? (
        <DashboardEmptyState description="Nenhum dado de helpdesk encontrado. Execute o sync via Admin > Sync Central para carregar os dados da API." />
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <DashboardKpiCard
              label="Total Registros" value={totalRegistros} icon={FileText}
              isLoading={isLoading} onClick={() => handleKpiClick('consultores')}
              active={activeView === 'consultores'}
            />
            <DashboardKpiCard
              label="Horas Acumulado" value={totalHoras} suffix="h" icon={Clock}
              isLoading={isLoading} delay={80} onClick={() => handleKpiClick('chamados')}
              active={activeView === 'chamados'}
            />
            <DashboardKpiCard
              label="Horas Hoje" value={horasDiaTotal} suffix="h" icon={BarChart3}
              isLoading={isLoading} delay={160}
            />
            <DashboardKpiCard
              label="Consultores" value={totalConsultores} icon={Users}
              isLoading={isLoading} delay={240} onClick={() => handleKpiClick('consultores')}
              active={activeView === 'consultores'}
            />
          </div>

          {/* Secondary KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <DashboardKpiCard
              label="Sistemas" value={registrosPorSistema.length} icon={Monitor}
              isLoading={isLoading} onClick={() => handleKpiClick('sistemas')}
              active={activeView === 'sistemas'}
            />
            <DashboardKpiCard
              label="Bandeiras" value={registrosPorBandeira.length} icon={Flag}
              isLoading={isLoading} delay={80} onClick={() => handleKpiClick('bandeiras')}
              active={activeView === 'bandeiras'}
            />
            <DashboardKpiCard
              label="Clientes" value={registrosPorCliente.length} icon={UserCheck}
              isLoading={isLoading} delay={160} onClick={() => handleKpiClick('clientes')}
              active={activeView === 'clientes'}
            />
            <DashboardKpiCard
              label="Tipos Ocorrência" value={ocorrenciasPorTipo.length} icon={Headphones}
              isLoading={isLoading} delay={240} onClick={() => handleKpiClick('tipos')}
              active={activeView === 'tipos'}
            />
          </div>

          {/* Charts row */}
          {!isLoading && hasData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              {/* Registros por Consultor - Bar Chart */}
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Registros por Consultor</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={registrosPorConsultor.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis type="category" dataKey="nome" className="text-xs" width={75} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="totalRegistros" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Ocorrências por Tipo - Pie Chart */}
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Ocorrências por Tipo</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                      <Pie
                        data={ocorrenciasPorTipo.length > 0 ? ocorrenciasPorTipo : [{ nome: 'Sem dados', quantidade: 1 }]}
                        dataKey="quantidade"
                        nameKey="nome"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={ocorrenciasPorTipo.length > 0 ? ({ nome, percent }: { nome: string; percent: number }) => `${nome} ${(percent * 100).toFixed(0)}%` : false}
                      >
                        {(ocorrenciasPorTipo.length > 0 ? ocorrenciasPorTipo : [{ nome: 'Sem dados', quantidade: 1 }]).map((_, i) => (
                          <Cell key={i} fill={ocorrenciasPorTipo.length > 0 ? CHART_COLORS[i % CHART_COLORS.length] : 'hsl(var(--muted))'} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Tipo Chamado x Tempo Médio */}
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Tipo de Chamado x Tempo Médio (min)</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tipoChamadoTempoMedio} margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="tipo" className="text-xs" tick={{ fontSize: 10 }} />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="tempoMedio" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Tempo Médio" />
                      <Bar dataKey="quantidade" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} name="Quantidade" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Registros por Sistema */}
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Registros por Sistema</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={registrosPorSistema.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis type="category" dataKey="nome" className="text-xs" width={75} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="quantidade" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          )}

          {/* Data Table - changes based on active KPI */}
          {!isLoading && hasData && (
            <div className="mt-6">
              {activeView === 'chamados' ? (
                <DashboardDataTable
                  title={tableTitle}
                  subtitle={`${tipoChamadoTempoMedio.length} tipos`}
                  columns={tipoColumns}
                  data={tipoChamadoTempoMedio}
                  isLoading={isLoading}
                  getRowKey={(r) => r.tipo}
                  onRowClick={(r) => setDrawerItem(r)}
                  searchPlaceholder="Buscar tipo..."
                />
              ) : activeView === 'consultores' || !activeView ? (
                <DashboardDataTable
                  title={tableTitle}
                  subtitle={`${registrosPorConsultor.length} consultores`}
                  columns={consultorColumns}
                  data={registrosPorConsultor}
                  isLoading={isLoading}
                  getRowKey={(r) => r.nome}
                  onRowClick={(r) => setDrawerItem(r)}
                  searchPlaceholder="Buscar consultor..."
                />
              ) : (
                <DashboardDataTable
                  title={tableTitle}
                  subtitle={`${(tableData as RegistroPorGrupo[]).length} itens`}
                  columns={grupoColumns}
                  data={tableData as RegistroPorGrupo[]}
                  isLoading={isLoading}
                  getRowKey={(r) => r.nome}
                  onRowClick={(r) => setDrawerItem(r)}
                  searchPlaceholder="Buscar..."
                />
              )}
            </div>
          )}
        </>
      )}

      <DashboardDrawer
        open={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        title="Detalhes"
        fields={drawerFields}
      />
    </SectorLayout>
  );
}
