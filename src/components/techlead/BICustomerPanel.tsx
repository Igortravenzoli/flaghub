import { useState } from 'react';
import {
  useBICustomerKpis,
  useBICustomerDetalhe,
  BICustomerDetalheItem,
} from '@/hooks/useBICustomer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  TrendingDown, TrendingUp, Clock, CheckCircle2, AlertTriangle,
  ChevronRight, X, ExternalLink,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Constantes ────────────────────────────────────────────────────────

type TipoChamado = 'INC' | 'PRB' | 'RITM';

const TIPO: Record<TipoChamado, { label: string; color: string; agingDias: number; agingLabel: string }> = {
  INC:  { label: 'Incidentes',  color: '#3b82f6', agingDias: 5,  agingLabel: '> 5 dias'  },
  PRB:  { label: 'Problemas',   color: '#f59e0b', agingDias: 10, agingLabel: '> 10 dias' },
  RITM: { label: 'Requisições', color: '#8b5cf6', agingDias: 30, agingLabel: '> 30 dias' },
};

// ── Helpers ───────────────────────────────────────────────────────────

function pctDelta(curr: number, prev: number) {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return '—'; }
}

function DeltaBadge({ curr, prev }: { curr: number; prev: number }) {
  const d = pctDelta(curr, prev);
  if (d === null) return null;
  const up = d > 0;
  const color = up ? 'text-red-500' : 'text-emerald-500';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${color}`}>
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {up ? '+' : ''}{d}%
    </span>
  );
}

function Kv({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold font-mono leading-none">{value}</p>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 3;
  return (
    <div className="h-1 rounded-full bg-muted overflow-hidden mt-1">
      <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

// ── Tabela de detalhe ─────────────────────────────────────────────────

function DetalheTable({ tipo, diasMin, onClose }: { tipo: TipoChamado; diasMin: number; onClose: () => void }) {
  const { data, isLoading, isError, refetch } = useBICustomerDetalhe(tipo, diasMin, true);
  const cfg = TIPO[tipo];

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border"
           style={{ borderLeftWidth: 3, borderLeftColor: cfg.color }}>
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full" style={{ background: cfg.color }} />
          <div>
            <p className="text-sm font-semibold">
              {cfg.label} em aberto
              {diasMin > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {cfg.agingLabel}
                </span>
              )}
            </p>
            {!isLoading && data && (
              <p className="text-xs text-muted-foreground">{data.total} registro{data.total !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="p-4 space-y-2">
          {[1,2,3].map(i => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      )}
      {isError && (
        <div className="p-4">
          <DashboardEmptyState variant="error" onRetry={() => refetch()} />
        </div>
      )}
      {!isLoading && !isError && (
        data?.items.length === 0
          ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma OS encontrada.</p>
          : (
            <ScrollArea className="h-64">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card/95 backdrop-blur border-b border-border z-10">
                  <tr className="text-muted-foreground text-[11px]">
                    <th className="py-2 pl-4 pr-2 text-left font-medium">Ticket</th>
                    <th className="py-2 px-2 text-left font-medium">Cliente</th>
                    <th className="py-2 px-2 text-left font-medium">Sistema</th>
                    <th className="py-2 px-2 text-left font-medium">Responsável</th>
                    <th className="py-2 px-2 text-center font-medium">Dias</th>
                    <th className="py-2 px-4 text-left font-medium">Abertura</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.items.map((item: BICustomerDetalheItem, i: number) => (
                    <tr key={`${item.ticket}-${i}`}
                        className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pl-4 pr-2 font-mono font-semibold" style={{ color: cfg.color }}>
                        {item.ticket || '—'}
                      </td>
                      <td className="py-2 px-2 max-w-[140px] truncate">{item.cliente}</td>
                      <td className="py-2 px-2 text-muted-foreground max-w-[100px] truncate">{item.sistema}</td>
                      <td className="py-2 px-2 text-muted-foreground">{item.consultor}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`inline-block rounded px-1.5 py-0.5 font-mono font-bold text-[11px] ${
                          item.diasAberto > 30
                            ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                            : item.diasAberto > 10
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {item.diasAberto}d
                        </span>
                      </td>
                      <td className="py-2 px-4 text-muted-foreground">{fmtDate(item.dataRegistro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )
      )}
    </div>
  );
}

// ── Painel principal ──────────────────────────────────────────────────

export function BICustomerPanel() {
  const { data, isLoading, isError, refetch } = useBICustomerKpis();
  const [detail, setDetail] = useState<{ tipo: TipoChamado; diasMin: number } | null>(null);

  function toggle(tipo: TipoChamado, diasMin: number) {
    setDetail(p => p?.tipo === tipo && p.diasMin === diasMin ? null : { tipo, diasMin });
  }

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  const ma = data?.mesAtual;
  const mp = data?.mesAnterior;
  const ab = data?.abertos;
  const mt = data?.metricas;

  // ── dados de composição para o donut ─────────────────────────────
  const donutMes = ma ? [
    { name: 'INC',  value: ma.incTickets,  color: TIPO.INC.color  },
    { name: 'PRB',  value: ma.prbTickets,  color: TIPO.PRB.color  },
    { name: 'RITM', value: ma.ritmTickets, color: TIPO.RITM.color },
  ] : [];

  const donutAbertos = ab ? [
    { name: 'INC',  value: ab.incTicketsAberto,  color: TIPO.INC.color  },
    { name: 'PRB',  value: ab.prbTicketsAberto,  color: TIPO.PRB.color  },
    { name: 'RITM', value: ab.ritmTicketsAberto, color: TIPO.RITM.color },
  ] : [];

  const totalAbertos = ab ? ab.incTicketsAberto + ab.prbTicketsAberto + ab.ritmTicketsAberto : 0;

  // ── por tipo: extrai valores ──────────────────────────────────────
  function tipoVals(t: TipoChamado) {
    const key = t.toLowerCase() as 'inc' | 'prb' | 'ritm';
    return {
      tickets:    ma?.[`${key}Tickets`]         ?? 0,
      ticketsPrev: mp?.[`${key}Tickets`]        ?? 0,
      abTickets:  ab?.[`${key}TicketsAberto`]   ?? 0,
      abOs:       ab?.[`${key}OsAberto`]        ?? 0,
      aging: ab?.[t === 'INC' ? 'incTicket5Dias' : t === 'PRB' ? 'prbTicket10Dias' : 'ritmTicket30Dias'] ?? 0,
    };
  }

  return (
    <div className="space-y-5">

      {/* ─── LINHA 1: resumo topo ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
          : [
              {
                label: 'Tickets Mês',
                value: ma?.totalTickets ?? '—',
                sub: <DeltaBadge curr={ma?.totalTickets ?? 0} prev={mp?.totalTickets ?? 0} />,
              },
              {
                label: 'OS Mês',
                value: ma?.totalOs ?? '—',
                sub: <DeltaBadge curr={ma?.totalOs ?? 0} prev={mp?.totalOs ?? 0} />,
              },
              {
                label: 'Em Aberto',
                value: totalAbertos,
                sub: <span className="text-[11px]">{ab ? ab.incOsAberto + ab.prbOsAberto + ab.ritmOsAberto : 0} OS</span>,
              },
              {
                label: 'TTR Médio',
                value: mt ? `${mt.ttrMedioDias.toFixed(1)}d` : '—',
                sub: (
                  <span className={`text-[11px] font-medium ${mt && mt.ttrMedioDias <= 3.9 ? 'text-emerald-500' : 'text-amber-500'}`}>
                    meta ≤ 3,9d
                  </span>
                ),
              },
              {
                label: '% em 24h',
                value: mt ? `${mt.pctEncerrados24h.toFixed(0)}%` : '—',
                sub: (
                  <span className={`text-[11px] font-medium inline-flex items-center gap-1 ${mt && mt.pctEncerrados24h >= 48 ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {mt && mt.pctEncerrados24h >= 48
                      ? <><CheckCircle2 className="h-3 w-3" /> OK</>
                      : <><AlertTriangle className="h-3 w-3" /> meta 48%</>
                    }
                  </span>
                ),
              },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl border border-border bg-card px-4 py-3 space-y-1">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold font-mono leading-none">{value}</p>
                <div>{sub}</div>
              </div>
            ))
        }
      </div>

      {/* ─── LINHA 2: cards INC / PRB / RITM ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['INC', 'PRB', 'RITM'] as TipoChamado[]).map(tipo => {
          const cfg = TIPO[tipo];
          const v = tipoVals(tipo);
          const isActiveAbertos = detail?.tipo === tipo && detail.diasMin === 0;
          const isActiveAging   = detail?.tipo === tipo && detail.diasMin === cfg.agingDias;

          return (
            <div key={tipo} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Cabeçalho colorido */}
              <div className="px-4 py-3 flex items-center justify-between"
                   style={{ background: `${cfg.color}15`, borderBottom: `1px solid ${cfg.color}30` }}>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ background: cfg.color }} />
                  <span className="font-semibold text-sm">{cfg.label}</span>
                </div>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded"
                      style={{ background: `${cfg.color}20`, color: cfg.color }}>
                  {tipo}
                </span>
              </div>

              <div className="px-4 py-3 space-y-4">
                {isLoading ? (
                  <Skeleton className="h-28 w-full" />
                ) : (
                  <>
                    {/* Mês atual vs anterior */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">
                          Tickets mês
                        </p>
                        <p className="text-3xl font-bold font-mono leading-none">{v.tickets}</p>
                        <DeltaBadge curr={v.tickets} prev={v.ticketsPrev} />
                        <ProgressBar value={v.tickets} max={Math.max(ma?.totalTickets ?? 1, 1)} color={cfg.color} />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">
                          Mês anterior
                        </p>
                        <p className="text-3xl font-bold font-mono leading-none text-muted-foreground">
                          {v.ticketsPrev}
                        </p>
                      </div>
                    </div>

                    {/* Botões de drill-through */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {/* Abertos */}
                      <button
                        onClick={() => toggle(tipo, 0)}
                        className={`group rounded-lg border px-3 py-2.5 text-left transition-all ${
                          isActiveAbertos
                            ? 'border-blue-500/60 bg-blue-500/10'
                            : 'border-border hover:border-primary/40 hover:bg-muted/40'
                        }`}
                      >
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                          Em aberto
                        </p>
                        <div className="flex items-end justify-between mt-1">
                          <span className="text-xl font-bold font-mono" style={{ color: cfg.color }}>
                            {v.abTickets}
                          </span>
                          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform ${isActiveAbertos ? 'rotate-90' : ''}`} />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{v.abOs} OS</p>
                      </button>

                      {/* Aging */}
                      <button
                        onClick={() => toggle(tipo, cfg.agingDias)}
                        className={`group rounded-lg border px-3 py-2.5 text-left transition-all ${
                          isActiveAging
                            ? 'border-amber-500/60 bg-amber-500/10'
                            : 'border-border hover:border-amber-500/40 hover:bg-amber-500/5'
                        }`}
                      >
                        <p className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 font-medium">
                          Aging
                        </p>
                        <div className="flex items-end justify-between mt-1">
                          <span className={`text-xl font-bold font-mono ${
                            v.aging > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                          }`}>
                            {v.aging}
                          </span>
                          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform ${isActiveAging ? 'rotate-90' : ''}`} />
                        </div>
                        <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mt-0.5">
                          {cfg.agingLabel}
                        </p>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Detalhe drill-through ────────────────────────────────── */}
      {detail && (
        <DetalheTable
          tipo={detail.tipo}
          diasMin={detail.diasMin}
          onClose={() => setDetail(null)}
        />
      )}

      {/* ─── LINHA 3: donuts + TTR ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Donut mês atual */}
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Distribuição — Mês Atual</CardTitle>
            {!isLoading && ma && (
              <p className="text-xs text-muted-foreground">{ma.totalTickets} tickets · {ma.totalOs} OS</p>
            )}
          </CardHeader>
          <CardContent className="pt-0 pb-4">
            {isLoading ? <Skeleton className="h-40 w-full" /> : (
              <div className="flex items-center gap-4">
                <div className="h-40 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutMes} cx="50%" cy="50%" innerRadius={44} outerRadius={64}
                           paddingAngle={3} dataKey="value">
                        {donutMes.map(e => <Cell key={e.name} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number, n: string) => [v, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 text-xs shrink-0">
                  {donutMes.map(e => (
                    <div key={e.name} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: e.color }} />
                      <span className="text-muted-foreground">{e.name}</span>
                      <span className="font-bold font-mono ml-auto pl-2">{e.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Donut abertos */}
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Distribuição — Em Aberto</CardTitle>
            {!isLoading && ab && (
              <p className="text-xs text-muted-foreground">{totalAbertos} tickets · {ab.incOsAberto + ab.prbOsAberto + ab.ritmOsAberto} OS</p>
            )}
          </CardHeader>
          <CardContent className="pt-0 pb-4">
            {isLoading ? <Skeleton className="h-40 w-full" /> : (
              <div className="flex items-center gap-4">
                <div className="h-40 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutAbertos} cx="50%" cy="50%" innerRadius={44} outerRadius={64}
                           paddingAngle={3} dataKey="value">
                        {donutAbertos.map(e => <Cell key={e.name} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number, n: string) => [v, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 text-xs shrink-0">
                  {donutAbertos.map(e => (
                    <div key={e.name} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: e.color }} />
                      <span className="text-muted-foreground">{e.name}</span>
                      <span className="font-bold font-mono ml-auto pl-2">{e.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* TTR */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Métricas TTR</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">Fechamentos dos últimos 60 dias</p>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            {isLoading ? <Skeleton className="h-32 w-full" /> : (
              <>
                {/* Fechados */}
                <div className="flex items-center justify-between py-2.5 border-b border-border/60">
                  <span className="text-xs text-muted-foreground">Fechados (60d)</span>
                  <span className="text-lg font-bold font-mono">{mt?.fechados60Dias ?? '—'}</span>
                </div>

                {/* TTR médio */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">TTR Médio</span>
                    <span className={`text-base font-bold font-mono ${
                      mt && mt.ttrMedioDias <= 3.9 ? 'text-emerald-500' : 'text-amber-500'
                    }`}>
                      {mt ? `${mt.ttrMedioDias.toFixed(1)}d` : '—'}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${
                      mt && mt.ttrMedioDias <= 3.9 ? 'bg-emerald-500' : 'bg-amber-500'
                    }`} style={{ width: `${mt ? Math.min(100, (mt.ttrMedioDias / 10) * 100) : 0}%` }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Meta: ≤ 3,9 dias</p>
                </div>

                {/* % 24h */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">Encerrados em 24h</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-base font-bold font-mono ${
                        mt && mt.pctEncerrados24h >= 48 ? 'text-emerald-500' : 'text-amber-500'
                      }`}>
                        {mt ? `${mt.pctEncerrados24h.toFixed(1)}%` : '—'}
                      </span>
                      {mt && (mt.pctEncerrados24h >= 48
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${
                      mt && mt.pctEncerrados24h >= 48 ? 'bg-emerald-500' : 'bg-amber-500'
                    }`} style={{ width: `${mt?.pctEncerrados24h ?? 0}%` }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Meta: ≥ 48%</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
