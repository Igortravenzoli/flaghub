import { useEffect, useMemo, useState } from 'react';
import {
  useGerencialQa, useQaDesempenho, useQaEncerramentosPorUsuario,
  useQaAtemporalSummary, useQaItemsAtemporal, useQaClosedPorSprintPeriodo, useQaHandoffHistogram,
  type GerencialQaRow,
} from '@/hooks/useGerencialQa';
import { extractProducts, normalizeProduct, extractClients } from '@/lib/products';
import { QaKpiCard } from '@/components/qualidade/QaKpiCard';
import { QaPillarCard } from '@/components/qualidade/QaPillarCard';
import { QA_HEALTH, QA_CHART_SERIES, QA_TONES, thresholdColorHigh, thresholdColorLow } from '@/lib/qaTheme';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { MultiSprintFilter } from '@/components/gerencial/MultiSprintFilter';
import { SortableTableHead, useTableSort } from '@/components/gerencial/SortableTableHead';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  LineChart, Line, Legend, Tooltip as RTooltip, Cell,
  PieChart, Pie, ReferenceLine,
} from 'recharts';
import {
  CheckCircle2, XCircle, ShieldCheck,
  Users, TrendingUp, Info, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { getCurrentOfficialSprintCode, getOfficialSprintRange } from '@/lib/sprintCalendar';

const HEALTH_COLORS = QA_HEALTH;

const SERIES_COLORS = QA_CHART_SERIES;

type QaDrillFilter = 'concluidos' | 'sem_retorno' | 'com_retorno' | null;

/** Divisor de seção da visão executiva (Visão Sprint / Desempenho) */
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 pt-4">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">{title}</h3>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      <div className="h-px flex-1 bg-border" />
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
  const { data: encerramentos } = useQaEncerramentosPorUsuario(dateStartIso, dateEndIso);
  const historicalYear = new Date().getFullYear();
  const { data: atemporal, isLoading: atemporalLoading } = useQaAtemporalSummary(dateStartIso, dateEndIso);
  const { data: qaItems } = useQaItemsAtemporal(dateStartIso, dateEndIso);
  const { data: closedPorPeriodo } = useQaClosedPorSprintPeriodo(historicalYear);
  const { data: handoff } = useQaHandoffHistogram(dateStartIso, dateEndIso);
  const [kpiDrill, setKpiDrill] = useState<QaDrillFilter>(null);

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

  // Retornos por produto/sistema (itens com tag RETORNO QA, por produto)
  const retornosPorProduto = useMemo(() => {
    if (!qaItems?.length) return [];
    const map = new Map<string, number>();
    for (const it of qaItems) {
      if (!it.tem_retorno) continue;
      const produtos = extractProducts(it.tags);
      const labels = produtos.length > 0 ? produtos.map(normalizeProduct) : ['Sem produto'];
      for (const p of labels) map.set(p, (map.get(p) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([produto, retornos]) => ({ produto, retornos }))
      .sort((a, b) => b.retornos - a.retornos);
  }, [qaItems]);

  // Volumetria de trabalho por produto/sistema (contagem de itens concluídos QA)
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

  // Tasks por cliente (tags que não são produto nem marcador de processo)
  const tasksPorCliente = useMemo(() => {
    if (!qaItems?.length) return [];
    const map = new Map<string, number>();
    let semCliente = 0;
    for (const it of qaItems) {
      const clientes = extractClients(it.tags);
      if (clientes.length === 0) { semCliente++; continue; }
      for (const c of clientes) map.set(c, (map.get(c) || 0) + 1);
    }
    const rows = Array.from(map.entries())
      .map(([cliente, itens]) => ({ cliente, itens }))
      .sort((a, b) => b.itens - a.itens)
      .slice(0, 15);
    if (semCliente > 0) rows.push({ cliente: 'Sem cliente', itens: semCliente });
    return rows;
  }, [qaItems]);

  // Histórico atemporal — encerradas DENTRO do período de cada sprint, empilhado por sprint de ORIGEM
  const origens = useMemo(() => {
    const set = new Set((closedPorPeriodo || []).map(r => r.sprint_origem));
    return Array.from(set).sort((a, b) => {
      if (a === 'Sem sprint') return 1;
      if (b === 'Sem sprint') return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }, [closedPorPeriodo]);

  const periodoData = useMemo(() => {
    if (!closedPorPeriodo?.length) return [];
    const bySprint = new Map<string, Record<string, number | string>>();
    for (const r of closedPorPeriodo) {
      const row = bySprint.get(r.sprint_periodo) || { sprint: r.sprint_periodo, total: 0 };
      row[r.sprint_origem] = (Number(row[r.sprint_origem]) || 0) + r.qtd;
      row.total = (Number(row.total) || 0) + r.qtd;
      bySprint.set(r.sprint_periodo, row);
    }
    return Array.from(bySprint.values()).sort((a, b) =>
      String(a.sprint).localeCompare(String(b.sprint), undefined, { numeric: true })
    );
  }, [closedPorPeriodo]);

  const totalPeriodo = useMemo(
    () => (closedPorPeriodo || []).reduce((s, r) => s + r.qtd, 0),
    [closedPorPeriodo]
  );

  // Histograma de handoff Dev→QA + marcadores de fim de sprint
  const handoffData = useMemo(() =>
    (handoff || []).map(h => ({
      dia: h.dia,
      label: new Date(h.dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      entradas: h.entradas,
    })),
    [handoff]
  );

  const sprintEndMarkers = useMemo(() => {
    if (!handoffData.length) return [];
    const first = handoffData[0].dia;
    const last = handoffData[handoffData.length - 1].dia;
    const marks: { dia: string; sprint: string }[] = [];
    for (let n = 1; n <= 27; n++) {
      const code = `S${n}-${historicalYear}`;
      const range = getOfficialSprintRange(code);
      if (!range) continue;
      const end = range.to.toISOString().slice(0, 10);
      if (end >= first && end <= last) marks.push({ dia: end, sprint: code });
    }
    return marks;
  }, [handoffData, historicalYear]);

  const totalHandoff = useMemo(
    () => (handoff || []).reduce((s, h) => s + h.entradas, 0),
    [handoff]
  );

  // Drill-down dos KPIs clicáveis
  const drillItems = useMemo(() => {
    if (!kpiDrill || !qaItems?.length) return [];
    if (kpiDrill === 'com_retorno') return qaItems.filter(i => i.tem_retorno);
    if (kpiDrill === 'sem_retorno') return qaItems.filter(i => !i.tem_retorno);
    return qaItems;
  }, [kpiDrill, qaItems]);

  const drillLabel: Record<Exclude<QaDrillFilter, null>, string> = {
    concluidos: 'Itens concluídos pelo QA',
    sem_retorno: 'Encerradas sem retorno',
    com_retorno: 'Com retorno QA (tag)',
  };

  const isLoading = qaLoading || atemporalLoading;

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
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : atemporal ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <QaKpiCard label="Itens concluídos" value={atemporal.concluidos} icon={ShieldCheck} tone="primary" delay={0}
            onClick={() => setKpiDrill(kpiDrill === 'concluidos' ? null : 'concluidos')} active={kpiDrill === 'concluidos'}
            sublabel={`${atemporal.qtd_tasks} tasks · ${atemporal.qtd_pbis} PBIs · ${atemporal.qtd_bugs} bugs`}
            tooltip="Qualquer tipo de item em Done com Closed By do QA (mesma régua da query oficial do DevOps). Clique para listar." />
          <QaKpiCard label="Encerradas sem Retorno" value={atemporal.sem_retorno} icon={CheckCircle2} tone="success" delay={60}
            onClick={() => setKpiDrill(kpiDrill === 'sem_retorno' ? null : 'sem_retorno')} active={kpiDrill === 'sem_retorno'}
            tooltip="Concluídos QA sem a tag RETORNO QA. Clique para listar." />
          <QaKpiCard label="Com retorno QA" value={atemporal.com_retorno} icon={XCircle} delay={120}
            tone={atemporal.com_retorno > 0 ? 'warning' : 'neutral'}
            onClick={() => setKpiDrill(kpiDrill === 'com_retorno' ? null : 'com_retorno')} active={kpiDrill === 'com_retorno'}
            tooltip="Concluídos QA com a tag RETORNO QA (marcador oficial de retorno). Clique para listar." />
          <QaKpiCard label="% sem retorno" value={atemporal.pct_sem_retorno} suffix="%" decimals={1} icon={TrendingUp} delay={180}
            tone={atemporal.pct_sem_retorno >= 80 ? 'success' : atemporal.pct_sem_retorno >= 60 ? 'warning' : 'danger'}
            valueColor={thresholdColorHigh(atemporal.pct_sem_retorno)} progress={atemporal.pct_sem_retorno}
            tooltip="Percentual de concluídos QA sem a tag RETORNO QA" />
          <QaKpiCard label="Crítico (3+)" value={agg?.criticos ?? 0} icon={AlertTriangle} delay={240}
            tone={(agg?.criticos ?? 0) > 0 ? 'danger' : 'neutral'}
            tooltip="Itens com 3 ou mais ciclos de retorno no histórico de estados" />
        </div>
      ) : null}

      {kpiDrill && (
        <Card className="animate-fade-in">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {drillLabel[kpiDrill]}
              <Badge variant="outline" className="text-xs">{drillItems.length} itens</Badge>
            </CardTitle>
            <button onClick={() => setKpiDrill(null)} className="text-xs text-muted-foreground hover:text-foreground">Fechar ✕</button>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[420px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">ID</TableHead>
                    <TableHead className="w-24">Tipo</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Encerrado por</TableHead>
                    <TableHead className="w-28">Data</TableHead>
                    <TableHead className="w-28">Sprint origem</TableHead>
                    <TableHead className="w-24 text-center">Retorno</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillItems.map((it) => (
                    <TableRow key={it.work_item_id}>
                      <TableCell className="font-mono text-xs">
                        {it.web_url ? (
                          <a href={it.web_url} target="_blank" rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-0.5">
                            {it.work_item_id}<ExternalLink className="h-3 w-3" />
                          </a>
                        ) : it.work_item_id}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{it.work_item_type || '—'}</Badge></TableCell>
                      <TableCell className="max-w-[360px] truncate text-sm">{it.title}</TableCell>
                      <TableCell className="text-sm">{it.closed_by || '—'}</TableCell>
                      <TableCell className="text-xs">{it.closed_date ? new Date(it.closed_date).toLocaleDateString('pt-BR') : '—'}</TableCell>
                      <TableCell className="text-xs">{it.sprint_origem}</TableCell>
                      <TableCell className="text-center">
                        {it.tem_retorno
                          ? <Badge variant="destructive" className="text-[10px]">RETORNO QA</Badge>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <SectionHeader title="Visão Sprint" subtitle="evolução, encerramentos e distribuição" />

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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" /> Histórico de Encerramentos QA por Usuário
                <Badge variant="outline" className="ml-2 text-xs">{totalEncerramentosCloser} encerramentos</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {encerramentosByCloser.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
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
                Conta itens (qualquer tipo) encerrados por Closed By autorizado, agrupados pelo período
                de sprint da data de fechamento.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Encerradas no Período de Cada Sprint — {historicalYear}
                <Badge variant="outline" className="ml-2 text-xs">{totalPeriodo} encerramentos</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {periodoData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={periodoData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis dataKey="sprint" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <RTooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {origens.map((o, i) => (
                        <Bar key={o} dataKey={o} stackId="origem" name={o}
                          fill={o === 'Sem sprint' ? '#94a3b8' : SERIES_COLORS[i % SERIES_COLORS.length]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                    <Info className="h-3.5 w-3.5" />
                    QA é atemporal: cada barra conta o que foi ENCERRADO dentro do período oficial da sprint
                    (data de fechamento), empilhado pela sprint de ORIGEM da task. Ex.: tasks alocadas na S6
                    e encerradas na S9 contam na barra da S9, na cor da S6.
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-sm py-8 text-center">
                  Sem encerramentos registrados em {historicalYear}.
                </p>
              )}
            </CardContent>
          </Card>
      </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Distribuição de Tasks ao QA (entradas em "Em Teste")
                <Badge variant="outline" className="ml-2 text-xs">{totalHandoff} entradas</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {handoffData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={handoffData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={24} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <RTooltip />
                      {sprintEndMarkers.map(m => {
                        const point = handoffData.find(h => h.dia === m.dia);
                        return point ? (
                          <ReferenceLine key={m.sprint} x={point.label} stroke={QA_TONES.danger.solid}
                            strokeDasharray="4 3" label={{ value: `fim ${m.sprint.split('-')[0]}`, fontSize: 9, fill: QA_TONES.danger.solid, position: 'top' }} />
                        ) : null;
                      })}
                      <Bar dataKey="entradas" fill={QA_TONES.info.solid} name="Itens entregues ao QA" radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                    <Info className="h-3.5 w-3.5" />
                    Volume diário de itens transicionados para "Em Teste" (handoff do desenvolvimento ao QA).
                    Linhas tracejadas marcam o fim de cada sprint — picos próximos delas indicam concentração
                    de entregas no fim da sprint. Cobertura cresce conforme o histórico das Tasks é sincronizado.
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-sm py-8 text-center">
                  Sem entradas em "Em Teste" registradas no recorte.
                </p>
              )}
            </CardContent>
          </Card>

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
                  Volumetria por produto (tag do item), sobre os concluídos pelo QA.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Tasks Trabalhadas por Cliente</CardTitle>
            </CardHeader>
            <CardContent>
              {tasksPorCliente.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={Math.max(220, tasksPorCliente.length * 26)}>
                    <BarChart data={tasksPorCliente} layout="vertical" margin={{ left: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="cliente" tick={{ fontSize: 10 }} width={130} />
                      <RTooltip />
                      <Bar dataKey="itens" name="Tasks" radius={[0,4,4,0]}>
                        {tasksPorCliente.map((c, i) => (
                          <Cell key={i} fill={c.cliente === 'Sem cliente' ? '#94a3b8' : QA_TONES.violet.solid} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                    <Info className="h-3.5 w-3.5" />
                    Cliente identificado pela tag do work item (ex.: HEINEKEN, RIONORTE, BROKERxxx).
                    Itens sem tag de cliente entram em "Sem cliente".
                  </p>
                </>
              ) : <p className="text-muted-foreground text-sm py-8 text-center">Sem dados</p>}
            </CardContent>
          </Card>

      <SectionHeader title="Desempenho" subtitle="retrabalho e desempenho por responsável" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                { label: 'Com retorno (tag)', value: atemporal?.com_retorno ?? 0, color: (atemporal?.com_retorno ?? 0) > 0 ? QA_TONES.warning.solid : undefined },
              ]}
            />
          )}
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
    </div>
  );
}
