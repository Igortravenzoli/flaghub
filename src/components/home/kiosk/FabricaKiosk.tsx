import { FabricaTvView } from '@/components/fabrica/FabricaTvView';
import { useFabricaKpis } from '@/hooks/useFabricaKpis';
import { getCurrentOfficialSprintCode, getOfficialSprintRange } from '@/lib/sprintCalendar';

/** Modo TV de Fábrica (escopo: sprint atual). Composição própria — ver FabricaTvView. */
export default function FabricaKiosk() {
  const code = getCurrentOfficialSprintCode();
  const range = code ? getOfficialSprintRange(code) : null;
  // sprintFilter='all' + range → useFabricaKpis escopa por data (iteration_path
  // exato exigiria o PATH da sprint, não o código). Mantém o escopo da sprint atual.
  const fab = useFabricaKpis(range?.from, range?.to, 'all', { includeTimeLogs: true });
  return <FabricaTvView fab={fab} sprintCode={code} periodLabel={code ?? 'Sprint atual'} />;
}
