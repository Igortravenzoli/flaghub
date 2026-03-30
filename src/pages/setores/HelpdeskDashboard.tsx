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
import {
  Headphones, Clock, Users, FileText, Monitor, Flag, UserCheck,
  BarChart3, Filter, X, Check, ChevronsUpDown, TrendingUp, Phone,
  Ticket, Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import type { Integration } from '@/components/setores/SectorIntegrations';
import { getDateBoundsFromItems } from '@/lib/dateBounds';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy load ticket sub-pages for tab embedding
const DashboardPage = lazy(() => import('@/pages/Dashboard'));
const TicketBuscaPage = lazy(() => import('@/pages/TicketBuscaComponente'));

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
  'hsl(160, 60%, 45%)',
  'hsl(340, 65%, 50%)',
];

const STORAGE_KEY = 'helpdesk_consultant_filter';
const DEFAULT_COLLABORATORS = ['Leandrofaria', 'Ailton', 'Italo', 'Vagner', 'Bruna', 'Ricardo', 'Ronaldo', 'Brunosassada'];

function loadConsultantFilter(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_COLLABORATORS;
  } catch { return DEFAULT_COLLABORATORS; }
}

function saveConsultantFilter(selected: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
}

// -- Consultant Filter Component --
function ConsultantFilter({
  consultores,
  selected,
  onChange,
}: {
  consultores: string[];
  selected: string[];
  onChange: (s: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = consultores.filter(c =>
    c.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (name: string) => {
    const next = selected.includes(name)
      ? selected.filter(s => s !== name)
      : [...selected, name];
    onChange(next);
    saveConsultantFilter(next);
  };

  const clearAll = () => { onChange([]); saveConsultantFilter([]); };
  const selectAll = () => { onChange(consultores); saveConsultantFilter(consultores); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={selected.length > 0 ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5 h-8"
        >
          <Filter className="h-3.5 w-3.5" />
          Consultores
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] rounded-full px-1.5 text-[10px] font-bold bg-background/20 text-primary-foreground">
              {selected.length}
            </Badge>
          )}
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2">
          <Input
            placeholder="Buscar consultor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="flex items-center justify-between px-3 pb-1">
          <button onClick={selectAll} className="text-[10px] text-primary hover:underline font-medium">Todos</button>
          <button onClick={clearAll} className="text-[10px] text-muted-foreground hover:underline">Limpar</button>
        </div>
        <Separator />
        <ScrollArea className="h-56">
          <div className="p-1">
            {filtered.map(name => (
              <label
                key={name}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent cursor-pointer text-sm"
              >
                <Checkbox
                  checked={selected.includes(name)}
                  onCheckedChange={() => toggle(name)}
                />
                <span className="truncate">{name}</span>
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum consultor encontrado</p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// -- Custom Tooltip --
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-xl px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">{p.value?.toLocaleString('pt-BR')}</span>
        </div>
      ))}
    </div>
  );
}

type ActiveView = 'consultores' | 'sistemas' | 'bandeiras' | 'clientes' | 'tipos' | 'chamados' | null;

export default function HelpdeskDashboard() {
  const filters = useDashboardFilters('30d');
  const kpis = useHelpdeskKpis(filters.dateFrom, filters.dateTo);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [activeView, setActiveView] = useState<ActiveView>(null);
  const [drawerItem, setDrawerItem] = useState<any>(null);
  const [selectedConsultants, setSelectedConsultants] = useState<string[]>(loadConsultantFilter);
  const [chartTab, setChartTab] = useState('consultores');

  const {
    allSnapshots, historico, totalSnapshotsNoPeriodo, diasComDados,
    registrosPorConsultor, tipoChamadoTempoMedio, registrosPorSistema,
    registrosPorBandeira, registrosPorCliente, ocorrenciasPorTipo,
    horasTotaisPorDia,
    totalRegistros, totalHoras, horasDiaTotal, totalConsultores,
    lastSync, isLoading, isError, refetch,
  } = kpis;

  const { minDate, maxDate } = useMemo(
    () => getDateBoundsFromItems(allSnapshots || [], [(s: any) => s.collected_at]),
    [allSnapshots]
  );

  // -- Apply consultant filter --
  const filteredConsultores = useMemo(() => {
    if (selectedConsultants.length === 0) return registrosPorConsultor;
    return registrosPorConsultor.filter(c => selectedConsultants.includes(c.nome));
  }, [registrosPorConsultor, selectedConsultants]);

  const filteredTotalRegistros = useMemo(() =>
    selectedConsultants.length === 0
      ? totalRegistros
      : filteredConsultores.reduce((s, c) => s + c.totalRegistros, 0),
    [filteredConsultores, totalRegistros, selectedConsultants]
  );

  const filteredTotalMinutos = useMemo(() =>
    selectedConsultants.length === 0
      ? kpis.totalMinutos
      : filteredConsultores.reduce((s, c) => s + c.totalMinutos, 0),
    [filteredConsultores, kpis.totalMinutos, selectedConsultants]
  );

  const filteredTotalHoras = Math.round(filteredTotalMinutos / 60 * 10) / 10;

  const allConsultantNames = useMemo(() =>
    registrosPorConsultor.map(c => c.nome).sort((a, b) => a.localeCompare(b)),
    [registrosPorConsultor]
  );

  const handleKpiClick = (view: ActiveView) => {
    setActiveView(prev => prev === view ? null : view);
  };

  const handleExportCSV = () => exportCSV({
    title: 'Helpdesk KPIs', area: 'Helpdesk', periodLabel: filters.presetLabel,
    columns: ['nome', 'quantidade', 'totalMinutos'],
    rows: filteredConsultores as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Helpdesk KPIs', area: 'Helpdesk', periodLabel: filters.presetLabel,
    kpis: [
      { label: 'Total Registros', value: filteredTotalRegistros },
      { label: 'Total Horas', value: filteredTotalHoras },
      { label: 'Consultores', value: selectedConsultants.length || totalConsultores },
    ],
    columns: ['nome', 'totalRegistros', 'totalMinutos'],
    rows: filteredConsultores as any[],
  });

  // Table data
  const getActiveTableData = () => {
    switch (activeView) {
      case 'consultores': return { data: filteredConsultores, title: 'Registros por Consultor' };
      case 'sistemas': return { data: registrosPorSistema, title: 'Registros por Sistema' };
      case 'bandeiras': return { data: registrosPorBandeira, title: 'Registros por Bandeira' };
      case 'clientes': return { data: registrosPorCliente, title: 'Registros por Cliente' };
      case 'tipos': return { data: ocorrenciasPorTipo, title: 'Ocorrências por Tipo' };
      case 'chamados': return { data: tipoChamadoTempoMedio, title: 'Tipo de Chamado x Tempo Médio' };
      default: return { data: filteredConsultores, title: 'Registros por Consultor' };
    }
  };

  const { data: tableData, title: tableTitle } = getActiveTableData();

  const consultorColumns: DataTableColumn<ConsultorKpi>[] = [
    { key: 'nome', header: 'Consultor', className: 'font-medium' },
    { key: 'totalRegistros', header: 'Registros', className: 'text-right' },
    { key: 'totalMinutos', header: 'Minutos', className: 'text-right', render: (r) => r.totalMinutos.toLocaleString('pt-BR') },
  ];

  const grupoColumns: DataTableColumn<RegistroPorGrupo>[] = [
    { key: 'nome', header: 'Nome', className: 'font-medium' },
    { key: 'quantidade', header: 'Quantidade', className: 'text-right' },
  ];

  const tipoColumns: DataTableColumn<TipoChamadoKpi>[] = [
    { key: 'tipo', header: 'Tipo', className: 'font-medium' },
    { key: 'quantidade', header: 'Quantidade', className: 'text-right' },
    { key: 'tempoMedio', header: 'Tempo Médio (min)', className: 'text-right', render: (r) => r.tempoMedio.toFixed(1) },
  ];

  const drawerFields: DrawerField[] = drawerItem ? Object.entries(drawerItem).map(([key, value]) => ({
    label: key, value: String(value ?? '—'),
  })) : [];

  const hasData = totalRegistros > 0 || registrosPorConsultor.length > 0;

  // Sorted data for charts
  const top10Consultores = filteredConsultores
    .slice()
    .sort((a, b) => b.totalRegistros - a.totalRegistros)
    .slice(0, 10);

  const top10Sistemas = registrosPorSistema
    .slice()
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 10);

  // Hours trend data
  const horasTrend = horasTotaisPorDia
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(-30)
    .map(h => ({
      ...h,
      label: h.data ? new Date(h.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '',
    }));

  const tabFallback = (
    <div className="space-y-3 p-4">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  const ticketExtraTabs = [
    {
      id: 'tickets-painel',
      label: 'Painel Tickets',
      icon: <Ticket className="h-3.5 w-3.5" />,
      content: <Suspense fallback={tabFallback}><DashboardPage /></Suspense>,
    },
    {
      id: 'tickets-busca-vdesk',
      label: 'Busca VDesk',
      icon: <Search className="h-3.5 w-3.5" />,
      content: <Suspense fallback={tabFallback}><TicketBuscaPage /></Suspense>,
    },
  ];

  return (
    <SectorLayout
      title="Helpdesk"
      subtitle="KPIs de Atendimento — VDesk"
      lastUpdate=""
      integrations={integrations}
      templateKey="helpdesk_v1"
      areaKey="tickets_os"
      extraTabs={ticketExtraTabs}
      syncFunctions={[
        { name: 'vdesk-sync-helpdesk', label: 'Sincronizar Helpdesk (VDesk)' },
      ]}
    >

      {/* Top bar: sync badge + consultant filter */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <DashboardLastSyncBadge syncedAt={lastSync} status="ok" />
        <div className="flex items-center gap-2">
          {selectedConsultants.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {selectedConsultants.slice(0, 3).map(name => (
                <Badge key={name} variant="secondary" className="text-[10px] gap-1 pr-1">
                  {name}
                  <button onClick={() => {
                    const next = selectedConsultants.filter(s => s !== name);
                    setSelectedConsultants(next);
                    saveConsultantFilter(next);
                  }}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {selectedConsultants.length > 3 && (
                <Badge variant="outline" className="text-[10px]">+{selectedConsultants.length - 3}</Badge>
              )}
            </div>
          )}
          <ConsultantFilter
            consultores={allConsultantNames}
            selected={selectedConsultants}
            onChange={setSelectedConsultants}
          />
        </div>
      </div>

      <DashboardFilterBar
        preset={filters.preset}
        onPresetChange={filters.setPreset}
        presetLabel={filters.presetLabel}
        presetControl="dropdown"
        presetsLabel="Período"
        presets={[
          { value: '7d', label: '7d' },
          { value: '30d', label: '30d' },
          { value: '90d', label: '90d' },
          { value: '6m', label: '6m' },
          { value: '1y', label: '1a' },
          { value: 'all', label: 'Todos' },
        ]}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        minDate={minDate}
        maxDate={maxDate}
        onCustomRange={filters.setCustomRange}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
      />

      {isError ? (
        <DashboardEmptyState variant="error" onRetry={() => refetch()} />
      ) : !isLoading && !hasData ? (
        <DashboardEmptyState description="Nenhum dado de helpdesk encontrado. Execute o sync via Admin > Sync Central para carregar os dados da API." />
      ) : (
        <>
          {/* === Hero KPI Cards (main metrics) === */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-1">
            <DashboardKpiCard
              label="Total Registros"
              value={filteredTotalRegistros}
              icon={FileText}
              isLoading={isLoading}
              onClick={() => handleKpiClick('consultores')}
              active={activeView === 'consultores'}
            />
            <DashboardKpiCard
              label="Horas Acumuladas"
              value={filteredTotalHoras}
              suffix="h"
              icon={Clock}
              isLoading={isLoading}
              delay={80}
              onClick={() => handleKpiClick('chamados')}
              active={activeView === 'chamados'}
            />
            <DashboardKpiCard
              label="Horas Hoje"
              value={horasDiaTotal}
              suffix="h"
              icon={TrendingUp}
              isLoading={isLoading}
              delay={160}
            />
            <DashboardKpiCard
              label="Consultores Ativos"
              value={selectedConsultants.length || totalConsultores}
              icon={Users}
              isLoading={isLoading}
              delay={240}
              onClick={() => handleKpiClick('consultores')}
              active={activeView === 'consultores'}
            />
          </div>

          {/* === Secondary KPI row === */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <DashboardKpiCard
              label="Sistemas"
              value={registrosPorSistema.length}
              icon={Monitor}
              isLoading={isLoading}
              onClick={() => handleKpiClick('sistemas')}
              active={activeView === 'sistemas'}
            />
            <DashboardKpiCard
              label="Bandeiras"
              value={registrosPorBandeira.length}
              icon={Flag}
              isLoading={isLoading}
              delay={80}
              onClick={() => handleKpiClick('bandeiras')}
              active={activeView === 'bandeiras'}
            />
            <DashboardKpiCard
              label="Clientes"
              value={registrosPorCliente.length}
              icon={UserCheck}
              isLoading={isLoading}
              delay={160}
              onClick={() => handleKpiClick('clientes')}
              active={activeView === 'clientes'}
            />
            <DashboardKpiCard
              label="Tipos Ocorrência"
              value={ocorrenciasPorTipo.length}
              icon={Headphones}
              isLoading={isLoading}
              delay={240}
              onClick={() => handleKpiClick('tipos')}
              active={activeView === 'tipos'}
            />
          </div>

          {/* === Charts Section (Tabbed) === */}
          {!isLoading && hasData && (
            <div className="mt-6">
              <Tabs value={chartTab} onValueChange={setChartTab} className="w-full">
                <TabsList className="mb-4 h-9">
                  <TabsTrigger value="consultores" className="text-xs gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Consultores
                  </TabsTrigger>
                  <TabsTrigger value="sistemas" className="text-xs gap-1.5">
                    <Monitor className="h-3.5 w-3.5" /> Sistemas
                  </TabsTrigger>
                  <TabsTrigger value="tendencia" className="text-xs gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" /> Tendência
                  </TabsTrigger>
                  <TabsTrigger value="detalhes" className="text-xs gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" /> Detalhes
                  </TabsTrigger>
                </TabsList>

                {/* Tab: Consultores */}
                <TabsContent value="consultores">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Bar chart - top consultores */}
                    <Card className="lg:col-span-2">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary" />
                          Top 10 Consultores por Registros
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={top10Consultores} layout="vertical" margin={{ left: 5, right: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" className="opacity-20" horizontal={false} />
                              <XAxis type="number" className="text-xs" tick={{ fontSize: 10 }} />
                              <YAxis
                                type="category"
                                dataKey="nome"
                                width={90}
                                tick={{ fontSize: 11 }}
                                className="text-xs"
                              />
                              <Tooltip content={<ChartTooltip />} />
                              <Bar
                                dataKey="totalRegistros"
                                name="Registros"
                                fill="hsl(var(--primary))"
                                radius={[0, 6, 6, 0]}
                                barSize={18}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Pie: Ocorrências por Tipo */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Headphones className="h-4 w-4 text-primary" />
                          Ocorrências por Tipo
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-72 flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={ocorrenciasPorTipo.length > 0 ? ocorrenciasPorTipo : [{ nome: 'Sem dados', quantidade: 1 }]}
                                dataKey="quantidade"
                                nameKey="nome"
                                cx="50%"
                                cy="50%"
                                innerRadius={45}
                                outerRadius={85}
                                paddingAngle={3}
                                label={ocorrenciasPorTipo.length > 0
                                  ? ({ nome, percent }: any) => `${nome} (${(percent * 100).toFixed(0)}%)`
                                  : false}
                              >
                                {(ocorrenciasPorTipo.length > 0 ? ocorrenciasPorTipo : [{ nome: 'Sem dados', quantidade: 1 }]).map((_, i) => (
                                  <Cell
                                    key={i}
                                    fill={ocorrenciasPorTipo.length > 0 ? CHART_COLORS[i % CHART_COLORS.length] : 'hsl(var(--muted))'}
                                    stroke="hsl(var(--card))"
                                    strokeWidth={2}
                                  />
                                ))}
                              </Pie>
                              <Tooltip content={<ChartTooltip />} />
                              <Legend
                                verticalAlign="bottom"
                                iconType="circle"
                                iconSize={8}
                                wrapperStyle={{ fontSize: '11px' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Tab: Sistemas */}
                <TabsContent value="sistemas">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Monitor className="h-4 w-4 text-primary" />
                          Registros por Sistema
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={top10Sistemas} layout="vertical" margin={{ left: 5, right: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" className="opacity-20" horizontal={false} />
                              <XAxis type="number" className="text-xs" tick={{ fontSize: 10 }} />
                              <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 11 }} />
                              <Tooltip content={<ChartTooltip />} />
                              <Bar
                                dataKey="quantidade"
                                name="Registros"
                                radius={[0, 6, 6, 0]}
                                barSize={20}
                              >
                                {top10Sistemas.map((_, i) => (
                                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Ranking mini-list */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Top Clientes Impactados</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-80">
                          <div className="space-y-2">
                             {registrosPorCliente
                              .slice()
                              .sort((a, b) => b.quantidade - a.quantidade)
                              .map((s, i, sortedArr) => {
                                const maxQtd = sortedArr[0]?.quantidade || 1;
                                const pct = Math.max(4, Math.round((s.quantidade / maxQtd) * 100));
                                return (
                                  <div key={s.nome} className="flex items-center gap-3">
                                    <span className="text-xs text-muted-foreground w-5 text-right font-mono">{i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-sm font-medium truncate">{s.nome}</span>
                                        <span className="text-xs font-bold text-foreground ml-2">{s.quantidade}</span>
                                      </div>
                                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                        <div
                                          className="h-full rounded-full transition-all duration-500"
                                          style={{
                                            width: `${pct}%`,
                                            background: CHART_COLORS[i % CHART_COLORS.length],
                                          }}
                                        />
                                      </div>
                                    </div>
                                    <Phone className="h-3.5 w-3.5 text-muted-foreground/70" />
                                  </div>
                                );
                              })}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Tab: Tendência */}
                <TabsContent value="tendencia">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Horas por Dia (últimos 30 dias)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={horasTrend} margin={{ left: 0, right: 10, top: 5 }}>
                            <defs>
                              <linearGradient id="horasGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                            <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                            <YAxis className="text-xs" tick={{ fontSize: 10 }} />
                            <Tooltip content={<ChartTooltip />} />
                            <Area
                              type="monotone"
                              dataKey="totalHoras"
                              name="Horas"
                              stroke="hsl(var(--primary))"
                              strokeWidth={2}
                              fill="url(#horasGrad)"
                              dot={{ r: 2, fill: 'hsl(var(--primary))' }}
                              activeDot={{ r: 5 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Tab: Detalhes */}
                <TabsContent value="detalhes">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Tipo Chamado x Tempo Médio */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Tipo de Chamado × Tempo Médio</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={tipoChamadoTempoMedio} margin={{ left: 10 }}>
                              <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                              <XAxis dataKey="tipo" className="text-xs" tick={{ fontSize: 10 }} />
                              <YAxis className="text-xs" tick={{ fontSize: 10 }} />
                              <Tooltip content={<ChartTooltip />} />
                              <Bar dataKey="tempoMedio" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} name="Tempo Médio (min)" barSize={32} />
                              <Bar dataKey="quantidade" fill="hsl(var(--chart-3))" radius={[6, 6, 0, 0]} name="Quantidade" barSize={32} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Bandeiras / Clientes summary */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Flag className="h-4 w-4 text-primary" />
                          Distribuição por Bandeira
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={registrosPorBandeira.length > 0 ? registrosPorBandeira : [{ nome: 'N/A', quantidade: 1 }]}
                                dataKey="quantidade"
                                nameKey="nome"
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={75}
                                paddingAngle={2}
                              >
                                {(registrosPorBandeira.length > 0 ? registrosPorBandeira : [{ nome: 'N/A', quantidade: 1 }]).map((_, i) => (
                                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="hsl(var(--card))" strokeWidth={2} />
                                ))}
                              </Pie>
                              <Tooltip content={<ChartTooltip />} />
                              <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* === Data Table === */}
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
                  subtitle={`${filteredConsultores.length} consultores${selectedConsultants.length > 0 ? ' (filtrado)' : ''}`}
                  columns={consultorColumns}
                  data={filteredConsultores}
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
