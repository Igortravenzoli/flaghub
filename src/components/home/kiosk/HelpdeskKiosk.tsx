import { CsTvView } from '@/components/customerservice/CsTvView';
import { useHelpdeskKpis } from '@/hooks/useHelpdeskKpis';

/**
 * Modo TV de Customer Service (Helpdesk/VDesk) — escopo: mês atual.
 *
 * 07/08/2026: deixou de encolher a `HelpdeskExecutivoTab` inteira (modo legado,
 * ~56% da tela vazia e 3 cards com rolagem interna) e passou a renderizar a
 * `CsTvView` — view própria de telão em modo fill, 2 páginas (Direção A do
 * mock MOCK_TV_CS_07-08 aprovado pelo Igor). A aba Executiva de mesa continua
 * intocada com a `HelpdeskExecutivoTab`.
 */
export default function HelpdeskKiosk() {
  const now = new Date();
  const mesStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const k = useHelpdeskKpis(mesStart, now);
  // Mês anterior COMPLETO, só para o delta de TMA da faixa (chip "▼ Xm vs jul"
  // do mock aprovado). Segunda chamada ao dashboard por ciclo de refresh — o
  // gateway cacheia; não derrubar o chip sem reavaliar o aprovo.
  const mesAntStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const mesAntEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const kAnt = useHelpdeskKpis(mesAntStart, mesAntEnd);
  return (
    <CsTvView
      k={k}
      kAnterior={{
        totalRegistros: kAnt.totalRegistros,
        totalMinutos: kAnt.totalMinutos,
        isLoading: kAnt.isLoading,
        isError: kAnt.isError,
      }}
      dataInicio={mesStart}
      dataFim={now}
    />
  );
}
