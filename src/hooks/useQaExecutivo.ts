import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ── META: fila QA + idade em sprints (rpc_qa_exec_fila_aging) ────────────────
export interface QaFilaOrigem {
  sprint_origem: string;
  age_sprints: number;
  n: number;
  atraso: boolean;
}

export interface QaFilaAging {
  sprint_atual: string;
  total_qa: number;
  em_teste: number;
  aguardando_deploy: number;
  no_prazo: number;
  atraso: number;
  sem_sprint: number;
  por_origem: QaFilaOrigem[];
}

export function useQaExecFilaAging() {
  return useQuery({
    queryKey: ['qa-exec-fila-aging'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('rpc_qa_exec_fila_aging');
      if (error) throw error;
      return (data ?? null) as QaFilaAging | null;
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

// ── Retornos quantificados + reconciliação (rpc_qa_exec_retornos_distribuicao) ─
export interface QaRetornoTop {
  work_item_id: number;
  title: string | null;
  work_item_type: string | null;
  sprint_code: string | null;
  ciclos: number;
  tem_aberto: boolean;
}

export interface QaRetornosDistribuicao {
  eventos_total: number;
  itens_com_retorno: number;
  itens_1x: number;
  itens_2x: number;
  itens_3x_mais: number;
  top_3x_mais: QaRetornoTop[];
  reconc: {
    itens_qualquer_estagio: number;
    itens_concluidos: number;
    ciclos_concluidos: number;
  };
}

export function useQaExecRetornosDistribuicao(year: number) {
  return useQuery({
    queryKey: ['qa-exec-retornos-dist', year],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('rpc_qa_exec_retornos_distribuicao', { p_year: year });
      if (error) throw error;
      return (data ?? null) as QaRetornosDistribuicao | null;
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

// ── Controle de versão de sistemas (qualidade_sistema_versions) ──────────────
export interface SistemaVersao {
  id: string;
  sistema_nome: string;
  versao_atual: string;
  ordem: number;
  notas: string | null;
  is_active: boolean;
  updated_at: string;
}

export function useQualidadeSistemaVersions() {
  return useQuery({
    queryKey: ['qualidade-sistema-versions'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('qualidade_sistema_versions')
        .select('*')
        .eq('is_active', true)
        .order('ordem', { ascending: true })
        .order('sistema_nome', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SistemaVersao[];
    },
    staleTime: 60 * 1000,
  });
}

export function useSistemaVersaoMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['qualidade-sistema-versions'] });

  const create = useMutation({
    mutationFn: async (v: { sistema_nome: string; versao_atual: string; ordem?: number; notas?: string | null }) => {
      const { error } = await (supabase as any).from('qualidade_sistema_versions').insert(v);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await (supabase as any).from('qualidade_sistema_versions').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('qualidade_sistema_versions').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
