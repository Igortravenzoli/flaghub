/**
 * Rótulo de mês de referência — 'YYYY-MM' → 'jul/26'.
 *
 * Promovido de `HelpdeskExecutivoTab.tsx` (onde nasceu junto do "Comparativo
 * mensal", removido em 30/07) porque três telas passaram a precisar do mesmo
 * rótulo: os cards de SLA (janela de calendário do gateway), o Panorama
 * (mês de referência da cobertura de clientes) e o card de incidentes.
 *
 * A entrada vem SEMPRE do backend (`referencia.mesAtual`, `mesReferencia`) —
 * o front não calcula janela. Por isso a função só formata e degrada.
 */

export const MESES_ABREV = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
] as const;

/** 'YYYY-MM' → 'jul/26'. Entrada vazia/ausente → '—' (nunca 'undefined/NaN'). */
export function fmtMesAno(ym?: string | null): string {
  if (!ym) return '—';
  const [y, m] = ym.split('-');
  const mes = MESES_ABREV[Number(m) - 1] ?? m;
  const ano = (y ?? '').slice(2);
  return ano ? `${mes}/${ano}` : '—';
}

/**
 * 'YYYY-MM-DD' → '30/07/2026'. Feito por string de propósito:
 * `new Date('2026-07-01')` é interpretado como UTC e, a oeste de Greenwich,
 * imprimiria 30/06.
 */
export function fmtDataIso(iso?: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : '—';
}
