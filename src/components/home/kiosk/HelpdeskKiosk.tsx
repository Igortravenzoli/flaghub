import { HelpdeskExecutivoTab } from '@/components/helpdesk/HelpdeskExecutivoTab';
import { useHelpdeskKpis } from '@/hooks/useHelpdeskKpis';

/** Modo TV de Customer Service (Helpdesk/VDesk) = Visão Executiva (escopo: mês atual). */
export default function HelpdeskKiosk() {
  const now = new Date();
  const mesStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const k = useHelpdeskKpis(mesStart, now);
  return (
    <HelpdeskExecutivoTab
      totalRegistros={k.totalRegistros}
      totalHoras={k.totalHoras}
      consultoresAtivos={k.totalConsultores}
      registrosPorConsultor={k.registrosPorConsultor}
      tipoChamadoTempoMedio={k.tipoChamadoTempoMedio}
      registrosPorSistema={k.registrosPorSistema}
      registrosPorBandeira={k.registrosPorBandeira}
      registrosPorCliente={k.registrosPorCliente}
      historico={k.historico}
      periodLabel="Mês atual"
    />
  );
}
