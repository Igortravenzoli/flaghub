import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { detectarCliente, detectarPlataforma, ehCelular, versaoDesktop } from '@/lib/timerAcesso';
import {
  desvioServidor,
  devePerguntarPresenca,
  houveSuspensao,
  lerEstado,
  mensagemErroTimer,
  presencaPerguntarEm,
  presencaPrazo,
  relogio,
  segundosRodando,
  sinalDevido,
  totalHojeSeg,
  type EstadoTimer,
} from '@/lib/timerRelogio';

/**
 * O relógio do Timer no app.
 *
 * Egress: nada de polling curto. Com o timer parado, a tela não fala com o
 * servidor (só ao abrir e ao voltar para a aba). Rodando, manda um sinal a
 * cada 5 min (o que o servidor exige para não cortar) — e a resposta do sinal
 * já é o estado novo. O tempo na tela corre localmente, a partir do início
 * carimbado pelo servidor.
 */
export interface EstadoNoCliente extends EstadoTimer {
  /** servidor − máquina, em ms, no momento da resposta */
  desvioMs: number;
}

/** As RPCs do relógio ainda não estão no types.ts gerado. */
const db = supabase as unknown as SupabaseClient;

const chave = (userId: string | undefined, dias = 1) => ['timer-estado', userId ?? 'anon', dias] as const;

function noCliente(bruto: unknown): EstadoNoCliente {
  const e = lerEstado(bruto);
  return { ...e, desvioMs: desvioServidor(e.agora, Date.now()) };
}

async function rpc(nome: string, args: Record<string, unknown> = {}): Promise<EstadoNoCliente> {
  const { data, error } = await db.rpc(nome, args);
  if (error) throw error;
  return noCliente(data);
}

/** Estado do timer. dias = 1 (hoje) ou até 7, para a lista de trechos. */
export function useTimerEstado(dias = 1, ativo = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: chave(user?.id, dias),
    enabled: ativo && !!user?.id,
    retry: 1,
    queryFn: () => rpc('timer_estado', { p_dias: dias }),
  });
}

export interface IniciarTimer {
  id: number;
  titulo: string;
  tipo: string;
  projeto?: string | null;
}

export function useAcoesTimer() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const gravar = useCallback(
    (e: EstadoNoCliente, semana = true) => {
      qc.setQueryData(chave(user?.id, 1), e);
      // a lista de 7 dias: recarrega só se estiver na tela (e nunca no sinal
      // de 5 em 5 min, que não muda trecho fechado)
      if (semana) void qc.invalidateQueries({ queryKey: chave(user?.id, 7), refetchType: 'active' });
    },
    [qc, user?.id],
  );
  const falhou = (err: unknown) => toast.error(mensagemErroTimer(err));

  const iniciar = useMutation({
    mutationFn: (item: IniciarTimer) => {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const path = typeof window !== 'undefined' ? window.location.pathname : '/timer';
      return rpc('timer_iniciar', {
        p_work_item_id: item.id,
        p_titulo: item.titulo,
        p_tipo: item.tipo,
        p_projeto: item.projeto ?? null,
        p_cliente: detectarCliente(ua, path),
        p_plataforma: detectarPlataforma(ua),
        p_versao_app: versaoDesktop(ua),
      });
    },
    onSuccess: (e) => gravar(e),
    onError: falhou,
  });

  const pausar = useMutation({
    mutationFn: (p: { motivo?: 'manual' | 'suspensao' | 'bloqueio' | 'ocioso' | 'sem_confirmacao'; fim?: string | null } = {}) =>
      rpc('timer_pausar', { p_motivo: p.motivo ?? 'manual', p_fim: p.fim ?? null }),
    onSuccess: (e) => gravar(e),
    onError: falhou,
  });

  const sinal = useMutation({
    mutationFn: (presenca: boolean) => rpc('timer_sinal', { p_presenca: presenca }),
    // o sinal pode fechar um trecho (corte do servidor): aí a semana muda
    onSuccess: (e) => gravar(e, !e.rodando),
    // sinal falho é silencioso: tenta de novo no próximo ciclo
  });

  const corrigir = useMutation({
    mutationFn: (p: { id: string; fim: string; dias: number }) =>
      rpc('timer_corrigir', { p_id: p.id, p_novo_fim: p.fim, p_dias: p.dias }),
    onSuccess: (e, p) => {
      if (p.dias === 1) gravar(e);
      else {
        qc.setQueryData(chave(user?.id, p.dias), e);
        void qc.invalidateQueries({ queryKey: chave(user?.id, 1) });
      }
    },
    onError: falhou,
  });

  const descartar = useMutation({
    mutationFn: (p: { id: string; dias: number }) => rpc('timer_descartar', { p_id: p.id, p_dias: p.dias }),
    onSuccess: (e, p) => {
      if (p.dias === 1) gravar(e);
      else {
        qc.setQueryData(chave(user?.id, p.dias), e);
        void qc.invalidateQueries({ queryKey: chave(user?.id, 1) });
      }
    },
    onError: falhou,
  });

  // Lançar no TimeLog passa pela edge (ela fala com o Azure); o estado volta
  // pelo refetch, porque quem muda é o banco.
  const depoisDeLancar = (r: RespostaLancamento) => {
    void qc.invalidateQueries({ queryKey: ['timer-estado', user?.id ?? 'anon'] });
    const ok = r.resultados.filter((x) => x.status === 'lancado');
    const ruins = r.resultados.filter((x) => x.status !== 'lancado');
    if (ok.length > 0) {
      const min = ok.reduce((s, x) => s + (x.minutos ?? 0), 0);
      toast.success(`${ok.length === 1 ? '1 lançamento' : `${ok.length} lançamentos`} no TimeLog (${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}min).`);
    }
    for (const x of ruins) toast.error(`#${x.work_item_id} (${x.dia}): ${x.mensagem ?? 'não lançado.'}`);
  };

  const lancar = useMutation({
    mutationFn: (grupos: { dia: string; work_item_id: number; notas?: string | null }[]) =>
      chamarEdge({ op: 'lancar', grupos }),
    onSuccess: depoisDeLancar,
    onError: (e: Error) => toast.error(e.message),
  });

  const relancar = useMutation({
    mutationFn: (id: string) => chamarEdge({ op: 'relancar', id }),
    onSuccess: depoisDeLancar,
    onError: (e: Error) => {
      toast.error(e.message);
      void qc.invalidateQueries({ queryKey: ['timer-estado', user?.id ?? 'anon'] });
    },
  });

  return { iniciar, pausar, sinal, corrigir, descartar, lancar, relancar };
}

export interface ResultadoLancamento {
  id?: string;
  dia: string;
  work_item_id: number;
  status: 'lancado' | 'erro' | 'cancelado' | 'recusado';
  minutos?: number;
  motivo?: string;
  mensagem?: string;
}

export interface RespostaLancamento {
  ok: boolean;
  resultados: ResultadoLancamento[];
}

async function chamarEdge(corpo: Record<string, unknown>): Promise<RespostaLancamento> {
  const { data, error } = await supabase.functions.invoke('timer-devops', { body: corpo });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let msg = 'Não foi possível falar com o servidor.';
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as { mensagem?: string };
        if (j?.mensagem) msg = j.mensagem;
      } catch {
        /* mensagem genérica */
      }
    }
    throw new Error(msg);
  }
  const r = data as RespostaLancamento;
  return { ok: !!r?.ok, resultados: Array.isArray(r?.resultados) ? r.resultados : [] };
}

/** Uma tentativa de sinal falha espera isto antes da próxima. */
const ESPERA_APOS_FALHA_MS = 60_000;

/**
 * O motor: um por tela. Faz o tempo correr na tela, manda o sinal, detecta
 * suspensão e cuida do prazo da pergunta de presença.
 */
export function useMotorTimer(opcoes: { tituloDaAba?: boolean } = {}) {
  const estadoQ = useTimerEstado(1);
  const acoes = useAcoesTimer();
  const estado = estadoQ.data ?? null;
  const rodando = estado?.rodando ?? null;

  const [agoraLocal, setAgoraLocal] = useState(() => Date.now());
  const ultimoTique = useRef(Date.now());
  const ultimaTentativaSinal = useRef(0);
  const prazoTratado = useRef<string | null>(null);

  // refs com o valor mais recente, para o setInterval não ler estado velho
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const acoesRef = useRef(acoes);
  acoesRef.current = acoes;

  const rodandoId = rodando?.id ?? null;
  // No celular o Timer é só consulta (o servidor recusa iniciar e não aceita
  // sinal nem presença de lá): o relógio corre na tela, mas o motor não fala
  // com o servidor — senão cada visita pelo celular viraria "tentativa".
  const somenteConsulta = typeof navigator !== 'undefined' && ehCelular(navigator.userAgent);

  useEffect(() => {
    if (!rodandoId) return;
    ultimoTique.current = Date.now();
    setAgoraLocal(Date.now());

    const id = window.setInterval(() => {
      const agora = Date.now();
      const e = estadoRef.current;
      const a = acoesRef.current;
      if (!e?.rodando) return;
      if (somenteConsulta) {
        ultimoTique.current = agora;
        setAgoraLocal(agora);
        return;
      }

      // 1. a máquina dormiu: pausa no último tique antes de dormir
      if (houveSuspensao(ultimoTique.current, agora)) {
        const fim = new Date(ultimoTique.current + e.desvioMs).toISOString();
        ultimoTique.current = agora;
        if (!a.pausar.isPending) {
          a.pausar.mutate(
            { motivo: 'suspensao', fim },
            { onSuccess: () => toast.info('O computador ficou suspenso: o timer foi pausado no momento em que ele dormiu.') },
          );
        }
        return;
      }
      ultimoTique.current = agora;
      setAgoraLocal(agora);

      const agoraServ = agora + e.desvioMs;

      // 2. prazo da presença vencido: o servidor já não conta; fecha agora
      if (agoraServ >= presencaPrazo(e.rodando, e.regras) && prazoTratado.current !== e.rodando.id) {
        prazoTratado.current = e.rodando.id;
        a.pausar.mutate({
          motivo: 'sem_confirmacao',
          fim: new Date(presencaPerguntarEm(e.rodando, e.regras)).toISOString(),
        });
        return;
      }

      // 3. sinal a cada sinal_seg
      if (
        sinalDevido(e.rodando, e.regras, agoraServ) &&
        !a.sinal.isPending &&
        agora - ultimaTentativaSinal.current >= ESPERA_APOS_FALHA_MS
      ) {
        ultimaTentativaSinal.current = agora;
        a.sinal.mutate(false);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [rodandoId, somenteConsulta]);

  // Voltou para a aba: o job do servidor pode ter cortado algo enquanto isso.
  const { refetch } = estadoQ;
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [refetch]);

  const agoraServidor = agoraLocal + (estado?.desvioMs ?? 0);
  const segundos = segundosRodando(rodando, agoraServidor);
  const perguntarPresenca =
    !somenteConsulta && !!estado && devePerguntarPresenca(rodando, estado.regras, agoraServidor);
  const prazoPresencaMs = rodando && estado ? presencaPrazo(rodando, estado.regras) : null;

  // Título da aba: o tempo correndo, ou o pedido de confirmação.
  const tituloDaAba = opcoes.tituloDaAba ?? false;
  useEffect(() => {
    if (!tituloDaAba) return;
    const original = document.title;
    return () => {
      document.title = original;
    };
  }, [tituloDaAba]);
  useEffect(() => {
    if (!tituloDaAba) return;
    if (!rodando) document.title = 'Timer Flag';
    else if (perguntarPresenca) document.title = '⚠ Confirme a presença · Timer Flag';
    else document.title = `▶ ${relogio(segundos)} · #${rodando.work_item_id} · Timer Flag`;
  }, [tituloDaAba, rodando, perguntarPresenca, segundos]);

  const totalHoje = useMemo(() => (estado ? totalHojeSeg(estado, agoraServidor) : 0), [estado, agoraServidor]);

  return {
    estado,
    carregando: estadoQ.isLoading,
    erro: estadoQ.error,
    rodando,
    segundos,
    totalHoje,
    agoraServidor,
    perguntarPresenca,
    prazoPresencaMs,
    somenteConsulta,
    acoes,
  };
}

export type MotorTimer = ReturnType<typeof useMotorTimer>;
