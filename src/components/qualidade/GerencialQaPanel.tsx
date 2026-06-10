import { useEffect, useMemo, useState } from 'react';
import {
  useGerencialQa, useQaDesempenho, useQaEncerramentosPorUsuario, useGerencialQaItems,
  type GerencialQaRow,
} from '@/hooks/useGerencialQa';
import { extractProducts, normalizeProduct } from '@/lib/products';
import { useQaHistoricalSeries } from '@/hooks/useSprintHistorical';
import { QaKpiCard } from '@/components/qualidade/QaKpiCard';
import { QaPillarCard } from '@/components/qualidade/QaPillarCard';
import { QA_HEALTH, QA_CHART_SERIES, QA_SOURCE_COLORS, QA_TONES, thresholdColorHigh, thresholdColorLow } from '@/lib/qaTheme';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

const HEALTH_COLORS = QA_HEALTH;

const SERIES_COLORS = QA_CHART_SERIES;

const SOURCE_META: Record<string, { label: string; color: string }> = {
  fim_sprint_reconstruido: { label: 'Reconstruído (fim de sprint)', color: QA_SOURCE_COLORS.fim_sprint_reconstruido },
  estado_atual: { label: 'Estado atual', color: QA_SOURCE_COLORS.estado_atual },
  manual: { label: 'Manual', color: QA_SOURCE_COLORS.manual },
};
function sourceMeta(source?: string) {
  return SOURCE_META[source || ''] || { label: source || '—', color: '#94a3b8' };
}

function HistoricalTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const meta = sourceMeta(d.source);
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <div className="font-medium">{d.sprint_code}</div>
      <div>Concluídos (Closed By): <b>{d.concluidos}</b></div>
      <div className="text-muted-foreground">sem retorno {d.sem_retorno} · com retorno {d.com_retorno}</div>
      <div className="mt-1 flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: meta.color }} />
        {meta.label}
      </div>
      {d.as_of && <div className="text-muted-foreground">em {new Date(d.as_of).toLocaleString('pt-BR')}</div>}
    </div>
  );
}

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
  const { data: encerramentos } = useQaEncerramentosPorUsuario(lockedSprintCode || undefined, dateStartIso, dateEndIso);
  const { data: qaItems } = useGerencialQaItems(lockedSprintCode || undefined, dateStartIso, dateEndIso);
  const historicalYear = new Date().getFullYear();
  const { data: qaHistorical } = useQaHistoricalSeries(historicalYear);

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
    const concluidos = filteredRows.reduce((s, r) => s + (r.concluidos || 0), 0);
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
    return { testadas, concluidos, aprovadas, reprovadas, total, taxaAprovacao, taxaRetrabalho, avgDays, criticos, saudaveis, atencao, itensCriticos };
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

  // Item 3 — histórico de encerramentos por usuário (pivot sprint × closer)
  const closers = useMemo(
    () => Array.from(new Set((encerramentos || []).map(e => e.closer_display))).sort(),
    [encerramentos]
  );
  const encerramentosByCloser = useMemo(() => {
    if (!encerramentos?.length) return [];
    const bySprint = new Map<string, Record<string, number | string>>();
    for (const e of encerramentos) {
      const sprint = e.sprint_code?.split('\\').pop() || e.sprint_code || 'Sem Sprint';
      const row = bySprint.get(sprint) || { sprint };
      row[e.closer_display] = (Number(row[e.closer_display]) || 0) + e.encerramentos;
      bySprint.set(sprint, row);
    }
    return Array.from(bySprint.values()).sort((a, b) =>
      String(a.sprint).localeCompare(String(b.sprint), undefined, { numeric: true })
    );
  }, [encerramentos]);

  const totalEncerramentosCloser = useMemo(() =>
    (encerramentos || []).reduce((s, e) => s + e.encerramentos, 0),
    [encerramentos]
  );

  // Item 4 — retornos por produto/sistema (soma de ciclos de retorno por produto)
  const retornosPorProduto = useMemo(() => {
    if (!qaItems?.length) return [];
    const map = new Map<string, number>();
    for (const it of qaItems) {
      if ((it.qa_return_count || 0) <= 0) continue;
      const produtos = extractProducts(it.tags);
      const labels = produtos.length > 0 ? produtos.map(normalizeProduct) : ['Sem produto'];
      for (const p of labels) map.set(p, (map.get(p) || 0) + it.qa_return_count);
    }
    return Array.from(map.entries())
      .map(([produto, retornos]) => ({ produto, retornos }))
      .sort((a, b) => b.retornos - a.retornos);
  }, [qaItems]);

  // Item 5 — volumetria de trabalho por produto/sistema (contagem de itens)
  const volumetriaPorProduto = useMemo(() => {
    if (!qaItems?.length) return [];
    const map = new Map<string, number>();
    for (const it of qaItems) {
      const produtos = extractProducts(it.tags);
      const labels = produtos.length > 0 ? produtos.map(normalizeProduct) : ['Sem produto'];
      for (const p of labels) map.set(p, (map.get(p) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([produto, itens]) => ({ produto, itens }))
      .sort((a, b) => b.itens - a.itens);
  }, [qaItems]);

  // Histórico (snapshots) — qa_concluidos por sprint + procedência
  const historicalData = useMemo(() =>
    (qaHistorical || []).map(h => ({
      sprint: h.sprint_code?.split('-')[0] || h.sprint_code,
      sprint_code: h.sprint_code,
      concluidos: h.qa_concluidos,
      sem_retorno: h.qa_concluidos_sem_retorno,
      com_retorno: h.qa_concluidos_com_retorno,
      taxa: h.qa_return_rate_pct,
      source: h.snapshot_source,
      as_of: h.as_of_datetime,
    })),
    [qaHistorical]
  );
  const historicalReconCount = useMemo(
    () => (qaHistorical || []).filter(h => h.snapshot_source === 'fim_sprint_reconstruido').length,
    [qaHistorical]
  );

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
          <QaKpiCard label="Itens concluídos" value={agg.concluidos} icon={ShieldCheck} tone="primary" delay={0}
            tooltip="Itens encerrados pelo QA — Closed By autorizado (Thales, Marquin, Rodrigues, Thiago, Alessandro, Mauricio)" />
          <QaKpiCard label="Encerradas sem Retorno" value={agg.aprovadas} icon={CheckCircle2} tone="success" delay={60}
            tooltip="Itens encerrados pelo QA sem nenhum retorno" />
          <QaKpiCard label="Com retorno QA" value={agg.reprovadas} icon={XCircle} delay={120}
            tone={agg.reprovadas > 5 ? 'danger' : agg.reprovadas > 0 ? 'warning' : 'neutral'}
            tooltip="Itens encerrados pelo QA com pelo menos 1 retorno" />
          <QaKpiCard label="% sem retorno" value={agg.taxaAprovacao} suffix="%" decimals={1} icon={TrendingUp} delay={180}
            tone={agg.taxaAprovacao >= 80 ? 'success' : agg.taxaAprovacao >= 60 ? 'warning' : 'danger'}
            valueColor={thresholdColorHigh(agg.taxaAprovacao)} progress={agg.taxaAprovacao}
            tooltip="Percentual de itens concluídos sem retrabalho" />
          <QaKpiCard label="Crítico (3+)" value={agg.criticos} icon={AlertTriangle} delay={240}
            tone={agg.criticos > 0 ? 'danger' : 'neutral'}
            tooltip="Itens com 3 ou mais ciclos de retorno" />
          <QaKpiCard label="Tempo médio QA" value={agg.avgDays} suffix="d" decimals={1} icon={Clock} tone="info" delay={300}
            tooltip="Tempo médio (dias) na etapa de qualidade" />
        </div>
      ) : null}

      <Tabs defaultValue="evolucao" className="space-y-4">
        <TabsList>
          <TabsTrigger value="evolucao">Evolução Sprint</TabsTrigger>
          <TabsTrigger value="encerramentos">Encerramentos QA</TabsTrigger>
          <TabsTrigger value="historico">Histórico (snapshots)</TabsTrigger>
          <TabsTrigger value="produtos">Produtos/Sistemas</TabsTrigger>
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
                      <Bar dataKey="aprovadas" stackId="a" fill={QA_TONES.success.solid} name="Sem retorno" radius={[0,0,0,0]} />
                      <Bar dataKey="reprovadas" stackId="a" fill={QA_TONES.danger.solid} name="Com retorno" />
                      <Bar dataKey="retornadas" stackId="a" fill={QA_TONES.warning.solid} name="Ciclos" radius={[3,3,0,0]} />
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

        <TabsContent value="encerramentos" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" /> Histórico de Encerramentos QA por Usuário
                <Badge variant="outline" className="ml-2 text-xs">{totalEncerramentosCloser} encerramentos</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {encerramentosByCloser.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={encerramentosByCloser}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                    <XAxis dataKey="sprint" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <RTooltip />
                    <Legend />
                    {closers.map((c, i) => (
                      <Bar key={c} dataKey={c} stackId="enc" fill={SERIES_COLORS[i % SERIES_COLORS.length]} name={c} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-sm py-8 text-center">
                  Sem encerramentos atribuídos aos usuários do QA no recorte selecionado.
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <Info className="h-3.5 w-3.5" />
                Conta itens encerrados por Closed By autorizado, por sprint.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Concluídos por Sprint (Closed By) — {historicalYear}
                <Badge variant="outline" className="ml-2 text-xs">
                  {historicalReconCount}/{historicalData.length} reconstruídas
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historicalData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={historicalData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis dataKey="sprint" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <RTooltip content={<HistoricalTooltip />} />
                      <Bar dataKey="concluidos" name="Concluídos (Closed By)">
                        {historicalData.map((d, i) => (
                          <Cell key={i} fill={sourceMeta(d.source).color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SOURCE_META.fim_sprint_reconstruido.color }} />
                      {SOURCE_META.fim_sprint_reconstruido.label}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SOURCE_META.estado_atual.color }} />
                      {SOURCE_META.estado_atual.label}
                    </span>
                    <span className="flex items-center gap-1">
                      <Info className="h-3.5 w-3.5" />
                      "Reconstruído" = estado real no fim da sprint (via histórico de transições); "Estado atual" = estado das tasks na captura.
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-sm py-8 text-center">
                  Sem snapshots históricos para {historicalYear}.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="produtos" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Retornos por Produto/Sistema</CardTitle>
              </CardHeader>
              <CardContent>
                {retornosPorProduto.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={retornosPorProduto} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="produto" tick={{ fontSize: 10 }} width={110} />
                      <RTooltip />
                      <Bar dataKey="retornos" fill={QA_TONES.danger.solid} name="Retornos" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-muted-foreground text-sm py-8 text-center">Sem dados</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Volumetria de Trabalho por Produto/Sistema</CardTitle>
              </CardHeader>
              <CardContent>
                {volumetriaPorProduto.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={volumetriaPorProduto} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="produto" tick={{ fontSize: 10 }} width={110} />
                      <RTooltip />
                      <Bar dataKey="itens" fill={QA_TONES.primary.solid} name="Itens" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-muted-foreground text-sm py-8 text-center">Sem dados</p>}
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                  <Info className="h-3.5 w-3.5" />
                  Volumetria por produto (tag do item). Bandeira comercial por cliente ainda não vinculável aos work items.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="retrabalho" className="space-y-4">
          {agg && (
            <QaPillarCard
              title="Saúde do Retrabalho QA"
              subtitle="Itens com retorno sobre concluídos no recorte"
              caption="Taxa de retrabalho"
              value={agg.taxaRetrabalho} valueSuffix="%" decimals={1}
              valueColor={thresholdColorLow(agg.taxaRetrabalho)}
              progress={agg.taxaRetrabalho} progressColor={thresholdColorLow(agg.taxaRetrabalho)}
              stats={[
                { label: 'Crítico 3+', value: agg.criticos, color: agg.criticos > 0 ? QA_TONES.danger.solid : undefined },
                { label: 'Tempo médio QA', value: `${agg.avgDays}d` },
              ]}
              className="max-w-sm"
            />
          )}
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
                      <Bar dataKey="baixo" stackId="a" fill={QA_TONES.warning.solid} name="Baixo (1)" />
                      <Bar dataKey="alto" stackId="a" fill="#f97316" name="Alto (2)" />
                      <Bar dataKey="critico" stackId="a" fill={QA_TONES.danger.solid} name="Crítico (3+)" radius={[3,3,0,0]} />
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
                      <Line type="monotone" dataKey="taxa" stroke={QA_TONES.danger.solid} strokeWidth={2} name="% Retrabalho" dot={{ r: 3 }} />
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
