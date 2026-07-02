import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type FunilKey = 'sdr' | 'comercial';

export interface FunilEtapa {
  id: string;
  funil: FunilKey;
  etapa: string;
  icone: string | null;
  ordem: number;
  /** Quantidade do mês selecionado (0 quando não há lançamento). */
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
  mes: string; // YYYY-MM
  label: string; // ex: jul/26
  sdr: number;
  comercial: number;
}

const ETAPAS_KEY = ['comercial', 'funil', 'etapas'];
const LANC_KEY = ['comercial', 'funil', 'lancamentos'];

export function ymNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const PT_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function ymLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${PT_MESES[parseInt(m, 10) - 1] ?? m}/${y.slice(2)}`;
}

/**
 * Funil de vendas com lançamentos mensais.
 * @param mesKey mês selecionado ('YYYY-MM'); default = mês corrente.
 */
export function useComercialFunil(mesKey?: string) {
  const queryClient = useQueryClient();
  const mes = mesKey ?? ymNow();

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

  // Quantidade por etapa no mês selecionado
  const qtyByEtapa = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.mes.slice(0, 7) === mes) qtyByEtapa.set(l.etapa_id, l.quantidade);
  }

  const etapas: FunilEtapa[] = catalog.map(e => ({
    ...e,
    quantidade: qtyByEtapa.get(e.id) ?? 0,
  }));

  const sdr = etapas.filter(e => e.funil === 'sdr');
  const comercial = etapas.filter(e => e.funil === 'comercial');

  // Meses com lançamento (para seletor e histograma)
  const mesesComDados = [...new Set(lancamentos.map(l => l.mes.slice(0, 7)))].sort();

  // Último mês com dados (fallback: mês corrente) — usado na executiva
  const ultimoMesComDados = mesesComDados.length > 0 ? mesesComDados[mesesComDados.length - 1] : ymNow();

  // Histórico: total por funil × mês
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
  const historico: FunilHistoricoMes[] = [...histMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, v]) => ({ mes: ym, label: ymLabel(ym), sdr: v.sdr, comercial: v.comercial }));

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
    mes,
    etapas,
    sdr,
    comercial,
    historico,
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
