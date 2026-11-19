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
  /** campo Custom.PRODUTOSS (o DevOps troca os nomes: guarda o CLIENTE) */
  cliente?: string | null;
  /** campo Custom.CLIENTESS (o DevOps troca os nomes: guarda o PRODUTO) */
  produto?: string | null;
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
  /** categoria (System.Tags; a edge tira os marcadores de KPI) */
  tags?: string[];
  /** campos de lista do DevOps, conferidos na lista pela edge */
  cliente?: string | null;
  produto?: string | null;
  /** veio do pai num clique: o que não couber na lista é descartado */
  herdado?: boolean;
}

export function useCriarItemTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (novo: NovoItem) => chamar<{ ok: true; item: ItemTimer; tagsDescartadas?: string[] }>({ op: 'criar', ...novo }),
    onSuccess: (_r, novo) => {
      void qc.invalidateQueries({ queryKey: ['timer-tarefas', 'minhas'] });
      void qc.invalidateQueries({ queryKey: ['timer-tarefas', 'filhos'], predicate: (q) => q.queryKey[3] === novo.paiId });
    },
  });
}

// ─── tags do DevOps ─────────────────────────────────────────────────────────

const DIA_MS = 24 * 60 * 60 * 1000;
// v2: a v1 podia ter guardado lista vazia por 24 h (18/11/2026)
const chaveTags = (projeto: string) => `timer-flag:tags2:${projeto}`;

function lerTagsGuardadas(projeto: string): string[] | null {
  try {
    const bruto = localStorage.getItem(chaveTags(projeto));
    if (!bruto) return null;
    const v = JSON.parse(bruto) as { em?: number; tags?: unknown };
    if (typeof v.em !== 'number' || Date.now() - v.em > DIA_MS || !Array.isArray(v.tags) || v.tags.length === 0) return null;
    return v.tags.filter((t): t is string => typeof t === 'string');
  } catch {
    return null;
  }
}

function guardarTags(projeto: string, tags: string[]) {
  if (tags.length === 0) return; // vazia não fica guardada: tenta de novo na próxima
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
      try {
        localStorage.removeItem(`timer-flag:tags:${p}`); // cache da v1
      } catch {
        /* sem storage */
      }
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

// ─── Timer em Reunião ───────────────────────────────────────────────────────

export interface NovaReuniao {
  tema: string;
  /** na Feature; sem ela, na raiz do `projeto` */
  featureId: number | null;
  projeto: string | null;
  tags: string[];
  cliente: string | null;
  produto: string | null;
}

export interface ReuniaoCriada {
  ok: true;
  item: ItemTimer;
  pai: { id: number; title: string | null; work_item_type: string | null } | null;
  /** o DevOps recusou a Task direto na Feature: ficou na raiz do projeto */
  recusouFeature: boolean;
  /** tags que não existem no projeto e ficaram de fora (o Timer não cria tag) */
  tagsDescartadas?: string[];
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

/**
 * Tags dos itens que já estão na tela (minhas tarefas, ancestrais e a busca):
 * completam a lista do DevOps sem nenhuma chamada a mais.
 */
export function useTagsConhecidas(): string[] {
  const qc = useQueryClient();
  const { user } = useAuth();
  const minhas = qc.getQueryData<RespostaTarefas>(['timer-tarefas', 'minhas', user?.id ?? null]);
  const vistos = new Map<string, string>();
  for (const i of [...(minhas?.itens ?? []), ...(minhas?.ancestrais ?? [])]) {
    for (const t of (i.tags ?? '').split(';')) {
      const limpo = t.trim();
      if (limpo && !vistos.has(limpo.toUpperCase())) vistos.set(limpo.toUpperCase(), limpo);
    }
  }
  return [...vistos.values()];
}

// ─── Cliente e Produto: campos de lista do DevOps ───────────────────────────

export interface CamposPermitidos {
  clientes: string[];
  produtos: string[];
}

const chaveCampos = (projeto: string, tipo: string) => `timer-flag:campos:${projeto}|${tipo}`;

/**
 * Os valores permitidos de Cliente e Produto (picklists do DevOps) para um
 * projeto e tipo. Uma ida à edge a cada 24 h por navegador; lista vazia não
 * fica guardada.
 */
export function useCamposTimer(projeto: string | null | undefined, tipo: 'Task' | 'Product Backlog Item' = 'Task') {
  const { user } = useAuth();
  const p = projeto?.trim() || null;
  return useQuery({
    queryKey: ['timer-tarefas', 'campos', p, tipo],
    enabled: !!user?.id && !!p,
    staleTime: DIA_MS,
    gcTime: DIA_MS,
    retry: false,
    queryFn: async (): Promise<CamposPermitidos> => {
      try {
        const bruto = localStorage.getItem(chaveCampos(p!, tipo));
        if (bruto) {
          const v = JSON.parse(bruto) as { em?: number } & Partial<CamposPermitidos>;
          if (typeof v.em === 'number' && Date.now() - v.em < DIA_MS && Array.isArray(v.clientes) && Array.isArray(v.produtos)) {
            return { clientes: v.clientes, produtos: v.produtos };
          }
        }
      } catch {
        /* sem storage */
      }
      const r = await chamar<{ ok: true } & CamposPermitidos>({ op: 'campos', projeto: p, tipo });
      const c = { clientes: Array.isArray(r.clientes) ? r.clientes : [], produtos: Array.isArray(r.produtos) ? r.produtos : [] };
      if (c.clientes.length + c.produtos.length > 0) {
        try {
          localStorage.setItem(chaveCampos(p!, tipo), JSON.stringify({ em: Date.now(), ...c }));
        } catch {
          /* storage cheio ou bloqueado */
        }
      }
      return c;
    },
  });
}
