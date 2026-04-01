import { useInfraestruturaKpis } from '@/hooks/useInfraestruturaKpis';
import {
  KioskHeroCard, KioskSupportCard, KioskAlertBanner,
  KioskSectionLabel, KioskFooter,
} from './KioskPrimitives';

export default function InfraestruturaKiosk() {
  const kpis = useInfraestruturaKpis();
  const { pendentes, emAndamento, concluidos, iso27001, melhorias, transbordo, lastSync, isLoading } = kpis;

  const alerts: { msg: string; type: 'critical' | 'warning' }[] = [];
  if (pendentes > emAndamento * 2) alerts.push({ msg: `🚨 Pendentes (${pendentes}) excedem 2× Em Andamento (${emAndamento})`, type: 'critical' });

  if (isLoading) return <div className="text-slate-500 text-center py-20 text-lg">Carregando Infraestrutura…</div>;

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="grid grid-cols-3 gap-4">
        <KioskHeroCard label="Em Andamento" value={emAndamento} borderColor="border-blue-500" />
        <KioskHeroCard label="Pendentes" value={pendentes} borderColor="border-yellow-500" alert={pendentes > emAndamento * 2} delay={80} />
        <KioskHeroCard label="Concluídos" value={concluidos} borderColor="border-emerald-500" delay={160} />
      </div>

      <KioskSectionLabel>Métricas de Suporte</KioskSectionLabel>
      <div className="grid grid-cols-3 gap-3">
        <KioskSupportCard label="ISO 27001" value={iso27001} borderColor="border-cyan-600" />
        <KioskSupportCard label="Melhorias" value={melhorias} borderColor="border-slate-700" delay={80} />
        <KioskSupportCard label="Transbordo" value={transbordo} borderColor={transbordo > 0 ? 'border-red-500' : 'border-slate-700'} delay={160} />
      </div>

      {alerts.map((a, i) => <KioskAlertBanner key={i} message={a.msg} type={a.type} />)}
      <KioskFooter lastSync={lastSync} sectorName="Infraestrutura" />
    </div>
  );
}
