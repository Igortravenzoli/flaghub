import { useState } from 'react';
import {
  useBICustomerKpis,
  useBICustomerDetalhe,
  BICustomerDetalheItem,
  BICustomerSegmento,
  BICustomerSegmentoKey,
} from '@/hooks/useBICustomer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  TrendingDown, TrendingUp, CheckCircle2, AlertTriangle,
  ChevronRight, X, Building2, Boxes,
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

// Meta SLA (mesma do gateway Gestao)
const META_TTR_DIAS = 3.9;
const META_24H_PCT = 48;

interface SegConfig {
  key: BICustomerSegmentoKey;
  titulo: string;
  unidadeLabel: string;       // "Tickets" | "OS"
  totalLabel: string;         // "Tickets no Mês" | "Total OS no Mês"
  Icon: typeof Building2;
}

const SEGMENTOS: SegConfig[] = [
  { key: 'nestle', titulo: 'Nestlé',            unidadeLabel: 'Tickets', totalLabel: 'Tickets no Mês', Icon: Building2 },
  { key: 'outras', titulo: 'Outras Indústrias', unidadeLabel: 'OS',      totalLabel: 'Total OS no Mês', Icon: Boxes },
];

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

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 3;
  return (
    <div className="h-1 rounded-full bg-muted overflow-hidden mt-1">
      <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

// ── Tabela de detalhe ─────────────────────────────────────────────────

function DetalheTable({ segmento, tipo, diasMin, onClose }: {
  segmento: BICustomerSegmentoKey; tipo: TipoChamado; diasMin: number; onClose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useBICustomerDetalhe(segmento, tipo, diasMin, true);
  const cfg = TIPO[tipo];

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border"
           style={{ borderLeftWidth: 3, borderLeftColor: cfg.color }}>
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full" style={{ background: cfg.color }} />
          <div>
            <p className="text-sm font-semibold">
              {cfg.label} em aberto
              {diasMin > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{cfg.agingLabel}</span>}
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

      {isLoading && (
        <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
      )}
      {isError && <div className="p-4"><DashboardEmptyState variant="error" onRetry={() => refetch()} /></div>}
      {!isLoading && !isError && (
        data?.items.length === 0
          ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma OS encontrada.</p>
          : (
            <ScrollArea className="h-64">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card/95 backdrop-blur border-b border-border z-10">
                  <tr className="text-muted-foreground text-[11px]">
                    <th className="py-2 pl-4 pr-2 text-left font-medium">Ticket / OS</th>
                    <th className="py-2 px-2 text-left font-medium">Cliente</th>
                    <th className="py-2 px-2 text-left font-medium">Bandeira</th>
                    <th className="py-2 px-2 text-left font-medium">Sistema</th>
                    <th className="py-2 px-2 text-left font-medium">Responsável</th>
                    <th className="py-2 px-2 text-center font-medium">Dias</th>
                    <th className="py-2 px-4 text-left font-medium">Abertura</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.items.map((item: BICustomerDetalheItem, i: number) => (
                    <tr key={`${item.os}-${i}`} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pl-4 pr-2 font-mono font-semibold" style={{ color: cfg.color }}>
                        {item.ticket || `OS ${item.os}`}
                      </td>
                      <td className="py-2 px-2 max-w-[140px] truncate">{item.cliente}</td>
                      <td className="py-2 px-2 text-muted-foreground">{item.bandeira}</td>
                      <td className="py-2 px-2 text-muted-foreground max-w-[100px] truncate">{item.sistema}</td>
                      <td className="py-2 px-2 text-muted-foreground">{item.consultor}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`inline-block rounded px-1.5 py-0.5 font-mono font-bold text-[11px] ${
                          item.diasAberto > 30 ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                          : item.diasAberto > 10 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground'
                        }`}>{item.diasAberto}d</span>
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

// ── Bloco de um segmento ──────────────────────────────────────────────

function SegmentoBlock({ cfg, seg, isLoading }: {
  cfg: SegConfig; seg?: BICustomerSegmento; isLoading: boolean;
}) {
  const [detail, setDetail] = useState<{ tipo: TipoChamado; diasMin: number } | null>(null);
  function toggle(tipo: TipoChamado, diasMin: number) {
    setDetail(p => p?.tipo === tipo && p.diasMin === diasMin ? null : { tipo, diasMin });
  }

  const ma = seg?.mesAtual;
  const mp = seg?.mesAnterior;
  const ab = seg?.abertos;
  const mt = seg?.metricas;

  const totalAbertos = ab ? ab.incAberto + ab.prbAberto + ab.ritmAberto : 0;
  const donutAbertos = ab ? [
    { name: 'INC',  value: ab.incAberto,  color: TIPO.INC.color  },
    { name: 'PRB',  value: ab.prbAberto,  color: TIPO.PRB.color  },
    { name: 'RITM', value: ab.ritmAberto, color: TIPO.RITM.color },
  ] : [];

  function tipoVals(t: TipoChamado) {
    const key = t.toLowerCase() as 'inc' | 'prb' | 'ritm';
    return {
      mes:      ma?.[key] ?? 0,
      mesPrev:  mp?.[key] ?? 0,
      aberto:   ab?.[t === 'INC' ? 'incAberto' : t === 'PRB' ? 'prbAberto' : 'ritmAberto'] ?? 0,
      aging:    ab?.[t === 'INC' ? 'inc5Dias' : t === 'PRB' ? 'prb10Dias' : 'ritm30Dias'] ?? 0,
    };
  }

  const HeaderIcon = cfg.Icon;

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
      {/* Cabeçalho do segmento */}
      <div className="flex items-center gap-2">
        <HeaderIcon className="h-5 w-5 text-primary" />
        <h2 className="text-base font-bold tracking-tight uppercase">{cfg.titulo}</h2>
        <span className="text-[11px] text-muted-foreground ml-1">unidade: {cfg.unidadeLabel}</span>
      </div>

      {/* Resumo topo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
          : [
              { label: cfg.totalLabel, value: ma?.total ?? '—', sub: <DeltaBadge curr={ma?.total ?? 0} prev={mp?.total ?? 0} /> },
              { label: 'Mês Anterior', value: mp?.total ?? '—', sub: <span className="text-[11px] text-muted-foreground">meta</span> },
              {
                label: 'Tempo Médio',
                value: mt ? `${mt.ttrMedioDias.toFixed(2)}d` : '—',
                sub: <span className={`text-[11px] font-medium ${mt && mt.ttrMedioDias <= META_TTR_DIAS ? 'text-emerald-500' : 'text-amber-500'}`}>meta ≤ {META_TTR_DIAS}d</span>,
              },
              {
                label: '% em 24h',
                value: mt ? `${mt.pctEncerrados24h.toFixed(0)}%` : '—',
                sub: (
                  <span className={`text-[11px] font-medium inline-flex items-center gap-1 ${mt && mt.pctEncerrados24h >= META_24H_PCT ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {mt && mt.pctEncerrados24h >= META_24H_PCT
                      ? <CheckCircle2 className="h-3 w-3" />
                      : <AlertTriangle className="h-3 w-3" />}
                    meta ≥ {META_24H_PCT}%
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

      {/* Cards INC / PRB / RITM */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(['INC', 'PRB', 'RITM'] as TipoChamado[]).map(tipo => {
          const tc = TIPO[tipo];
          const v = tipoVals(tipo);
          const activeAbertos = detail?.tipo === tipo && detail.diasMin === 0;
          const activeAging   = detail?.tipo === tipo && detail.diasMin === tc.agingDias;
          return (
            <div key={tipo} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 flex items-center justify-between"
                   style={{ background: `${tc.color}15`, borderBottom: `1px solid ${tc.color}30` }}>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ background: tc.color }} />
                  <span className="font-semibold text-sm">{tc.label}</span>
                </div>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: `${tc.color}20`, color: tc.color }}>{tipo}</span>
              </div>
              <div className="px-4 py-3 space-y-3">
                {isLoading ? <Skeleton className="h-24 w-full" /> : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">No mês</p>
                        <p className="text-2xl font-bold font-mono leading-none">{v.mes}</p>
                        <DeltaBadge curr={v.mes} prev={v.mesPrev} />
                        <ProgressBar value={v.mes} max={Math.max(ma?.total ?? 1, 1)} color={tc.color} />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">Mês ant.</p>
                        <p className="text-2xl font-bold font-mono leading-none text-muted-foreground">{v.mesPrev}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button onClick={() => toggle(tipo, 0)}
                        className={`group rounded-lg border px-3 py-2 text-left transition-all ${activeAbertos ? 'border-blue-500/60 bg-blue-500/10' : 'border-border hover:border-primary/40 hover:bg-muted/40'}`}>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Em aberto</p>
                        <div className="flex items-end justify-between mt-1">
                          <span className="text-xl font-bold font-mono" style={{ color: tc.color }}>{v.aberto}</span>
                          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform ${activeAbertos ? 'rotate-90' : ''}`} />
                        </div>
                      </button>
                      <button onClick={() => toggle(tipo, tc.agingDias)}
                        className={`group rounded-lg border px-3 py-2 text-left transition-all ${activeAging ? 'border-amber-500/60 bg-amber-500/10' : 'border-border hover:border-amber-500/40 hover:bg-amber-500/5'}`}>
                        <p className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 font-medium">Aging</p>
                        <div className="flex items-end justify-between mt-1">
                          <span className={`text-xl font-bold font-mono ${v.aging > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>{v.aging}</span>
                          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform ${activeAging ? 'rotate-90' : ''}`} />
                        </div>
                        <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mt-0.5">{tc.agingLabel}</p>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drill-through */}
      {detail && (
        <DetalheTable segmento={cfg.key} tipo={detail.tipo} diasMin={detail.diasMin} onClose={() => setDetail(null)} />
      )}

      {/* Donut abertos */}
      <Card>
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Distribuição — Em Aberto</CardTitle>
          {!isLoading && ab && <p className="text-xs text-muted-foreground">{totalAbertos} {cfg.unidadeLabel.toLowerCase()} em aberto</p>}
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          {isLoading ? <Skeleton className="h-40 w-full" /> : (
            <div className="flex items-center gap-4">
              <div className="h-40 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutAbertos} cx="50%" cy="50%" innerRadius={44} outerRadius={64} paddingAngle={3} dataKey="value">
                      {donutAbertos.map(e => <Cell key={e.name} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(val: number, n: string) => [val, n]} />
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
    </div>
  );
}

// ── Painel principal ──────────────────────────────────────────────────

export function BICustomerPanel() {
  const { data, isLoading, isError, refetch } = useBICustomerKpis();

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {SEGMENTOS.map(cfg => (
        <SegmentoBlock key={cfg.key} cfg={cfg} seg={data?.[cfg.key]} isLoading={isLoading} />
      ))}
    </div>
  );
}
