import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { ItemDevops } from '@/lib/minhasAtividades';

/**
 * Tarefas do Timer, lidas AO VIVO do Azure DevOps pela edge `timer-devops`.
 * Não é o espelho devops_work_items: ele só cobre as queries cadastradas, e
 * quem tem só o Timer nem o enxerga (RLS de hub_is_approved).
 *
 * Egress e Azure: nada de polling. A lista herda o staleTime global de 5 min
 * e só recarrega no botão, depois de criar um item ou ao abrir a tela.
 */
export interface ItemTimer extends ItemDevops {
  team_project: string | null;
  area_path: string | null;
}

export interface RespostaTarefas {
  itens: ItemTimer[];
  ancestrais: ItemTimer[];
  truncado?: boolean;
  lidoEm?: string;
}

export class ErroTimer extends Error {
  constructor(public motivo: string, mensagem: string) {
    super(mensagem);
  }
}

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('timer-devops', { body: corpo });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let json: { motivo?: string; mensagem?: string } | null = null;
    if (ctx && typeof ctx.json === 'function') {
      try {
        json = await ctx.json();
      } catch {
        json = null;
      }
    }
    throw new ErroTimer(json?.motivo ?? 'falha_de_rede', json?.mensagem ?? 'Não foi possível falar com o servidor.');
  }
  return data as T;
}

export function useMinhasTarefasTimer() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['timer-tarefas', 'minhas', user?.id ?? null],
    enabled: !!user?.id,
    retry: false,
    queryFn: () => chamar<RespostaTarefas>({ op: 'minhas' }),
  });
}

/** Busca no DevOps (título com 3+ letras ou #id). `texto` já vem com debounce. */
export function useBuscaTimer(texto: string) {
  const { user } = useAuth();
  const t = texto.trim();
  const valida = /^#?\d+$/.test(t) || t.replace(/^#/, '').length >= 3;
  return useQuery({
    queryKey: ['timer-tarefas', 'busca', user?.id ?? null, t.toLowerCase()],
    enabled: !!user?.id && valida,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: () => chamar<RespostaTarefas>({ op: 'buscar', texto: t }),
  });
}

export function useFilhosTimer(id: number | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['timer-tarefas', 'filhos', user?.id ?? null, id],
    enabled: !!user?.id && id != null,
    retry: false,
    queryFn: () => chamar<{ itens: ItemTimer[] }>({ op: 'filhos', id }),
  });
}

export interface NovoItem {
  tipo: 'Task' | 'PBI';
  titulo: string;
  paiId: number;
  descricao?: string;
}

export function useCriarItemTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (novo: NovoItem) => chamar<{ ok: true; item: ItemTimer }>({ op: 'criar', ...novo }),
    onSuccess: (_r, novo) => {
      void qc.invalidateQueries({ queryKey: ['timer-tarefas', 'minhas'] });
      void qc.invalidateQueries({ queryKey: ['timer-tarefas', 'filhos'], predicate: (q) => q.queryKey[3] === novo.paiId });
    },
  });
}
