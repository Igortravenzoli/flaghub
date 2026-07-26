/**
 * Formato de horas da Fábrica — **h:mm** (decisão de Igor, 26/07/2026).
 *
 * Por quê: hora decimal e hora sexagesimal se parecem e não são a mesma coisa —
 * `34.7h` foi lido como "34h07" na conferência da S14, quando o real era 34:42
 * (0,7h = 42min). Como todo número de hora da Fábrica é confrontado com o
 * DevOps e com a planilha do gestor, que estão em h:mm, o portal fala a mesma
 * língua da fonte.
 *
 * Regras:
 * - a conta é sempre feita em MINUTOS inteiros; o arredondamento acontece só
 *   aqui, na exibição (somar valores já arredondados foi o que produziu o
 *   `299.1 × 301.1` entre dois prints do mesmo dado);
 * - h:mm nunca leva sufixo "h" (senão vira "84:22h");
 * - use `font-mono`/`tabular-nums` em coluna de hora.
 */

/** Minutos → "84:22". Negativo sai com sinal de menos: "−12:30". */
export function horasHM(minutos: number): string {
  const total = Math.round(Math.abs(minutos));
  const sinal = minutos < 0 && total > 0 ? '−' : '';
  return `${sinal}${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Minutos → "+2:30" / "−2:30". Para deltas (realizado − capacidade). */
export function horasHMComSinal(minutos: number): string {
  const total = Math.round(Math.abs(minutos));
  return `${minutos >= 0 ? '+' : '−'}${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Horas decimais → h:mm, para as poucas séries que só carregam o decimal já
 * arredondado (gráficos). Prefira `horasHM` sempre que os minutos existirem:
 * aqui o valor já perdeu até 3 minutos no arredondamento da origem.
 */
export function horasHMdeDecimal(horas: number): string {
  return horasHM(Math.round(horas * 60));
}
