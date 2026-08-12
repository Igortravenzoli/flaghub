import { Fragment, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, Legend, ReferenceLine,
} from 'recharts';
import { AlertTriangle, Download, ExternalLink, Info, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { horasHM } from '@/lib/formatHoras';
import { fabricaColor } from '@/lib/chartColors';
import { fmtDia, isoLocal, segundaDaSemana } from '@/lib/timelogTrilha';
import { sprintEndsBetween } from '@/lib/sprintCalendar';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import {
  useColaboradorAtividade, ROTULO_MOTIVO, type MotivoAtipico,
} from '@/hooks/useColaboradorAtividade';

const DEVOPS_ITEM_URL = 'https://dev.azure.com/FlagIW/Flag.Planejamento/_workitems/edit/';
const DIAS_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/** Motivos que indicam erro de digitação, não ritmo de trabalho. */
const MOTIVO_GRAVE = new Set<MotivoAtipico>(['dia_acima_12h', 'lancamento_longo']);

const DIA_ALERTA_MIN = 8 * 60;
const DIA_ERRO_MIN = 12 * 60;
const COR_NORMAL = 'hsl(210,90%,60%)';
const COR_ALERTA = 'hsl(35,85%,52%)';
const COR_ERRO = 'hsl(0,70%,55%)';

function corDaCarga(minutos: number): string {
  if (minutos > DIA_ERRO_MIN) return COR_ERRO;
  if (minutos > DIA_ALERTA_MIN) return COR_ALERTA;
  return COR_NORMAL;
}

/**
 * Barra de um dia: a cor sai da carga do dia e, quando algum lançamento foi
 * feito depois do dia trabalhado, um triângulo aparece no topo.
 *
 * Uma barra só, de propósito: duas séries (trabalhado × registrado) davam a
 * entender que o portal MEDE jornada. Ele não mede — registra o que foi
 * digitado. O atraso é anotação sobre a mesma barra, não uma segunda medição.
 */
function BarraDia(props: any) {
  const { x, y, width, height, payload, diaSel } = props;
  if (!height || height <= 0) return null;
  const atrasado = (payload?.lancamentosAtrasados ?? 0) > 0;
  const selecionado = !!diaSel && payload?.dia === diaSel;
  const apagado = !!diaSel && !selecionado;
  const r = Math.min(3, width / 2);
  return (
    <g opacity={apagado ? 0.3 : 1} style={{ cursor: 'pointer' }}>
      <rect
        x={x} y={y} width={width} height={height} rx={r} ry={r}
        fill={corDaCarga(payload?.minutos ?? 0)}
        stroke={selecionado ? 'hsl(var(--foreground))' : undefined}
        strokeWidth={selecionado ? 1.5 : 0}
      />
      {atrasado && (
        <g transform={`translate(${x + width / 2}, ${Math.max(y - 9, 1)})`}>
          <path d="M 0 -4 L 4.5 4 L -4.5 4 Z" fill="hsl(35,92%,48%)" stroke="hsl(var(--card))" strokeWidth={0.8} />
          <rect x={-0.55} y={-1.6} width={1.1} height={3} fill="hsl(var(--card))" />
          <rect x={-0.55} y={2.1} width={1.1} height={1.1} fill="hsl(var(--card))" />
        </g>
      )}
    </g>
  );
}

type Props = {
  aberto: boolean;
  onFechar: () => void;
  /** Um ou mais colaboradores. Com mais de um, o gráfico diário intercala as barras. */
  colaboradores: string[];
  dateFrom?: Date | null;
  dateTo?: Date | null;
  periodoLabel?: string;
  pbiByTaskId?: Record<number, number>;
};

function urlItem(id: number, url: string | null): string {
  return url || `${DEVOPS_ITEM_URL}${id}`;
}

function fmtRegistro(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Popup analítico do colaborador: quanto lançou, em que dias, e — o que o gestor
 * não conseguia ver — QUANDO registrou cada lançamento.
 *
 * Uma barra por dia (a hora informada), com a cor saindo da carga e um triângulo
 * quando algum lançamento foi feito depois do dia trabalhado. A versão anterior
 * tinha duas séries lado a lado e dava a entender que o portal MEDE jornada —
 * ele não mede, registra o que foi digitado no TimeLog (ajuste de 11/08/2026).
 */
export function ColaboradorAnaliseDialog({
  aberto, onFechar, colaboradores, dateFrom, dateTo, periodoLabel, pbiByTaskId,
}: Props) {
  const { exportCSV, exportPDF } = useDashboardExport();
  const [visao, setVisao] = useState<'dia' | 'semana'>('dia');
  /** Dia clicado no gráfico. Recorta a tabela e o export para os lançamentos dele. */
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);

  const atv = useColaboradorAtividade(
    aberto ? colaboradores : [],
    dateFrom, dateTo, pbiByTaskId,
  );

  const varios = colaboradores.length > 1;
  const titulo = varios ? `${colaboradores.length} colaboradores` : (colaboradores[0] ?? '—');

  // ── Série do gráfico ────────────────────────────────────────────────────────
  const serieDia = useMemo(() => atv.porDia.map((d) => ({
    rotulo: fmtDia(d.dia),
    dia: d.dia,
    ...d.porColaborador,
    total: d.total / 60,
    minutos: d.total,
    atrasoMaxDias: d.atrasoMaxDias,
    lancamentosAtrasados: d.lancamentosAtrasados,
    temSemTrilha: d.temSemTrilha,
  })), [atv.porDia]);

  const serieSemana = useMemo(() => atv.porSemana.map((s) => ({
    rotulo: `sem ${fmtDia(s.semana)}`,
    total: s.minutos / 60,
    minutos: s.minutos,
    atrasoMaxDias: 0,
    lancamentosAtrasados: 0,
    temSemTrilha: false,
  })), [atv.porSemana]);

  const serie = visao === 'dia' ? serieDia : serieSemana;

  /**
   * A tabela tem dois recortes: sem dia clicado mostra os atípicos do período;
   * com dia clicado mostra TODOS os lançamentos daquele dia — inclusive os
   * normais, que são justamente o que compõe a barra.
   */
  const linhasTabela = useMemo(() => {
    const motivosPorId = new Map(atv.atipicos.map((a) => [a.id, a]));
    if (!diaSelecionado) return atv.atipicos;
    return atv.lancamentos
      .filter((l) => l.dia === diaSelecionado)
      .map((l) => {
        const at = motivosPorId.get(l.id);
        return { ...l, motivos: at?.motivos ?? [], minutosNoDia: at?.minutosNoDia ?? l.minutos };
      })
      .sort((a, b) => (a.inicio || '').localeCompare(b.inicio || '') || b.minutos - a.minutos);
  }, [diaSelecionado, atv.atipicos, atv.lancamentos]);

  /**
   * Viradas de sprint dentro do período. A do último dia não vira linha: cairia
   * colada na borda do gráfico sem informar nada (é o caso do filtro numa sprint
   * só, que é o padrão da tela).
   */
  const viradas = useMemo(() => {
    if (visao !== 'dia' || !dateFrom || !dateTo) return [];
    const ultimoDia = atv.porDia[atv.porDia.length - 1]?.dia;
    return sprintEndsBetween(dateFrom, dateTo)
      .map((s) => ({ ...s, iso: isoLocal(s.end) }))
      .filter((s) => s.iso !== ultimoDia && atv.porDia.some((d) => d.dia === s.iso));
  }, [visao, dateFrom, dateTo, atv.porDia]);

  const minutosDoDia = useMemo(
    () => (diaSelecionado ? atv.porDia.find((d) => d.dia === diaSelecionado)?.total ?? 0 : 0),
    [diaSelecionado, atv.porDia],
  );

  // ── Calendário de intensidade (só faz sentido para uma pessoa por vez) ──────
  const semanas = useMemo(() => {
    const porSemana = new Map<string, (typeof atv.porDia[number] | null)[]>();
    for (const d of atv.porDia) {
      const k = segundaDaSemana(d.dia);
      const linha = porSemana.get(k) ?? Array(7).fill(null);
      const [y, m, dd] = d.dia.split('-').map(Number);
      linha[(new Date(y, m - 1, dd).getDay() + 6) % 7] = d;
      porSemana.set(k, linha);
    }
    return [...porSemana.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [atv.porDia]);

  const maxDia = useMemo(
    () => Math.max(1, ...atv.porDia.map((d) => d.total)),
    [atv.porDia],
  );

  /** Mesma régua de cor do gráfico, com intensidade dentro da faixa normal. */
  const corDia = (min: number): string => {
    if (min === 0) return 'hsl(var(--muted))';
    if (min > DIA_ERRO_MIN) return COR_ERRO;
    if (min > DIA_ALERTA_MIN) return COR_ALERTA;
    const p = Math.min(min / Math.max(maxDia, DIA_ALERTA_MIN), 1);
    return `hsl(210,90%,${Math.round(76 - p * 22)}%)`;
  };

  // ── Export detalhado: um lançamento por linha, com link ─────────────────────
  const exportDetalhado = useMemo(() => ({
    title: (varios ? 'TimeLog detalhado' : `TimeLog detalhado - ${titulo}`)
      + (diaSelecionado ? ` - ${diaSelecionado.split('-').reverse().join('-')}` : ''),
    area: 'Fábrica',
    periodLabel: periodoLabel ?? '',
    columns: [
      'colaborador', 'pbi', 'pbi_titulo', 'pbi_link',
      'task', 'task_titulo', 'task_link',
      'descricao', 'dia_trabalhado', 'inicio', 'horas_lancadas',
      'registrado_em', 'atraso_dias', 'versao', 'atipico',
    ],
    rows: (diaSelecionado ? atv.lancamentos.filter((l) => l.dia === diaSelecionado) : atv.lancamentos).map((l) => {
      const at = atv.atipicos.find((a) => a.id === l.id);
      return {
        colaborador: l.colaborador,
        pbi: l.pbiId ?? '',
        pbi_titulo: l.pbiTitulo ?? '',
        pbi_link: l.pbiId ? urlItem(l.pbiId, l.pbiUrl) : '',
        task: l.taskId,
        task_titulo: l.taskTitulo,
        task_link: urlItem(l.taskId, l.taskUrl),
        descricao: l.notas ?? '',
        dia_trabalhado: l.dia.split('-').reverse().join('/'),
        inicio: l.inicio ?? '',
        horas_lancadas: horasHM(l.minutos),
        registrado_em: fmtRegistro(l.registradoEm),
        atraso_dias: l.atrasoDias ?? 'sem trilha',
        versao: l.versao > 1 ? `v${l.versao} (editado)` : 'v1',
        atipico: at ? at.motivos.map((m) => ROTULO_MOTIVO[m]).join(' | ') : '',
      };
    }),
    kpis: [
      { label: 'Colaborador(es)', value: colaboradores.join(', ') || '—' },
      { label: 'Recorte', value: diaSelecionado ? `dia ${diaSelecionado.split('-').reverse().join('/')}` : 'período inteiro' },
      { label: 'Lançamentos', value: diaSelecionado ? linhasTabela.length : atv.lancamentos.length },
      { label: 'Horas no período', value: horasHM(atv.totalMinutos) },
      { label: 'Lançamentos atípicos', value: atv.atipicos.length },
    ],
    /*
      No PDF as URLs cruas ficam fora: dois links de ~70 caracteres espremiam as
      outras 13 colunas a ponto de o cabeçalho sair na vertical. Os números do
      PBI e da Task continuam clicáveis via `pdfLinks`.
    */
    pdfColumns: [
      ...(varios ? ['colaborador'] : []),
      'pbi', 'task', 'task_titulo', 'descricao',
      'dia_trabalhado', 'horas_lancadas', 'registrado_em', 'atraso_dias', 'atipico',
    ],
    columnLabels: {
      colaborador: 'Colaborador',
      pbi: 'PBI',
      task: 'Task',
      task_titulo: 'Task — título',
      descricao: 'Descrição',
      dia_trabalhado: 'Dia',
      horas_lancadas: 'Horas',
      registrado_em: 'Registrado em',
      atraso_dias: 'Atraso',
      atipico: 'Atípico',
    },
    pdfLinks: { pbi: 'pbi_link', task: 'task_link' },
    pdfColumnWidths: {
      colaborador: 2.2, pbi: 0.9, task: 0.9, task_titulo: 4.2, descricao: 4.2,
      dia_trabalhado: 1.2, horas_lancadas: 0.9, registrado_em: 1.6,
      atraso_dias: 0.9, atipico: 2.6,
    },
  }), [atv.lancamentos, atv.atipicos, atv.totalMinutos, colaboradores, periodoLabel, titulo, varios, diaSelecionado, linhasTabela.length]);

  const diasComApontamento = atv.porDia.filter((d) => d.total > 0).length;

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) { setDiaSelecionado(null); onFechar(); } }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {titulo}
            <Badge variant="outline" className="text-[10px] font-normal">{periodoLabel}</Badge>
            {atv.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto h-7 gap-1.5 text-xs" disabled={atv.lancamentos.length === 0}>
                  <Download className="h-3.5 w-3.5" />Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-xs" onClick={() => exportCSV(exportDetalhado)}>
                  CSV — {exportDetalhado.rows.length} lançamentos
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs" onClick={() => exportPDF(exportDetalhado)}>
                  PDF — {exportDetalhado.rows.length} lançamentos
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </DialogTitle>
        </DialogHeader>

        {atv.lancamentos.length === 0 && !atv.isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            Nenhum lançamento no período para {varios ? 'os colaboradores selecionados' : titulo}.
          </p>
        ) : (
          <div className="space-y-5">
            {/* Resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { l: 'Horas no período', v: horasHM(atv.totalMinutos) },
                { l: 'Lançamentos', v: String(atv.lancamentos.length) },
                { l: 'Dias com apontamento', v: `${diasComApontamento} de ${atv.porDia.length}` },
                { l: 'Atípicos', v: String(atv.atipicos.length) },
              ].map((k) => (
                <div key={k.l} className="rounded-md border p-3">
                  <div className="text-lg font-bold font-mono tabular-nums">{k.v}</div>
                  <div className="text-[11px] text-muted-foreground">{k.l}</div>
                </div>
              ))}
            </div>

            {/* Gráfico de interação */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold">Horas lançadas por dia</h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="Como ler este gráfico"
                      className="text-muted-foreground/70 hover:text-foreground">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-sm text-xs">
                    A barra é a hora que a pessoa <b>informou</b> ter trabalhado naquele dia — o TimeLog
                    não mede jornada, ele registra o que foi digitado. O portal também guarda
                    <b> quando</b> o lançamento apareceu no DevOps: quando as duas datas não batem, o dia
                    ganha o triângulo de alerta.
                  </TooltipContent>
                </Tooltip>
                <div className="ml-auto inline-flex rounded-md border overflow-hidden">
                  {(['dia', 'semana'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => { setVisao(v); setDiaSelecionado(null); }}
                      className={`px-2 py-0.5 text-[10px] font-medium ${visao === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {v === 'dia' ? 'Dia a dia' : 'Por semana'}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={serie} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="rotulo" fontSize={9} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" />
                  <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" tickFormatter={(v: number) => `${Math.round(v)}h`} />
                  <RechartsTooltip
                    cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof serie)[number];
                      if (!d.minutos) return null;
                      return (
                        <div className="rounded-lg border bg-card px-2.5 py-1.5 text-[11px] shadow-sm">
                          <div className="font-medium">{d.rotulo}</div>
                          <div className="font-mono">{horasHM(d.minutos)} lançadas</div>
                          {d.lancamentosAtrasados > 0 && (
                            <div className="text-amber-600 dark:text-amber-400">
                              {d.lancamentosAtrasados} lançamento{d.lancamentosAtrasados === 1 ? '' : 's'} feito
                              {d.lancamentosAtrasados === 1 ? '' : 's'} até {d.atrasoMaxDias} dia
                              {d.atrasoMaxDias === 1 ? '' : 's'} depois
                            </div>
                          )}
                          {d.minutos > DIA_ERRO_MIN && <div className="text-red-600 dark:text-red-400">acima de 12h no dia</div>}
                          {d.minutos > DIA_ALERTA_MIN && d.minutos <= DIA_ERRO_MIN && (
                            <div className="text-amber-600 dark:text-amber-400">acima de 8h no dia</div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {viradas.map((v) => (
                    <ReferenceLine
                      key={v.code}
                      x={fmtDia(v.iso)}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="4 3"
                      strokeWidth={1}
                      label={{
                        value: `fim ${v.code.split('-')[0]}`,
                        position: 'top',
                        fontSize: 9,
                        fill: 'hsl(var(--muted-foreground))',
                      }}
                    />
                  ))}
                  {varios
                    ? colaboradores.map((nome, i) => (
                        <Bar key={nome} dataKey={nome} name={nome} stackId="pessoas" fill={fabricaColor(nome, i)} />
                      ))
                    : (
                        <Bar
                          dataKey="total"
                          name="Horas lançadas"
                          isAnimationActive={false}
                          shape={(p: any) => <BarraDia {...p} diaSel={visao === 'dia' ? diaSelecionado : null} />}
                          onClick={(p: any) => {
                            const dia = p?.payload?.dia;
                            if (visao !== 'dia' || !dia || !p?.payload?.minutos) return;
                            setDiaSelecionado((atual) => (atual === dia ? null : dia));
                          }}
                        />
                      )}
                  {varios && <Legend wrapperStyle={{ fontSize: 10 }} />}
                </BarChart>
              </ResponsiveContainer>
              {!varios && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: COR_NORMAL }} />até 8h
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: COR_ALERTA }} />acima de 8h
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: COR_ERRO }} />acima de 12h
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />lançado depois do dia trabalhado
                  </span>
                  {viradas.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block w-3 border-t border-dashed border-muted-foreground" />fim de sprint
                    </span>
                  )}
                  {visao === 'dia' && (
                    <span className="text-muted-foreground/70">· clique numa barra para ver os lançamentos do dia</span>
                  )}
                </div>
              )}
            </div>

            {/* Calendário de intensidade — uma pessoa por vez */}
            {!varios && semanas.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Calendário de atividade</h3>
                <div className="inline-block">
                  <div className="grid grid-cols-[auto_repeat(7,26px)] gap-1 text-[9px] text-muted-foreground">
                    <span />
                    {DIAS_SEMANA.map((d) => <span key={d} className="text-center">{d}</span>)}
                    {semanas.map(([seg, dias]) => (
                      <Fragment key={seg}>
                        <span className="pr-1 self-center tabular-nums">{fmtDia(seg)}</span>
                        {dias.map((d, i) => (
                          <Tooltip key={`${seg}-${i}`}>
                            <TooltipTrigger asChild>
                              <div
                                role={d && d.total > 0 ? 'button' : undefined}
                                tabIndex={d && d.total > 0 ? 0 : undefined}
                                onClick={() => {
                                  if (!d || d.total === 0) return;
                                  setVisao('dia');
                                  setDiaSelecionado((atual) => (atual === d.dia ? null : d.dia));
                                }}
                                className={`h-[26px] rounded-sm border transition-all ${
                                  d && d.total > 0 ? 'cursor-pointer hover:brightness-110' : ''
                                } ${d && d.dia === diaSelecionado ? 'border-foreground border-2' : 'border-border/40'}`}
                                style={{ background: d ? corDia(d.total) : 'transparent' }}
                              />
                            </TooltipTrigger>
                            {d && (
                              <TooltipContent side="top" className="text-xs">
                                {d.dia.split('-').reverse().join('/')} — trabalhou <b>{horasHM(d.total)}</b>
                                {d.totalRegistrado > 0 && <> · registrou {horasHM(d.totalRegistrado)} no TimeLog neste dia</>}
                              </TooltipContent>
                            )}
                          </Tooltip>
                        ))}
                      </Fragment>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Tom mais forte = mais horas no dia · âmbar = acima de 8h · vermelho = acima de 12h.
                </p>
              </div>
            )}

            {/* Lançamentos atípicos */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 flex-wrap">
                {diaSelecionado ? (
                  <>
                    Lançamentos de {diaSelecionado.split('-').reverse().join('/')}
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {linhasTabela.length} lançamento{linhasTabela.length === 1 ? '' : 's'} · {horasHM(minutosDoDia)}
                    </span>
                    <Button
                      type="button" variant="ghost" size="sm"
                      className="h-6 px-1.5 text-[10px] text-muted-foreground"
                      onClick={() => setDiaSelecionado(null)}
                    >
                      limpar ✕
                    </Button>
                  </>
                ) : (
                  <>
                    Lançamentos atípicos
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {atv.atipicos.length} de {atv.lancamentos.length}
                    </span>
                  </>
                )}
              </h3>
              {linhasTabela.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3">
                  {diaSelecionado ? 'Sem lançamentos neste dia.' : 'Nada atípico no período.'}
                </p>
              ) : (
                <div className="border rounded-md overflow-x-auto max-h-[320px] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        {!varios ? null : <th className="text-left px-2 py-1.5 font-medium">Quem</th>}
                        <th className="text-left px-2 py-1.5 font-medium">PBI</th>
                        <th className="text-left px-2 py-1.5 font-medium">Task</th>
                        <th className="text-left px-2 py-1.5 font-medium">Descrição</th>
                        <th className="text-left px-2 py-1.5 font-medium">Dia</th>
                        <th className="text-right px-2 py-1.5 font-medium">Horas</th>
                        <th className="text-left px-2 py-1.5 font-medium">Registrado em</th>
                        <th className="text-left px-2 py-1.5 font-medium">Por quê</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {linhasTabela.map((l) => (
                        <tr key={l.id} className="hover:bg-muted/30">
                          {varios && <td className="px-2 py-1 truncate max-w-[110px]">{l.colaborador}</td>}
                          <td className="px-2 py-1 font-mono whitespace-nowrap">
                            {l.pbiId ? (
                              <a href={urlItem(l.pbiId, l.pbiUrl)} target="_blank" rel="noopener noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-0.5">
                                #{l.pbiId}<ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-2 py-1 font-mono whitespace-nowrap">
                            <a href={urlItem(l.taskId, l.taskUrl)} target="_blank" rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-0.5">
                              #{l.taskId}<ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </td>
                          <td className="px-2 py-1 max-w-[220px]">
                            <span className="block truncate" title={l.taskTitulo}>{l.taskTitulo}</span>
                            {l.notas && (
                              <span className="block truncate text-muted-foreground" title={l.notas}>{l.notas}</span>
                            )}
                          </td>
                          <td className="px-2 py-1 whitespace-nowrap tabular-nums">{l.dia.split('-').reverse().join('/')}</td>
                          <td className="px-2 py-1 text-right font-mono tabular-nums whitespace-nowrap">
                            {horasHM(l.minutos)}
                            {l.minutosNoDia !== l.minutos && (
                              <span className="text-muted-foreground"> / {horasHM(l.minutosNoDia)} no dia</span>
                            )}
                          </td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            {l.atrasoDias == null
                              ? <span className="text-muted-foreground/70">sem trilha</span>
                              : <>{fmtRegistro(l.registradoEm)}{l.atrasoDias >= 1 && <span className="text-amber-600 dark:text-amber-400"> +{l.atrasoDias}d</span>}</>}
                          </td>
                          <td className="px-2 py-1">
                            <span className="flex flex-wrap gap-1">
                              {l.motivos.length === 0 && <span className="text-muted-foreground/60">—</span>}
                              {l.motivos.map((m) => (
                                <Badge key={m} variant="outline"
                                  className={`text-[9px] ${MOTIVO_GRAVE.has(m)
                                    ? 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300'
                                    : 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300'}`}>
                                  {ROTULO_MOTIVO[m]}
                                </Badge>
                              ))}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
