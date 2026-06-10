/**
 * Reconstrução do estado de um work item "as-of" um instante de corte
 * (ex.: 23:59 do último dia da sprint), a partir do histórico de transições.
 *
 * Mesma lógica usada na RPC rpc_reconstruct_sprint_snapshot:
 *   - se o item não mudou após o corte (changedDate <= cutoff) → estado atual;
 *   - senão, último newValue com revisedDate <= cutoff;
 *   - fallback: oldValue da transição mais antiga;
 *   - sem histórico e mudado após o corte → estado atual como melhor estimativa
 *     (caso "aproximado"; quem chama deve sinalizar a baixa fidelidade).
 */

export interface StateTransition {
  oldValue?: string | null;
  newValue?: string | null;
  revisedDate?: string | null;
}

export interface AsOfInput {
  currentState: string | null;
  changedDate: string | null;
  stateHistory: StateTransition[] | null;
}

const DONE_STATES = new Set(['done', 'closed', 'resolved']);

function ts(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function stateAsOf(input: AsOfInput, cutoffIso: string): string | null {
  const cutoff = ts(cutoffIso);
  if (cutoff === null) return input.currentState;

  const changed = ts(input.changedDate);
  if (changed !== null && changed <= cutoff) return input.currentState;

  const hist = (input.stateHistory ?? []).filter((e) => ts(e.revisedDate) !== null);
  if (hist.length === 0) return input.currentState; // sem histórico: melhor estimativa = estado atual

  const sorted = [...hist].sort((a, b) => (ts(a.revisedDate)! - ts(b.revisedDate)!));
  const before = sorted.filter((e) => ts(e.revisedDate)! <= cutoff);
  if (before.length > 0) return before[before.length - 1].newValue ?? null;
  return sorted[0].oldValue ?? null;
}

export function isDoneState(state: string | null): boolean {
  return DONE_STATES.has((state ?? '').toLowerCase().trim());
}

/** Nº de retornos de QA até o corte = (entradas em "Em Teste" com data <= corte) - 1, mínimo 0. */
export function qaReturnsAsOf(stateHistory: StateTransition[] | null, cutoffIso: string): number {
  const cutoff = ts(cutoffIso);
  if (cutoff === null || !stateHistory) return 0;
  const emTeste = stateHistory.filter(
    (e) => (e.newValue ?? '').toLowerCase().trim() === 'em teste' && ts(e.revisedDate) !== null && ts(e.revisedDate)! <= cutoff,
  ).length;
  return Math.max(0, emTeste - 1);
}
