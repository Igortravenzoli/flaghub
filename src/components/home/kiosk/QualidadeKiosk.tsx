import { useMemo } from 'react';
import { useQualidadeKpis } from '@/hooks/useQualidadeKpis';
import { usePbiHealthBatch } from '@/hooks/usePbiHealthBatch';
import {
  KioskHeroCard, KioskSupportCard, KioskBadge, KioskAlertBanner,
  KioskSectionLabel, KioskFooter,
} from './KioskPrimitives';

export default function QualidadeKiosk() {
  const kpis = useQualidadeKpis();
  const { items, filaQA, emTeste, aguardandoDeploy, taxaVazao, totalRetornos, itensComRetorno, taxaRetorno, avioesTestados, lastSync, isLoading } = kpis;

  const ids = useMemo(() => (items || []).map(i => i.id).filter((id): id is number => id != null), [items]);
  const health = usePbiHealthBatch(ids);

  const alerts: { msg: string; type: 'critical' | 'warning' }[] = [];
  if (filaQA > 25) alerts.push({ msg: `🚨 Fila QA elevada: ${filaQA} itens`, type: 'critical' });
  if (filaQA > 0 && (itensComRetorno / filaQA) > 0.15) alerts.push({ msg: `⚠ Retorno QA: ${taxaRetorno}% dos itens na fila`, type: 'warning' });

  if (isLoading) return <div className="text-slate-500 text-center py-20 text-lg">Carregando Qualidade…</div>;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Hero */}
      <div className="grid grid-cols-3 gap-4">
        <KioskHeroCard label="Fila QA" value={filaQA} borderColor="border-purple-500" alert={filaQA > 25} />
        <KioskHeroCard label="Em Teste" value={emTeste} borderColor="border-blue-500" delay={80} />
        <KioskHeroCard label="Taxa Vazão" value={`${taxaVazao}%`} borderColor="border-emerald-500" delay={160} />
      </div>

      {/* Supporting */}
      <KioskSectionLabel>Métricas de Suporte</KioskSectionLabel>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        <KioskSupportCard label="Aguardando Deploy" value={aguardandoDeploy} borderColor="border-emerald-600" />
        <KioskSupportCard
          label="Retorno QA"
          value={itensComRetorno}
          borderColor={taxaRetorno > 15 ? 'border-red-500' : 'border-slate-700'}
          badge={<KioskBadge variant={taxaRetorno > 15 ? 'critical' : 'neutral'}>{taxaRetorno}%</KioskBadge>}
          delay={80}
        />
        <KioskSupportCard
          label="Aviões Testados"
          value={avioesTestados}
          borderColor={avioesTestados > 0 ? 'border-orange-500' : 'border-slate-700'}
          delay={160}
        />
      </div>

      {health.overview && (
        <>
          <KioskSectionLabel>Saúde dos PBIs</KioskSectionLabel>
          <div className="grid grid-cols-3 gap-3">
            <KioskSupportCard label="Verde" value={health.overview.verde} borderColor="border-emerald-500" />
            <KioskSupportCard label="Amarelo" value={health.overview.amarelo} borderColor="border-yellow-500" delay={80} />
            <KioskSupportCard label="Vermelho" value={health.overview.vermelho} borderColor="border-red-500" delay={160} />
          </div>
        </>
      )}

      {alerts.map((a, i) => <KioskAlertBanner key={i} message={a.msg} type={a.type} />)}
      <KioskFooter lastSync={lastSync} sectorName="Qualidade" />
    </div>
  );
}
