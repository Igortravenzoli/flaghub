import { useMemo } from 'react';
import { useCustomerServiceKpis } from '@/hooks/useCustomerServiceKpis';
import { Clock, Package } from 'lucide-react';
import {
  KioskHeroCard, KioskSupportCard, KioskAlertBanner,
  KioskSectionLabel, KioskFooter, KioskItemList, KioskDonut,
} from './KioskPrimitives';

export default function CustomerServiceKiosk() {
  const kpis = useCustomerServiceKpis();
  const { totalFilaCS, implAndamento, implFinalizadas, devopsItems, lastSync, isLoading } = kpis;

  // Aging: items > 30 days old
  const agingItems = useMemo(() => devopsItems.filter(i => {
    if (!i.created_date) return false;
    const days = (Date.now() - new Date(i.created_date).getTime()) / 86400000;
    return days > 30;
  }), [devopsItems]);

  // Product distribution
  const prodMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of devopsItems) {
      const p = (item as any).product || 'Sem Produto';
      map[p] = (map[p] || 0) + 1;
    }
    return map;
  }, [devopsItems]);

  const prodSegments = useMemo(() =>
    Object.entries(prodMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ label, value ], i) => ({
        value,
        label,
        color: ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444'][i] || '#64748b',
      })),
    [prodMap]
  );

  if (isLoading) return <div className="text-slate-500 text-center py-20 text-lg animate-pulse">Carregando Customer Service…</div>;

  const alerts: { msg: string; type: 'critical' | 'warning' }[] = [];
  if (agingItems.length > 0) alerts.push({ msg: `${agingItems.length} item(ns) com mais de 30 dias na fila`, type: 'critical' });

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Hero */}
      <div className="grid grid-cols-3 gap-4">
        <KioskHeroCard label="Fila CS" value={totalFilaCS} borderColor="border-blue-500/40" glowColor="#3b82f6" />
        <KioskHeroCard label="Implantações Ativas" value={implAndamento} borderColor="border-purple-500/40" glowColor="#a855f7" delay={80} />
        <KioskHeroCard label="Finalizadas" value={implFinalizadas} borderColor="border-emerald-500/40" glowColor="#10b981" delay={160} />
      </div>

      {/* Supporting */}
      <KioskSectionLabel>Métricas de Suporte</KioskSectionLabel>
      <div className="grid grid-cols-3 gap-3">
        <KioskSupportCard
          label="Aging (+30d)" value={agingItems.length}
          borderColor={agingItems.length > 0 ? 'border-red-500/40' : 'border-slate-700/50'}
          alert={agingItems.length > 0}
        />
        <KioskSupportCard label="Itens DevOps" value={devopsItems.length} borderColor="border-slate-700/50" delay={80} />
        <KioskSupportCard label="Produtos" value={Object.keys(prodMap).length} borderColor="border-cyan-600/40" delay={160} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Aging items list */}
        {agingItems.length > 0 && (
          <div>
            <KioskSectionLabel>Itens Envelhecidos (+30d)</KioskSectionLabel>
            <div className="mt-2">
              <KioskItemList
                items={agingItems.slice(0, 6).map(i => {
                  const days = Math.round((Date.now() - new Date(i.created_date!).getTime()) / 86400000);
                  return {
                    label: i.title || `#${i.work_item_id}`,
                    sublabel: `${days}d`,
                    icon: <Clock className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />,
                  };
                })}
                maxItems={6}
              />
            </div>
          </div>
        )}

        {/* Product distribution */}
        {prodSegments.length > 0 && (
          <div>
            <KioskSectionLabel>Distribuição por Produto</KioskSectionLabel>
            <div className="mt-3 flex justify-center">
              <KioskDonut segments={prodSegments} size={85} />
            </div>
          </div>
        )}
      </div>

      {alerts.map((a, i) => <KioskAlertBanner key={i} message={a.msg} type={a.type} />)}
      <KioskFooter lastSync={lastSync} sectorName="Customer Service" />
    </div>
  );
}
