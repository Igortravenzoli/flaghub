import { useGestaoSlaFlag, useGestaoSlaNestle, GestaoSlaResponse } from '@/hooks/useGestaoKpis';
import { isMockMode } from '@/services/gatewayService';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle, Clock, Timer, XCircle } from 'lucide-react';

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

function SlaCard({ data, title, isLoading, isError, refetch }: {
  data: GestaoSlaResponse | undefined;
  title: string;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}) {
  if (isError) return <DashboardEmptyState variant="error" onRetry={refetch} />;

  const borderColor = data?.status?.ttr === 'CRITICAL' || data?.status?.pct24h === 'CRITICAL'
    ? 'border-l-destructive'
    : data?.status?.ttr === 'ALERT' || data?.status?.pct24h === 'ALERT'
    ? 'border-l-amber-500'
    : 'border-l-emerald-500';

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

      {/* Metas */}
      {!isLoading && data && (
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Meta TTR: <strong>{data.metas.metaTTRDias} dias</strong></span>
          <span>Meta 24h: <strong>{data.metas.metaTTR24hPct}%</strong></span>
        </div>
      )}

      {/* KPIs grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
        ) : data ? (
          <>
            {/* Abertas */}
            <div className="p-3 rounded-lg bg-muted/40 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">OS Abertas</p>
              <p className="text-2xl font-bold font-mono">{data.kpis.totalAbertos}</p>
            </div>

            <div className={`p-3 rounded-lg bg-muted/40 space-y-1`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
                <Clock className="h-3 w-3" /> TTR Médio (Abertas)
              </p>
              <p className={`text-2xl font-bold font-mono ${statusColor(data.status?.ttr)}`}>
                {data.kpis.ttrMedioAbertoDias.toFixed(1)}d
              </p>
              <p className="text-[10px] text-muted-foreground">meta: {data.metas.metaTTRDias}d</p>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Abertas &gt; 5 dias</p>
              <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                {data.kpis.abertos5Dias}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Abertas &gt; 30 dias</p>
              <p className="text-2xl font-bold font-mono text-destructive">
                {data.kpis.abertos30Dias}
              </p>
            </div>

            {/* Fechadas */}
            <div className="p-3 rounded-lg bg-muted/40 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Fechadas (60d)</p>
              <p className="text-2xl font-bold font-mono">{data.kpis.totalFechados60Dias}</p>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
                <Timer className="h-3 w-3" /> TTR Médio (Fechadas)
              </p>
              <p className={`text-2xl font-bold font-mono ${statusColor(data.status?.ttr)}`}>
                {data.kpis.ttrMedioFechadoDias.toFixed(1)}d
              </p>
            </div>

            <div className={`p-3 rounded-lg bg-muted/40 space-y-1 col-span-2`}>
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

export function GestaoSlaPanel() {
  const flag = useGestaoSlaFlag();
  const nestle = useGestaoSlaNestle();

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
        TTR ≤ 3,9 dias · Encerramento em 24h ≥ 48%.
      </p>
      <div className="grid grid-cols-1 gap-4">
        <SlaCard
          title="SLA Flag — OS Pendentes"
          data={flag.data}
          isLoading={flag.isLoading}
          isError={flag.isError}
          refetch={() => flag.refetch()}
        />
        <SlaCard
          title="SLA Nestlé — INC / RITM"
          data={nestle.data}
          isLoading={nestle.isLoading}
          isError={nestle.isError}
          refetch={() => nestle.refetch()}
        />
      </div>
    </div>
  );
}
