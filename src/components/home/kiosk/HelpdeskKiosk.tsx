import { useMemo } from 'react';
import { useHelpdeskKpis } from '@/hooks/useHelpdeskKpis';
import { Clock } from 'lucide-react';
import {
  KioskHeroCard, KioskSupportCard, KioskBadge, KioskAlertBanner,
  KioskBarChart, KioskSectionLabel, KioskFooter, KioskItemList, KioskDonut,
} from './KioskPrimitives';

export default function HelpdeskKiosk() {
  const kpis = useHelpdeskKpis();
  const {
    totalRegistros, totalHoras, totalConsultores,
    registrosPorConsultor, ocorrenciasPorTipo,
    tipoChamadoTempoMedio, registrosPorSistema,
    lastSync, isLoading,
  } = kpis;

  const tempoMedio = totalRegistros > 0 ? Math.round((kpis.totalMinutos / totalRegistros) * 10) / 10 : 0;
  const eficiencia = totalHoras > 0 ? Math.round((totalRegistros / totalHoras) * 10) / 10 : 0;

  const topTipos = useMemo(() =>
    [...ocorrenciasPorTipo].sort((a, b) => b.quantidade - a.quantidade).slice(0, 5),
    [ocorrenciasPorTipo]
  );

  const topSistemas = useMemo(() =>
    [...registrosPorSistema].sort((a, b) => b.quantidade - a.quantidade).slice(0, 5),
    [registrosPorSistema]
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
    registrosPorConsultor
      .slice().sort((a, b) => b.totalRegistros - a.totalRegistros)
      .slice(0, 6)
      .map(c => ({ label: c.nome, value: c.totalRegistros, color: '#6366f1' })),
    [registrosPorConsultor]
  );

  const tipoBars = useMemo(() =>
    topTipos.map(t => ({ label: t.nome, value: t.quantidade, color: '#06b6d4' })),
    [topTipos]
  );

  // Sistema distribution donut
  const sistemaDonut = useMemo(() => {
    if (topSistemas.length === 0) return null;
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7'];
    return topSistemas.map((s, i) => ({
      value: s.quantidade,
      color: colors[i % colors.length],
      label: s.nome,
    }));
  }, [topSistemas]);

  // Top tempo médio por tipo
  const topTempoMedio = useMemo(() =>
    [...tipoChamadoTempoMedio]
      .filter(t => t.tempoMedio > 0)
      .sort((a, b) => b.tempoMedio - a.tempoMedio)
      .slice(0, 4)
      .map(t => ({
        label: t.tipo,
        sublabel: `${t.tempoMedio.toFixed(1)}min • ${t.quantidade} chamados`,
        icon: <Clock className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />,
      })),
    [tipoChamadoTempoMedio]
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
      <KioskSectionLabel>Atendimento</KioskSectionLabel>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KioskSupportCard label="Tempo Médio" value={tempoMedio} suffix="min" borderColor="border-slate-700/50" />
        <KioskSupportCard label="Eficiência" value={eficiencia} suffix="reg/h" borderColor="border-slate-700/50" delay={80} />
        <KioskSupportCard label="Sistemas" value={kpis.totalSistemas} borderColor="border-indigo-500/40" delay={160} />
        {topTipos[0] && (
          <KioskSupportCard
            label={`Top: ${topTipos[0].nome}`} value={topTipos[0].quantidade}
            borderColor="border-cyan-500/40" delay={240}
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

        {/* Right: sistema donut or top tipos */}
        <div>
          {sistemaDonut ? (
            <>
              <KioskSectionLabel>Distribuição por Sistema</KioskSectionLabel>
              <div className="mt-3 flex justify-center">
                <KioskDonut segments={sistemaDonut} size={80} />
              </div>
            </>
          ) : tipoBars.length > 0 ? (
            <>
              <KioskSectionLabel>Top Tipos de Chamado</KioskSectionLabel>
              <div className="mt-2"><KioskBarChart items={tipoBars} maxBars={5} /></div>
            </>
          ) : null}
        </div>
      </div>

      {/* Tempo médio por tipo */}
      {topTempoMedio.length > 0 && (
        <div>
          <KioskSectionLabel>Maior Tempo Médio por Tipo</KioskSectionLabel>
          <div className="mt-2">
            <KioskItemList items={topTempoMedio} maxItems={4} emptyText="Sem dados" />
          </div>
        </div>
      )}

      {alerts.map((a, i) => <KioskAlertBanner key={i} message={a.msg} type={a.type} />)}
      <KioskFooter lastSync={lastSync} sectorName="Helpdesk" />
    </div>
  );
}
