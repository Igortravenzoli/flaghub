import { FabricaTvView } from '@/components/fabrica/FabricaTvView';
import { useFabricaKpis } from '@/hooks/useFabricaKpis';
import { getCurrentOfficialSprintCode, getOfficialSprintRange } from '@/lib/sprintCalendar';

/** Modo TV de Fábrica (escopo: sprint atual). Composição própria — ver FabricaTvView. */
export default function FabricaKiosk() {
  const code = getCurrentOfficialSprintCode();
  const range = code ? getOfficialSprintRange(code) : null;
  /**
   * Escopo dos ITENS = sprint vigente pelo CÓDIGO (o hook casa código ⇄
   * iteration_path desde 29/07/2026). Antes ia `'all'` e o escopo saía da janela
   * de datas, o que trazia Backlog e sprints passadas para a faixa de KPI do
   * telão (197 itens onde a Fábrica mostrava 108).
   *
   * O `range` CONTINUA sendo passado de propósito: ele não escopa mais os itens,
   * mas é o que alimenta horas/capacidade (`rpc_devops_timelog_agg` sem datas
   * devolve o histórico inteiro) e o ritmo da sprint na view.
   *
   * `telao`: baixa só a sprint vigente (PBI/US/Bug, colunas que a tela lê) e a
   * hierarquia dos itens com apontamento — egress, EG-8 (11/10/2026). O que esta
   * view mostra sai igual ao perfil de mesa (src/test/fabricaPerfilTelao.test.tsx).
   */
  const fab = useFabricaKpis(range?.from, range?.to, code ?? 'all', { includeTimeLogs: true, telao: true });
  return <FabricaTvView fab={fab} sprintCode={code} periodLabel={code ?? 'Sprint atual'} dateFrom={range?.from ?? null} dateTo={range?.to ?? null} />;
}
