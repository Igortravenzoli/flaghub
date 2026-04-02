import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GerencialQaRow {
  sprint_code: string;
  total_itens: number;
  testadas: number;
  aprovadas: number;
  reprovadas: number;
  retornadas: number;
  avg_qualidade_days: number | null;
  max_qualidade_days: number | null;
  taxa_aprovacao: number;
  taxa_retrabalho: number;
  retrabalho_baixo: number;
  retrabalho_alto: number;
  retrabalho_critico: number;
  itens_criticos: number;
  itens_atencao: number;
  itens_saudaveis: number;
}

export interface QaDesempenhoRow {
  responsavel: string;
  tasks_testadas: number;
  avg_qualidade_days: number | null;
  reprovacoes: number;
  taxa_aprovacao: number;
  retornos_gerados: number;
  itens_criticos: number;
}

export function useGerencialQa(sprintCode?: string, dateStart?: string, dateEnd?: string) {
  return useQuery({
    queryKey: ['gerencial-qa', sprintCode, dateStart, dateEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_gerencial_qa_summary', {
        p_sprint_code: sprintCode || null,
        p_date_start: dateStart || null,
        p_date_end: dateEnd || null,
      });
      if (error) throw error;
      return (data || []) as unknown as GerencialQaRow[];
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useQaDesempenho(sprintCode?: string, dateStart?: string, dateEnd?: string) {
  return useQuery({
    queryKey: ['qa-desempenho', sprintCode, dateStart, dateEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_qa_desempenho_responsavel', {
        p_sprint_code: sprintCode || null,
        p_date_start: dateStart || null,
        p_date_end: dateEnd || null,
      });
      if (error) throw error;
      return (data || []) as unknown as QaDesempenhoRow[];
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
