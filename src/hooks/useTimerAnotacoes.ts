import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Anotações do Timer: lembretes que viram Task (play → escolhe o PBI/Bug →
 * cria a Task → inicia o timer). Não marcam tempo. Ficam no banco porque a
 * mesma pessoa usa o navegador e o app desktop.
 *
 * Egress: lidas ao abrir a tela; cada ação devolve a lista nova.
 */
export interface Anotacao {
  id: string;
  texto: string;
  criado_em: string;
}

const db = supabase as unknown as SupabaseClient;
const chave = (userId: string | undefined) => ['timer-anotacoes', userId ?? 'anon'] as const;

function lista(data: unknown): Anotacao[] {
  return Array.isArray(data) ? (data as Anotacao[]) : [];
}

const MENSAGENS: Record<string, string> = {
  timer_anotacao_vazia: 'Escreva algo na anotação.',
  timer_anotacoes_demais: 'Você já tem 50 anotações abertas. Feche ou apague algumas.',
  timer_anotacao_inexistente: 'Essa anotação já não existe.',
};
function mensagem(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message ?? '';
  const k = Object.keys(MENSAGENS).find((x) => msg.includes(x));
  return k ? MENSAGENS[k] : 'Não foi possível salvar a anotação.';
}

export function useTimerAnotacoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const k = chave(user?.id);

  const consulta = useQuery({
    queryKey: k,
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await db.rpc('timer_anotacoes');
      if (error) throw error;
      return lista(data);
    },
  });

  const gravar = (data: unknown) => qc.setQueryData(k, lista(data));
  const falhou = (e: unknown) => toast.error(mensagem(e));

  const anotar = useMutation({
    mutationFn: async (texto: string) => {
      const { data, error } = await db.rpc('timer_anotar', { p_texto: texto });
      if (error) throw error;
      return data;
    },
    onSuccess: gravar,
    onError: falhou,
  });

  const fechar = useMutation({
    mutationFn: async (p: { id: string; virouItemId?: number | null }) => {
      const { data, error } = await db.rpc('timer_anotacao_fechar', { p_id: p.id, p_virou_item_id: p.virouItemId ?? null });
      if (error) throw error;
      return data;
    },
    onSuccess: gravar,
    onError: falhou,
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db.rpc('timer_anotacao_apagar', { p_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: gravar,
    onError: falhou,
  });

  const editar = useMutation({
    mutationFn: async (p: { id: string; texto: string }) => {
      const { data, error } = await db.rpc('timer_anotacao_editar', { p_id: p.id, p_texto: p.texto });
      if (error) throw error;
      return data;
    },
    onSuccess: gravar,
    onError: falhou,
  });

  return { anotacoes: consulta.data ?? [], carregando: consulta.isLoading, anotar, fechar, apagar, editar };
}
