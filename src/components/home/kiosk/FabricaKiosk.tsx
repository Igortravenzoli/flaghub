import { useMemo } from 'react';
import { useFabricaKpis } from '@/hooks/useFabricaKpis';
import { usePbiHealthBatch } from '@/hooks/usePbiHealthBatch';
import {
  KioskHeroCard, KioskSupportCard, KioskBadge, KioskAlertBanner,
  KioskBarChart, KioskSectionLabel, KioskFooter,
} from './KioskPrimitives';

export default function FabricaKiosk() {
  const kpis = useFabricaKpis(undefined, undefined, 'all', { includeTimeLogs: true });
  const {
    kpiItems, total, inProgress, toDo, done, items,
    realOverflowItemCount, realOverflowPct, leadTimeMedio,
    currentSprint, sortedSprints, lastSync, isLoading,
  } = kpis;

  const ids = useMemo(() => (items || []).map(i => i.id).filter((id): id is number => id != null), [items]);
  const health = usePbiHealthBatch(ids);

  // Aviões
  const avioes = useMemo(() => (items || []).filter(i => (i.tags || '').toUpperCase().includes('AVIAO')).length, [items]);
  // Aguardando teste
  const aguardandoTeste = useMemo(() => (items || []).filter(i => i.state === 'Aguardando Teste').length, [items]);

  // Distribution bars
  const distBars = useMemo(() => [
    { label: 'To Do', value: toDo, color: '#94a3b8' },
    { label: 'In Progress', value: inProgress, color: '#3b82f6' },
    { label: 'Done', value: done, color: '#10b981' },
  ], [toDo, inProgress, done]);

  // Sprint remaining days
  const sprintLabel = currentSprint ? currentSprint.split('\\').pop() || currentSprint : null;

  // Alerts
  const alerts: { msg: string; type: 'critical' | 'warning' }[] = [];
  if (total > 0 && (toDo / total) > 0.2) alerts.push({ msg: `⚠ To Do representa ${Math.round((toDo / total) * 100)}% do Total`, type: 'warning' });
  if (realOverflowItemCount > 5) alerts.push({ msg: `🚨 Transbordo elevado: ${realOverflowItemCount} itens (${realOverflowPct}%)`, type: 'critical' });

  if (isLoading) return <div className="text-slate-500 text-center py-20 text-lg">Carregando Fábrica…</div>;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Sprint context */}
      {sprintLabel && (
        <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
          <span className="bg-slate-800 px-2 py-0.5 rounded">{sprintLabel}</span>
        </div>
      )}

      {/* Hero row */}
      <div className="grid grid-cols-3 gap-4">
        <KioskHeroCard label="Em Progresso" value={inProgress} borderColor="border-blue-500" />
        <KioskHeroCard label="Total" value={total} borderColor="border-slate-500" delay={80} />
        <KioskHeroCard label="Done" value={done} trend={done > 0 ? 'up' : 'flat'} borderColor="border-emerald-500" delay={160} />
      </div>

      {/* Supporting grid */}
      <KioskSectionLabel>Métricas de Suporte</KioskSectionLabel>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KioskSupportCard
          label="To Do"
          value={toDo}
          borderColor={total > 0 && toDo / total > 0.2 ? 'border-yellow-500' : 'border-slate-700'}
          alert={total > 0 && toDo / total > 0.2}
        />
        <KioskSupportCard
          label="Transbordo Real"
          value={realOverflowItemCount}
          borderColor={realOverflowItemCount > 0 ? 'border-red-500' : 'border-slate-700'}
          badge={realOverflowPct != null ? <KioskBadge variant={realOverflowItemCount > 5 ? 'critical' : realOverflowItemCount > 0 ? 'warning' : 'healthy'}>{realOverflowPct}%</KioskBadge> : undefined}
          delay={80}
        />
        <KioskSupportCard
          label="Lead Time Médio"
          value={leadTimeMedio ?? '—'}
          suffix={leadTimeMedio != null ? 'h' : undefined}
          borderColor="border-slate-700"
          delay={160}
        />
        <KioskSupportCard
          label="Aviões"
          value={avioes}
          borderColor={avioes > 0 ? 'border-orange-500' : 'border-slate-700'}
          badge={avioes > 0 ? <KioskBadge variant="warning">{avioes}</KioskBadge> : undefined}
          delay={240}
        />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KioskSupportCard label="Aguardando Teste" value={aguardandoTeste} borderColor="border-purple-500" />
        {health.overview && (
          <>
            <KioskSupportCard label="Saúde Verde" value={health.overview.verde} borderColor="border-emerald-500" delay={80} />
            <KioskSupportCard label="Saúde Amarela" value={health.overview.amarelo} borderColor="border-yellow-500" delay={160} />
            <KioskSupportCard label="Saúde Vermelha" value={health.overview.vermelho} borderColor="border-red-500" delay={240} />
          </>
        )}
      </div>

      {/* Insights */}
      <KioskSectionLabel>Distribuição por Estado</KioskSectionLabel>
      <KioskBarChart items={distBars} />

      {/* Alerts */}
      {alerts.map((a, i) => <KioskAlertBanner key={i} message={a.msg} type={a.type} />)}

      <KioskFooter lastSync={lastSync} sectorName="Fábrica" />
    </div>
  );
}
