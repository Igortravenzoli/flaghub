import { useMemo } from 'react';
import { useQualidadeKpis } from '@/hooks/useQualidadeKpis';
import { usePbiHealthBatch } from '@/hooks/usePbiHealthBatch';
import { RotateCcw } from 'lucide-react';
import {
  KioskHeroCard, KioskSupportCard, KioskBadge, KioskAlertBanner,
  KioskSectionLabel, KioskFooter, KioskDonut, KioskItemList,
} from './KioskPrimitives';

export default function QualidadeKiosk() {
  const kpis = useQualidadeKpis();
  const { items, filaQA, emTeste, aguardandoDeploy, taxaVazao, totalRetornos, itensComRetorno, taxaRetorno, avioesTestados, lastSync, isLoading } = kpis;

  const ids = useMemo(() => (items || []).map(i => i.id).filter((id): id is number => id != null), [items]);
  const health = usePbiHealthBatch(ids);

  // Items with return (rework)
  const retornoItems = useMemo(() =>
    (items || []).filter(i => (i.tags || '').toUpperCase().includes('RETORNO')).slice(0, 5),
    [items]
  );

  const alerts: { msg: string; type: 'critical' | 'warning' }[] = [];
  if (filaQA > 25) alerts.push({ msg: `Fila QA elevada: ${filaQA} itens`, type: 'critical' });
  if (filaQA > 0 && (itensComRetorno / filaQA) > 0.15) alerts.push({ msg: `Retorno QA: ${taxaRetorno}% dos itens na fila`, type: 'warning' });

  if (isLoading) return <div className="text-slate-500 text-center py-20 text-lg animate-pulse">Carregando Qualidade…</div>;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Hero */}
      <div className="grid grid-cols-3 gap-4">
        <KioskHeroCard label="Fila QA" value={filaQA} borderColor="border-purple-500/40" glowColor="#a855f7" alert={filaQA > 25} />
        <KioskHeroCard label="Em Teste" value={emTeste} borderColor="border-blue-500/40" glowColor="#3b82f6" delay={80} />
        <KioskHeroCard label="Taxa Vazão" value={`${taxaVazao}%`} borderColor="border-emerald-500/40" glowColor="#10b981" delay={160} />
      </div>

      {/* Supporting */}
      <KioskSectionLabel>Métricas de Suporte</KioskSectionLabel>
      <div className="grid grid-cols-3 gap-3">
        <KioskSupportCard label="Aguardando Deploy" value={aguardandoDeploy} borderColor="border-emerald-600/40" />
        <KioskSupportCard
          label="Retorno QA" value={itensComRetorno}
          borderColor={taxaRetorno > 15 ? 'border-red-500/40' : 'border-slate-700/50'}
          badge={<KioskBadge variant={taxaRetorno > 15 ? 'critical' : 'neutral'}>{taxaRetorno}%</KioskBadge>}
          delay={80}
        />
        <KioskSupportCard
          label="Aviões Testados" value={avioesTestados}
          borderColor={avioesTestados > 0 ? 'border-orange-500/40' : 'border-slate-700/50'}
          delay={160}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Retorno Items */}
        {itensComRetorno > 0 && (
          <div>
            <KioskSectionLabel>Itens com Retorno</KioskSectionLabel>
            <div className="mt-2">
              <KioskItemList
                items={retornoItems.map(i => ({
                  label: i.title || `#${i.id}`,
                  sublabel: i.state || '',
                  icon: <RotateCcw className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />,
                }))}
                maxItems={5}
                emptyText="Nenhum retorno"
              />
            </div>
          </div>
        )}

        {/* Health donut */}
        {health.overview && (
          <div>
            <KioskSectionLabel>Saúde dos PBIs</KioskSectionLabel>
            <div className="mt-3 flex justify-center">
              <KioskDonut segments={[
                { value: health.overview.verde, color: '#10b981', label: 'Verde' },
                { value: health.overview.amarelo, color: '#eab308', label: 'Amarelo' },
                { value: health.overview.vermelho, color: '#ef4444', label: 'Vermelho' },
              ]} size={80} />
            </div>
          </div>
        )}
      </div>

      {alerts.map((a, i) => <KioskAlertBanner key={i} message={a.msg} type={a.type} />)}
      <KioskFooter lastSync={lastSync} sectorName="Qualidade" />
    </div>
  );
}
