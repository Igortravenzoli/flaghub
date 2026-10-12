import { InfraExecutivoTab } from '@/components/infraestrutura/InfraExecutivoTab';
import { useInfraestruturaKpis } from '@/hooks/useInfraestruturaKpis';
import { getCurrentOfficialSprintCode, getOfficialSprintRange } from '@/lib/sprintCalendar';

/** Modo TV de Infraestrutura = Visão Executiva (escopo: sprint atual). */
export default function InfraestruturaKiosk() {
  const code = getCurrentOfficialSprintCode();
  const range = code ? getOfficialSprintRange(code) : null;
  // Egress (EG-8, 11/10/2026): colunas que a Visão Executiva lê e histórico de
  // sprint só dos itens do recorte — `sprintMigracoes`/`transbordo` somam só ele.
  const kpis = useInfraestruturaKpis(range?.from, range?.to, 'all', { visaoEnxuta: true, transbordo: 'escopo' });
  return (
    <InfraExecutivoTab
      tvMode
      kpis={kpis}
      dateFrom={range?.from}
      dateTo={range?.to}
      periodLabel={code ?? 'Sprint atual'}
    />
  );
}
