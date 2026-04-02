import { useState, useMemo } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { useGerencialFabrica, type GerencialFabricaRow } from '@/hooks/useGerencialFabrica';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { MultiSprintFilter } from '@/components/gerencial/MultiSprintFilter';
import { SortableTableHead, useTableSort } from '@/components/gerencial/SortableTableHead';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  LineChart, Line, Legend, Tooltip as RTooltip, Cell,
  PieChart, Pie,
} from 'recharts';
import {
  AlertTriangle, TrendingDown, TrendingUp, Clock, ShieldCheck,
  Zap, BarChart3, Info,
} from 'lucide-react';

function KpiCard({ label, value, icon: Icon, tooltip, variant = 'default' }: {
  label: string; value: string | number; icon: React.ElementType;
  tooltip: string; variant?: 'default' | 'danger' | 'warning' | 'success';
}) {
  const variantClasses = {
    default: 'border-border',
    danger: 'border-red-500/40 bg-red-500/5',
    warning: 'border-amber-500/40 bg-amber-500/5',
    success: 'border-emerald-500/40 bg-emerald-500/5',
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className={`${variantClasses[variant]} transition-all hover:shadow-md`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{value}</div>
          </CardContent>
        </Card>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-sm">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

const HEALTH_COLORS = { verde: '#10b981', amarelo: '#eab308', vermelho: '#ef4444' };

export default function GerencialFabricaDashboard() {
  const [selectedSprints, setSelectedSprints] = useState<string[]>([]);
  const { data: rows, isLoading } = useGerencialFabrica();

  const sprints = useMemo(() => (rows || []).map(r => r.sprint_code).filter(Boolean), [rows]);

  const filteredRows = useMemo(() => {
    if (!rows?.length) return [];
    if (selectedSprints.length === 0) return rows;
    return rows.filter(r => selectedSprints.includes(r.sprint_code));
  }, [rows, selectedSprints]);

  const { sortKey, sortDir, onSort, sortFn } = useTableSort<GerencialFabricaRow>('sprint_code', 'desc');

  const sortedRows = useMemo(() => [...filteredRows].sort(sortFn), [filteredRows, sortFn]);

  // Aggregate KPIs
  const agg = useMemo(() => {
    if (!filteredRows.length) return null;
    const total = filteredRows.reduce((s, r) => s + r.total_itens, 0);
    const done = filteredRows.reduce((s, r) => s + r.done_count, 0);
    const transbordo = filteredRows.reduce((s, r) => s + r.transbordo_count, 0);
    const despriorizado = filteredRows.reduce((s, r) => s + r.despriorizado_count, 0);
    const qaReturns = filteredRows.reduce((s, r) => s + r.qa_return_total, 0);
    const criticos = filteredRows.reduce((s, r) => s + r.itens_criticos, 0);
    const atencao = filteredRows.reduce((s, r) => s + r.itens_atencao, 0);
    const saudaveis = filteredRows.reduce((s, r) => s + r.itens_saudaveis, 0);
    const avgLead = filteredRows.length > 0
      ? Math.round((filteredRows.reduce((s, r) => s + (r.avg_lead_time_days || 0), 0) / filteredRows.length) * 10) / 10
      : 0;
    const gargalo = filteredRows[0]?.gargalo_principal || '—';
    return { total, done, transbordo, despriorizado, qaReturns, criticos, atencao, saudaveis, avgLead, gargalo };
  }, [filteredRows]);

  // Chart data: transbordo evolution by sprint
  const transbordoEvolution = useMemo(() =>
    [...filteredRows].reverse().map(r => ({
      sprint: r.sprint_code?.split('\\').pop() || r.sprint_code,
      transbordos: r.transbordo_count,
      retornos_qa: r.qa_return_total,
    })),
    [filteredRows]
  );

  // Health donut
  const healthDonut = useMemo(() => {
    if (!agg) return [];
    return [
      { name: 'Saudável', value: agg.saudaveis, fill: HEALTH_COLORS.verde },
      { name: 'Atenção', value: agg.atencao, fill: HEALTH_COLORS.amarelo },
      { name: 'Crítico', value: agg.criticos, fill: HEALTH_COLORS.vermelho },
    ].filter(d => d.value > 0);
  }, [agg]);

  return (
    <SectorLayout
      title="Gerencial Fábrica"
      subtitle="Visão executiva de saúde, gargalos e risco do pipeline de desenvolvimento"
      areaKey="fabrica"
    >
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <MultiSprintFilter
            sprints={sprints}
            selected={selectedSprints}
            onChange={setSelectedSprints}
          />
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            Dados calculados automaticamente a partir do ciclo de vida dos PBIs
          </div>
        </div>

        {/* KPI Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : agg ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <KpiCard label="Total Itens" value={agg.total} icon={BarChart3}
              tooltip="Total de itens no pipeline (PBIs, User Stories, Bugs) nas sprints selecionadas" />
            <KpiCard label="Concluídos" value={agg.done} icon={ShieldCheck}
              tooltip="Itens que alcançaram o estado Done" variant="success" />
            <KpiCard label="Transbordos" value={agg.transbordo} icon={TrendingDown}
              tooltip="Itens que migraram para sprint seguinte sem conclusão."
              variant={agg.transbordo > 5 ? 'danger' : agg.transbordo > 0 ? 'warning' : 'default'} />
            <KpiCard label="Despriorizados" value={agg.despriorizado} icon={AlertTriangle}
              tooltip="Itens planejados e removidos da sprint antes da conclusão."
              variant={agg.despriorizado > 3 ? 'warning' : 'default'} />
            <KpiCard label="Retornos QA" value={agg.qaReturns} icon={Zap}
              tooltip="Total de retornos de QA (reprovações em teste)."
              variant={agg.qaReturns > 5 ? 'danger' : agg.qaReturns > 0 ? 'warning' : 'default'} />
            <KpiCard label="Lead Time Médio" value={`${agg.avgLead}d`} icon={Clock}
              tooltip="Tempo médio (dias) do backlog até Done." />
          </div>
        ) : null}

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Health donut */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Saúde dos Itens
                <Tooltip>
                  <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent className="max-w-xs text-sm">
                    Saudável: dentro da sprint, sem bloqueios. Atenção: 1 retorno QA ou migração. Crítico: 2+ retornos, transbordo ou atraso &gt;7 dias.
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              {healthDonut.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={healthDonut} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={50} outerRadius={85} paddingAngle={3}>
                      {healthDonut.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <RTooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-sm py-8">Sem dados de saúde</p>
              )}
            </CardContent>
          </Card>

          {/* Transbordo evolution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Evolução: Transbordos e Retornos QA por Sprint
                <Tooltip>
                  <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent className="max-w-xs text-sm">
                    Tendência de transbordos e retornos QA ao longo das sprints.
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transbordoEvolution.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={transbordoEvolution}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis dataKey="sprint" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RTooltip />
                    <Legend />
                    <Line type="monotone" dataKey="transbordos" stroke="#ef4444" strokeWidth={2} name="Transbordos" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="retornos_qa" stroke="#eab308" strokeWidth={2} name="Retornos QA" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-sm py-8">Sem dados de evolução</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sprint comparison table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Comparativo por Sprint</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead label="Sprint" sortKey="sprint_code" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
                      <SortableTableHead label="Total" sortKey="total_itens" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="text-center" />
                      <SortableTableHead label="Done" sortKey="done_count" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="text-center" />
                      <SortableTableHead label="Em Progresso" sortKey="in_progress_count" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="text-center" />
                      <SortableTableHead label="Transbordos" sortKey="transbordo_count" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="text-center" />
                      <SortableTableHead label="Retornos QA" sortKey="qa_return_total" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="text-center" />
                      <SortableTableHead label="Lead Time" sortKey="avg_lead_time_days" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="text-center" />
                      <TableHead className="text-center">Gargalo</TableHead>
                      <TableHead className="text-center">Saúde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRows.map((r) => (
                      <TableRow key={r.sprint_code}>
                        <TableCell className="font-medium text-xs">
                          {r.sprint_code?.split('\\').pop() || r.sprint_code}
                        </TableCell>
                        <TableCell className="text-center">{r.total_itens}</TableCell>
                        <TableCell className="text-center">
                          <span className="text-emerald-600 font-medium">{r.done_count}</span>
                        </TableCell>
                        <TableCell className="text-center">{r.in_progress_count}</TableCell>
                        <TableCell className="text-center">
                          {r.transbordo_count > 0 ? (
                            <Badge variant="destructive" className="text-xs">{r.transbordo_count}</Badge>
                          ) : '0'}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.qa_return_total > 0 ? (
                            <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">{r.qa_return_total}</Badge>
                          ) : '0'}
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          {r.avg_lead_time_days != null ? `${r.avg_lead_time_days}d` : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.gargalo_principal ? (
                            <Badge variant="outline" className="text-xs capitalize">{r.gargalo_principal}</Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Saudável" />
                            <span className="text-xs">{r.itens_saudaveis}</span>
                            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 ml-1" title="Atenção" />
                            <span className="text-xs">{r.itens_atencao}</span>
                            <span className="inline-block w-2 h-2 rounded-full bg-red-500 ml-1" title="Crítico" />
                            <span className="text-xs">{r.itens_criticos}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {sortedRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          Sem dados disponíveis
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SectorLayout>
  );
}
