import { useCustomerServiceKpis } from '@/hooks/useCustomerServiceKpis';
import {
  KioskHeroCard, KioskSupportCard, KioskAlertBanner,
  KioskSectionLabel, KioskFooter,
} from './KioskPrimitives';

export default function CustomerServiceKiosk() {
  const kpis = useCustomerServiceKpis();
  const { totalFilaCS, implAndamento, implFinalizadas, devopsItems, lastSync, isLoading } = kpis;

  // Aging: items > 30 days old
  const agingItems = devopsItems.filter(i => {
    if (!i.created_date) return false;
    const days = (Date.now() - new Date(i.created_date).getTime()) / 86400000;
    return days > 30;
  });

  // Product distribution
  const prodMap: Record<string, number> = {};
  for (const item of devopsItems) {
    const p = (item as any).product || 'Sem Produto';
    prodMap[p] = (prodMap[p] || 0) + 1;
  }

  if (isLoading) return <div className="text-slate-500 text-center py-20 text-lg">Carregando Customer Service…</div>;

  const alerts: { msg: string; type: 'critical' | 'warning' }[] = [];
  if (agingItems.length > 0) alerts.push({ msg: `🚨 ${agingItems.length} item(ns) com mais de 30 dias na fila`, type: 'critical' });

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="grid grid-cols-3 gap-4">
        <KioskHeroCard label="Fila CS" value={totalFilaCS} borderColor="border-blue-500" />
        <KioskHeroCard label="Implantações Ativas" value={implAndamento} borderColor="border-purple-500" delay={80} />
        <KioskHeroCard label="Finalizadas" value={implFinalizadas} borderColor="border-emerald-500" delay={160} />
      </div>

      <KioskSectionLabel>Métricas de Suporte</KioskSectionLabel>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        <KioskSupportCard
          label="Aging (+30d)"
          value={agingItems.length}
          borderColor={agingItems.length > 0 ? 'border-red-500' : 'border-slate-700'}
          alert={agingItems.length > 0}
        />
        <KioskSupportCard label="Itens DevOps" value={devopsItems.length} borderColor="border-slate-700" delay={80} />
        <KioskSupportCard label="Produtos" value={Object.keys(prodMap).length} borderColor="border-cyan-600" delay={160} />
      </div>

      {alerts.map((a, i) => <KioskAlertBanner key={i} message={a.msg} type={a.type} />)}
      <KioskFooter lastSync={lastSync} sectorName="Customer Service" />
    </div>
  );
}
