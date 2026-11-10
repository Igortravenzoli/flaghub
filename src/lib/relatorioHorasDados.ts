/**
 * Busca e impressão do relatório de horas do período.
 *
 * A busca é SOB DEMANDA, no clique: roster, ausências e fotos de sprint só
 * interessam a quem exporta, e deixá-las num hook da aba faria toda visita
 * pagar três consultas por um botão que quase ninguém aperta. As horas não são
 * buscadas de novo — chegam da aba, que já as tem em cache.
 */
import { supabase } from '@/integrations/supabase/client';
import type { HoraNegocioRow } from '@/hooks/useHorasNegocio';
import type { Ausencia } from '@/lib/capacidade';
import {
  montarRelatorio, renderizarRelatorioHtml,
  type RosterRelatorio, type SnapshotRelatorio,
} from '@/lib/relatorioHoras';

const COLUNAS_SNAPSHOT =
  'sprint_code,sprint_start_date,sprint_end_date,total_demands,planned_demands,unplanned_demands,'
  + 'delivered_demands,finalized_demands,transbordo_count,avg_lead_time_days,qa_concluidos,'
  + 'qa_concluidos_com_retorno,qa_return_rate_pct,qa_avg_return_cycles,category_breakdown';

async function carregarApoio(dateFrom: string, dateTo: string) {
  // Roster, ausências e fotos não estão todos nos tipos gerados (padrão do repo:
  // cast pontual em vez de regenerar o schema).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [roster, ausencias, snapshots] = await Promise.all([
    sb.from('fabrica_squad_membership').select('colaborador, squad, papel').eq('ativo', true),
    sb.from('v_colaborador_ausencias').select('colaborador, tipo, data_inicio, data_fim')
      .lte('data_inicio', dateTo).gte('data_fim', dateFrom),
    sb.from('sprint_indicator_snapshots').select(COLUNAS_SNAPSHOT)
      .lte('sprint_start_date', dateTo).gte('sprint_end_date', dateFrom)
      .order('sprint_start_date', { ascending: true }),
  ]);
  for (const r of [roster, ausencias, snapshots]) if (r.error) throw r.error;

  // A tabela guarda uma foto por sprint, mas reprocessamento já deixou duas no
  // passado: fica a primeira de cada código.
  const vistos = new Set<string>();
  const fotos = ((snapshots.data ?? []) as SnapshotRelatorio[]).filter((s) => {
    if (vistos.has(s.sprint_code)) return false;
    vistos.add(s.sprint_code);
    return true;
  });

  return {
    roster: (roster.data ?? []) as RosterRelatorio[],
    ausencias: (ausencias.data ?? []) as Ausencia[],
    snapshots: fotos,
  };
}

/**
 * Imprime um documento HTML num iframe oculto. O diálogo de impressão do
 * navegador é onde o usuário escolhe "Salvar como PDF".
 *
 * Iframe, e não `window.open`: a busca é assíncrona, e uma janela aberta depois
 * de um `await` é barrada como pop-up.
 */
function imprimirHtml(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  iframe.onload = () => {
    const janela = iframe.contentWindow;
    if (!janela) return;
    // O iframe só pode sair depois de o diálogo fechar; removê-lo antes cancela
    // a impressão em Chromium. O timeout longo cobre navegador sem `afterprint`.
    const remover = () => iframe.remove();
    janela.addEventListener('afterprint', remover, { once: true });
    setTimeout(remover, 10 * 60 * 1000);
    janela.focus();
    janela.print();
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

export async function exportarRelatorioHoras(params: {
  dateFrom: string;
  dateTo: string;
  rows: HoraNegocioRow[];
}): Promise<void> {
  const apoio = await carregarApoio(params.dateFrom, params.dateTo);
  const modelo = montarRelatorio({ ...params, ...apoio, extraidoEm: new Date() });
  imprimirHtml(renderizarRelatorioHtml(modelo));
}
