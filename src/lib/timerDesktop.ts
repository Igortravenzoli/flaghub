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
  abrirCompleto: () => void;
  abrirMini: () => void;
}

declare global {
  interface Window {
    timerFlagDesktop?: PonteDesktop;
  }
}

export function ponteDesktop(): PonteDesktop | null {
  return typeof window !== 'undefined' && window.timerFlagDesktop ? window.timerFlagDesktop : null;
}

/** Valida o que vem do processo principal antes de agir (defensivo). */
export function lerPausaSistema(bruto: unknown, agoraMs = Date.now()): PausaSistema | null {
  const o = bruto as Partial<PausaSistema> | null;
  if (!o || !['bloqueio', 'suspensao', 'ocioso'].includes(o.motivo as string)) return null;
  const fim = Number(o.fimMs);
  if (!Number.isFinite(fim) || fim > agoraMs + 60_000) return null;
  return { motivo: o.motivo as MotivoSistema, fimMs: Math.min(fim, agoraMs) };
}
