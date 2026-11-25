/**
 * Chamar a atenção de quem está em OUTRA tela quando o Timer pergunta algo
 * ("Ainda está nesta tarefa?", a cada hora; "Você está aí?", sem uso do
 * computador). Pedido do Igor, 25/11/2026: a pergunta passava batido — a
 * pessoa só via o timer pausado depois.
 *
 * Enquanto a pergunta espera resposta e a janela do Timer não está em foco:
 *   • aviso do sistema (Notification), que aparece por cima de qualquer
 *     programa e, clicado, traz o Timer para a frente;
 *   • um toque curto, repetido a cada 30 s;
 *   • o ícone da aba pisca (o título já piscava; com muitas abas só o ícone
 *     aparece);
 *   • no app desktop 1.0.6+, a janela fica por cima das outras até a pessoa
 *     clicar nela.
 *
 * Tudo aqui é melhor-esforço: sem permissão, sem áudio ou sem suporte, o
 * diálogo e o título da aba seguem funcionando como antes.
 */
import { ponteDesktop } from '@/lib/timerDesktop';

export type TipoPergunta = 'presenca' | 'ausencia';

export interface TextoDoAviso {
  titulo: string;
  corpo: string;
}

/** O texto do aviso do sistema: a pergunta, as tarefas e o prazo. */
export function textoDoAviso(
  tipo: TipoPergunta,
  tarefas: { work_item_id: number; titulo: string }[],
  prazoMin: number,
): TextoDoAviso {
  const varios = tarefas.length > 1;
  const titulo = tipo === 'ausencia' ? 'Você está aí?' : varios ? 'Ainda está nestas tarefas?' : 'Ainda está nesta tarefa?';
  const lista = tarefas
    .slice(0, 3)
    .map((t) => `#${t.work_item_id} ${t.titulo}`.slice(0, 70))
    .join('\n');
  const mais = tarefas.length > 3 ? `\n+${tarefas.length - 3}` : '';
  const prazo = `Responda em até ${Math.max(1, Math.round(prazoMin))} min, ou ${varios ? 'os timers pausam' : 'o timer pausa'}.`;
  return { titulo: `${titulo} · Timer Flag`, corpo: [lista + mais, prazo].filter(Boolean).join('\n') };
}

// ─── uma janela só avisa (app + mini, ou duas abas, rodam o mesmo motor) ────

export const CHAVE_ATENCAO = 'timer-flag:atencao';

/**
 * A primeira janela a marcar a pergunta fica com o aviso do sistema e o toque;
 * as outras só piscam. Sem storage, todas avisam (melhor repetir que calar).
 */
export function assumirAviso(
  chavePergunta: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  minhas: Set<string> = perguntasDestaJanela,
): boolean {
  // a mesma janela religando o aviso da mesma pergunta continua dona dele
  if (minhas.has(chavePergunta)) return true;
  if (!storage) return true;
  try {
    if (storage.getItem(CHAVE_ATENCAO) === chavePergunta) return false;
    storage.setItem(CHAVE_ATENCAO, chavePergunta);
    minhas.add(chavePergunta);
    return true;
  } catch {
    return true;
  }
}

const perguntasDestaJanela = new Set<string>();

// ─── permissão do aviso do sistema ──────────────────────────────────────────

export type PermissaoAviso = 'granted' | 'denied' | 'default' | 'sem_suporte';

export function permissaoDoAviso(): PermissaoAviso {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'sem_suporte';
  return Notification.permission;
}

const CHAVE_PEDIU = 'timer-flag:aviso-pedido';

/**
 * Pede a permissão do aviso do sistema. Chamar a partir de um clique (iniciar
 * o timer, ou o botão do diálogo). Sem `insistir`, pede uma vez só por
 * navegador: quem fechou o pedido não é perguntado a cada timer.
 */
export async function pedirPermissaoDoAviso(insistir = false): Promise<PermissaoAviso> {
  const atual = permissaoDoAviso();
  if (atual !== 'default') return atual;
  try {
    if (!insistir && localStorage.getItem(CHAVE_PEDIU)) return atual;
    localStorage.setItem(CHAVE_PEDIU, '1');
  } catch {
    /* sem storage: pede assim mesmo */
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return permissaoDoAviso();
  }
}

// ─── toque ──────────────────────────────────────────────────────────────────

let audio: AudioContext | null = null;

/** Dois bipes curtos. Calado se o navegador ainda não liberou áudio para a página. */
export function tocarAviso(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const ctx = audio;
    void ctx.resume().catch(() => undefined);
    if (ctx.state !== 'running') return;
    const bipe = (inicio: number, hz: number) => {
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      ganho.gain.setValueAtTime(0.0001, inicio);
      ganho.gain.exponentialRampToValueAtTime(0.18, inicio + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.22);
      osc.connect(ganho).connect(ctx.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.25);
    };
    bipe(ctx.currentTime, 880);
    bipe(ctx.currentTime + 0.3, 1175);
  } catch {
    /* sem áudio: o aviso e a aba piscando seguem */
  }
}

// ─── ícone da aba piscando ──────────────────────────────────────────────────

const ICONE_ALERTA =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#DC2626"/>' +
      '<rect x="14" y="7" width="4" height="12" rx="2" fill="#fff"/><circle cx="16" cy="24" r="2.4" fill="#fff"/></svg>',
  );

/** Alterna o ícone da aba com um alerta vermelho. Devolve o "parar", que restaura o original. */
export function piscarIconeDaAba(intervaloMs = 800): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) return () => undefined;
  const original = { href: link.getAttribute('href'), type: link.getAttribute('type') };
  let alerta = false;
  const trocar = () => {
    alerta = !alerta;
    link.setAttribute('type', 'image/svg+xml');
    link.setAttribute('href', alerta ? ICONE_ALERTA : (original.href ?? ''));
  };
  trocar();
  const id = window.setInterval(trocar, intervaloMs);
  return () => {
    window.clearInterval(id);
    if (original.href !== null) link.setAttribute('href', original.href);
    if (original.type !== null) link.setAttribute('type', original.type);
    else link.removeAttribute('type');
  };
}

// ─── tudo junto ─────────────────────────────────────────────────────────────

const REPETIR_TOQUE_MS = 30_000;

/** A pessoa está olhando para o Timer agora? */
const emFoco = () => typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();

/**
 * Liga os avisos de uma pergunta. Devolve o "desligar" (respondeu, pausou ou
 * venceu o prazo). `chave` identifica a pergunta: a mesma pergunta em duas
 * janelas toca e notifica uma vez só.
 */
export function chamarAtencao(p: { chave: string; texto: TextoDoAviso }): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const desligar: (() => void)[] = [];
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const dono = assumirAviso(p.chave, storage);

  desligar.push(piscarIconeDaAba());

  // App desktop 1.0.6+: a janela completa vem para cima das outras e fica.
  const ponte = ponteDesktop();
  ponte?.chamarAtencao?.(true);
  desligar.push(() => ponte?.chamarAtencao?.(false));

  if (dono) {
    const trazer = () => {
      window.focus();
      ponteDesktop()?.abrirCompleto();
    };
    let aviso: Notification | null = null;
    const notificar = () => {
      if (emFoco() || permissaoDoAviso() !== 'granted') return;
      try {
        aviso?.close();
        aviso = new Notification(p.texto.titulo, {
          body: p.texto.corpo,
          tag: 'timer-flag-pergunta',
          requireInteraction: true,
          icon: '/favicon.svg',
        });
        aviso.onclick = () => {
          trazer();
          aviso?.close();
        };
      } catch {
        // Chrome no Android só aceita aviso pelo service worker: fica sem
      }
    };
    notificar();
    if (!emFoco()) tocarAviso();
    const id = window.setInterval(() => {
      if (!emFoco()) tocarAviso();
    }, REPETIR_TOQUE_MS);
    // voltou para o Timer: o aviso do sistema já cumpriu o papel
    const aoFocar = () => aviso?.close();
    window.addEventListener('focus', aoFocar);
    desligar.push(() => {
      window.clearInterval(id);
      window.removeEventListener('focus', aoFocar);
      aviso?.close();
    });
  }

  return () => desligar.forEach((f) => f());
}
