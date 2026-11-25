/**
 * Ponte com o app desktop (Electron, pasta desktop/). O preload expõe
 * window.timerFlagDesktop; no navegador ela não existe e tudo aqui vira no-op.
 *
 * O app desktop é a mesma tela do /timer numa janela própria: o que ele
 * acrescenta é o que o navegador não sabe — bandeja, mini timer sempre por
 * cima e os avisos do sistema (tela bloqueada, suspensão, ociosidade).
 */

export type MotivoSistema = 'bloqueio' | 'suspensao' | 'ocioso';

export interface PausaSistema {
  motivo: MotivoSistema;
  /** quando a pessoa parou, no relógio da máquina (ms) */
  fimMs: number;
}

export interface PonteDesktop {
  versao: string;
  onPausar: (cb: (p: PausaSistema) => void) => () => void;
  /** a janela acabou de aparecer (app 1.0.2+; no 1.0.1 não existe) */
  onMostrada?: (cb: () => void) => () => void;
  abrirCompleto: () => void;
  abrirMini: () => void;
  /**
   * A tela está perguntando algo (true) ou parou de perguntar (false): a
   * janela completa fica por cima das outras até a pessoa clicar nela (app
   * 1.0.6+; antes disso não existe e vale só o abrirCompleto).
   */
  chamarAtencao?: (ativo: boolean) => void;
}

// ─── sincronia entre janelas (app + mini, ou abas do navegador) ─────────────
// Toda ação que muda o timer avisa as outras janelas, que releem o estado.
// O evento 'storage' só chega nas OUTRAS janelas, nunca na que gravou.

export const CHAVE_ESTADO_MUDOU = 'timer-flag:estado-mudou';

export function avisarEstadoMudou(agoraMs = Date.now()): void {
  try {
    localStorage.setItem(CHAVE_ESTADO_MUDOU, `${agoraMs}:${Math.random().toString(36).slice(2, 8)}`);
  } catch {
    /* sem storage: a outra janela relê ao aparecer */
  }
}

declare global {
  interface Window {
    timerFlagDesktop?: PonteDesktop;
  }
}

export function ponteDesktop(): PonteDesktop | null {
  return typeof window !== 'undefined' && window.timerFlagDesktop ? window.timerFlagDesktop : null;
}

// ─── mini → janela completa: "encerrar e lançar" ───────────────────────────
// O mini pausa e pede à janela completa o diálogo de lançamento. As duas
// janelas compartilham o localStorage, e o evento 'storage' chega na outra.

export const CHAVE_PEDIDO_ENCERRAR = 'timer-flag:pedido-encerrar';
const VALIDADE_PEDIDO_MS = 60_000;

export interface PedidoEncerrar {
  id: number;
  titulo: string;
  ts: number;
  /** tipo do work item, quando o mini sabe (o diálogo decide se oferece o estado do PBI) */
  tipo?: string;
}

export function pedirEncerrar(item: { id: number; titulo: string; tipo?: string | null }, agoraMs = Date.now()): void {
  try {
    localStorage.setItem(
      CHAVE_PEDIDO_ENCERRAR,
      JSON.stringify({ id: item.id, titulo: item.titulo, ts: agoraMs, ...(item.tipo ? { tipo: item.tipo } : {}) }),
    );
  } catch {
    /* sem storage: a pessoa encerra pela janela completa */
  }
}

/** Lê e valida o pedido (vencido ou malformado = nada). */
export function lerPedidoEncerrar(bruto: string | null, agoraMs = Date.now()): PedidoEncerrar | null {
  if (!bruto) return null;
  try {
    const o = JSON.parse(bruto) as Partial<PedidoEncerrar>;
    const id = Number(o.id);
    const ts = Number(o.ts);
    if (!Number.isInteger(id) || id <= 0 || typeof o.titulo !== 'string') return null;
    if (!Number.isFinite(ts) || agoraMs - ts > VALIDADE_PEDIDO_MS || ts > agoraMs + 5_000) return null;
    const tipo = typeof o.tipo === 'string' && o.tipo.length > 0 && o.tipo.length <= 60 ? o.tipo : null;
    return { id, titulo: o.titulo.slice(0, 300), ts, ...(tipo ? { tipo } : {}) };
  } catch {
    return null;
  }
}

/** Valida o que vem do processo principal antes de agir (defensivo). */
export function lerPausaSistema(bruto: unknown, agoraMs = Date.now()): PausaSistema | null {
  const o = bruto as Partial<PausaSistema> | null;
  if (!o || !['bloqueio', 'suspensao', 'ocioso'].includes(o.motivo as string)) return null;
  const fim = Number(o.fimMs);
  if (!Number.isFinite(fim) || fim > agoraMs + 60_000) return null;
  return { motivo: o.motivo as MotivoSistema, fimMs: Math.min(fim, agoraMs) };
}
