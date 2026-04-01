import { useMemo } from 'react';
import { useHelpdeskKpis } from '@/hooks/useHelpdeskKpis';
import { UserCircle } from 'lucide-react';
import {
  KioskHeroCard, KioskSupportCard, KioskBadge, KioskAlertBanner,
  KioskBarChart, KioskSectionLabel, KioskFooter, KioskItemList,
} from './KioskPrimitives';

export default function HelpdeskKiosk() {
  const kpis = useHelpdeskKpis();
  const {
    totalRegistros, totalHoras, totalConsultores,
    registrosPorConsultor, registrosPorSistema, ocorrenciasPorTipo,
    lastSync, isLoading,
  } = kpis;

  const tempoMedio = totalRegistros > 0 ? Math.round((kpis.totalMinutos / totalRegistros) * 10) / 10 : 0;
  const eficiencia = totalHoras > 0 ? Math.round((totalRegistros / totalHoras) * 10) / 10 : 0;

  const topTipos = useMemo(() =>
    [...ocorrenciasPorTipo].sort((a, b) => b.quantidade - a.quantidade).slice(0, 5),
    [ocorrenciasPorTipo]
  );

  const maxConsultorPct = useMemo(() => {
    if (totalRegistros === 0 || registrosPorConsultor.length === 0) return 0;
    const maxRegs = Math.max(...registrosPorConsultor.map(c => c.totalRegistros));
    return Math.round((maxRegs / totalRegistros) * 100);
  }, [registrosPorConsultor, totalRegistros]);

  const overloadedConsultant = useMemo(() => {
    if (maxConsultorPct <= 30) return null;
    return registrosPorConsultor.reduce((a, b) => a.totalRegistros > b.totalRegistros ? a : b, registrosPorConsultor[0]);
  }, [registrosPorConsultor, maxConsultorPct]);

  const consultorBars = useMemo(() =>
    registrosPorConsultor.map(c => ({ label: c.nome, value: c.totalRegistros, color: '#6366f1' })),
    [registrosPorConsultor]
  );

  const tipoBars = useMemo(() =>
    topTipos.map(t => ({ label: t.nome, value: t.quantidade, color: '#06b6d4' })),
    [topTipos]
  );

  if (isLoading) return <div className="text-slate-500 text-center py-20 text-lg animate-pulse">Carregando Helpdesk…</div>;

  const alerts: { msg: string; type: 'critical' | 'warning' }[] = [];
  if (maxConsultorPct > 30) alerts.push({ msg: `Concentração: ${overloadedConsultant?.nome} com ${maxConsultorPct}% dos registros`, type: 'warning' });

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Hero */}
      <div className="grid grid-cols-3 gap-4">
        <KioskHeroCard label="Total Registros" value={totalRegistros} borderColor="border-blue-500/40" glowColor="#3b82f6" />
        <KioskHeroCard label="Total Horas" value={totalHoras} suffix="h" borderColor="border-purple-500/40" glowColor="#a855f7" delay={80} />
        <KioskHeroCard label="Consultores" value={totalConsultores} borderColor="border-cyan-500/40" glowColor="#06b6d4" delay={160} />
      </div>

      {/* Supporting */}
      <KioskSectionLabel>Métricas de Suporte</KioskSectionLabel>
      <div className="grid grid-cols-3 gap-3">
        <KioskSupportCard label="Tempo Médio" value={tempoMedio} suffix="min" borderColor="border-slate-700/50" />
        <KioskSupportCard label="Eficiência" value={eficiencia} suffix="reg/h" borderColor="border-slate-700/50" delay={80} />
        {topTipos[0] && (
          <KioskSupportCard
            label={`Top: ${topTipos[0].nome}`} value={topTipos[0].quantidade}
            borderColor="border-indigo-500/40" delay={160}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Consultant load */}
        {consultorBars.length > 0 && (
          <div>
            <KioskSectionLabel>Carga por Consultor</KioskSectionLabel>
            <div className="mt-2"><KioskBarChart items={consultorBars} maxBars={6} /></div>
          </div>
        )}

        {/* Top tipos */}
        {tipoBars.length > 0 && (
          <div>
            <KioskSectionLabel>Top Tipos de Chamado</KioskSectionLabel>
            <div className="mt-2"><KioskBarChart items={tipoBars} maxBars={5} /></div>
          </div>
        )}
      </div>

      {alerts.map((a, i) => <KioskAlertBanner key={i} message={a.msg} type={a.type} />)}
      <KioskFooter lastSync={lastSync} sectorName="Helpdesk" />
    </div>
  );
}
