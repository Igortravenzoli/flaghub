import { useInfraestruturaKpis } from '@/hooks/useInfraestruturaKpis';
import {
  KioskHeroCard, KioskSupportCard, KioskAlertBanner,
  KioskSectionLabel, KioskFooter, KioskDonut,
} from './KioskPrimitives';

export default function InfraestruturaKiosk() {
  const kpis = useInfraestruturaKpis();
  const { pendentes, emAndamento, concluidos, iso27001, melhorias, transbordo, lastSync, isLoading } = kpis;

  const total = pendentes + emAndamento + concluidos;
  const alerts: { msg: string; type: 'critical' | 'warning' }[] = [];
  if (pendentes > emAndamento * 2) alerts.push({ msg: `Pendentes (${pendentes}) excedem 2× Em Andamento (${emAndamento})`, type: 'critical' });
  if (transbordo > 0) alerts.push({ msg: `Transbordo ativo: ${transbordo} itens em overflow`, type: 'warning' });

  if (isLoading) return <div className="text-slate-500 text-center py-20 text-lg animate-pulse">Carregando Infraestrutura…</div>;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Hero */}
      <div className="grid grid-cols-3 gap-4">
        <KioskHeroCard label="Em Andamento" value={emAndamento} borderColor="border-blue-500/40" glowColor="#3b82f6" />
        <KioskHeroCard label="Pendentes" value={pendentes} borderColor="border-amber-500/40" glowColor="#f59e0b" alert={pendentes > emAndamento * 2} delay={80} />
        <KioskHeroCard label="Concluídos" value={concluidos} borderColor="border-emerald-500/40" glowColor="#10b981" delay={160} />
      </div>

      {/* Supporting */}
      <KioskSectionLabel>Métricas de Suporte</KioskSectionLabel>
      <div className="grid grid-cols-3 gap-3">
        <KioskSupportCard label="ISO 27001" value={iso27001} borderColor="border-cyan-600/40" />
        <KioskSupportCard label="Melhorias" value={melhorias} borderColor="border-slate-700/50" delay={80} />
        <KioskSupportCard label="Transbordo" value={transbordo} borderColor={transbordo > 0 ? 'border-red-500/40' : 'border-slate-700/50'} alert={transbordo > 0} delay={160} />
      </div>

      {/* Gauge visual */}
      <KioskSectionLabel>Distribuição de Carga</KioskSectionLabel>
      <div className="flex justify-center">
        <KioskDonut segments={[
          { value: emAndamento, color: '#3b82f6', label: 'Em Andamento' },
          { value: pendentes, color: '#f59e0b', label: 'Pendentes' },
          { value: concluidos, color: '#10b981', label: 'Concluídos' },
        ]} size={90} />
      </div>

      {alerts.map((a, i) => <KioskAlertBanner key={i} message={a.msg} type={a.type} />)}
      <KioskFooter lastSync={lastSync} sectorName="Infraestrutura" />
    </div>
  );
}
