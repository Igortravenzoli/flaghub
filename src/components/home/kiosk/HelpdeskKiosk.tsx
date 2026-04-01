import { useMemo } from 'react';
import { useHelpdeskKpis } from '@/hooks/useHelpdeskKpis';
import {
  KioskHeroCard, KioskSupportCard, KioskBadge, KioskAlertBanner,
  KioskBarChart, KioskSectionLabel, KioskFooter,
} from './KioskPrimitives';

export default function HelpdeskKiosk() {
  const kpis = useHelpdeskKpis();
  const {
    totalRegistros, totalHoras, totalConsultores,
    registrosPorConsultor, registrosPorSistema, ocorrenciasPorTipo,
    lastSync, isLoading,
  } = kpis;

  // Tempo médio por registro
  const tempoMedio = totalRegistros > 0 ? Math.round((kpis.totalMinutos / totalRegistros) * 10) / 10 : 0;
  // Eficiência
  const eficiencia = totalHoras > 0 ? Math.round((totalRegistros / totalHoras) * 10) / 10 : 0;

  // Top 3 tipos
  const topTipos = useMemo(() =>
    [...ocorrenciasPorTipo].sort((a, b) => b.quantidade - a.quantidade).slice(0, 3),
    [ocorrenciasPorTipo]
  );

  // Consultant overload alert
  const maxConsultorPct = useMemo(() => {
    if (totalRegistros === 0 || registrosPorConsultor.length === 0) return 0;
    const maxRegs = Math.max(...registrosPorConsultor.map(c => c.totalRegistros));
    return Math.round((maxRegs / totalRegistros) * 100);
  }, [registrosPorConsultor, totalRegistros]);

  // Consultant bar chart
  const consultorBars = useMemo(() =>
    registrosPorConsultor.map(c => ({ label: c.nome, value: c.totalRegistros, color: '#6366f1' })),
    [registrosPorConsultor]
  );

  if (isLoading) return <div className="text-slate-500 text-center py-20 text-lg">Carregando Helpdesk…</div>;

  const alerts: { msg: string; type: 'critical' | 'warning' }[] = [];
  if (maxConsultorPct > 30) alerts.push({ msg: `⚠ Concentração: consultor com ${maxConsultorPct}% dos registros`, type: 'warning' });

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="grid grid-cols-3 gap-4">
        <KioskHeroCard label="Total Registros" value={totalRegistros} borderColor="border-blue-500" />
        <KioskHeroCard label="Total Horas" value={totalHoras} suffix="h" borderColor="border-purple-500" delay={80} />
        <KioskHeroCard label="Consultores Ativos" value={totalConsultores} borderColor="border-cyan-500" delay={160} />
      </div>

      <KioskSectionLabel>Métricas de Suporte</KioskSectionLabel>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        <KioskSupportCard label="Tempo Médio" value={tempoMedio} suffix="min" borderColor="border-slate-700" />
        <KioskSupportCard label="Eficiência" value={eficiencia} suffix="reg/h" borderColor="border-slate-700" delay={80} />
        {topTipos[0] && (
          <KioskSupportCard
            label={`Top: ${topTipos[0].nome}`}
            value={topTipos[0].quantidade}
            borderColor="border-indigo-500"
            delay={160}
          />
        )}
      </div>

      {/* Consultant load */}
      {consultorBars.length > 0 && (
        <>
          <KioskSectionLabel>Carga por Consultor</KioskSectionLabel>
          <KioskBarChart items={consultorBars} maxBars={6} />
        </>
      )}

      {alerts.map((a, i) => <KioskAlertBanner key={i} message={a.msg} type={a.type} />)}
      <KioskFooter lastSync={lastSync} sectorName="Helpdesk" />
    </div>
  );
}
