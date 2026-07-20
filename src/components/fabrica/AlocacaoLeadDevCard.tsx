import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { cleanFabricaName } from '@/lib/fabricaNames';
import { fabricaColor } from '@/lib/chartColors';
import { normName, SQUADS } from '@/lib/fabricaRoster';
import { useFabricaRoster } from '@/hooks/useFabricaRoster';
import { businessDaysBetween } from '@/lib/sprintCalendar';

type FabricaScopeRow = {
  key: string;
  collaborators: { name: string; minutes: number }[];
};

type AlocacaoLeadDevCardProps = {
  /** Horas por fábrica (Epic) com colaboradores — ex.: fab.horasPorFabricaFull. */
  fabricaRows: FabricaScopeRow[];
  /** Período do realizado — capacidade = h/dia × dias úteis nesse intervalo. */
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

type LogRow = {
  user_name: string;
  work_item_id: number;
  log_date: string;
  start_time: string | null;
  time_minutes: number | null;
  notes: string | null;
  ingested_at: string;
};

type ItemMeta = { id: number; title: string | null; work_item_type: string | null; web_url: string | null };

function fmtH(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}
function fmtDelta(minutes: number): string {
  return `${minutes >= 0 ? '+' : '−'}${fmtH(Math.abs(minutes))}`;
}
/** Minutos → "84:22" (formato da planilha do gestor). */
function fmtHM(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
/** "2026-07-17" → "17/07" sem passar por new Date (evita o -1 dia do fuso). */
function fmtDia(logDate: string): string {
  const [, m, d] = logDate.split('-');
  return `${d}/${m}`;
}
/** Dias entre o dia trabalhado (declarado) e o momento do registro no portal. */
function lagDias(row: LogRow): number {
  const [y, m, d] = row.log_date.split('-').map(Number);
  return Math.floor((new Date(row.ingested_at).getTime() - Date.UTC(y, m - 1, d)) / 86400000);
}

/**
 * Visão de alocação Lead → desenvolvedores. Cada squad do roster fixo abre para
 * os seus devs; a barra de cada dev fica bicolor quando parte das horas foi para
 * OUTRA fábrica (uso cruzado), com o destino no chip.
 *
 * Drill-down em dois níveis: clique no desenvolvedor → tasks com total de
 * horas; clique na task → lançamentos individuais (dia trabalhado, horas em
 * h:mm, quando registrou e comentário). Permite ao gestor confrontar a
 * planilha dele com o que o portal coleta e ver quem registra tarde ou depois
 * do fim da sprint. Este KPI não é congelado: reage ao que é lançado
 * (decisão do gestor 19/07).
 */
export function AlocacaoLeadDevCard({ fabricaRows, dateFrom, dateTo }: AlocacaoLeadDevCardProps) {
  const { data: roster = [], isLoading } = useFabricaRoster();
  const [aberta, setAberta] = useState<string | null>(null);
  const [devAberto, setDevAberto] = useState<string | null>(null);
  const [taskAberta, setTaskAberta] = useState<string | null>(null);

  const businessDays = useMemo(
    () => (dateFrom && dateTo ? businessDaysBetween(dateFrom, dateTo) : null),
    [dateFrom, dateTo],
  );

  const fromStr = dateFrom ? dateFrom.toISOString().split('T')[0] : null;
  const toStr = dateTo ? dateTo.toISOString().split('T')[0] : null;
  const fimSprintMs = dateTo
    ? new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999).getTime()
    : null;

  // ── Drill-down: lançamentos individuais do período (lazy — só ao expandir um dev) ──
  const logsQuery = useQuery({
    queryKey: ['aloc-timelog-detail', fromStr, toStr],
    enabled: devAberto != null && !!fromStr && !!toStr,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('devops_time_logs')
        .select('user_name, work_item_id, log_date, start_time, time_minutes, notes, ingested_at')
        .gte('log_date', fromStr)
        .lte('log_date', toStr)
        .limit(5000);
      if (error) throw error;
      return (data || []) as LogRow[];
    },
  });

  const collabMapQuery = useQuery({
    queryKey: ['aloc-collab-map'],
    enabled: devAberto != null,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('devops_collaborator_map')
        .select('timelog_name, canonical_name') as { data: Array<{ timelog_name: string; canonical_name: string }> | null };
      const map = new Map<string, string>();
      for (const r of data || []) {
        map.set(r.timelog_name.toLowerCase(), r.canonical_name);
        map.set(normName(r.timelog_name), r.canonical_name);
      }
      return map;
    },
  });

  const itemIds = useMemo(() => {
    const ids = new Set<number>();
    for (const r of logsQuery.data || []) ids.add(r.work_item_id);
    return [...ids].sort((a, b) => a - b);
  }, [logsQuery.data]);

  const itemsQuery = useQuery({
    queryKey: ['aloc-timelog-items', itemIds.join(',')],
    enabled: itemIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('devops_work_items')
        .select('id, title, work_item_type, web_url')
        .in('id', itemIds);
      if (error) throw error;
      const map = new Map<number, ItemMeta>();
      for (const it of (data || []) as ItemMeta[]) map.set(it.id, it);
      return map;
    },
  });

  // Lançamentos por dev (nome canônico normalizado), ordenados por dia/início.
  const detalhePorDev = useMemo(() => {
    const out = new Map<string, LogRow[]>();
    const cmap = collabMapQuery.data;
    for (const r of logsQuery.data || []) {
      const canonical = cmap?.get(r.user_name.toLowerCase()) ?? cmap?.get(normName(r.user_name)) ?? r.user_name;
      const k = normName(canonical);
      const arr = out.get(k) ?? [];
      arr.push(r);
      out.set(k, arr);
    }
    for (const arr of out.values()) {
      arr.sort((a, b) => a.log_date.localeCompare(b.log_date) || (a.start_time || '').localeCompare(b.start_time || ''));
    }
    return out;
  }, [logsQuery.data, collabMapQuery.data]);

  // Horas de cada colaborador por fábrica de DESTINO (fábrica do item).
  const byCollab = useMemo(() => {
    const m = new Map<string, { total: number; byDest: Map<string, number> }>();
    for (const row of fabricaRows) {
      const dest = cleanFabricaName(row.key);
      for (const c of row.collaborators) {
        const k = normName(c.name);
        const e = m.get(k) ?? { total: 0, byDest: new Map<string, number>() };
        e.total += c.minutes;
        e.byDest.set(dest, (e.byDest.get(dest) ?? 0) + c.minutes);
        m.set(k, e);
      }
    }
    return m;
  }, [fabricaRows]);

  const squads = useMemo(() => {
    return SQUADS.map((squad) => {
      const membros = roster.filter((r) => r.squad === squad);
      const lead = membros.find((r) => r.papel === 'lead') ?? null;
      // Lead só gestor (conta_horas=false) fica só no cabeçalho; lead executor conta como dev.
      const devs = membros
        .filter((r) => r.conta_horas !== false)
        .map((r) => {
          const stat = byCollab.get(normName(r.colaborador));
          const total = stat?.total ?? 0;
          const own = stat?.byDest.get(squad) ?? 0;
          const crossDests = [...(stat?.byDest ?? new Map<string, number>())]
            .filter(([d]) => d !== squad)
            .sort((a, b) => b[1] - a[1]);
          const cap = businessDays ? (Number(r.capacidade_h_dia) || 0) * businessDays * 60 : 0;
          return { nome: r.colaborador, papel: r.papel, total, own, cross: total - own, crossDests, cap };
        })
        .sort((a, b) => b.total - a.total);
      const total = devs.reduce((s, d) => s + d.total, 0);
      const cross = devs.reduce((s, d) => s + d.cross, 0);
      const cap = devs.reduce((s, d) => s + d.cap, 0);
      return { squad, lead, devs, total, cross, cap };
    }).filter((s) => s.devs.length > 0);
  }, [roster, byCollab, businessDays]);
  const temCapacidade = !!businessDays;

  // ── Nível 1 do drill: tasks do dev; nível 2: lançamentos da task ────────────
  const renderDetalhe = (devKey: string) => {
    const rows = detalhePorDev.get(devKey) ?? [];
    const carregando = logsQuery.isLoading || collabMapQuery.isLoading;
    const itemById = itemsQuery.data;
    const totalMin = rows.reduce((s, r) => s + (r.time_minutes || 0), 0);

    type Grupo = { id: number; minutes: number; rows: LogRow[]; minDia: string; maxDia: string; maxLag: number; posSprint: number };
    const grupos: Grupo[] = (() => {
      const m = new Map<number, Grupo>();
      for (const r of rows) {
        const g = m.get(r.work_item_id) ?? {
          id: r.work_item_id, minutes: 0, rows: [] as LogRow[],
          minDia: r.log_date, maxDia: r.log_date, maxLag: 0, posSprint: 0,
        };
        g.minutes += r.time_minutes || 0;
        g.rows.push(r);
        if (r.log_date < g.minDia) g.minDia = r.log_date;
        if (r.log_date > g.maxDia) g.maxDia = r.log_date;
        const lag = lagDias(r);
        if (lag > g.maxLag) g.maxLag = lag;
        if (fimSprintMs != null && new Date(r.ingested_at).getTime() > fimSprintMs) g.posSprint++;
        m.set(r.work_item_id, g);
      }
      return [...m.values()].sort((a, b) => b.minutes - a.minutes);
    })();

    return (
      <div className="px-3 pb-3 pl-9 bg-muted/20">
        {carregando ? (
          <p className="text-[11px] text-muted-foreground py-3">Carregando lançamentos…</p>
        ) : rows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground py-3">Sem lançamentos no período.</p>
        ) : (
          <div className="border rounded-md overflow-hidden bg-card">
            {grupos.map((g) => {
              const meta = itemById?.get(g.id);
              const tKey = `${devKey}|${g.id}`;
              const isTaskAberta = taskAberta === tKey;
              const periodo = g.minDia === g.maxDia ? fmtDia(g.minDia) : `${fmtDia(g.minDia)}–${fmtDia(g.maxDia)}`;
              return (
                <div key={g.id} className="border-b last:border-b-0 border-border/60">
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-muted/40 cursor-pointer select-none"
                    title={isTaskAberta ? 'Fechar lançamentos da task' : 'Ver lançamentos individuais desta task'}
                    onClick={() => setTaskAberta(isTaskAberta ? null : tKey)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTaskAberta(isTaskAberta ? null : tKey); } }}
                  >
                    {isTaskAberta
                      ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                    {meta?.web_url ? (
                      <a
                        href={meta.web_url} target="_blank" rel="noopener noreferrer"
                        className="font-mono text-primary hover:underline shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >#{g.id}</a>
                    ) : (
                      <span className="font-mono shrink-0">#{g.id}</span>
                    )}
                    <span className="truncate flex-1 min-w-0" title={meta?.title ?? undefined}>{meta?.title ?? '—'}</span>
                    {g.posSprint > 0 && (
                      <span className="px-1 rounded bg-rose-500/15 text-rose-600 dark:text-rose-300 font-medium shrink-0">
                        {g.posSprint} após a sprint
                      </span>
                    )}
                    {g.posSprint === 0 && g.maxLag >= 2 && (
                      <span className="px-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium shrink-0" title={`Maior atraso de registro: ${g.maxLag} dias`}>
                        até +{g.maxLag}d
                      </span>
                    )}
                    <span className="text-muted-foreground tabular-nums shrink-0 w-24 text-right">{periodo}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0 w-16 text-right">{g.rows.length} lançtos</span>
                    <span className="font-mono font-semibold tabular-nums shrink-0 w-14 text-right">{fmtHM(g.minutes)}</span>
                  </div>

                  {isTaskAberta && (
                    <table className="w-full text-[11px] bg-muted/10">
                      <thead className="text-muted-foreground">
                        <tr className="border-t border-border/40">
                          <th className="text-left pl-9 pr-2 py-1 font-medium w-16">Dia</th>
                          <th className="text-left px-2 py-1 font-medium w-14">Início</th>
                          <th className="text-right px-2 py-1 font-medium w-14">Horas</th>
                          <th className="text-left px-2 py-1 font-medium w-44">Registrado em</th>
                          <th className="text-left px-2 py-1 font-medium">Comentário</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {g.rows.map((r, i) => {
                          const ing = new Date(r.ingested_at);
                          const ingStr = ing.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                          const lag = lagDias(r);
                          const posSprint = fimSprintMs != null && ing.getTime() > fimSprintMs;
                          return (
                            <tr key={`${r.log_date}-${i}`}>
                              <td className="pl-9 pr-2 py-1 tabular-nums whitespace-nowrap">{fmtDia(r.log_date)}</td>
                              <td className="px-2 py-1 tabular-nums text-muted-foreground">{r.start_time || '—'}</td>
                              <td className="px-2 py-1 text-right font-mono tabular-nums">{fmtHM(r.time_minutes || 0)}</td>
                              <td className="px-2 py-1 whitespace-nowrap">
                                <span className="tabular-nums">{ingStr}</span>
                                {posSprint && (
                                  <span className="ml-1 px-1 rounded bg-rose-500/15 text-rose-600 dark:text-rose-300 font-medium">após a sprint</span>
                                )}
                                {!posSprint && lag >= 2 && (
                                  <span className="ml-1 px-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium" title={`Registrado ${lag} dias depois do dia trabalhado`}>+{lag}d</span>
                                )}
                              </td>
                              <td className="px-2 py-1 max-w-[320px]">
                                <span className="block truncate text-muted-foreground" title={r.notes ?? undefined}>{r.notes || '—'}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
            <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] bg-muted/30">
              <span className="text-muted-foreground">{rows.length} lançamento{rows.length === 1 ? '' : 's'} em {grupos.length} task{grupos.length === 1 ? '' : 's'}</span>
              <span className="ml-auto font-mono font-bold tabular-nums">{fmtHM(totalMin)}</span>
              <span className="text-muted-foreground">= {fmtH(totalMin)} em decimal (como o card exibe)</span>
            </div>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          Clique na task para abrir os lançamentos. "Registrado em" = quando o lançamento chegou ao portal (coleta a cada ~15 min, horário de Brasília).
          <span className="text-amber-700 dark:text-amber-300"> +Nd</span> = registrado N dias após o dia trabalhado declarado;
          <span className="text-rose-600 dark:text-rose-300"> após a sprint</span> = registrado depois do fim oficial (sexta 23:59).
        </p>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Alocação — Lead → desenvolvedores
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-muted-foreground text-center py-8">Carregando roster das squads…</p>
        ) : squads.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Roster das squads não carregado (tabela <code>fabrica_squad_membership</code> vazia).
          </p>
        ) : (
          <div className="space-y-2">
            {squads.map((s, si) => {
              const cor = fabricaColor(s.squad, si);
              const isOpen = aberta === s.squad;
              const crossPct = s.total > 0 ? Math.round((s.cross / s.total) * 100) : 0;
              return (
                <div key={s.squad} className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors text-left"
                    onClick={() => { setAberta(isOpen ? null : s.squad); setDevAberto(null); setTaskAberta(null); }}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: cor }} />
                    <span className="font-semibold text-sm">
                      {s.lead ? s.lead.colaborador : s.squad}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: cor, color: cor }}>
                      {s.lead
                        ? `${s.lead.conta_horas === false ? 'Lead gestor' : 'Lead executor'} · ${s.squad}`
                        : `${s.squad} · lead não definido`}
                    </span>
                    <span className="ml-auto text-xs tabular-nums">
                      {temCapacidade && s.cap > 0 ? (
                        <>
                          <span className="font-mono font-semibold">{Math.round((s.total / s.cap) * 100)}%</span>
                          <span className="text-muted-foreground"> · {fmtH(s.total)}/{fmtH(s.cap)} </span>
                          <span className={s.total - s.cap >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-destructive font-medium'}>{fmtDelta(s.total - s.cap)}</span>
                        </>
                      ) : (
                        <>
                          <span className="font-mono font-semibold">{fmtH(s.total)}</span>
                          {s.cross > 0 && <span className="text-amber-600 dark:text-amber-400"> · {crossPct}% cruzado</span>}
                        </>
                      )}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="divide-y divide-border/60 border-t">
                      {s.devs.map((d) => {
                        const ownPct = d.total > 0 ? (d.own / d.total) * 100 : 0;
                        const crossPctDev = d.total > 0 ? (d.cross / d.total) * 100 : 0;
                        const showCap = temCapacidade && d.cap > 0;
                        const capFillPct = showCap ? Math.min(d.total / d.cap, 1) * 100 : 100;
                        const devKey = `${s.squad}|${normName(d.nome)}`;
                        const isDevAberto = devAberto === devKey;
                        return (
                          <div key={d.nome}>
                            <button
                              type="button"
                              className={`w-full grid grid-cols-[1fr_150px_120px] items-center gap-3 px-3 py-2 pl-9 text-left transition-colors hover:bg-muted/40 ${isDevAberto ? 'bg-muted/30' : ''}`}
                              title={isDevAberto ? 'Fechar lançamentos' : 'Ver as tasks e lançamentos do período'}
                              onClick={() => { setDevAberto(isDevAberto ? null : devKey); setTaskAberta(null); }}
                            >
                              <span className="text-sm flex items-center gap-1.5 flex-wrap">
                                {isDevAberto
                                  ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                                  : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                                <span className={d.total === 0 ? 'text-muted-foreground' : ''}>{d.nome}</span>
                                {d.papel === 'lead' && (
                                  <span className="text-[10px] px-1 rounded bg-muted text-muted-foreground">lead</span>
                                )}
                                {d.crossDests.map(([dest, min]) => (
                                  <span key={dest} className="text-[10px] px-1.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium">
                                    {fmtH(min)} → {dest}
                                  </span>
                                ))}
                                {d.total === 0 && d.cap === 0 && (
                                  <span className="text-[10px] px-1.5 rounded bg-muted text-muted-foreground">{showCap || !temCapacidade ? 'sem apontamento' : 'sem capacity'}</span>
                                )}
                              </span>
                              <span className="text-xs text-right font-mono tabular-nums">
                                {showCap ? (
                                  <>{fmtH(d.total)}<span className="text-muted-foreground">/{fmtH(d.cap)}</span> <span className={d.total - d.cap >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>{fmtDelta(d.total - d.cap)}</span></>
                                ) : fmtH(d.total)}
                              </span>
                              <div
                                className="relative h-2.5 w-full overflow-hidden rounded-full"
                                style={{ background: showCap ? 'repeating-linear-gradient(90deg, hsl(var(--muted)), hsl(var(--muted)) 4px, hsl(var(--border)) 4px, hsl(var(--border)) 5px)' : 'hsl(var(--muted))' }}
                                title={showCap ? `capacidade ${fmtH(d.cap)} · realizado ${fmtH(d.total)}` : undefined}
                              >
                                <div className="absolute inset-y-0 left-0 flex" style={{ width: `${capFillPct}%` }}>
                                  <div style={{ width: `${ownPct}%`, background: cor }} title={`própria fábrica: ${fmtH(d.own)}`} />
                                  <div style={{ width: `${crossPctDev}%`, background: 'hsl(28,92%,55%)' }} title={`outras fábricas: ${fmtH(d.cross)}`} />
                                </div>
                                {showCap && <div className="absolute inset-y-0 right-0 w-px bg-foreground/50" />}
                              </div>
                            </button>
                            {isDevAberto && renderDetalhe(normName(d.nome))}
                          </div>
                          );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          Clique na squad para abrir os desenvolvedores, <b>no desenvolvedor para ver as tasks</b> (com total em h:mm)
          e <b>na task para ver cada lançamento</b> (dia, horas, quando registrou e comentário). Segmento âmbar na barra =
          horas alocadas em <b>outra fábrica</b> (uso cruzado). Este indicador não é congelado — reflete os lançamentos conforme chegam.
        </p>
      </CardContent>
    </Card>
  );
}
