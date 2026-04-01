import { useComercialKpis } from '@/hooks/useComercialKpis';
import { useComercialMovimentacao, useComercialPesquisa } from '@/hooks/useComercialMovimentacao';
import {
  KioskHeroCard, KioskSupportCard, KioskBadge, KioskAlertBanner,
  KioskSectionLabel, KioskFooter,
} from './KioskPrimitives';

export default function ComercialKiosk() {
  const { stats, lastSync, isLoading } = useComercialKpis();
  const { stats: movStats, isLoading: movLoading } = useComercialMovimentacao('todos');
  const { stats: pesqStats, isLoading: pesqLoading } = useComercialPesquisa();

  const loading = isLoading || movLoading || pesqLoading;
  if (loading) return <div className="text-slate-500 text-center py-20 text-lg">Carregando Comercial…</div>;

  const bloqueadoPct = stats.total > 0 ? Math.round((stats.bloqueados / stats.total) * 100) : 0;

  const alerts: { msg: string; type: 'critical' | 'warning' }[] = [];
  if (bloqueadoPct > 5) alerts.push({ msg: `🚨 Bloqueados: ${stats.bloqueados} (${bloqueadoPct}% do total)`, type: 'critical' });

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="grid grid-cols-3 gap-4">
        <KioskHeroCard label="Clientes Ativos" value={stats.ativos} borderColor="border-emerald-500" />
        <KioskHeroCard
          label="Movimentação Líquida"
          value={movStats.saldoClientes >= 0 ? `+${movStats.saldoClientes}` : `${movStats.saldoClientes}`}
          trend={movStats.saldoClientes > 0 ? 'up' : movStats.saldoClientes < 0 ? 'down' : 'flat'}
          borderColor={movStats.saldoClientes >= 0 ? 'border-emerald-500' : 'border-red-500'}
          delay={80}
        />
        <KioskHeroCard label="Total Clientes" value={stats.total} borderColor="border-slate-500" delay={160} />
      </div>

      <KioskSectionLabel>Métricas de Suporte</KioskSectionLabel>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        <KioskSupportCard
          label="Bloqueados"
          value={stats.bloqueados}
          borderColor={bloqueadoPct > 5 ? 'border-red-500' : 'border-slate-700'}
          alert={bloqueadoPct > 5}
        />
        <KioskSupportCard
          label="Pesquisa Satisfação"
          value={pesqStats.mediaGeral ?? '—'}
          borderColor="border-cyan-600"
          badge={pesqStats.mediaGeral != null ? <KioskBadge variant={pesqStats.mediaGeral >= 8 ? 'healthy' : pesqStats.mediaGeral >= 6 ? 'warning' : 'critical'}>{pesqStats.total} resp.</KioskBadge> : undefined}
          delay={80}
        />
        <KioskSupportCard label="Inativos" value={stats.inativos} borderColor="border-yellow-600" delay={160} />
      </div>

      <KioskSectionLabel>Movimentação</KioskSectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <KioskSupportCard label="Ganhos" value={movStats.totalGanhos} borderColor="border-emerald-500" />
        <KioskSupportCard label="Perdas" value={movStats.totalPerdas} borderColor="border-red-500" delay={80} />
      </div>

      {alerts.map((a, i) => <KioskAlertBanner key={i} message={a.msg} type={a.type} />)}
      <KioskFooter lastSync={lastSync} sectorName="Comercial" />
    </div>
  );
}
