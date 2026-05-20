import { useEffect, useMemo, useState } from 'react';
import { useGerencialQa, useQaDesempenho, type GerencialQaRow } from '@/hooks/useGerencialQa';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MultiSprintFilter } from '@/components/gerencial/MultiSprintFilter';
import { SortableTableHead, useTableSort } from '@/components/gerencial/SortableTableHead';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  LineChart, Line, Legend, Tooltip as RTooltip, Cell,
  PieChart, Pie,
} from 'recharts';
import {
  CheckCircle2, XCircle, Clock, ShieldCheck,
  Users, TrendingUp, Info, AlertTriangle,
} from 'lucide-react';
import { getCurrentOfficialSprintCode } from '@/lib/sprintCalendar';

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

interface GerencialQaPanelProps {
  lockedSprintCode?: string | null;
  dateStart?: Date;
  dateEnd?: Date;
}

function toIsoDate(d?: Date): string | undefined {
  if (!d) return undefined;
  return d.toISOString().slice(0, 10);
}

export function GerencialQaPanel({ lockedSprintCode = null, dateStart, dateEnd }: GerencialQaPanelProps) {
  const [selectedSprints, setSelectedSprints] = useState<string[]>([]);
  const dateStartIso = toIsoDate(dateStart);
  const dateEndIso = toIsoDate(dateEnd);

  const { data: qaRows, isLoading: qaLoading } = useGerencialQa(lockedSprintCode || undefined, dateStartIso, dateEndIso);
  const { data: desempenho, isLoading: desLoading } = useQaDesempenho(lockedSprintCode || undefined, dateStartIso, dateEndIso);

  const sprints = useMemo(
    () => Array.from(new Set((qaRows || []).map(r => r.sprint_code).filter(Boolean))),
    [qaRows]
  );

  const currentSprint = useMemo(() => {
    const code = getCurrentOfficialSprintCode();
    return sprints.includes(code) ? code : null;
  }, [sprints]);

  useEffect(() => {
    if (lockedSprintCode) {
      setSelectedSprints([lockedSprintCode]);
      return;
    }
    if (selectedSprints.length > 0) return;
    setSelectedSprints(sprints);
  }, [lockedSprintCode, selectedSprints.length, sprints]);

  const filteredRows = useMemo(() => {
    if (!qaRows?.length) return [];
    if (selectedSprints.length === 0) return [];
    return qaRows.filter(r => selectedSprints.includes(r.sprint_code));
  }, [qaRows, selectedSprints]);

  const { sortKey, sortDir, onSort, sortFn } = useTableSort<GerencialQaRow>('sprint_code', 'desc');
  const sortedRows = useMemo(() => [...filteredRows].sort(sortFn), [filteredRows, sortFn]);

  const agg = useMemo(() => {
    if (!filteredRows.length) return null;
    const testadas = filteredRows.reduce((s, r) => s + r.testadas, 0);
    const aprovadas = filteredRows.reduce((s, r) => s + r.aprovadas, 0);
    const reprovadas = filteredRows.reduce((s, r) => s + r.reprovadas, 0);
    const total = filteredRows.reduce((s, r) => s + r.total_itens, 0);
    const taxaAprovacao = testadas > 0 ? Math.round((aprovadas / testadas) * 1000) / 10 : 0;
    const taxaRetrabalho = total > 0 ? Math.round((reprovadas / total) * 1000) / 10 : 0;
    const avgDays = filteredRows.length > 0
      ? Math.round((filteredRows.reduce((s, r) => s + (r.avg_qualidade_days || 0), 0) / filteredRows.length) * 10) / 10
      : 0;
    const criticos = filteredRows.reduce((s, r) => s + r.retrabalho_critico, 0);
    const saudaveis = filteredRows.reduce((s, r) => s + r.itens_saudaveis, 0);
    const atencao = filteredRows.reduce((s, r) => s + r.itens_atencao, 0);
    const itensCriticos = filteredRows.reduce((s, r) => s + r.itens_criticos, 0);
    return { testadas, aprovadas, reprovadas, total, taxaAprovacao, taxaRetrabalho, avgDays, criticos, saudaveis, atencao, itensCriticos };
  }, [filteredRows]);

  const evolutionData = useMemo(() =>
    [...filteredRows].reverse().map(r => ({
      sprint: r.sprint_code?.split('\\').pop() || r.sprint_code,
      aprovadas: r.aprovadas,
      reprovadas: r.reprovadas,
      retornadas: r.retornadas,
    })),
    [filteredRows]
  );

  const reworkTrend = useMemo(() =>
    [...filteredRows].reverse().map(r => ({
      sprint: r.sprint_code?.split('\\').pop() || r.sprint_code,
      baixo: r.retrabalho_baixo,
      alto: r.retrabalho_alto,
      critico: r.retrabalho_critico,
      taxa: r.taxa_retrabalho,
    })),
    [filteredRows]
  );

  const healthDonut = useMemo(() => {
    if (!agg) return [];
    return [
      { name: 'Saudável', value: agg.saudaveis, fill: HEALTH_COLORS.verde },
      { name: 'Atenção', value: agg.atencao, fill: HEALTH_COLORS.amarelo },
      { name: 'Crítico', value: agg.itensCriticos, fill: HEALTH_COLORS.vermelho },
    ].filter(d => d.value > 0);
  }, [agg]);

  const isLoading = qaLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <MultiSprintFilter
          sprints={sprints}
          selected={selectedSprints}
          onChange={setSelectedSprints}
          currentSprint={currentSprint}
          disabled={!!lockedSprintCode}
        />
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          {lockedSprintCode
            ? `Filtro de sprint herdado da aba do setor (${lockedSprintCode})`
            : 'Métricas históricas por sprint de encerramento'}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : agg ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard label="Itens concluídos" value={agg.total} icon={ShieldCheck}
            tooltip="Total de itens Done no recorte de sprint" />
          <KpiCard label="Sem retorno QA" value={agg.aprovadas} icon={CheckCircle2}
            tooltip="Itens concluídos sem retorno QA" variant="success" />
          <KpiCard label="Com retorno QA" value={agg.reprovadas} icon={XCircle}
            tooltip="Itens concluídos com pelo menos 1 retorno QA"
            variant={agg.reprovadas > 5 ? 'danger' : agg.reprovadas > 0 ? 'warning' : 'default'} />
          <KpiCard label="% sem retorno" value={`${agg.taxaAprovacao}%`} icon={TrendingUp}
            tooltip="Percentual de itens concluídos sem retrabalho"
            variant={agg.taxaAprovacao >= 80 ? 'success' : agg.taxaAprovacao >= 60 ? 'warning' : 'danger'} />
          <KpiCard label="Crítico (3+)" value={agg.criticos} icon={AlertTriangle}
            tooltip="Itens com 3 ou mais ciclos de retorno"
            variant={agg.criticos > 0 ? 'danger' : 'default'} />
          <KpiCard label="Tempo médio QA" value={`${agg.avgDays}d`} icon={Clock}
            tooltip="Tempo médio (dias) na etapa de qualidade" />
        </div>
      ) : null}

      <Tabs defaultValue="evolucao" className="space-y-4">
        <TabsList>
          <TabsTrigger value="evolucao">Evolução Sprint</TabsTrigger>
          <TabsTrigger value="retrabalho">Retrabalho</TabsTrigger>
          <TabsTrigger value="desempenho">Desempenho QA</TabsTrigger>
        </TabsList>

        <TabsContent value="evolucao" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Resultado por Sprint</CardTitle>
              </CardHeader>
              <CardContent>
                {evolutionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={evolutionData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis dataKey="sprint" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RTooltip />
                      <Legend />
                      <Bar dataKey="aprovadas" stackId="a" fill="#10b981" name="Sem retorno" />
                      <Bar dataKey="reprovadas" stackId="a" fill="#ef4444" name="Com retorno" />
                      <Bar dataKey="retornadas" stackId="a" fill="#eab308" name="Ciclos" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-muted-foreground text-sm py-8 text-center">Sem dados</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Saúde dos Itens</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                {healthDonut.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={healthDonut} dataKey="value" nameKey="name" cx="50%" cy="50%"
                        innerRadius={50} outerRadius={85} paddingAngle={3}>
                        {healthDonut.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <RTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-muted-foreground text-sm py-8">Sem dados</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="retrabalho" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Tendência de Retrabalho por Sprint</CardTitle>
              </CardHeader>
              <CardContent>
                {reworkTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={reworkTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis dataKey="sprint" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RTooltip />
                      <Legend />
                      <Bar dataKey="baixo" stackId="a" fill="#eab308" name="Baixo (1)" />
                      <Bar dataKey="alto" stackId="a" fill="#f97316" name="Alto (2)" />
                      <Bar dataKey="critico" stackId="a" fill="#ef4444" name="Crítico (3+)" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-muted-foreground text-sm py-8 text-center">Sem dados</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Taxa de Retrabalho (%)</CardTitle>
              </CardHeader>
              <CardContent>
                {reworkTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={reworkTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis dataKey="sprint" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} unit="%" />
                      <RTooltip />
                      <Line type="monotone" dataKey="taxa" stroke="#ef4444" strokeWidth={2} name="% Retrabalho" dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <p className="text-muted-foreground text-sm py-8 text-center">Sem dados</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="desempenho" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" /> Desempenho por Responsável QA
              </CardTitle>
            </CardHeader>
            <CardContent>
              {desLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Responsável</TableHead>
                        <TableHead className="text-center">Tasks Testadas</TableHead>
                        <TableHead className="text-center">Tempo Médio (dias)</TableHead>
                        <TableHead className="text-center">Reprovações</TableHead>
                        <TableHead className="text-center">% Aprovação</TableHead>
                        <TableHead className="text-center">Retornos Gerados</TableHead>
                        <TableHead className="text-center">Críticos (3+)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(desempenho || []).map((d) => (
                        <TableRow key={d.responsavel}>
                          <TableCell className="font-medium text-sm">{d.responsavel}</TableCell>
                          <TableCell className="text-center">{d.tasks_testadas}</TableCell>
                          <TableCell className="text-center">{d.avg_qualidade_days ?? '—'}</TableCell>
                          <TableCell className="text-center">
                            {d.reprovacoes > 0 ? (
                              <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">{d.reprovacoes}</Badge>
                            ) : '0'}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={d.taxa_aprovacao >= 80 ? 'text-emerald-600' : d.taxa_aprovacao >= 60 ? 'text-amber-600' : 'text-red-600'}>
                              {d.taxa_aprovacao}%
                            </span>
                          </TableCell>
                          <TableCell className="text-center">{d.retornos_gerados}</TableCell>
                          <TableCell className="text-center">
                            {d.itens_criticos > 0 ? (
                              <Badge variant="destructive" className="text-xs">{d.itens_criticos}</Badge>
                            ) : '0'}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!desempenho || desempenho.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            Sem dados de desempenho
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
