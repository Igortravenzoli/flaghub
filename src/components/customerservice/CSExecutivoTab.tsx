import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip,
} from 'recharts';
import { Inbox, Rocket, Target, AlertTriangle, HeartPulse, Package } from 'lucide-react';
import { BlocoCard, corMetaHigh } from '@/components/executivo/BlocoCard';
import { usePbiHealthBatch } from '@/hooks/usePbiHealthBatch';
import type { CSKpiItem } from '@/hooks/useCustomerServiceKpis';

interface CSExecutivoTabProps {
  kpis: { totalFilaCS: number; implAndamento: number; implFinalizadas: number; implTotal: number; isLoading: boolean };
  aprovacaoCSCount: number;
  customerServiceCount: number;
  inBacklogCount: number;
  alertCounts: { total: number; critical: number; warning: number };
  devopsItems: CSKpiItem[];
  periodLabel?: string;
}

const PBI_TYPES = new Set(['Product Backlog Item', 'User Story', 'Bug']);

export function CSExecutivoTab({
  kpis, aprovacaoCSCount, customerServiceCount, inBacklogCount, alertCounts, devopsItems, periodLabel,
}: CSExecutivoTabProps) {
  const healthIds = useMemo(
    () => devopsItems.filter(i => i.work_item_id && PBI_TYPES.has(i.work_item_type || '')).map(i => i.work_item_id as number),
    [devopsItems]
  );
  const pbiHealth = usePbiHealthBatch(healthIds, healthIds.length > 0);

  // Meta derivada: % da fila sem alerta de atraso
  const semAlerta = Math.max(0, kpis.totalFilaCS - alertCounts.total);
  const pctNoPrazo = kpis.totalFilaCS > 0 ? Math.round((semAlerta / kpis.totalFilaCS) * 100) : 100;

  const implPct = kpis.implTotal > 0 ? Math.round((kpis.implFinalizadas / kpis.implTotal) * 100) : 0;

  const topProdutos = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of devopsItems) {
      const p = i.product?.trim();
      if (!p) continue;
      map.set(p, (map.get(p) ?? 0) + 1);
    }
    return [...map.entries()].map(([produto, n]) => ({ produto, n })).sort((a, b) => b.n - a.n).slice(0, 6);
  }, [devopsItems]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Visão Executiva</h2>
        <p className="text-sm text-muted-foreground">
          Customer Service · onde estamos · o que queremos · de onde viemos {periodLabel ? `· ${periodLabel}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Onde estamos — Fila CS */}
        <BlocoCard icon={Inbox} titulo="Onde estamos · Fila CS">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold font-mono">{kpis.isLoading ? '—' : kpis.totalFilaCS}</p>
              <p className="text-xs text-muted-foreground mt-0.5">itens na fila</p>
            </div>
          </div>
          {kpis.totalFilaCS > 0 && (
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div style={{ width: `${(aprovacaoCSCount / kpis.totalFilaCS) * 100}%`, backgroundColor: 'hsl(199,89%,48%)' }} />
              <div style={{ width: `${(customerServiceCount / kpis.totalFilaCS) * 100}%`, backgroundColor: 'hsl(174,58%,40%)' }} />
              <div style={{ width: `${(inBacklogCount / kpis.totalFilaCS) * 100}%`, backgroundColor: 'hsl(262,83%,58%)' }} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 border-t pt-2 text-center">
            <div><p className="text-lg font-bold font-mono text-[hsl(199,89%,48%)]">{aprovacaoCSCount}</p><p className="text-[11px] text-muted-foreground">aprovação CS</p></div>
            <div><p className="text-lg font-bold font-mono text-[hsl(174,58%,40%)]">{customerServiceCount}</p><p className="text-[11px] text-muted-foreground">customer service</p></div>
            <div><p className="text-lg font-bold font-mono text-[hsl(262,83%,58%)]">{inBacklogCount}</p><p className="text-[11px] text-muted-foreground">no backlog</p></div>
          </div>
        </BlocoCard>

        {/* Onde estamos — Implantações */}
        <BlocoCard icon={Rocket} titulo="Onde estamos · Implantações">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold font-mono text-[hsl(43,85%,40%)]">{kpis.isLoading ? '—' : kpis.implAndamento}</p>
              <p className="text-xs text-muted-foreground mt-0.5">em andamento</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono text-[hsl(142,71%,40%)]">{kpis.implFinalizadas}</p>
              <p className="text-[11px] text-muted-foreground">finalizadas · {kpis.implTotal} total</p>
            </div>
          </div>
          {kpis.implTotal > 0 && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${implPct}%`, backgroundColor: 'hsl(142,71%,45%)' }} />
            </div>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2">{implPct}% das implantações do período finalizadas.</p>
        </BlocoCard>

        {/* Meta — Fila sem atraso */}
        <BlocoCard icon={Target} titulo="O que queremos · Fila sem atraso">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold font-mono" style={{ color: corMetaHigh(pctNoPrazo) }}>
                {kpis.isLoading ? '—' : `${pctNoPrazo}%`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">da fila sem alerta de atraso</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono" style={{ color: alertCounts.total > 0 ? '#ef4444' : '#16a34a' }}>{alertCounts.total}</p>
              <p className="text-[11px] text-muted-foreground">em atraso</p>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pctNoPrazo}%`, backgroundColor: corMetaHigh(pctNoPrazo) }} />
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">Meta: manter a fila sem itens em atraso (aging fora do SLA).</p>
        </BlocoCard>

        {/* Alertas & aging */}
        <BlocoCard icon={AlertTriangle} titulo="Alertas de atraso">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-destructive/10 py-1">
              <p className="text-3xl font-bold font-mono text-destructive">{alertCounts.critical}</p>
              <p className="text-[11px] text-destructive font-medium">críticos</p>
            </div>
            <div className="rounded-lg bg-amber-500/10 py-1">
              <p className="text-3xl font-bold font-mono text-amber-600 dark:text-amber-400">{alertCounts.warning}</p>
              <p className="text-[11px] text-muted-foreground">atenção</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">Itens fora do SLA de permanência na fila (aging).</p>
        </BlocoCard>

        {/* Saúde da esteira */}
        <BlocoCard icon={HeartPulse} titulo="Saúde da esteira">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-3xl font-bold font-mono text-[hsl(142,71%,45%)]">{pbiHealth.isLoading ? '—' : pbiHealth.overview.verde}</p>
              <p className="text-[11px] text-muted-foreground">saudável</p>
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-amber-500">{pbiHealth.isLoading ? '—' : pbiHealth.overview.amarelo}</p>
              <p className="text-[11px] text-muted-foreground">atenção</p>
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-destructive">{pbiHealth.isLoading ? '—' : pbiHealth.overview.vermelho}</p>
              <p className="text-[11px] text-muted-foreground">crítico</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">{pbiHealth.overview.total} PBIs monitorados na esteira de CS.</p>
        </BlocoCard>

        {/* De onde viemos — Produtos na fila */}
        <BlocoCard icon={Package} titulo="Produtos na fila">
          {topProdutos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sem produto identificado nos itens.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(150, topProdutos.length * 26)}>
              <BarChart data={topProdutos} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="produto" width={92} tick={{ fontSize: 11 }} />
                <RTooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="n" fill="hsl(199,89%,48%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2">Distribuição da fila por sistema/produto.</p>
        </BlocoCard>
      </div>
    </div>
  );
}
