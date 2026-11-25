import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { registrarEventoTimer } from '@/hooks/useTimerAcesso';
import { detectarCliente, detectarPlataforma, ehCelular, versaoDesktop } from '@/lib/timerAcesso';
import { avisarEstadoMudou, CHAVE_ESTADO_MUDOU, lerPausaSistema, ponteDesktop, type MotivoSistema } from '@/lib/timerDesktop';
import { chamarAtencao, pedirPermissaoDoAviso, textoDoAviso, type TextoDoAviso } from '@/lib/timerAtencao';
import { temDeteccaoAusencia } from '@/lib/timerPwa';
import { gravarSelecao, lerSelecao } from '@/lib/timerSelecao';
import {
  aLancarDoItem,
  AUSENCIA_TOLERANCIA_MS,
  ausenciaVencida,
  classificarLacuna,
  desvioServidor,
  devePerguntarPresenca,
  lerEstado,
  lerRodandoTodos,
  mensagemErroTimer,
  novaAusencia,
  OCIOSO_MS,
  presencaPerguntarEm,
  presencaPrazo,
  referenciaPresenca,
  relogio,
  segundosRodando,
  sinalDevido,
  horaTrabalhadaSeg,
  type Ausencia,
  type EstadoTimer,
  type TrechoRodando,
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

/** Resposta curta do sinal quando nada mudou (TM7). */
interface ResumoSinal {
  resumo: true;
  agora: string;
  rodando: TrechoRodando;
  rodandoTodos: TrechoRodando[];
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
  /** true = roda junto com os que já rodam (TM9); false = troca */
  paralelo?: boolean;
}

export function useAcoesTimer() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const gravar = useCallback(
    (e: EstadoNoCliente, semana = true) => {
      qc.setQueryData(chave(user?.id, 1), e);
      avisarEstadoMudou(); // o mini (ou outra aba) relê
      // a lista de 7 dias: recarrega só se estiver na tela (e nunca no sinal
      // de 5 em 5 min, que não muda trecho fechado)
      if (semana) void qc.invalidateQueries({ queryKey: chave(user?.id, 7), refetchType: 'active' });
    },
    [qc, user?.id],
  );
  const falhou = (err: unknown) => toast.error(mensagemErroTimer(err));

  const iniciar = useMutation({
    mutationFn: (item: IniciarTimer) => {
      // Iniciar é um clique: a hora certa de pedir o aviso do sistema, que
      // depois chama a pessoa quando o Timer perguntar algo (uma vez só).
      void pedirPermissaoDoAviso();
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
        // só manda quando é paralelo: o servidor sem a TM9 não conhece o parâmetro
        ...(item.paralelo ? { p_paralelo: true } : {}),
      });
    },
    onSuccess: (e) => gravar(e),
    onError: falhou,
  });

  const pausar = useMutation({
    // sem workItemId pausa todos os que rodam (suspensão, bloqueio, ociosidade,
    // presença: valem para a pessoa)
    mutationFn: (
      p: { motivo?: 'manual' | 'suspensao' | 'bloqueio' | 'ocioso' | 'sem_confirmacao'; fim?: string | null; workItemId?: number } = {},
    ) =>
      rpc('timer_pausar', {
        p_motivo: p.motivo ?? 'manual',
        p_fim: p.fim ?? null,
        ...(p.workItemId ? { p_work_item_id: p.workItemId } : {}),
      }),
    onSuccess: (e) => gravar(e),
    onError: falhou,
  });

  // Sinal enxuto (TM7): sem mudança, o servidor devolve só agora + rodando, e
  // isso é mesclado no estado que a tela já tem. Se as regras cortaram algo,
  // vem o estado completo.
  const sinal = useMutation({
    mutationFn: async (presenca: boolean): Promise<EstadoNoCliente | ResumoSinal> => {
      const { data, error } = await db.rpc('timer_sinal', { p_presenca: presenca, p_resumo: true });
      if (error) throw error;
      const d = data as { resumo?: boolean; agora?: string; rodando?: unknown; rodando_todos?: unknown } | null;
      if (d?.resumo && typeof d.agora === 'string' && d.rodando && typeof d.rodando === 'object') {
        const rodando = d.rodando as TrechoRodando;
        return {
          resumo: true,
          agora: d.agora,
          rodando,
          rodandoTodos: lerRodandoTodos(d.rodando_todos, rodando),
          desvioMs: desvioServidor(d.agora, Date.now()),
        };
      }
      return noCliente(data);
    },
    onSuccess: (r) => {
      if ('resumo' in r) {
        qc.setQueryData<EstadoNoCliente>(chave(user?.id, 1), (velho) =>
          velho ? { ...velho, agora: r.agora, rodando: r.rodando, rodandoTodos: r.rodandoTodos, desvioMs: r.desvioMs } : velho,
        );
        return;
      }
      // o sinal fechou um trecho (corte do servidor): aí a semana muda
      gravar(r, !r.rodando);
    },
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
        avisarEstadoMudou();
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
        avisarEstadoMudou();
      }
    },
    onError: falhou,
  });

  // Lançar no TimeLog passa pela edge (ela fala com o Azure); o estado volta
  // pelo refetch, porque quem muda é o banco.
  const depoisDeLancar = (r: RespostaLancamento) => {
    void qc.invalidateQueries({ queryKey: ['timer-estado', user?.id ?? 'anon'] });
    avisarEstadoMudou();
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

  // TM8: corta o trecho rodando agora (o pedaço fechado pode ser lançado) e
  // segue contando. A semana é relida para o lançamento enxergar o pedaço.
  const partir = useMutation({
    // com o item, parte só ele (os outros paralelos seguem intactos)
    mutationFn: async (workItemId?: number) => {
      const e = await rpc('timer_partir', workItemId ? { p_work_item_id: workItemId } : {});
      await qc.refetchQueries({ queryKey: chave(user?.id, 7) });
      return e;
    },
    onSuccess: (e) => {
      qc.setQueryData(chave(user?.id, 1), e);
      avisarEstadoMudou();
    },
    onError: falhou,
  });

  // TM8: encerra a demanda (sai do Em espera); se estiver rodando, pausa antes.
  // Depois, a Task vai para Done no DevOps (19/11/2026). Falha no DevOps não
  // desfaz o encerrar: avisa e deixa o link para fechar à mão.
  // PBI e Bug (25/11/2026) só mudam com `estado`, o destino escolhido no
  // diálogo de encerrar; sem ele ficam como estão.
  const encerrarDemanda = useMutation({
    mutationFn: async (p: { id: number; estado?: string | null }) => {
      const e = await rpc('timer_demanda_encerrar', { p_work_item_id: p.id });
      const devops = await concluirNoDevops(p.id, p.estado ?? null);
      return { e, devops, workItemId: p.id };
    },
    onSuccess: ({ e, devops, workItemId }) => {
      // demanda encerrada não é mais a "última escolhida": o mini timer deixa
      // de oferecer o ▶ nela (25/11/2026)
      if (lerSelecao()?.id === workItemId) gravarSelecao(null);
      gravar(e);
      void qc.invalidateQueries({ queryKey: ['timer-tarefas', 'minhas'] });
      if (devops.mudou) toast.success(`#${workItemId} foi para ${devops.estado ?? 'Done'} no DevOps.`);
      else if (!devops.ok) toast.warning(devops.mensagem ?? `Demanda encerrada, mas o item #${workItemId} não mudou de estado no DevOps.`);
    },
    onError: falhou,
  });

  return { iniciar, pausar, sinal, corrigir, descartar, lancar, relancar, partir, encerrarDemanda };
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

export interface RespostaConcluir {
  ok: boolean;
  mudou?: boolean;
  estado?: string;
  motivo?: string;
  mensagem?: string;
}

/**
 * Leva a Task para Done no DevOps (edge `concluir`); com `estado`, leva o item
 * (PBI e Bug inclusive) para o estado escolhido. Nunca lança erro.
 */
async function concluirNoDevops(id: number, estado: string | null = null): Promise<RespostaConcluir> {
  const { data, error } = await supabase.functions.invoke('timer-devops', {
    body: estado ? { op: 'concluir', id, estado } : { op: 'concluir', id },
  });
  if (!error) return (data as RespostaConcluir) ?? { ok: false };
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      return { ok: false, ...((await ctx.json()) as RespostaConcluir) };
    } catch {
      /* mensagem genérica */
    }
  }
  return { ok: false };
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


const AVISO_SISTEMA: Record<MotivoSistema, string> = {
  bloqueio: 'Tela bloqueada: o timer foi pausado.',
  suspensao: 'Computador suspenso: o timer foi pausado no momento em que ele dormiu.',
  ocioso: 'Sem uso do computador e sem resposta: o timer foi pausado e o tempo parado não contou.',
};

interface IdleDetectorLike extends EventTarget {
  userState: 'active' | 'idle' | null;
  screenState: 'locked' | 'unlocked' | null;
  start: (o: { threshold: number; signal: AbortSignal }) => Promise<void>;
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
  const rodandoTodos = useMemo(() => estado?.rodandoTodos ?? [], [estado]);
  // sinal e presença valem para a pessoa: o mais atrasado dos que rodam
  const referencia = useMemo(() => referenciaPresenca(rodandoTodos), [rodandoTodos]);

  const [agoraLocal, setAgoraLocal] = useState(() => Date.now());
  const ultimoTique = useRef(Date.now());
  const ultimaTentativaSinal = useRef(0);
  const prazoTratado = useRef<string | null>(null);
  // "Você está aí?" depois de OCIOSO_MS sem uso (só a janela que recebe o aviso do sistema)
  const [ausencia, setAusencia] = useState<Ausencia | null>(null);
  const ausenciaRef = useRef(ausencia);
  ausenciaRef.current = ausencia;

  // refs com o valor mais recente, para o setInterval não ler estado velho
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const acoesRef = useRef(acoes);
  acoesRef.current = acoes;

  const rodandoId = rodandoTodos.map((r) => r.id).join(',') || null;
  // No celular o Timer é só consulta (o servidor recusa iniciar e não aceita
  // sinal nem presença de lá): o relógio corre na tela, mas o motor não fala
  // com o servidor — senão cada visita pelo celular viraria "tentativa".
  const somenteConsulta = typeof navigator !== 'undefined' && ehCelular(navigator.userAgent);

  // O navegador avisa antes de congelar a página (Page Lifecycle API): guarda
  // o momento, para a lacuna não virar "computador suspenso" (23/11/2026).
  const congeladaEm = useRef<number | null>(null);
  useEffect(() => {
    const aoCongelar = () => {
      congeladaEm.current = Date.now();
    };
    document.addEventListener('freeze', aoCongelar);
    return () => document.removeEventListener('freeze', aoCongelar);
  }, []);

  // Enquanto há timer rodando, segura uma trava (Web Locks): o Chromium evita
  // congelar a página que segura uma. Reduz a chance; não garante.
  useEffect(() => {
    if (!rodandoId || somenteConsulta) return;
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks?.request) return;
    let soltar: (() => void) | null = null;
    void locks
      .request('timer-flag-rodando', { mode: 'shared' }, () => new Promise<void>((r) => (soltar = r)))
      .catch(() => {
        // sem trava: segue com o sinal e o servidor
      });
    return () => soltar?.();
  }, [rodandoId, somenteConsulta]);

  useEffect(() => {
    if (!rodandoId) return;
    ultimoTique.current = Date.now();
    setAgoraLocal(Date.now());

    const id = window.setInterval(() => {
      const agora = Date.now();
      const e = estadoRef.current;
      const a = acoesRef.current;
      const ref = e ? referenciaPresenca(e.rodandoTodos) : null;
      if (!e || !ref) return;
      if (somenteConsulta) {
        ultimoTique.current = agora;
        setAgoraLocal(agora);
        return;
      }

      const lacuna = classificarLacuna(ultimoTique.current, agora, congeladaEm.current);

      // 1a. o NAVEGADOR congelou a página (a pessoa pode estar trabalhando em
      // outro programa): não pausa; manda o sinal na hora. Se o congelamento
      // passou do prazo do servidor, ele já pausou no último sinal.
      if (lacuna === 'congelada') {
        const paradoMin = Math.round((agora - ultimoTique.current) / 60_000);
        const cortado = agora + e.desvioMs - Date.parse(ref.ultimo_sinal_em) > e.regras.sem_sinal_seg * 1000;
        congeladaEm.current = null;
        ultimoTique.current = agora;
        setAgoraLocal(agora);
        ultimaTentativaSinal.current = agora;
        if (!a.sinal.isPending) a.sinal.mutate(false);
        void registrarEventoTimer('janela_visivel', { retomou: 'congelada', parado_min: paradoMin, cortado });
        toast.info(
          cortado
            ? `O navegador congelou o Timer por ${paradoMin} min: passou do prazo e o timer foi pausado no último sinal.`
            : `O navegador congelou o Timer por ${paradoMin} min. O tempo seguiu contando.`,
        );
        return;
      }

      // 1b. a máquina dormiu: pausa no último tique antes de dormir
      if (lacuna === 'suspensao') {
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

      // 1c. "Você está aí?" sem resposta no prazo: pausa no início da inatividade
      const aus = ausenciaRef.current;
      if (aus && ausenciaVencida(aus, agora)) {
        setAusencia(null);
        if (!a.pausar.isPending) {
          a.pausar.mutate(
            { motivo: 'ocioso', fim: new Date(aus.desdeMs + e.desvioMs).toISOString() },
            { onSuccess: () => toast.info(AVISO_SISTEMA.ocioso) },
          );
        }
        return;
      }

      const agoraServ = agora + e.desvioMs;

      // 2. prazo da presença vencido: o servidor já não conta; fecha agora
      const chavePrazo = `${ref.id}:${ref.ultima_presenca_em}`;
      if (agoraServ >= presencaPrazo(ref, e.regras) && prazoTratado.current !== chavePrazo) {
        prazoTratado.current = chavePrazo;
        a.pausar.mutate({
          motivo: 'sem_confirmacao',
          fim: new Date(presencaPerguntarEm(ref, e.regras)).toISOString(),
        });
        return;
      }

      // 3. sinal a cada sinal_seg
      if (
        sinalDevido(ref, e.regras, agoraServ) &&
        !a.sinal.isPending &&
        agora - ultimaTentativaSinal.current >= ESPERA_APOS_FALHA_MS
      ) {
        ultimaTentativaSinal.current = agora;
        a.sinal.mutate(false);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [rodandoId, somenteConsulta]);

  // Avisos do sistema: o app desktop (tela bloqueada, suspensão, 30 min sem
  // uso) e, no Chrome/Edge com permissão, a detecção de ausência. Pausa no
  // momento em que a pessoa parou; o servidor só aceita fim para trás.
  useEffect(() => {
    if (somenteConsulta) return;
    const pausarPorSistema = (motivo: MotivoSistema, fimMs: number) => {
      const e = estadoRef.current;
      const a = acoesRef.current;
      if (!e?.rodandoTodos.length || a.pausar.isPending) return;
      // Ociosidade não pausa na hora: pergunta e espera o clique (decisão do
      // Igor, 18/11/2026). Tela bloqueada e suspensão seguem pausando direto.
      if (motivo === 'ocioso') {
        if (!ausenciaRef.current) setAusencia(novaAusencia(fimMs, Date.now()));
        return;
      }
      a.pausar.mutate(
        { motivo, fim: new Date(fimMs + e.desvioMs).toISOString() },
        { onSuccess: () => toast.info(AVISO_SISTEMA[motivo]) },
      );
    };

    const desligar: (() => void)[] = [];
    const ponte = ponteDesktop();
    if (ponte) {
      desligar.push(
        ponte.onPausar((bruto) => {
          const p = lerPausaSistema(bruto);
          if (p) pausarPorSistema(p.motivo, p.fimMs);
        }),
      );
    } else if (temDeteccaoAusencia()) {
      const controle = new AbortController();
      desligar.push(() => controle.abort());
      void (async () => {
        try {
          const permissao = await navigator.permissions.query({ name: 'idle-detection' as PermissionName });
          if (permissao.state !== 'granted') return;
          const Detector = (window as unknown as { IdleDetector: new () => IdleDetectorLike }).IdleDetector;
          const d = new Detector();
          d.addEventListener('change', () => {
            if (d.screenState === 'locked') pausarPorSistema('bloqueio', Date.now());
            else if (d.userState === 'idle') pausarPorSistema('ocioso', Date.now() - OCIOSO_MS);
          });
          await d.start({ threshold: OCIOSO_MS, signal: controle.signal });
        } catch {
          // sem permissão ou sem suporte: segue só com sinal e presença
        }
      })();
    }
    return () => desligar.forEach((f) => f());
  }, [somenteConsulta]);

  // Voltou para a aba: o job do servidor pode ter cortado algo enquanto isso.
  // Outra janela (o mini do app, outra aba) mudou o timer: relê na hora.
  // No app desktop a página fica sempre "visible" (backgroundThrottling off),
  // então quem avisa que a janela apareceu é a ponte (onMostrada).
  const { refetch } = estadoQ;
  const qc = useQueryClient();
  const { user } = useAuth();
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    const aoMudarOutraJanela = (e: StorageEvent) => {
      if (e.key !== CHAVE_ESTADO_MUDOU) return;
      void refetch();
      void qc.invalidateQueries({ queryKey: chave(user?.id, 7), refetchType: 'active' });
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('storage', aoMudarOutraJanela);
    const desligarMostrada = ponteDesktop()?.onMostrada?.(() => void refetch());
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('storage', aoMudarOutraJanela);
      desligarMostrada?.();
    };
  }, [refetch, qc, user?.id]);

  const agoraServidor = agoraLocal + (estado?.desvioMs ?? 0);
  // Trecho atual (desde o último iniciar/lançar) e o que a tarefa tem A LANÇAR
  // hoje. Lançou, zera (decisão do Igor, 17/11/2026: o que já foi para o
  // TimeLog sai do relógio); pausar e retomar sem lançar segue somando.
  const segundosTrecho = segundosRodando(rodando, agoraServidor);
  const aLancarDoItemHoje = useMemo(
    () => (rodando && estado ? aLancarDoItem(estado.trechos, rodando.work_item_id) : 0),
    [rodando, estado],
  );
  const segundos = rodando ? aLancarDoItemHoje + segundosTrecho : 0;
  /** relógio de um dos que rodam: o que ele tem a lançar hoje + o trecho atual */
  const segundosDe = useCallback(
    (r: TrechoRodando) => (estado ? aLancarDoItem(estado.trechos, r.work_item_id) : 0) + segundosRodando(r, agoraServidor),
    [estado, agoraServidor],
  );
  /** só os trechos que estão rodando agora, somados (para o "A lançar") */
  const segundosRodandoTodos = rodandoTodos.reduce((s, r) => s + segundosRodando(r, agoraServidor), 0);
  const perguntarPresenca =
    !somenteConsulta && !!estado && devePerguntarPresenca(referencia, estado.regras, agoraServidor);
  const prazoPresencaMs = referencia && estado ? presencaPrazo(referencia, estado.regras) : null;

  // Parou o timer por outro caminho: a pergunta de ausência perde o sentido.
  if (ausencia && rodandoTodos.length === 0 && estado) setAusencia(null);
  const perguntarAusencia = !somenteConsulta && !!ausencia && rodandoTodos.length > 0;
  const confirmarAusencia = useCallback(() => {
    setAusencia(null);
    acoes.sinal.mutate(true); // "estou aqui" também renova a presença
  }, [acoes.sinal]);
  const pararPorAusencia = useCallback(() => {
    const aus = ausenciaRef.current;
    setAusencia(null);
    if (!aus) return;
    acoes.pausar.mutate({
      motivo: 'ocioso',
      fim: new Date(aus.desdeMs + (estadoRef.current?.desvioMs ?? 0)).toISOString(),
    });
  }, [acoes.pausar]);

  // Pergunta aberta (presença ou ausência) com a janela minimizada: o app
  // desktop traz a janela completa para a frente — no mini não dá para ler.
  const perguntando = perguntarPresenca || perguntarAusencia;
  const chavePergunta = perguntarAusencia
    ? `aus:${ausencia?.desdeMs}`
    : perguntarPresenca
      ? `pres:${referencia?.id}:${referencia?.ultima_presenca_em}`
      : null;
  useEffect(() => {
    if (chavePergunta) ponteDesktop()?.abrirCompleto();
  }, [chavePergunta]);

  // E chama a atenção de quem está em outra tela: aviso do sistema, toque e o
  // ícone da aba piscando, até responder (pedido do Igor, 25/11/2026).
  const textoPerguntaRef = useRef<TextoDoAviso | null>(null);
  textoPerguntaRef.current = perguntando
    ? textoDoAviso(
        perguntarAusencia ? 'ausencia' : 'presenca',
        rodandoTodos,
        perguntarAusencia ? AUSENCIA_TOLERANCIA_MS / 60_000 : (estado?.regras.presenca_tolerancia_seg ?? 600) / 60,
      )
    : null;
  useEffect(() => {
    const texto = textoPerguntaRef.current;
    if (!chavePergunta || !texto) return;
    return chamarAtencao({ chave: chavePergunta, texto });
  }, [chavePergunta]);

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
    else if (perguntando) {
      // pisca na barra de tarefas/aba enquanto espera a resposta
      document.title = Math.floor(agoraLocal / 1000) % 2 === 0 ? '⚠ Você está aí? · Timer Flag' : '● Responda · Timer Flag';
    } else {
      const mais = rodandoTodos.length > 1 ? ` +${rodandoTodos.length - 1}` : '';
      document.title = `▶ ${relogio(segundos)} · #${rodando.work_item_id}${mais} · Timer Flag`;
    }
  }, [tituloDaAba, rodando, rodandoTodos.length, perguntando, segundos, agoraLocal]);

  // hora de relógio do dia: paralelos sobrepostos contam uma vez (25/11/2026)
  const totalHoje = useMemo(() => (estado ? horaTrabalhadaSeg(estado, agoraServidor) : 0), [estado, agoraServidor]);

  return {
    estado,
    carregando: estadoQ.isLoading,
    erro: estadoQ.error,
    /** o mais recente dos que rodam (mini, título, compatibilidade) */
    rodando,
    /** todos os que rodam (TM9: paralelo), do mais recente ao mais antigo */
    rodandoTodos,
    /** o mais atrasado em sinal/presença (é por ele que o servidor corta) */
    referencia,
    /** o que a tarefa rodando tem a lançar hoje (zera ao lançar) */
    segundos,
    segundosDe,
    /** só o trecho atual (base do "parei há") */
    segundosTrecho,
    segundosRodandoTodos,
    totalHoje,
    agoraServidor,
    perguntarPresenca,
    prazoPresencaMs,
    /** "Você está aí?" depois de 10 min sem uso do computador */
    ausencia: perguntarAusencia ? ausencia : null,
    confirmarAusencia,
    pararPorAusencia,
    somenteConsulta,
    acoes,
  };
}

export type MotorTimer = ReturnType<typeof useMotorTimer>;
