import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { qKeyDoMes, qLabel, ymLabel, ymNow } from '@/lib/comercialPeriodo';

// Reexportados por compatibilidade — a fonte é @/lib/comercialPeriodo.
export { ymNow, ymLabel };

export type FunilKey = 'sdr' | 'comercial';

export interface FunilEtapa {
  id: string;
  funil: FunilKey;
  etapa: string;
  icone: string | null;
  ordem: number;
  /** Quantidade do escopo selecionado — soma dos meses quando o escopo é trimestral. */
  quantidade: number;
  updated_at: string;
}

export interface FunilLancamento {
  id: string;
  etapa_id: string;
  mes: string; // YYYY-MM-DD (dia 1)
  quantidade: number;
}

export interface FunilHistoricoMes {
  /** 'YYYY-MM' (mensal) ou 'YYYY-Q3' (trimestral). */
  mes: string;
  /** ex: jul/26 · Q3 2026 */
  label: string;
  sdr: number;
  comercial: number;
  /** Acumulado no ano até este ponto. */
  sdrAcum: number;
  comercialAcum: number;
}

const ETAPAS_KEY = ['comercial', 'funil', 'etapas'];
const LANC_KEY = ['comercial', 'funil', 'lancamentos'];

function acumularPorAno(
  linhas: { mes: string; label: string; sdr: number; comercial: number }[]
): FunilHistoricoMes[] {
  let ano = '';
  let sdrAcum = 0;
  let comercialAcum = 0;
  return linhas.map(l => {
    const anoLinha = l.mes.slice(0, 4);
    if (anoLinha !== ano) {
      ano = anoLinha;
      sdrAcum = 0;
      comercialAcum = 0;
    }
    sdrAcum += l.sdr;
    comercialAcum += l.comercial;
    return { ...l, sdrAcum, comercialAcum };
  });
}

/**
 * Funil de vendas com lançamentos mensais.
 *
 * @param escopo mês ('YYYY-MM') ou lista de meses; default = mês corrente.
 *   Trimestre = soma dos lançamentos mensais (regra fechada na reunião de 29/07/2026);
 *   o lançamento continua sendo sempre mensal.
 */
export function useComercialFunil(escopo?: string | string[]) {
  const queryClient = useQueryClient();
  const mesesPedidos = (Array.isArray(escopo) ? escopo : [escopo ?? ymNow()]).filter(Boolean) as string[];

  const etapasQuery = useQuery({
    queryKey: ETAPAS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comercial_funil')
        .select('id, funil, etapa, icone, ordem, updated_at')
        .order('funil')
        .order('ordem');
      if (error) throw error;
      return (data || []) as Omit<FunilEtapa, 'quantidade'>[];
    },
    staleTime: 60 * 1000,
  });

  const lancQuery = useQuery({
    queryKey: LANC_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comercial_funil_lancamentos')
        .select('id, etapa_id, mes, quantidade')
        .order('mes');
      if (error) throw error;
      return (data || []) as FunilLancamento[];
    },
    staleTime: 60 * 1000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ETAPAS_KEY });
    queryClient.invalidateQueries({ queryKey: LANC_KEY });
  };

  const catalog = etapasQuery.data || [];
  const lancamentos = lancQuery.data || [];

  // Meses com lançamento (para seletor e histograma)
  const mesesComDados = [...new Set(lancamentos.map(l => l.mes.slice(0, 7)))].sort();
  const ultimoMesComDados = mesesComDados.length > 0 ? mesesComDados[mesesComDados.length - 1] : ymNow();

  // Fallback explícito: se o escopo pedido não tem nenhum lançamento, exibe o
  // último mês com dados — mas devolve `fallbackDe` para a tela poder avisar.
  // Antes disso a Visão Executiva simplesmente ignorava o período (silencioso).
  const escopoTemDados = mesesPedidos.some(m => mesesComDados.includes(m));
  const semDados = lancQuery.isSuccess && !escopoTemDados && mesesComDados.length > 0;
  const meses = semDados ? [ultimoMesComDados] : mesesPedidos;
  const fallbackDe = semDados ? mesesPedidos : null;

  // Quantidade por etapa no escopo (soma dos meses selecionados)
  const mesesSet = new Set(meses);
  const qtyByEtapa = new Map<string, number>();
  for (const l of lancamentos) {
    const ym = l.mes.slice(0, 7);
    if (!mesesSet.has(ym)) continue;
    qtyByEtapa.set(l.etapa_id, (qtyByEtapa.get(l.etapa_id) ?? 0) + l.quantidade);
  }

  const etapas: FunilEtapa[] = catalog.map(e => ({
    ...e,
    quantidade: qtyByEtapa.get(e.id) ?? 0,
  }));

  const sdr = etapas.filter(e => e.funil === 'sdr');
  const comercial = etapas.filter(e => e.funil === 'comercial');

  // Histórico: total por funil × mês (e por trimestre), com acumulado no ano
  const funilByEtapa = new Map(catalog.map(e => [e.id, e.funil]));
  const histMap = new Map<string, { sdr: number; comercial: number }>();
  for (const l of lancamentos) {
    const ym = l.mes.slice(0, 7);
    const funil = funilByEtapa.get(l.etapa_id);
    if (!funil) continue;
    const acc = histMap.get(ym) ?? { sdr: 0, comercial: 0 };
    acc[funil] += l.quantidade;
    histMap.set(ym, acc);
  }
  const mesesOrdenados = [...histMap.keys()].sort();

  const historico: FunilHistoricoMes[] = acumularPorAno(
    mesesOrdenados.map(ym => ({ mes: ym, label: ymLabel(ym), ...histMap.get(ym)! }))
  );

  const qMap = new Map<string, { sdr: number; comercial: number }>();
  for (const ym of mesesOrdenados) {
    const qk = qKeyDoMes(ym);
    const acc = qMap.get(qk) ?? { sdr: 0, comercial: 0 };
    const v = histMap.get(ym)!;
    acc.sdr += v.sdr;
    acc.comercial += v.comercial;
    qMap.set(qk, acc);
  }
  const historicoTrimestral: FunilHistoricoMes[] = acumularPorAno(
    [...qMap.keys()].sort().map(qk => ({ mes: qk, label: qLabel(qk, false), ...qMap.get(qk)! }))
  );

  const createEtapa = useMutation({
    mutationFn: async (input: { funil: FunilKey; etapa: string; icone?: string | null; ordem: number }) => {
      const { data, error } = await supabase
        .from('comercial_funil')
        .insert({ funil: input.funil, etapa: input.etapa, icone: input.icone ?? null, ordem: input.ordem })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });

  const updateEtapa = useMutation({
    mutationFn: async (input: { id: string; etapa?: string; icone?: string | null; ordem?: number }) => {
      const { id, ...fields } = input;
      const { error } = await supabase
        .from('comercial_funil')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteEtapa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('comercial_funil').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Grava a quantidade de uma etapa em um mês (upsert por etapa+mês). */
  const upsertLancamento = useMutation({
    mutationFn: async (input: { etapa_id: string; mes: string; quantidade: number }) => {
      const { error } = await supabase
        .from('comercial_funil_lancamentos')
        .upsert(
          {
            etapa_id: input.etapa_id,
            mes: `${input.mes}-01`,
            quantidade: input.quantidade,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'etapa_id,mes' }
        );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    /** Meses efetivamente exibidos (já com fallback aplicado). */
    meses,
    /** Meses pedidos que não tinham lançamento — null quando não houve fallback. */
    fallbackDe,
    etapas,
    sdr,
    comercial,
    historico,
    historicoTrimestral,
    mesesComDados,
    ultimoMesComDados,
    isLoading: etapasQuery.isLoading || lancQuery.isLoading,
    isError: etapasQuery.isError || lancQuery.isError,
    refetch: () => { etapasQuery.refetch(); lancQuery.refetch(); },
    createEtapa,
    updateEtapa,
    deleteEtapa,
    upsertLancamento,
  };
}
