import { CADENCIA_MINIMA_MS } from '@/lib/cadencia';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

/**
 * Horas correlacionadas com CLIENTE e PRODUTO, para o TimeLog Executivo.
 *
 * Sai de `v_horas_negocio`, que já resolve as duas regras que não podem ser
 * quebradas no portal: hora removida no DevOps não conta, e VDESK e DevOps são
 * a mesma hora lançada em dois lugares — consolidada com `greatest()` por
 * (work item, dia, colaborador), nunca somada.
 *
 * `origem` diz de onde veio a classificação de cada linha ('campo' do Azure ou
 * 'tag'). O gestor exigiu essa coluna: a cobertura muda por período e um total
 * sem procedência não é auditável. Linha sem nenhum dos dois entra como
 * SEM_CLIENTE / SEM_PRODUTO e continua somando — hora sem classificação some do
 * relatório é o pior desfecho possível para um fechamento.
 *
 * O corte é SEMPRE por data de lançamento, nunca por sprint: 99% das horas de
 * um mês vêm de sprints que atravessam o mês (medido em julho/2026), então
 * sprint e mês fiscal não são reconciliáveis.
 */

export type OrigemClassificacao = 'campo' | 'tag' | null;
export type Conciliacao = 'match' | 'divergent' | 'only_vdesk' | 'only_devops';

export interface HoraNegocioRow {
  work_item_id: number | null;
  log_date: string;
  colaborador: string | null;
  minutos: number;
  horas: number;
  minutes_vdesk: number;
  minutes_devops: number;
  /** Lançamentos originais consolidados nesta linha, por lado. */
  lancamentos_vdesk: number;
  lancamentos_devops: number;
  conciliacao: Conciliacao;
  cliente: string | null;
  cliente_origem: OrigemClassificacao;
  cliente_herdado: boolean | null;
  cliente_ambiguo: boolean | null;
  produto: string | null;
  produto_origem: OrigemClassificacao;
  produto_herdado: boolean | null;
  produto_ambiguo: boolean | null;
  work_item_type: string | null;
  work_item_title: string | null;
  work_item_state: string | null;
  iteration_path: string | null;
  sprint_code: string | null;
  pbi_id: number | null;
  pbi_title: string | null;
  pbi_type: string | null;
  pbi_cliente: string | null;
  pbi_produto: string | null;
  pbi_cliente_origem: OrigemClassificacao;
  pbi_produto_origem: OrigemClassificacao;
}

export interface HorasNegocioFilters {
  dateFrom: string;
  dateTo: string;
}

const COLUNAS =
  'work_item_id,log_date,colaborador,minutos,horas,minutes_vdesk,minutes_devops,' +
  'lancamentos_vdesk,lancamentos_devops,conciliacao,' +
  'cliente,cliente_origem,cliente_herdado,cliente_ambiguo,' +
  'produto,produto_origem,produto_herdado,produto_ambiguo,' +
  'work_item_type,work_item_title,work_item_state,iteration_path,sprint_code,' +
  'pbi_id,pbi_title,pbi_type,pbi_cliente,pbi_produto,pbi_cliente_origem,pbi_produto_origem';

export const SEM_CLIENTE = 'Sem cliente';
export const SEM_PRODUTO = 'Sem produto';
export const SEM_COLABORADOR = 'Sem colaborador';

/** Tipos que contam como PBI nos indicadores do período. */
const TIPOS_PBI = new Set(['Product Backlog Item', 'User Story', 'Bug']);

export function useHorasNegocio(filters: HorasNegocioFilters) {
  return useQuery({
    queryKey: ['horas-negocio', filters.dateFrom, filters.dateTo],
    placeholderData: keepPreviousData,
    staleTime: CADENCIA_MINIMA_MS,
    queryFn: async () => {
      const rows = await fetchAllRows<HoraNegocioRow>((from, to) =>
        // `v_horas_negocio` é nova e ainda não está no types.ts gerado; o
        // contrato real está tipado acima em HoraNegocioRow.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('v_horas_negocio')
          .select(COLUNAS)
          .gte('log_date', filters.dateFrom)
          .lte('log_date', filters.dateTo)
          .order('log_date', { ascending: false })
          .range(from, to)
      );
      return rows;
    },
  });
}

// ─── Período ──────────────────────────────────────────────────────────────────

/**
 * Mês fechado anterior ao corrente. É o padrão pedido pelo gestor: o mês em
 * curso ainda recebe lançamento e o total muda debaixo de quem está olhando.
 */
export function mesFechadoAnterior(hoje = new Date()): { dateFrom: string; dateTo: string } {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-based; o mês anterior é `mes - 1`
  const inicio = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 0); // dia 0 do mês corrente = último dia do anterior
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { dateFrom: iso(inicio), dateTo: iso(fim) };
}

// ─── Indicadores ──────────────────────────────────────────────────────────────

export interface KpisExecutivo {
  horasDevops: number;
  horasVdesk: number;
  registosVdesk: number;
  registosSincronizados: number;
  pctSincronizado: number;
  pbis: number;
  tasks: number;
  pbisSemCliente: number;
  pbisSemProduto: number;
  pbisSemAmbos: number;
  pbisSoPorTag: number;
  conciliacao: Record<Conciliacao, number>;
}

export function calcularKpis(rows: HoraNegocioRow[]): KpisExecutivo {
  let horasDevops = 0;
  let horasVdesk = 0;
  let registosVdesk = 0;
  let registosSincronizados = 0;

  const conciliacao: Record<Conciliacao, number> = {
    match: 0, divergent: 0, only_vdesk: 0, only_devops: 0,
  };

  const tasks = new Set<number>();
  // O PBI é contado uma vez só, mas a classificação dele pode aparecer em
  // várias linhas — daí guardar o estado por id em vez de contar direto.
  const pbis = new Map<number, { cliente: boolean; produto: boolean; soTag: boolean }>();

  for (const r of rows) {
    horasDevops += r.minutes_devops / 60;
    horasVdesk += r.minutes_vdesk / 60;
    // Soma os LANÇAMENTOS, não as linhas: a view é consolidada por (work item,
    // dia, colaborador) e uma linha pode conter mais de um lançamento do VDESK.
    // Contar linhas dava 175 onde a verdade eram 178 em julho/2026.
    //
    // `minutes_vdesk > 0` exclui lançamento de tempo zerado do denominador.
    // Sem isso o indicador nunca fecha: hora zero não tem o que sincronizar, e
    // o enfileiramento a bloqueia de propósito, então ela ficaria para sempre
    // como pendência fantasma. Em julho/2026 eram 3 lançamentos, e por causa
    // deles o mês travava em 98,3% com tudo conciliado.
    if (r.lancamentos_vdesk > 0 && r.minutes_vdesk > 0) {
      registosVdesk += r.lancamentos_vdesk;
      if (r.minutes_devops > 0) registosSincronizados += r.lancamentos_vdesk;
    }
    if (conciliacao[r.conciliacao] !== undefined) conciliacao[r.conciliacao] += 1;

    if (r.work_item_id && r.work_item_type === 'Task') tasks.add(r.work_item_id);

    if (r.pbi_id && r.pbi_type && TIPOS_PBI.has(r.pbi_type)) {
      const temCampo = r.pbi_cliente_origem === 'campo' || r.pbi_produto_origem === 'campo';
      const temTag = r.pbi_cliente_origem === 'tag' || r.pbi_produto_origem === 'tag';
      pbis.set(r.pbi_id, {
        cliente: !!r.pbi_cliente,
        produto: !!r.pbi_produto,
        soTag: temTag && !temCampo,
      });
    }
  }

  let pbisSemCliente = 0;
  let pbisSemProduto = 0;
  let pbisSemAmbos = 0;
  let pbisSoPorTag = 0;
  for (const p of pbis.values()) {
    if (!p.cliente) pbisSemCliente += 1;
    if (!p.produto) pbisSemProduto += 1;
    if (!p.cliente && !p.produto) pbisSemAmbos += 1;
    if (p.soTag) pbisSoPorTag += 1;
  }

  return {
    horasDevops,
    horasVdesk,
    registosVdesk,
    registosSincronizados,
    pctSincronizado: registosVdesk > 0
      ? Math.round((registosSincronizados / registosVdesk) * 1000) / 10
      : 0,
    pbis: pbis.size,
    tasks: tasks.size,
    pbisSemCliente,
    pbisSemProduto,
    pbisSemAmbos,
    pbisSoPorTag,
    conciliacao,
  };
}

// ─── Série diária ─────────────────────────────────────────────────────────────

export function serieDiaria(rows: HoraNegocioRow[]): Array<{ dia: string; horas: number }> {
  const mapa = new Map<string, number>();
  for (const r of rows) mapa.set(r.log_date, (mapa.get(r.log_date) ?? 0) + r.horas);
  return [...mapa.entries()]
    .map(([dia, horas]) => ({ dia, horas }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

// ─── Árvore: dimensão → PBI → task → lançamento ───────────────────────────────

/**
 * `task` é diferente das outras três: em vez de agrupar, ela ACHATA. O gestor
 * pediu a lista corrida das tasks do período, sem hierarquia — é a visão de
 * quem procura um item específico, não de quem analisa um recorte.
 */
export type Dimensao = 'cliente' | 'produto' | 'colaborador' | 'task';

export interface NoTask {
  workItemId: number | null;
  titulo: string | null;
  tipo: string | null;
  colaborador: string | null;
  conciliacao: Conciliacao;
  horas: number;
  lancamentos: HoraNegocioRow[];
}

export interface NoPbi {
  pbiId: number | null;
  titulo: string | null;
  horas: number;
  registos: number;
  tasks: NoTask[];
}

/** Metadados que só a lista plana de tasks usa. */
export interface InfoTask {
  workItemId: number | null;
  titulo: string | null;
  tipo: string | null;
  cliente: string | null;
  produto: string | null;
  colaboradores: string[];
  conciliacao: Conciliacao;
  pbiId: number | null;
  lancamentos: HoraNegocioRow[];
}

export interface NoDimensao {
  chave: string;
  horas: number;
  registos: number;
  horasPorCampo: number;
  horasPorTag: number;
  semClassificacao: boolean;
  /** Vazio quando a dimensão é `task`: ali a lista é plana. */
  pbis: NoPbi[];
  task?: InfoTask;
}

export const SEM_TASK = 'Sem work item';

function chaveDaDimensao(row: HoraNegocioRow, dim: Dimensao): string {
  if (dim === 'cliente') return row.cliente ?? SEM_CLIENTE;
  if (dim === 'produto') return row.produto ?? SEM_PRODUTO;
  if (dim === 'task') return row.work_item_id ? String(row.work_item_id) : SEM_TASK;
  return row.colaborador ?? SEM_COLABORADOR;
}

/**
 * Lista plana de tasks. Uma linha por work item, com as horas de TODOS os
 * colaboradores somadas — quem quiser separar por pessoa usa a chave
 * Colaborador. Abrir a linha mostra os lançamentos, que é o único nível abaixo.
 */
function montarListaTasks(rows: HoraNegocioRow[]): NoDimensao[] {
  const mapa = new Map<string, NoDimensao & { _colaboradores: Set<string> }>();

  for (const row of rows) {
    const chave = chaveDaDimensao(row, 'task');
    let no = mapa.get(chave);
    if (!no) {
      no = {
        chave, horas: 0, registos: 0, horasPorCampo: 0, horasPorTag: 0,
        semClassificacao: !row.work_item_id,
        pbis: [],
        _colaboradores: new Set<string>(),
        task: {
          workItemId: row.work_item_id,
          titulo: row.work_item_title,
          tipo: row.work_item_type,
          cliente: row.cliente,
          produto: row.produto,
          colaboradores: [],
          conciliacao: row.conciliacao,
          pbiId: row.pbi_id,
          lancamentos: [],
        },
      };
      mapa.set(chave, no);
    }
    no.horas += row.horas;
    no.registos += 1;
    if (row.cliente_origem === 'campo') no.horasPorCampo += row.horas;
    else if (row.cliente_origem === 'tag') no.horasPorTag += row.horas;
    if (row.colaborador) no._colaboradores.add(row.colaborador);
    no.task!.lancamentos.push(row);
  }

  return [...mapa.values()]
    .map((no) => {
      no.task!.colaboradores = [...no._colaboradores].sort((a, b) => a.localeCompare(b, 'pt'));
      no.task!.lancamentos.sort((a, b) => a.log_date.localeCompare(b.log_date));
      return no;
    })
    .sort((a, b) => b.horas - a.horas);
}

/**
 * Monta a árvore do analítico.
 *
 * A task agrupa por (work item, colaborador, conciliação) e não só por work
 * item: a mesma task recebe hora de gente diferente, e juntar tudo numa linha
 * esconderia justamente o que o financeiro quer ver. Quando não há task no
 * DevOps (`only_vdesk`), `workItemId` fica nulo e a tela mostra a origem VDESK
 * no lugar do link.
 */
export function montarArvore(rows: HoraNegocioRow[], dim: Dimensao): NoDimensao[] {
  if (dim === 'task') return montarListaTasks(rows);

  const raiz = new Map<string, NoDimensao & { _pbis: Map<string, NoPbi & { _tasks: Map<string, NoTask> }> }>();

  for (const row of rows) {
    const chave = chaveDaDimensao(row, dim);
    let n1 = raiz.get(chave);
    if (!n1) {
      n1 = {
        chave, horas: 0, registos: 0, horasPorCampo: 0, horasPorTag: 0,
        semClassificacao: chave.startsWith('Sem '), pbis: [], _pbis: new Map(),
      };
      raiz.set(chave, n1);
    }
    n1.horas += row.horas;
    n1.registos += 1;
    const origem = dim === 'produto' ? row.produto_origem : row.cliente_origem;
    if (origem === 'campo') n1.horasPorCampo += row.horas;
    else if (origem === 'tag') n1.horasPorTag += row.horas;

    const pk = String(row.pbi_id ?? 'sem-pbi');
    let n2 = n1._pbis.get(pk);
    if (!n2) {
      n2 = { pbiId: row.pbi_id, titulo: row.pbi_title, horas: 0, registos: 0, tasks: [], _tasks: new Map() };
      n1._pbis.set(pk, n2);
    }
    n2.horas += row.horas;
    n2.registos += 1;

    const tk = `${row.work_item_id ?? 'vdesk'}|${row.colaborador ?? ''}|${row.conciliacao}`;
    let n3 = n2._tasks.get(tk);
    if (!n3) {
      n3 = {
        workItemId: row.conciliacao === 'only_vdesk' ? null : row.work_item_id,
        titulo: row.work_item_title,
        tipo: row.work_item_type,
        colaborador: row.colaborador,
        conciliacao: row.conciliacao,
        horas: 0,
        lancamentos: [],
      };
      n2._tasks.set(tk, n3);
    }
    n3.horas += row.horas;
    n3.lancamentos.push(row);
  }

  const saida = [...raiz.values()].map((n1) => {
    n1.pbis = [...n1._pbis.values()]
      .map((n2) => {
        n2.tasks = [...n2._tasks.values()].sort((a, b) => b.horas - a.horas);
        n2.tasks.forEach((t) => t.lancamentos.sort((a, b) => a.log_date.localeCompare(b.log_date)));
        return n2;
      })
      .sort((a, b) => b.horas - a.horas);
    return n1;
  });

  return saida.sort((a, b) => b.horas - a.horas);
}

export function ordenarArvore(
  nos: NoDimensao[],
  coluna: number,
  dir: 'asc' | 'desc'
): NoDimensao[] {
  const sinal = dir === 'asc' ? 1 : -1;
  const total = nos.reduce((s, n) => s + n.horas, 0);
  return [...nos].sort((a, b) => {
    if (coluna === 0) return sinal * a.chave.localeCompare(b.chave, 'pt');
    if (coluna === 1) return sinal * (a.pbis.length - b.pbis.length);
    if (coluna === 4) return sinal * ((a.horas / (total || 1)) - (b.horas / (total || 1)));
    if (coluna === 5) return sinal * (a.registos - b.registos);
    return sinal * (a.horas - b.horas);
  });
}

// ─── Rankings ─────────────────────────────────────────────────────────────────

export function ranking(rows: HoraNegocioRow[], dim: Dimensao, limite = 8) {
  const mapa = new Map<string, number>();
  for (const r of rows) {
    const k = chaveDaDimensao(r, dim);
    mapa.set(k, (mapa.get(k) ?? 0) + r.horas);
  }
  return [...mapa.entries()]
    .map(([chave, horas]) => ({ chave, horas }))
    .sort((a, b) => b.horas - a.horas)
    .slice(0, limite);
}

export interface ResumoCobertura {
  horasTotal: number;
  horasComCliente: number;
  horasComProduto: number;
  pctCliente: number;
  pctProduto: number;
  clientes: number;
  produtos: number;
  colaboradores: number;
  horasAmbiguas: number;
}

export function resumirCobertura(rows: HoraNegocioRow[]): ResumoCobertura {
  let horasTotal = 0;
  let horasComCliente = 0;
  let horasComProduto = 0;
  let horasAmbiguas = 0;
  const clientes = new Set<string>();
  const produtos = new Set<string>();
  const colaboradores = new Set<string>();

  for (const row of rows) {
    horasTotal += row.horas;
    if (row.cliente) { horasComCliente += row.horas; clientes.add(row.cliente); }
    if (row.produto) { horasComProduto += row.horas; produtos.add(row.produto); }
    if (row.colaborador) colaboradores.add(row.colaborador);
    if (row.cliente_ambiguo || row.produto_ambiguo) horasAmbiguas += row.horas;
  }

  const pct = (parte: number) => (horasTotal > 0 ? Math.round((parte / horasTotal) * 100) : 0);

  return {
    horasTotal, horasComCliente, horasComProduto,
    pctCliente: pct(horasComCliente),
    pctProduto: pct(horasComProduto),
    clientes: clientes.size, produtos: produtos.size, colaboradores: colaboradores.size,
    horasAmbiguas,
  };
}
