/**
 * Paleta gerencial profissional do setor Qualidade.
 * Cores semânticas fixas (hex) para uso em estilos inline e gráficos —
 * evita problemas de purge do Tailwind com classes dinâmicas e garante
 * contraste consistente em light/dark.
 */

export type QaTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'violet';

export interface QaToneStyle {
  /** Cor sólida (faixa lateral, barras, ícone) */
  solid: string;
  /** Fundo suave do chip de ícone (alpha) */
  soft: string;
}

export const QA_TONES: Record<QaTone, QaToneStyle> = {
  primary: { solid: '#2563eb', soft: 'rgba(37,99,235,0.12)' },
  success: { solid: '#0d9488', soft: 'rgba(13,148,136,0.12)' },
  warning: { solid: '#d97706', soft: 'rgba(217,119,6,0.14)' },
  danger:  { solid: '#dc2626', soft: 'rgba(220,38,38,0.12)' },
  info:    { solid: '#0ea5e9', soft: 'rgba(14,165,233,0.12)' },
  neutral: { solid: '#64748b', soft: 'rgba(100,116,139,0.12)' },
  violet:  { solid: '#7c3aed', soft: 'rgba(124,58,237,0.12)' },
};

export function toneStyle(tone: QaTone): QaToneStyle {
  return QA_TONES[tone] ?? QA_TONES.neutral;
}

/** Saúde dos itens (verde/amarelo/vermelho). */
export const QA_HEALTH = {
  verde: '#0d9488',
  amarelo: '#d97706',
  vermelho: '#dc2626',
} as const;

/** Cor por threshold de "quanto maior melhor" (ex.: % sem retorno). */
export function thresholdColorHigh(pct: number): string {
  if (pct >= 80) return QA_TONES.success.solid;
  if (pct >= 60) return QA_TONES.warning.solid;
  return QA_TONES.danger.solid;
}

/** Cor por threshold de "quanto menor melhor" (ex.: % retrabalho). */
export function thresholdColorLow(pct: number): string {
  if (pct <= 10) return QA_TONES.success.solid;
  if (pct <= 20) return QA_TONES.warning.solid;
  return QA_TONES.danger.solid;
}

/** Paleta categórica para séries de gráficos (produtos, closers, etc.). */
export const QA_CHART_SERIES = [
  '#2563eb', '#0d9488', '#d97706', '#dc2626',
  '#0ea5e9', '#7c3aed', '#65a30d', '#db2777',
];

/** Procedência de snapshot (histórico). */
export const QA_SOURCE_COLORS: Record<string, string> = {
  fim_sprint_reconstruido: '#2563eb',
  estado_atual: '#d97706',
  manual: '#64748b',
};
