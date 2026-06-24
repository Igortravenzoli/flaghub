import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RTooltip, Cell, ReferenceLine,
} from 'recharts';
import {
  ListChecks, Target, RotateCcw, GitCompareArrows, Users, CalendarClock, AlertTriangle,
} from 'lucide-react';
import { QA_TONES, thresholdColorHigh } from '@/lib/qaTheme';
import { getOfficialSprintRange } from '@/lib/sprintCalendar';
import { useQaEncerramentosPorUsuario, useQaHandoffHistogram } from '@/hooks/useGerencialQa';
import { useQaExecFilaAging, useQaExecRetornosDistribuicao } from '@/hooks/useQaExecutivo';
import { useHubAreas } from '@/hooks/useHubAreas';
import { useAuth } from '@/hooks/useAuth';
import { SistemaVersoesCard } from '@/components/qualidade/SistemaVersoesCard';

function toIsoDate(d?: Date): string | undefined {
  if (!d) return undefined;
  return d.toISOString().slice(0, 10);
}

function BlocoCard({
  icon: Icon,
  titulo,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-4 flex flex-col gap-3 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border bg-muted/40">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{titulo}</p>
      </div>
      {children}
    </Card>
  );
}

interface ExecutivoTabProps {
  lockedSprintCode?: string | null;
  dateStart?: Date;
  dateEnd?: Date;
  periodLabel?: string;
}

export function ExecutivoTab({ dateStart, dateEnd, periodLabel }: ExecutivoTabProps) {
  const dateStartIso = toIsoDate(dateStart);
  const dateEndIso = toIsoDate(dateEnd);
  const year = new Date().getFullYear();

  const { data: fila, isLoading: filaLoading } = useQaExecFilaAging();
  const { data: retornos, isLoading: retLoading } = useQaExecRetornosDistribuicao(year);
  const { data: encerramentos } = useQaEncerramentosPorUsuario(dateStartIso, dateEndIso);
  const { data: handoff } = useQaHandoffHistogram(dateStartIso, dateEndIso);

  const { isOwner } = useHubAreas();
  const { isAdmin } = useAuth();
  const canManage = isAdmin || isOwner('qualidade');

  // ── Meta: % no prazo (<=2 sprints) vs atraso (>2) ────────────────────────────
  const meta = useMemo(() => {
    const noPrazo = fila?.no_prazo ?? 0;
    const atraso = fila?.atraso ?? 0;
    const base = noPrazo + atraso;
    const pct = base > 0 ? Math.round((noPrazo / base) * 1000) / 10 : 100;
    return { noPrazo, atraso, pct, cor: thresholdColorHigh(pct) };
  }, [fila]);

  // ── Fila por origem (de onde viemos) ─────────────────────────────────────────
  const agingData = useMemo(
    () => (fila?.por_origem ?? []).map((o) => ({
      sprint: o.sprint_origem,
      n: o.n,
      atraso: o.atraso,
      age: o.age_sprints,
    })),
    [fila]
  );

  // ── Encerramentos por usuário (ranking, 2 cores objetivas) ───────────────────
  const encByCloser = useMemo(() => {
    const map = new Map<string, { closer: string; sem: number; com: number; total: number }>();
    for (const r of encerramentos ?? []) {
      const k = r.closer_display || r.closer_email || '—';
      const acc = map.get(k) ?? { closer: k, sem: 0, com: 0, total: 0 };
      acc.sem += r.sem_retorno;
      acc.com += r.com_retorno;
      acc.total += r.encerramentos;
      map.set(k, acc);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 12);
  }, [encerramentos]);

  // ── Entradas em "Em Teste" (handoff) + marcadores de sprint ──────────────────
  const handoffData = useMemo(
    () => (handoff ?? []).map((h) => ({
      dia: h.dia,
      label: new Date(h.dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      entradas: h.entradas,
    })),
    [handoff]
  );

  const sprintMarkers = useMemo(() => {
    if (!handoffData.length) return [];
    const first = handoffData[0].dia;
    const last = handoffData[handoffData.length - 1].dia;
    const marks: { label: string; sprint: string }[] = [];
    for (let n = 1; n <= 30; n++) {
      const code = `S${n}-${year}`;
      const range = getOfficialSprintRange(code);
      if (!range) continue;
      const end = range.to.toISOString().slice(0, 10);
      if (end >= first && end <= last) {
        const pt = handoffData.find((d) => d.dia >= end);
        if (pt) marks.push({ label: pt.label, sprint: code.split('-')[0] });
      }
    }
    return marks;
  }, [handoffData, year]);

  const totalHandoff = useMemo(() => handoffData.reduce((s, d) => s + d.entradas, 0), [handoffData]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Visão Executiva</h2>
        <p className="text-sm text-muted-foreground">
          Qualidade · onde estamos · o que queremos · de onde viemos {periodLabel ? `· ${periodLabel}` : ''}
        </p>
      </div>

      {/* ── Linha 1: onde estamos · o que queremos · qualidade do processo ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Onde estamos — Fila QA */}
        <BlocoCard icon={ListChecks} titulo="Onde estamos · Fila QA">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold font-mono">{filaLoading ? '—' : fila?.total_qa ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">total no escopo QA</p>
            </div>
            <div className="text-right space-y-0.5">
              <p className="text-sm font-mono"><span className="font-semibold text-[hsl(142,71%,40%)]">{fila?.em_teste ?? 0}</span> em teste</p>
              <p className="text-sm font-mono"><span className="font-semibold text-[hsl(199,89%,45%)]">{fila?.aguardando_deploy ?? 0}</span> ag. deploy</p>
            </div>
          </div>
          {!!fila?.total_qa && (
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div style={{ width: `${(fila.em_teste / fila.total_qa) * 100}%`, backgroundColor: QA_TONES.success.solid }} />
              <div style={{ width: `${(fila.aguardando_deploy / fila.total_qa) * 100}%`, backgroundColor: QA_TONES.info.solid }} />
            </div>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2">
            Escopo de qualidade (Em Teste + Aguardando Deploy). Sprint atual: {fila?.sprint_atual ?? '—'}.
          </p>
        </BlocoCard>

        {/* O que queremos — Meta de vazão / idade */}
        <BlocoCard icon={Target} titulo="O que queremos · Meta de vazão">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-3xl font-bold font-mono text-[hsl(142,71%,40%)]">{filaLoading ? '—' : meta.noPrazo}</p>
              <p className="text-[11px] text-muted-foreground">no prazo (≤ 2 sprints)</p>
            </div>
            <div>
              <p className="text-3xl font-bold font-mono" style={{ color: meta.atraso > 0 ? QA_TONES.danger.solid : QA_TONES.success.solid }}>
                {filaLoading ? '—' : meta.atraso}
              </p>
              <p className="text-[11px] text-muted-foreground">em atraso (&gt; 2 sprints)</p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-muted-foreground">% da fila no prazo</span>
              <span className="font-mono font-semibold" style={{ color: meta.cor }}>{meta.pct.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(meta.pct, 100)}%`, backgroundColor: meta.cor }} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">
            Meta: nada em teste há mais de 2 sprints. PBI com &gt; 2 sprints sem DONE = atraso (represamento).
          </p>
        </BlocoCard>

        {/* Qualidade do processo — retornos quantificados */}
        <BlocoCard icon={RotateCcw} titulo="Qualidade · retornos por nº de ciclos">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-2xl font-bold font-mono text-muted-foreground">{retLoading ? '—' : retornos?.itens_1x ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">voltaram 1x</p>
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-[hsl(43,85%,40%)]">{retLoading ? '—' : retornos?.itens_2x ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">voltaram 2x</p>
            </div>
            <div className="rounded-lg bg-destructive/10 py-0.5">
              <p className="text-2xl font-bold font-mono text-destructive">{retLoading ? '—' : retornos?.itens_3x_mais ?? 0}</p>
              <p className="text-[11px] text-destructive font-medium">≥ 3x ⚠</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">
            {retornos?.itens_com_retorno ?? 0} itens com retorno em {year}. ≥3 retornos = sinal de problema no processo (não só no dev).
          </p>
        </BlocoCard>
      </div>

      {/* ── Linha 2: de onde viemos — idade da fila + encerramentos por usuário ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Idade da fila por sprint de origem */}
        <BlocoCard icon={CalendarClock} titulo="Idade da fila · por sprint de origem">
          {filaLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : agingData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Fila vazia.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, agingData.length * 26)}>
              <BarChart data={agingData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="sprint" width={64} tick={{ fontSize: 11 }} />
                <RTooltip
                  formatter={(v: number, _n, p: any) => [`${v} itens · ${p.payload.age} sprint(s)`, p.payload.atraso ? 'ATRASO' : 'no prazo']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="n" radius={[0, 4, 4, 0]}>
                  {agingData.map((d) => (
                    <Cell key={d.sprint} fill={d.atraso ? QA_TONES.danger.solid : QA_TONES.success.solid} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: QA_TONES.success.solid }} /> no prazo</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: QA_TONES.danger.solid }} /> atraso (&gt; 2 sprints)</span>
          </p>
        </BlocoCard>

        {/* Encerramentos por usuário (ranking) */}
        <BlocoCard icon={Users} titulo="Encerramentos QA por usuário">
          {encByCloser.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem encerramentos no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, encByCloser.length * 26)}>
              <BarChart data={encByCloser} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="closer" width={110} tick={{ fontSize: 11 }} />
                <RTooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="sem" name="sem retorno" stackId="e" fill={QA_TONES.success.solid} radius={[0, 0, 0, 0]} />
                <Bar dataKey="com" name="com retorno" stackId="e" fill={QA_TONES.danger.solid} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: QA_TONES.success.solid }} /> sem retorno</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: QA_TONES.danger.solid }} /> com retorno</span>
            · ranking por total encerrado
          </p>
        </BlocoCard>
      </div>

      {/* ── Linha 3: entradas em Em Teste (handoff) com marcadores de sprint ── */}
      <BlocoCard icon={CalendarClock} titulo="Distribuição de entradas em 'Em Teste'">
        {handoffData.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem entradas registradas no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={handoffData} margin={{ top: 16, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <RTooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="entradas" fill={QA_TONES.info.solid} radius={[3, 3, 0, 0]} />
              {sprintMarkers.map((m) => (
                <ReferenceLine
                  key={m.label}
                  x={m.label}
                  stroke={QA_TONES.danger.solid}
                  strokeDasharray="4 3"
                  label={{ value: m.sprint, position: 'top', fontSize: 11, fill: QA_TONES.danger.solid }}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
        <p className="text-[11px] text-muted-foreground border-t pt-2">
          {totalHandoff} entradas no período. As linhas tracejadas marcam o fim de cada sprint (S11, S12…) — as barras à esquerda de cada linha pertencem àquela sprint.
        </p>
      </BlocoCard>

      {/* ── Linha 4: reconciliação (bug 76-vs-26) + controle de versão ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Reconciliação retorno QA */}
        <BlocoCard icon={GitCompareArrows} titulo="Retorno QA · reconciliação">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-2xl font-bold font-mono">{retornos?.eventos_total ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">eventos de retorno</p>
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{retornos?.itens_com_retorno ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">itens (qualquer estágio)</p>
            </div>
            <div>
              <p className="text-2xl font-bold font-mono text-primary">{retornos?.reconc.itens_concluidos ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">concluídos · {retornos?.reconc.ciclos_concluidos ?? 0} ciclos</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">
            O grid mostra <b>eventos</b> (cada retorno conta), os KPIs contam <b>itens concluídos</b> com retorno. São escopos diferentes — não divergência de dado.
          </p>
          {!!retornos?.top_3x_mais?.length && (
            <div className="space-y-1 overflow-y-auto max-h-[150px] pr-1 border-t pt-2">
              <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-destructive" /> Itens com ≥ 3 retornos
              </p>
              {retornos.top_3x_mais.map((t) => (
                <div key={t.work_item_id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-foreground" title={t.title ?? ''}>
                    {t.sprint_code ? <span className="text-muted-foreground">{t.sprint_code.split('-')[0]} · </span> : null}
                    {t.title ?? `#${t.work_item_id}`}
                  </span>
                  <Badge variant="destructive" className="flex-shrink-0 font-mono text-[10px]">{t.ciclos}x</Badge>
                </div>
              ))}
            </div>
          )}
        </BlocoCard>

        {/* Controle de versão de sistemas */}
        <SistemaVersoesCard canManage={canManage} />
      </div>
    </div>
  );
}
