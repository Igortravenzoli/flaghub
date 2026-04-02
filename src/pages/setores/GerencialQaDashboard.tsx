import { useState, useMemo } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { useGerencialQa, useQaDesempenho, type GerencialQaRow } from '@/hooks/useGerencialQa';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  LineChart, Line, Legend, Tooltip as RTooltip, Cell,
  PieChart, Pie,
} from 'recharts';
import {
  CheckCircle2, XCircle, RotateCcw, Clock, ShieldCheck,
  Users, TrendingUp, Info, AlertTriangle, BarChart3,
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

export default function GerencialQaDashboard() {
  const [selectedSprint, setSelectedSprint] = useState<string>('all');
  const sprintParam = selectedSprint !== 'all' ? selectedSprint : undefined;

  const { data: qaRows, isLoading: qaLoading } = useGerencialQa(sprintParam);
  const { data: desempenho, isLoading: desLoading } = useQaDesempenho(sprintParam);

  const sprints = useMemo(() => (qaRows || []).map(r => r.sprint_code).filter(Boolean), [qaRows]);

  const agg = useMemo(() => {
    if (!qaRows?.length) return null;
    const target = selectedSprint !== 'all' ? qaRows.filter(r => r.sprint_code === selectedSprint) : qaRows;
    const testadas = target.reduce((s, r) => s + r.testadas, 0);
    const aprovadas = target.reduce((s, r) => s + r.aprovadas, 0);
    const reprovadas = target.reduce((s, r) => s + r.reprovadas, 0);
    const retornadas = target.reduce((s, r) => s + r.retornadas, 0);
    const total = target.reduce((s, r) => s + r.total_itens, 0);
    const taxaAprovacao = testadas > 0 ? Math.round((aprovadas / testadas) * 1000) / 10 : 0;
    const taxaRetrabalho = total > 0 ? Math.round((reprovadas / total) * 1000) / 10 : 0;
    const avgDays = target.length > 0
      ? Math.round((target.reduce((s, r) => s + (r.avg_qualidade_days || 0), 0) / target.length) * 10) / 10
      : 0;
    const criticos = target.reduce((s, r) => s + r.retrabalho_critico, 0);
    const saudaveis = target.reduce((s, r) => s + r.itens_saudaveis, 0);
    const atencao = target.reduce((s, r) => s + r.itens_atencao, 0);
    const itensCriticos = target.reduce((s, r) => s + r.itens_criticos, 0);
    return { testadas, aprovadas, reprovadas, retornadas, total, taxaAprovacao, taxaRetrabalho, avgDays, criticos, saudaveis, atencao, itensCriticos };
  }, [qaRows, selectedSprint]);

  // Evolution chart data
  const evolutionData = useMemo(() =>
    (qaRows || []).slice().reverse().map(r => ({
      sprint: r.sprint_code?.split('\\').pop() || r.sprint_code,
      aprovadas: r.aprovadas,
      reprovadas: r.reprovadas,
      retornadas: r.retornadas,
      taxa_aprovacao: r.taxa_aprovacao,
    })),
    [qaRows]
  );

  // Rework trend
  const reworkTrend = useMemo(() =>
    (qaRows || []).slice().reverse().map(r => ({
      sprint: r.sprint_code?.split('\\').pop() || r.sprint_code,
      baixo: r.retrabalho_baixo,
      alto: r.retrabalho_alto,
      critico: r.retrabalho_critico,
      taxa: r.taxa_retrabalho,
    })),
    [qaRows]
  );

  // Health donut
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
    <SectorLayout
      title="Gerencial QA"
      subtitle="Visão executiva de qualidade, retrabalho e eficiência de testes"
      areaKey="qualidade"
    >
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedSprint} onValueChange={setSelectedSprint}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Todas as Sprints" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Sprints</SelectItem>
              {sprints.map(s => (
                <SelectItem key={s} value={s}>{s?.split('\\').pop() || s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            Métricas derivadas do ciclo de vida e retornos QA
          </div>
        </div>

        {/* KPI Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : agg ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <KpiCard label="Testadas" value={agg.testadas} icon={ShieldCheck}
              tooltip="Total de itens que passaram pela etapa de QA (qualidade_days > 0 ou etapa atual = qualidade/done)" />
            <KpiCard label="Aprovadas" value={agg.aprovadas} icon={CheckCircle2}
              tooltip="Itens concluídos (Done) sem nenhum retorno QA — aprovados de primeira" variant="success" />
            <KpiCard label="Reprovadas" value={agg.reprovadas} icon={XCircle}
              tooltip="Itens com pelo menos 1 retorno QA (falha em teste)"
              variant={agg.reprovadas > 5 ? 'danger' : agg.reprovadas > 0 ? 'warning' : 'default'} />
            <KpiCard label="Taxa Aprovação" value={`${agg.taxaAprovacao}%`} icon={TrendingUp}
              tooltip="Percentual de itens aprovados de primeira sobre o total testado"
              variant={agg.taxaAprovacao >= 80 ? 'success' : agg.taxaAprovacao >= 60 ? 'warning' : 'danger'} />
            <KpiCard label="Retrabalho Crítico" value={agg.criticos} icon={AlertTriangle}
              tooltip="Itens com 3+ retornos QA — indicam problemas graves de especificação ou qualidade de código"
              variant={agg.criticos > 0 ? 'danger' : 'default'} />
            <KpiCard label="Tempo Médio QA" value={`${agg.avgDays}d`} icon={Clock}
              tooltip="Tempo médio (dias) que os itens permanecem na etapa de qualidade/teste" />
          </div>
        ) : null}

        {/* Tabs */}
        <Tabs defaultValue="evolucao" className="space-y-4">
          <TabsList>
            <TabsTrigger value="evolucao">Evolução Sprint</TabsTrigger>
            <TabsTrigger value="retrabalho">Retrabalho</TabsTrigger>
            <TabsTrigger value="desempenho">Desempenho QA</TabsTrigger>
          </TabsList>

          {/* Evolução Sprint a Sprint */}
          <TabsContent value="evolucao" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Stacked bars */}
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
                        <Bar dataKey="aprovadas" stackId="a" fill="#10b981" name="Aprovadas" />
                        <Bar dataKey="reprovadas" stackId="a" fill="#ef4444" name="Reprovadas" />
                        <Bar dataKey="retornadas" stackId="a" fill="#eab308" name="Retornadas" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <p className="text-muted-foreground text-sm py-8 text-center">Sem dados</p>}
                </CardContent>
              </Card>

              {/* Health donut */}
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

            {/* Sprint comparison table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Comparativo por Sprint</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sprint</TableHead>
                        <TableHead className="text-center">Testadas</TableHead>
                        <TableHead className="text-center">Aprovadas</TableHead>
                        <TableHead className="text-center">Reprovadas</TableHead>
                        <TableHead className="text-center">Retornadas</TableHead>
                        <TableHead className="text-center">% Aprovação</TableHead>
                        <TableHead className="text-center">% Retrabalho</TableHead>
                        <TableHead className="text-center">Tempo Médio</TableHead>
                        <TableHead className="text-center">Saúde</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(qaRows || []).map((r) => (
                        <TableRow key={r.sprint_code}>
                          <TableCell className="font-medium text-xs">
                            {r.sprint_code?.split('\\').pop() || r.sprint_code}
                          </TableCell>
                          <TableCell className="text-center">{r.testadas}</TableCell>
                          <TableCell className="text-center text-emerald-600 font-medium">{r.aprovadas}</TableCell>
                          <TableCell className="text-center">
                            {r.reprovadas > 0 ? (
                              <Badge variant="destructive" className="text-xs">{r.reprovadas}</Badge>
                            ) : '0'}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.retornadas > 0 ? (
                              <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">{r.retornadas}</Badge>
                            ) : '0'}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={r.taxa_aprovacao >= 80 ? 'text-emerald-600' : r.taxa_aprovacao >= 60 ? 'text-amber-600' : 'text-red-600'}>
                              {r.taxa_aprovacao}%
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={r.taxa_retrabalho > 20 ? 'text-red-600' : r.taxa_retrabalho > 10 ? 'text-amber-600' : 'text-muted-foreground'}>
                              {r.taxa_retrabalho}%
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {r.avg_qualidade_days != null ? `${r.avg_qualidade_days}d` : '—'}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                              <span className="text-xs">{r.itens_saudaveis}</span>
                              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 ml-1" />
                              <span className="text-xs">{r.itens_atencao}</span>
                              <span className="inline-block w-2 h-2 rounded-full bg-red-500 ml-1" />
                              <span className="text-xs">{r.itens_criticos}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!qaRows || qaRows.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            Sem dados disponíveis
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Retrabalho */}
          <TabsContent value="retrabalho" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    Tendência de Retrabalho por Sprint
                    <Tooltip>
                      <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent className="max-w-xs text-sm">
                        Baixo: 1 retorno QA. Alto: 2 retornos. Crítico: 3+ retornos. Tendência de alta indica problemas de especificação ou qualidade.
                      </TooltipContent>
                    </Tooltip>
                  </CardTitle>
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
                        <Bar dataKey="baixo" stackId="a" fill="#eab308" name="Baixo (1 retorno)" />
                        <Bar dataKey="alto" stackId="a" fill="#f97316" name="Alto (2 retornos)" />
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

          {/* Desempenho QA */}
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
    </SectorLayout>
  );
}
