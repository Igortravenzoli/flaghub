/**
 * Transbordo de sprint — mover PBI/Bugs não concluídos para a próxima sprint.
 *
 * Fluxo: CLASSIFICAR (aplica a tag TRANSBORDO nos escolhidos) → APLICAR
 * TRANSBORDO (move só o que está classificado). A tag é a autorização humana,
 * dada antes; o botão nunca move o que não foi marcado.
 *
 * Escreve no Azure DevOps via edge `devops-transbordo`. A trava (foto selada da
 * sprint que fechou E data posterior ao fim dela) é decidida no banco por
 * rpc_transbordo_contexto e revalidada pela edge — o gate do front é só UX.
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Contexto / trava ────────────────────────────────────────────────────────

export interface TransbordoContexto {
  sprint_origem: string | null;
  sprint_fim: string | null;
  sprint_destino: string | null;
  foto_selada: boolean;
  foto_as_of: string | null;
  pode_migrar: boolean;
  motivo: string;
}

export function useTransbordoContexto() {
  return useQuery({
    queryKey: ['transbordo', 'contexto'],
    queryFn: async (): Promise<TransbordoContexto | null> => {
      const { data, error } = await (supabase as any).rpc('rpc_transbordo_contexto');
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as TransbordoContexto | null;
    },
    staleTime: 60 * 1000,
  });
}

// ─── Elegíveis (classificados × pendentes de classificação) ─────────────────

export interface TransbordoElegivel {
  work_item_id: number;
  work_item_type: string | null;
  title: string | null;
  state: string | null;
  tags: string;
  tem_tag: boolean;
  iteration_path: string | null;
  web_url: string | null;
  tasks_filhas: number;
  migracoes: number;
}

export function useTransbordoElegiveis(sprint: string | null | undefined) {
  return useQuery({
    queryKey: ['transbordo', 'elegiveis', sprint],
    queryFn: async (): Promise<TransbordoElegivel[]> => {
      const { data, error } = await (supabase as any).rpc('rpc_transbordo_elegiveis', { p_sprint: sprint });
      if (error) throw error;
      return (data ?? []) as TransbordoElegivel[];
    },
    enabled: !!sprint,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

// ─── Histórico dos lotes ─────────────────────────────────────────────────────

export interface TransbordoLote {
  batch_id: string;
  tipo: 'classificacao' | 'transbordo';
  sprint_origem: string;
  sprint_destino: string | null;
  executed_at: string;
  executor: string | null;
  total_itens: number;
  total_sucesso: number;
  total_falha: number;
  dry_run: boolean;
}

export function useTransbordoHistorico(days = 90) {
  return useQuery({
    queryKey: ['transbordo', 'historico', days],
    queryFn: async (): Promise<TransbordoLote[]> => {
      const { data, error } = await (supabase as any).rpc('rpc_transbordo_historico', { p_days: days });
      if (error) throw error;
      return (data ?? []) as TransbordoLote[];
    },
    staleTime: 60 * 1000,
  });
}

// ─── Ação: classificar / migrar ──────────────────────────────────────────────

export interface TransbordoResultado {
  ok: boolean;
  mode: 'classify' | 'migrate';
  dryRun: boolean;
  batchId: string;
  sprintOrigem: string;
  sprintDestino: string | null;
  processados: number;
  sucesso: number;
  falha: number;
  message?: string;
}

export function useTransbordoAcao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      mode: 'classify' | 'migrate';
      workItemIds?: number[];
      dryRun?: boolean;
    }): Promise<TransbordoResultado> => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Não autenticado.');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const resp = await fetch(`${supabaseUrl}/functions/v1/devops-transbordo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(params),
      });
      const json = await resp.json();
      if (!resp.ok) {
        // 409 = trava do servidor recusou (foto não selada ou sprint em curso)
        throw new Error(json?.motivo ?? json?.error ?? json?.detail ?? `HTTP ${resp.status}`);
      }
      return json as TransbordoResultado;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transbordo'] });
      // O escopo da sprint muda quando itens migram
      queryClient.invalidateQueries({ queryKey: ['fabrica-kpis'] });
    },
  });
}
