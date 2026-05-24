import { useState } from 'react';
import {
  useGestaoSlaFlag, useGestaoSlaNestle, useGestaoSlaNestleHistorico,
  useGestaoSlaFlagDetalhe, useGestaoSlaNestleDetalhe,
  GestaoSlaResponse, GestaoSlaDetalheItem,
} from '@/hooks/useGestaoKpis';
import { isMockMode } from '@/services/gatewayService';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertTriangle, CheckCircle, Clock, Timer, XCircle, TrendingUp,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

type SlaTier = 'OK' | 'ALERT' | 'CRITICAL';

function statusColor(tier: SlaTier | undefined) {
  if (tier === 'OK') return 'text-emerald-600 dark:text-emerald-400';
  if (tier === 'ALERT') return 'text-amber-600 dark:text-amber-400';
  return 'text-destructive';
}

function StatusBadge({ tier }: { tier: SlaTier | undefined }) {
  if (tier === 'OK')
    return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1"><CheckCircle className="h-3 w-3" /> OK</Badge>;
  if (tier === 'ALERT')
    return <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1"><AlertTriangle className="h-3 w-3" /> ALERTA</Badge>;
  return <Badge className="bg-destructive/10 text-destructive border-destructive/30 gap-1"><XCircle className="h-3 w-3" /> CRÍTICO</Badge>;
}

type DrawerState = {
  tipo: 'flag' | 'nestle';
  filtro: 'aberto' | 'aberto5' | 'aberto30' | 'aberto180';
  label: string;
} | null;

function OsDetalheDrawer({ state, onClose }: { state: DrawerState; onClose: () => void }) {
  const isFlagAberto = state?.tipo === 'flag' && state.filtro === 'aberto';
  const isFlagAberto5 = state?.tipo === 'flag' && state.filtro === 'aberto5';
  const isFlagAberto30 = state?.tipo === 'flag' && state.filtro === 'aberto30';
  const isFlagAberto180 = state?.tipo === 'flag' && state.filtro === 'aberto180';
  const isNestleAberto = state?.tipo === 'nestle' && state.filtro === 'aberto';
  const isNestleAberto5 = state?.tipo === 'nestle' && state.filtro === 'aberto5';
  const isNestleAberto30 = state?.tipo === 'nestle' && state.filtro === 'aberto30';

  const flagAberto = useGestaoSlaFlagDetalhe('aberto', isFlagAberto);
  const flagAberto5 = useGestaoSlaFlagDetalhe('aberto5', isFlagAberto5);
  const flagAberto30 = useGestaoSlaFlagDetalhe('aberto30', isFlagAberto30);
  const flagAberto180 = useGestaoSlaFlagDetalhe('aberto180', isFlagAberto180);
  const nestleAberto = useGestaoSlaNestleDetalhe('aberto', isNestleAberto);
  const nestleAberto5 = useGestaoSlaNestleDetalhe('aberto5', isNestleAberto5);
  const nestleAberto30 = useGestaoSlaNestleDetalhe('aberto30', isNestleAberto30);

  const active = state
    ? (state.tipo === 'flag'
      ? (state.filtro === 'aberto' ? flagAberto
        : state.filtro === 'aberto5' ? flagAberto5
        : state.filtro === 'aberto30' ? flagAberto30
        : flagAberto180)
      : (state.filtro === 'aberto' ? nestleAberto
        : state.filtro === 'aberto5' ? nestleAberto5
        : nestleAberto30))
    : null;

  const items: GestaoSlaDetalheItem[] = active?.data?.items ?? [];
  const isLoading = active?.isLoading ?? false;

  return (
    <Sheet open={!!state} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-sm font-semibold">{state?.label ?? ''}</SheetTitle>
          {!isLoading && active?.data && (
            <p className="text-xs text-muted-foreground">{active.data.total} OS</p>
          )}
        </SheetHeader>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <DashboardEmptyState description="Nenhuma OS encontrada." />
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background border-b border-border">
                <tr className="text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">OS</th>
                  <th className="text-left px-3 py-2 font-medium">Cliente</th>
                  <th className="text-left px-3 py-2 font-medium">Sistema</th>
                  <th className="text-right px-3 py-2 font-medium">Dias</th>
                  <th className="text-left px-3 py-2 font-medium">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {items.map((os) => (
                  <tr key={os.os} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono">{os.os}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate">{os.apelido}</td>
                    <td className="px-3 py-2 max-w-[120px] truncate text-muted-foreground">{os.sistema ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      <span className={os.diasAberto > 30 ? 'text-destructive font-bold' : os.diasAberto > 5 ? 'text-amber-600 dark:text-amber-400' : ''}>
                        {os.diasAberto}d
                      </span>
                      {os.desvioLancamento && (
                        <Badge className="ml-1 bg-destructive/10 text-destructive border-destructive/30 text-[9px] px-1 py-0">desvio</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground font-mono">{os.ticket ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function KpiCell({
  label, value, colorClass, onClick, isClickable = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  colorClass?: string;
  onClick?: () => void;
  isClickable?: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-lg bg-muted/40 space-y-1 ${isClickable ? 'cursor-pointer hover:bg-muted/60 transition-colors' : ''}`}
      onClick={onClick}
    >
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${colorClass ?? ''}`}>{value}</p>
    </div>
  );
}

function SlaCard({ data, title, tipo, isLoading, isError, refetch, onKpiClick }: {
  data: GestaoSlaResponse | undefined;
  title: string;
  tipo: 'flag' | 'nestle';
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  onKpiClick: (state: DrawerState) => void;
}) {
  if (isError) return <DashboardEmptyState variant="error" onRetry={refetch} />;

  const borderColor = data?.status?.ttr === 'CRITICAL' || data?.status?.pct24h === 'CRITICAL'
    ? 'border-l-destructive'
    : data?.status?.ttr === 'ALERT' || data?.status?.pct24h === 'ALERT'
    ? 'border-l-amber-500'
    : 'border-l-emerald-500';

  const maxFiltro = tipo === 'flag' ? 'aberto180' as const : 'aberto30' as const;

  return (
    <Card className={`p-5 border-l-4 ${borderColor} space-y-4`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
          {isLoading ? (
            <Skeleton className="h-5 w-32 mt-1" />
          ) : data?.dataReferencia ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              Referência: {new Date(data.dataReferencia).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          ) : null}
        </div>
        {!isLoading && data && (
          <div className="flex gap-2">
            <StatusBadge tier={data.status?.ttr} />
            <StatusBadge tier={data.status?.pct24h} />
          </div>
        )}
      </div>

      {!isLoading && data && (
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Meta TTR: <strong>{data.metas.metaTTRDias} dias</strong></span>
          <span>Meta 24h: <strong>{data.metas.metaTTR24hPct}%</strong></span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: tipo === 'flag' ? 9 : 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
        ) : data ? (
          <>
            <KpiCell
              label="OS Abertas"
              value={data.kpis.totalAbertos}
              isClickable
              onClick={() => onKpiClick({ tipo, filtro: 'aberto', label: `${title} — Todas abertas` })}
            />

            <KpiCell
              label={<><Clock className="h-3 w-3" /> TTR Médio (Abertas)</>}
              value={`${data.kpis.ttrMedioAbertoDias.toFixed(1)}d`}
              colorClass={statusColor(data.status?.ttr)}
            />

            <KpiCell
              label="Abertas > 5 dias"
              value={data.kpis.abertos5Dias}
              colorClass="text-amber-600 dark:text-amber-400"
              isClickable
              onClick={() => onKpiClick({ tipo, filtro: 'aberto5', label: `${title} — Abertas > 5 dias` })}
            />

            <KpiCell
              label="Abertas > 30 dias"
              value={data.kpis.abertos30Dias}
              colorClass="text-destructive"
              isClickable
              onClick={() => onKpiClick({ tipo, filtro: 'aberto30', label: `${title} — Abertas > 30 dias` })}
            />

            {tipo === 'flag' && (
              <KpiCell
                label="Desvio Lançamento (>180d)"
                value={data.kpis.abertos180Dias}
                colorClass="text-destructive font-bold"
                isClickable
                onClick={() => onKpiClick({ tipo: 'flag', filtro: 'aberto180', label: 'SLA Flag — Desvio de Lançamento (>180 dias)' })}
              />
            )}

            <KpiCell
              label="Fechadas (60d)"
              value={data.kpis.totalFechados60Dias}
            />

            <KpiCell
              label={<><Timer className="h-3 w-3" /> TTR Médio (Fechadas)</>}
              value={`${data.kpis.ttrMedioFechadoDias.toFixed(1)}d`}
              colorClass={statusColor(data.status?.ttr)}
            />

            <div className={`p-3 rounded-lg bg-muted/40 space-y-1 ${tipo === 'flag' ? '' : 'col-span-2'}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">% Encerradas em 24h</p>
              <div className="flex items-end gap-2">
                <p className={`text-2xl font-bold font-mono ${statusColor(data.status?.pct24h)}`}>
                  {data.kpis.pctEncerrados24h.toFixed(1)}%
                </p>
                <p className="text-[10px] text-muted-foreground mb-1">meta: {data.metas.metaTTR24hPct}%</p>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, data.kpis.pctEncerrados24h)}%`,
                    background: data.status?.pct24h === 'OK' ? 'hsl(142,71%,45%)'
                      : data.status?.pct24h === 'ALERT' ? 'hsl(43,85%,46%)' : 'hsl(0,84%,60%)',
                  }}
                />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}

function NestleHistoricoChart() {
  const { data, isLoading, isError } = useGestaoSlaNestleHistorico();

  if (isLoading) return <Skeleton className="h-52 w-full" />;
  if (isError || !data?.series?.length) return null;

  const chartData = [...data.series].reverse().map((s) => ({
    mes: s.mes,
    ttrMedioDias: +s.ttrMedioDias.toFixed(2),
    pct24h: +s.pctEncerrados24h.toFixed(1),
  }));

  const metaTTR = data.metas.metaTTRDias;
  const metaPct = data.metas.metaTTR24hPct;

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">Nestlé — Histórico TTR + % 24h (13 meses)</p>
      </div>
      <p className="text-xs text-muted-foreground">TTR medido desde abertura do ticket no ServiceNow (DatChamadoB1_At)</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
        {/* TTR Médio */}
        <div>
          <p className="text-[11px] text-muted-foreground font-medium mb-2">TTR Médio (dias) — meta: {metaTTR}d</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis dataKey="mes" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                <Tooltip
                  formatter={(v: number) => [`${v}d`, 'TTR Médio']}
                  contentStyle={{ fontSize: 11 }}
                />
                <ReferenceLine y={metaTTR} stroke="hsl(142,71%,45%)" strokeDasharray="4 2" label={{ value: `meta ${metaTTR}d`, fontSize: 9, fill: 'hsl(142,71%,45%)' }} />
                <Line
                  type="monotone"
                  dataKey="ttrMedioDias"
                  stroke="hsl(0,84%,60%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  name="TTR Médio"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* % 24h */}
        <div>
          <p className="text-[11px] text-muted-foreground font-medium mb-2">% Encerradas em 24h — meta: {metaPct}%</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis dataKey="mes" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                <Tooltip
                  formatter={(v: number) => [`${v}%`, '% 24h']}
                  contentStyle={{ fontSize: 11 }}
                />
                <ReferenceLine y={metaPct} stroke="hsl(142,71%,45%)" strokeDasharray="4 2" label={{ value: `meta ${metaPct}%`, fontSize: 9, fill: 'hsl(142,71%,45%)' }} />
                <Line
                  type="monotone"
                  dataKey="pct24h"
                  stroke="hsl(199,89%,48%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  name="% 24h"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function GestaoSlaPanel() {
  const flag = useGestaoSlaFlag();
  const nestle = useGestaoSlaNestle();
  const [drawer, setDrawer] = useState<DrawerState>(null);

  return (
    <div className="space-y-4 py-2">
      {isMockMode && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          <span className="font-semibold">MOCK</span>
          <span>Dados simulados — conecte o backend para dados reais do VDESK.</span>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {isMockMode ? 'Metas benchmark 2025: ' : 'Dados em tempo real via VDESK. Metas: '}
        TTR ≤ 3,9 dias · Encerramento em 24h ≥ 48%. Clique nos KPIs para ver o detalhe das OS.
      </p>
      <div className="grid grid-cols-1 gap-4">
        <SlaCard
          title="SLA Flag — OS Pendentes"
          tipo="flag"
          data={flag.data}
          isLoading={flag.isLoading}
          isError={flag.isError}
          refetch={() => flag.refetch()}
          onKpiClick={setDrawer}
        />
        <SlaCard
          title="SLA Nestlé — INC / RITM"
          tipo="nestle"
          data={nestle.data}
          isLoading={nestle.isLoading}
          isError={nestle.isError}
          refetch={() => nestle.refetch()}
          onKpiClick={setDrawer}
        />
      </div>

      <NestleHistoricoChart />

      <OsDetalheDrawer state={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
