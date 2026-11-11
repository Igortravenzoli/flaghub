/**
 * Busca e impressão do relatório de horas do período.
 *
 * A busca é SOB DEMANDA, no clique: roster, ausências e fotos de sprint só
 * interessam a quem exporta, e deixá-las num hook da aba faria toda visita
 * pagar três consultas por um botão que quase ninguém aperta. Quando quem chama
 * já tem as horas (a aba Executivo, em cache), elas chegam por parâmetro; a
 * página TimeLog não tem, e aí são buscadas aqui, também só no clique.
 */
import { supabase } from '@/integrations/supabase/client';
import { buscarHorasNegocio, type HoraNegocioRow } from '@/hooks/useHorasNegocio';
import type { Ausencia } from '@/lib/capacidade';
import { fetchAllRows } from '@/lib/fetchAllRows';
import type {
  CodigoPeriodo, CommitRelatorio, PrRelatorio, IdentidadeColaborador,
} from '@/lib/relatorioHorasCodigo';
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

const COLUNAS_COMMIT =
  'repo_id,commit_id,project_name,repo_name,author_name,author_email,author_date,comment,work_item_ids';
const COLUNAS_PR =
  'repo_id,pr_id,project_name,repo_name,title,status,is_draft,created_by_name,created_by_email,'
  + 'creation_date,closed_date,target_branch,work_item_ids';

/**
 * Commits e PRs do período, ou `null` se a coleta não estiver disponível.
 *
 * Falha aqui NÃO derruba o relatório: as tabelas dependem de uma migration e de
 * uma edge publicadas à parte, e o front costuma chegar a produção antes delas.
 * Sem coleta, o relatório sai como sempre saiu, só sem as partes de código.
 */
async function carregarCodigo(dateFrom: string, dateTo: string): Promise<CodigoPeriodo | null> {
  // As tabelas são novas e não estão nos tipos gerados.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  // Calendário de Brasília, o mesmo em que as horas são lançadas.
  const de = `${dateFrom}T00:00:00-03:00`;
  const ate = `${dateTo}T23:59:59.999-03:00`;
  try {
    const [commits, prs, identidades] = await Promise.all([
      fetchAllRows<CommitRelatorio>((from, to) =>
        sb.from('devops_git_commits').select(COLUNAS_COMMIT)
          .gte('author_date', de).lte('author_date', ate)
          .order('author_date', { ascending: true }).order('commit_id', { ascending: true })
          .range(from, to)),
      fetchAllRows<PrRelatorio>((from, to) =>
        sb.from('devops_git_pull_requests').select(COLUNAS_PR)
          // Criado OU fechado no período. Os valores vão entre aspas: dentro de
          // `or()` o PostgREST lê ":" e "." do carimbo como separadores.
          .or(`and(creation_date.gte."${de}",creation_date.lte."${ate}"),and(closed_date.gte."${de}",closed_date.lte."${ate}")`)
          .order('creation_date', { ascending: true }).order('pr_id', { ascending: true })
          .range(from, to)),
      sb.from('devops_collaborator_map').select('canonical_name,timelog_name,devops_email'),
    ]);
    if (identidades.error) throw identidades.error;
    return { commits, prs, identidades: (identidades.data ?? []) as IdentidadeColaborador[] };
  } catch (e) {
    console.warn('[relatorioHoras] coleta de commits/PRs indisponível; relatório segue sem código', e);
    return null;
  }
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
  /** Horas já carregadas por quem chama. Ausente = buscar o período aqui. */
  rows?: HoraNegocioRow[];
}): Promise<void> {
  const { dateFrom, dateTo } = params;
  const [rows, apoio, codigo] = await Promise.all([
    params.rows ?? buscarHorasNegocio({ dateFrom, dateTo }),
    carregarApoio(dateFrom, dateTo),
    carregarCodigo(dateFrom, dateTo),
  ]);
  if (rows.length === 0) throw new Error('não há horas apontadas no período');
  const modelo = montarRelatorio({ dateFrom, dateTo, rows, ...apoio, codigo, extraidoEm: new Date() });
  imprimirHtml(renderizarRelatorioHtml(modelo));
}

/** Nome do item nos menus de exportação — o mesmo nas duas telas que o oferecem. */
export const ROTULO_RELATORIO_HORAS = 'Visão Horas/Produtos (PDF)';
