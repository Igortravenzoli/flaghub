import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

/**
 * Horas correlacionadas com CLIENTE e PRODUTO, para a visão financeira.
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
 */

export type OrigemClassificacao = 'campo' | 'tag' | null;

export interface HoraNegocioRow {
  work_item_id: number | null;
  log_date: string;
  colaborador: string | null;
  minutos: number;
  horas: number;
  minutes_vdesk: number;
  minutes_devops: number;
  conciliacao: string;
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
  iteration_path: string | null;
  sprint_code: string | null;
}

export interface HorasNegocioFilters {
  dateFrom: string;
  dateTo: string;
  cliente?: string;
  produto?: string;
  colaborador?: string;
}

const COLUNAS =
  'work_item_id,log_date,colaborador,minutos,horas,minutes_vdesk,minutes_devops,conciliacao,' +
  'cliente,cliente_origem,cliente_herdado,cliente_ambiguo,' +
  'produto,produto_origem,produto_herdado,produto_ambiguo,' +
  'work_item_type,work_item_title,iteration_path,sprint_code';

export const SEM_CLIENTE = 'Sem cliente';
export const SEM_PRODUTO = 'Sem produto';
export const SEM_COLABORADOR = 'Sem colaborador';

export function useHorasNegocio(filters: HorasNegocioFilters) {
  return useQuery({
    queryKey: ['horas-negocio', filters],
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const rows = await fetchAllRows<HoraNegocioRow>((from, to) => {
        // `v_horas_negocio` é nova e ainda não está no types.ts gerado; o
        // contrato real está tipado acima em HoraNegocioRow.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any)
          .from('v_horas_negocio')
          .select(COLUNAS)
          .gte('log_date', filters.dateFrom)
          .lte('log_date', filters.dateTo);

        if (filters.cliente) q = q.eq('cliente', filters.cliente);
        if (filters.produto) q = q.eq('produto', filters.produto);
        if (filters.colaborador) q = q.eq('colaborador', filters.colaborador);

        return q.order('log_date', { ascending: false }).range(from, to);
      });
      return rows;
    },
  });
}

// ─── Agregação ────────────────────────────────────────────────────────────────

export type Dimensao = 'cliente' | 'produto' | 'colaborador';

export interface LinhaAgregada {
  chave: string;
  horas: number;
  /** Horas cuja classificação veio do campo personalizado do Azure. */
  horasPorCampo: number;
  /** Horas cuja classificação veio de tag. */
  horasPorTag: number;
  registos: number;
  /** true quando a linha é o balde de não classificados. */
  semClassificacao: boolean;
}

function valorDaDimensao(row: HoraNegocioRow, dim: Dimensao): { chave: string; vazio: boolean } {
  if (dim === 'cliente') return { chave: row.cliente ?? SEM_CLIENTE, vazio: !row.cliente };
  if (dim === 'produto') return { chave: row.produto ?? SEM_PRODUTO, vazio: !row.produto };
  return { chave: row.colaborador ?? SEM_COLABORADOR, vazio: !row.colaborador };
}

/**
 * Agrega por uma dimensão, mantendo a partição campo/tag visível.
 *
 * Colaborador não tem origem própria — quando a dimensão é colaborador, a
 * partição usada é a do CLIENTE, que é a pergunta que o financeiro faz ao
 * olhar essa lista ("as horas desta pessoa estão classificadas?").
 */
export function agregarPorDimensao(rows: HoraNegocioRow[], dim: Dimensao): LinhaAgregada[] {
  const mapa = new Map<string, LinhaAgregada>();

  for (const row of rows) {
    const { chave, vazio } = valorDaDimensao(row, dim);
    const origem = dim === 'produto' ? row.produto_origem : row.cliente_origem;

    let linha = mapa.get(chave);
    if (!linha) {
      linha = {
        chave,
        horas: 0,
        horasPorCampo: 0,
        horasPorTag: 0,
        registos: 0,
        semClassificacao: vazio,
      };
      mapa.set(chave, linha);
    }

    linha.horas += row.horas;
    linha.registos += 1;
    if (origem === 'campo') linha.horasPorCampo += row.horas;
    else if (origem === 'tag') linha.horasPorTag += row.horas;
  }

  return Array.from(mapa.values()).sort((a, b) => b.horas - a.horas);
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
    if (row.cliente) {
      horasComCliente += row.horas;
      clientes.add(row.cliente);
    }
    if (row.produto) {
      horasComProduto += row.horas;
      produtos.add(row.produto);
    }
    if (row.colaborador) colaboradores.add(row.colaborador);
    if (row.cliente_ambiguo || row.produto_ambiguo) horasAmbiguas += row.horas;
  }

  const pct = (parte: number) => (horasTotal > 0 ? Math.round((parte / horasTotal) * 100) : 0);

  return {
    horasTotal,
    horasComCliente,
    horasComProduto,
    pctCliente: pct(horasComCliente),
    pctProduto: pct(horasComProduto),
    clientes: clientes.size,
    produtos: produtos.size,
    colaboradores: colaboradores.size,
    horasAmbiguas,
  };
}
