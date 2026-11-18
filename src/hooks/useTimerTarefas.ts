import { useCallback, useRef } from 'react';
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

/**
 * A edge guarda "minhas tarefas" por 3 min (um token só para todos os devs:
 * alivia o Azure no pico). O botão de recarregar pede `forcar` e vai ao Azure.
 */
export function useMinhasTarefasTimer() {
  const { user } = useAuth();
  const forcarProxima = useRef(false);
  const consulta = useQuery({
    queryKey: ['timer-tarefas', 'minhas', user?.id ?? null],
    enabled: !!user?.id,
    retry: false,
    queryFn: () => {
      const forcar = forcarProxima.current;
      forcarProxima.current = false;
      return chamar<RespostaTarefas>(forcar ? { op: 'minhas', forcar: true } : { op: 'minhas' });
    },
  });
  const { refetch } = consulta;
  const recarregar = useCallback(() => {
    forcarProxima.current = true;
    return refetch();
  }, [refetch]);
  return { ...consulta, recarregar };
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
  /** produto, cliente, categoria (a edge tira os marcadores de KPI) */
  tags?: string[];
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

// ─── tags do DevOps ─────────────────────────────────────────────────────────

const DIA_MS = 24 * 60 * 60 * 1000;
const chaveTags = (projeto: string) => `timer-flag:tags:${projeto}`;

function lerTagsGuardadas(projeto: string): string[] | null {
  try {
    const bruto = localStorage.getItem(chaveTags(projeto));
    if (!bruto) return null;
    const v = JSON.parse(bruto) as { em?: number; tags?: unknown };
    if (typeof v.em !== 'number' || Date.now() - v.em > DIA_MS || !Array.isArray(v.tags)) return null;
    return v.tags.filter((t): t is string => typeof t === 'string');
  } catch {
    return null;
  }
}

function guardarTags(projeto: string, tags: string[]) {
  try {
    localStorage.setItem(chaveTags(projeto), JSON.stringify({ em: Date.now(), tags }));
  } catch {
    // storage cheio ou bloqueado: vale só nesta sessão
  }
}

/**
 * Tags de um projeto do DevOps. Uma ida à edge por projeto a cada 24 h por
 * navegador (e a edge guarda 24 h por instância): abrir o formulário não
 * chama o DevOps.
 */
export function useTagsTimer(projeto: string | null | undefined) {
  const { user } = useAuth();
  const p = projeto?.trim() || null;
  return useQuery({
    queryKey: ['timer-tarefas', 'tags', p],
    enabled: !!user?.id && !!p,
    staleTime: DIA_MS,
    gcTime: DIA_MS,
    retry: false,
    queryFn: async () => {
      const guardadas = lerTagsGuardadas(p!);
      if (guardadas) return guardadas;
      const r = await chamar<{ ok: true; tags: string[] }>({ op: 'tags', projeto: p });
      const tags = Array.isArray(r.tags) ? r.tags : [];
      guardarTags(p!, tags);
      return tags;
    },
  });
}

/** Tag nova criada no Timer entra na lista na hora (sem esperar as 24 h). */
export function useAcrescentarTags() {
  const qc = useQueryClient();
  return useCallback(
    (projeto: string | null | undefined, novas: string[]) => {
      const p = projeto?.trim();
      if (!p || novas.length === 0) return;
      const atuais = qc.getQueryData<string[]>(['timer-tarefas', 'tags', p]) ?? lerTagsGuardadas(p) ?? [];
      const faltam = novas.filter((n) => !atuais.some((a) => a.toUpperCase() === n.toUpperCase()));
      if (faltam.length === 0) return;
      const lista = [...atuais, ...faltam].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      qc.setQueryData(['timer-tarefas', 'tags', p], lista);
      guardarTags(p, lista);
    },
    [qc],
  );
}

// ─── Rec reunião ────────────────────────────────────────────────────────────

export interface NovaReuniao {
  tema: string;
  /** na Feature; sem ela, na raiz do `projeto` */
  featureId: number | null;
  projeto: string | null;
  tags: string[];
}

export interface ReuniaoCriada {
  ok: true;
  item: ItemTimer;
  pai: { id: number; title: string | null; work_item_type: string | null } | null;
  /** o DevOps recusou a Task direto na Feature: ficou na raiz do projeto */
  recusouFeature: boolean;
}

/** Cria a Task "Reunião - <tema>" (na Feature ou na raiz do projeto). */
export function useReuniaoTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: NovaReuniao) => chamar<ReuniaoCriada>({ op: 'reuniao', ...r }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['timer-tarefas', 'minhas'] });
    },
  });
}
