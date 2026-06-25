import { InfraExecutivoTab } from '@/components/infraestrutura/InfraExecutivoTab';
import { useInfraestruturaKpis } from '@/hooks/useInfraestruturaKpis';
import { getCurrentOfficialSprintCode, getOfficialSprintRange } from '@/lib/sprintCalendar';

/** Modo TV de Infraestrutura = Visão Executiva (escopo: sprint atual). */
export default function InfraestruturaKiosk() {
  const code = getCurrentOfficialSprintCode();
  const range = code ? getOfficialSprintRange(code) : null;
  const kpis = useInfraestruturaKpis(range?.from, range?.to, 'all');
  return (
    <InfraExecutivoTab
      kpis={kpis}
      dateFrom={range?.from}
      dateTo={range?.to}
      periodLabel={code ?? 'Sprint atual'}
    />
  );
}
