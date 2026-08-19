/**
 * Rampa de cor do funil de vendas — topo quente → base fria.
 *
 * Vivia dentro de `FunilVendasTab`; saiu para cá em 18/08/2026 porque a faixa
 * chapada (`FunnelBands`) precisa das mesmas cores e a aba precisa da faixa —
 * mantê-las no mesmo arquivo criaria import circular.
 */
export const FUNNEL_COLORS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0284c7', '#4f46e5', '#9333ea'];

/** Cor da etapa `index` num funil de `total` etapas — distribui a rampa inteira. */
export function funnelColor(index: number, total: number): string {
  if (total <= 1) return FUNNEL_COLORS[0];
  const pos = Math.round((index / (total - 1)) * (FUNNEL_COLORS.length - 1));
  return FUNNEL_COLORS[pos];
}

/** Clareia (factor > 1) ou escurece (factor < 1) um hex — usado no relevo da faixa. */
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `rgb(${r},${g},${b})`;
}
