import { FabricaExecutivoTab } from '@/components/fabrica/FabricaExecutivoTab';
import { useFabricaKpis } from '@/hooks/useFabricaKpis';
import { getCurrentOfficialSprintCode, getOfficialSprintRange } from '@/lib/sprintCalendar';

/** Modo TV de Fábrica = Visão Executiva (escopo: sprint atual). */
export default function FabricaKiosk() {
  const code = getCurrentOfficialSprintCode();
  const range = code ? getOfficialSprintRange(code) : null;
  const fab = useFabricaKpis(range?.from, range?.to, code ?? 'all', { includeTimeLogs: true });
  return (
    <FabricaExecutivoTab
      fab={fab}
      selectedSprintCode={code}
      dateFrom={range?.from ?? null}
      dateTo={range?.to ?? null}
      periodLabel={code ?? 'Sprint atual'}
    />
  );
}
