import { useMemo } from 'react';
import { useFabricaKpis } from '@/hooks/useFabricaKpis';
import { usePbiHealthBatch } from '@/hooks/usePbiHealthBatch';
import { Plane } from 'lucide-react';
import {
  KioskHeroCard, KioskSupportCard, KioskBadge, KioskAlertBanner,
  KioskBarChart, KioskSectionLabel, KioskFooter, KioskItemList, KioskDonut,
} from './KioskPrimitives';

export default function FabricaKiosk() {
  const kpis = useFabricaKpis(undefined, undefined, 'all', { includeTimeLogs: true });
  const {
    total, inProgress, toDo, done, items,
    realOverflowItemCount, realOverflowPct, leadTimeMedio,
    currentSprint, lastSync, isLoading,
  } = kpis;

  const ids = useMemo(() => (items || []).map(i => i.id).filter((id): id is number => id != null), [items]);
  const health = usePbiHealthBatch(ids);

  // Aviões na fila
  const avioes = useMemo(() => (items || []).filter(i => (i.tags || '').toUpperCase().includes('AVIAO')), [items]);
  const aguardandoTeste = useMemo(() => (items || []).filter(i => i.state === 'Aguardando Teste').length, [items]);

  // Distribution bars
  const distBars = useMemo(() => [
    { label: 'To Do', value: toDo, color: '#94a3b8' },
    { label: 'In Progress', value: inProgress, color: '#3b82f6' },
    { label: 'Done', value: done, color: '#10b981' },
  ], [toDo, inProgress, done]);

  const sprintLabel = currentSprint ? currentSprint.split('\\').pop() || currentSprint : null;

  const alerts: { msg: string; type: 'critical' | 'warning' }[] = [];
  if (total > 0 && (toDo / total) > 0.2) alerts.push({ msg: `To Do representa ${Math.round((toDo / total) * 100)}% do Total`, type: 'warning' });
  if (realOverflowItemCount > 5) alerts.push({ msg: `Transbordo elevado: ${realOverflowItemCount} itens (${realOverflowPct}%)`, type: 'critical' });

  if (isLoading) return <div className="text-slate-500 text-center py-20 text-lg animate-pulse">Carregando Fábrica…</div>;

  return (
    <div className="flex flex-col gap-4 h-full">
      {sprintLabel && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-full">{sprintLabel}</span>
        </div>
      )}

      {/* Hero */}
      <div className="grid grid-cols-3 gap-4">
        <KioskHeroCard label="Em Progresso" value={inProgress} borderColor="border-blue-500/40" glowColor="#3b82f6" />
        <KioskHeroCard label="Total" value={total} borderColor="border-slate-500/40" glowColor="#64748b" delay={80} />
        <KioskHeroCard label="Done" value={done} trend={done > 0 ? 'up' : 'flat'} borderColor="border-emerald-500/40" glowColor="#10b981" delay={160} />
      </div>

      {/* Supporting */}
      <KioskSectionLabel>Métricas de Suporte</KioskSectionLabel>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KioskSupportCard
          label="To Do" value={toDo}
          borderColor={total > 0 && toDo / total > 0.2 ? 'border-amber-500/40' : 'border-slate-700/50'}
          alert={total > 0 && toDo / total > 0.2}
        />
        <KioskSupportCard
          label="Transbordo" value={realOverflowItemCount}
          borderColor={realOverflowItemCount > 0 ? 'border-red-500/40' : 'border-slate-700/50'}
          badge={realOverflowPct != null ? <KioskBadge variant={realOverflowItemCount > 5 ? 'critical' : realOverflowItemCount > 0 ? 'warning' : 'healthy'}>{realOverflowPct}%</KioskBadge> : undefined}
          delay={80}
        />
        <KioskSupportCard
          label="Lead Time" value={leadTimeMedio ?? '—'} suffix={leadTimeMedio != null ? 'h' : undefined}
          borderColor="border-slate-700/50" delay={160}
        />
        <KioskSupportCard
          label="Aguardando Teste" value={aguardandoTeste}
          borderColor="border-purple-500/40" delay={240}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Aviões na fila */}
        <div>
          <KioskSectionLabel>Aviões na Fila ({avioes.length})</KioskSectionLabel>
          <div className="mt-2">
            <KioskItemList
              items={avioes.map(a => ({
                label: a.title || `#${a.id}`,
                sublabel: a.state || '',
                icon: <Plane className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />,
              }))}
              maxItems={6}
              emptyText="Nenhum avião na sprint"
            />
          </div>
        </div>

        {/* Distribution */}
        <div>
          <KioskSectionLabel>Distribuição</KioskSectionLabel>
          <div className="mt-2">
            <KioskBarChart items={distBars} />
          </div>
        </div>
      </div>

      {/* Health donut */}
      {health.overview && (
        <div className="flex items-center gap-6">
          <KioskDonut segments={[
            { value: health.overview.verde, color: '#10b981', label: 'Verde' },
            { value: health.overview.amarelo, color: '#eab308', label: 'Amarelo' },
            { value: health.overview.vermelho, color: '#ef4444', label: 'Vermelho' },
          ]} size={72} />
        </div>
      )}

      {alerts.map((a, i) => <KioskAlertBanner key={i} message={a.msg} type={a.type} />)}
      <KioskFooter lastSync={lastSync} sectorName="Fábrica" />
    </div>
  );
}
