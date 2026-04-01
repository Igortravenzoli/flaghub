import { useComercialKpis } from '@/hooks/useComercialKpis';
import { useComercialMovimentacao, useComercialPesquisa } from '@/hooks/useComercialMovimentacao';
import { useComercialVendas } from '@/hooks/useComercialVendas';
import { AlertTriangle } from 'lucide-react';
import {
  KioskHeroCard, KioskSupportCard, KioskBadge, KioskAlertBanner,
  KioskSectionLabel, KioskFooter, KioskBarChart, KioskItemList,
} from './KioskPrimitives';

export default function ComercialKiosk() {
  const { stats, lastSync, isLoading } = useComercialKpis();
  const { stats: movStats, items: movItems, isLoading: movLoading } = useComercialMovimentacao('todos');
  const { stats: pesqStats, isLoading: pesqLoading } = useComercialPesquisa();
  const { stats: vendasStats, isLoading: vendasLoading } = useComercialVendas();

  const loading = isLoading || movLoading || pesqLoading || vendasLoading;
  if (loading) return <div className="text-slate-500 text-center py-20 text-lg animate-pulse">Carregando Comercial…</div>;

  const bloqueadoPct = stats.total > 0 ? Math.round((stats.bloqueados / stats.total) * 100) : 0;

  // Bloqueados list
  const recentPerdas = movItems.filter(i => i.tipo === 'perda').slice(0, 5);

  const alerts: { msg: string; type: 'critical' | 'warning' }[] = [];
  if (bloqueadoPct > 5) alerts.push({ msg: `Bloqueados: ${stats.bloqueados} (${bloqueadoPct}% do total)`, type: 'critical' });

  // Vendas bars
  const vendasBars = vendasStats.vendasPorOrg.slice(0, 5).map(v => ({
    label: v.bandeira,
    value: v.percentual,
    color: '#06b6d4',
  }));

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Hero — no "Total Clientes" */}
      <div className="grid grid-cols-3 gap-4">
        <KioskHeroCard label="Clientes Ativos" value={stats.ativos} borderColor="border-emerald-500/40" glowColor="#10b981" />
        <KioskHeroCard
          label="Movimentação Líquida"
          value={movStats.saldoClientes >= 0 ? `+${movStats.saldoClientes}` : `${movStats.saldoClientes}`}
          trend={movStats.saldoClientes > 0 ? 'up' : movStats.saldoClientes < 0 ? 'down' : 'flat'}
          borderColor={movStats.saldoClientes >= 0 ? 'border-emerald-500/40' : 'border-red-500/40'}
          glowColor={movStats.saldoClientes >= 0 ? '#10b981' : '#ef4444'}
          delay={80}
        />
        <KioskHeroCard
          label="Vendas"
          value={vendasStats.totalDeals}
          suffix="deals"
          borderColor="border-cyan-500/40"
          glowColor="#06b6d4"
          delay={160}
        />
      </div>

      {/* Supporting */}
      <KioskSectionLabel>Métricas de Suporte</KioskSectionLabel>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        <KioskSupportCard
          label="Bloqueados" value={stats.bloqueados}
          borderColor={bloqueadoPct > 5 ? 'border-red-500/40' : 'border-slate-700/50'}
          alert={bloqueadoPct > 5}
        />
        <KioskSupportCard
          label="Satisfação" value={pesqStats.mediaGeral ?? '—'}
          borderColor="border-cyan-600/40"
          badge={pesqStats.mediaGeral != null ? <KioskBadge variant={pesqStats.mediaGeral >= 8 ? 'healthy' : pesqStats.mediaGeral >= 6 ? 'warning' : 'critical'}>{pesqStats.total} resp.</KioskBadge> : undefined}
          delay={80}
        />
        <KioskSupportCard label="Inativos" value={stats.inativos} borderColor="border-amber-600/40" delay={160} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Ganhos vs Perdas */}
        <div>
          <KioskSectionLabel>Movimentação</KioskSectionLabel>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <KioskSupportCard label="Ganhos" value={movStats.totalGanhos} borderColor="border-emerald-500/40" />
            <KioskSupportCard label="Perdas" value={movStats.totalPerdas} borderColor="border-red-500/40" />
          </div>
          {recentPerdas.length > 0 && (
            <div className="mt-2">
              <KioskItemList
                items={recentPerdas.map(p => ({
                  label: p.cliente_nome || `Cod ${p.cliente_codigo}`,
                  sublabel: p.motivo || 'Sem motivo',
                  icon: <AlertTriangle className="h-3 w-3 text-red-400 flex-shrink-0" />,
                }))}
                maxItems={4}
                emptyText="Sem perdas recentes"
              />
            </div>
          )}
        </div>

        {/* Vendas por Org */}
        {vendasBars.length > 0 && (
          <div>
            <KioskSectionLabel>Vendas por Organização</KioskSectionLabel>
            <div className="mt-2">
              <KioskBarChart items={vendasBars} maxBars={5} />
            </div>
          </div>
        )}
      </div>

      {alerts.map((a, i) => <KioskAlertBanner key={i} message={a.msg} type={a.type} />)}
      <KioskFooter lastSync={lastSync} sectorName="Comercial" />
    </div>
  );
}
