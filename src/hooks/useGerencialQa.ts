import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GerencialQaRow {
  sprint_code: string;
  total_itens: number;
  concluidos: number;
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

export interface QaEncerramentoUsuarioRow {
  sprint_code: string;
  closer_email: string;
  closer_display: string;
  encerramentos: number;
  sem_retorno: number;
  com_retorno: number;
}

export interface GerencialQaItemRow {
  work_item_id: number;
  sprint_code: string;
  work_item_type: string | null;
  title: string | null;
  tags: string | null;
  qa_return_count: number;
  closed_by: string | null;
  closed_by_email: string | null;
  qa_closed: boolean;
  current_stage: string | null;
  qualidade_days: number | null;
}

export function useQaEncerramentosPorUsuario(dateStart?: string, dateEnd?: string) {
  return useQuery({
    queryKey: ['qa-encerramentos-usuario', dateStart, dateEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_qa_encerramentos_por_usuario', {
        p_date_start: dateStart || null,
        p_date_end: dateEnd || null,
      });
      if (error) throw error;
      return (data || []) as unknown as QaEncerramentoUsuarioRow[];
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

// ── Visão atemporal (alinhada à query oficial do DevOps) ─────────────────────
// Concluído = qualquer tipo + Done + Closed By autorizado; retorno = tag RETORNO QA.

export interface QaAtemporalSummary {
  concluidos: number;
  com_retorno: number;
  sem_retorno: number;
  pct_sem_retorno: number;
  qtd_tasks: number;
  qtd_pbis: number;
  qtd_bugs: number;
  qtd_outros: number;
}

export function useQaAtemporalSummary(dateStart?: string, dateEnd?: string) {
  return useQuery({
    queryKey: ['qa-atemporal-summary', dateStart, dateEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_qa_atemporal_summary', {
        p_date_start: dateStart || null,
        p_date_end: dateEnd || null,
      });
      if (error) throw error;
      return ((data || []) as unknown as QaAtemporalSummary[])[0] ?? null;
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export interface QaItemAtemporalRow {
  work_item_id: number;
  title: string | null;
  work_item_type: string | null;
  closed_by: string | null;
  closed_date: string | null;
  sprint_periodo: string | null;
  sprint_origem: string;
  tem_retorno: boolean;
  tags: string | null;
  web_url: string | null;
}

export function useQaItemsAtemporal(dateStart?: string, dateEnd?: string) {
  return useQuery({
    queryKey: ['qa-items-atemporal', dateStart, dateEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_qa_items_atemporal', {
        p_date_start: dateStart || null,
        p_date_end: dateEnd || null,
      });
      if (error) throw error;
      return (data || []) as unknown as QaItemAtemporalRow[];
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export interface QaClosedSprintPeriodoRow {
  sprint_periodo: string;
  sprint_origem: string;
  qtd: number;
  com_retorno: number;
}

export function useQaClosedPorSprintPeriodo(year: number) {
  return useQuery({
    queryKey: ['qa-closed-sprint-periodo', year],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_qa_closed_por_sprint_periodo', {
        p_year: year,
      });
      if (error) throw error;
      return (data || []) as unknown as QaClosedSprintPeriodoRow[];
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export interface QaHandoffRow {
  dia: string;
  entradas: number;
}

export function useQaHandoffHistogram(dateStart?: string, dateEnd?: string) {
  return useQuery({
    queryKey: ['qa-handoff-histogram', dateStart, dateEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_qa_handoff_histogram', {
        p_date_start: dateStart || null,
        p_date_end: dateEnd || null,
      });
      if (error) throw error;
      return (data || []) as unknown as QaHandoffRow[];
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useGerencialQaItems(sprintCode?: string, dateStart?: string, dateEnd?: string) {
  return useQuery({
    queryKey: ['gerencial-qa-items', sprintCode, dateStart, dateEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_gerencial_qa_items', {
        p_sprint_code: sprintCode || null,
        p_date_start: dateStart || null,
        p_date_end: dateEnd || null,
      });
      if (error) throw error;
      return (data || []) as unknown as GerencialQaItemRow[];
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
