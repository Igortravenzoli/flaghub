import { extractSprintCodeFromPath, parseSprintCode } from '@/lib/sprintCalendar';

export interface QaStateHistoryEntry {
  oldValue?: string | null;
  newValue?: string | null;
  revisedBy?: unknown;
  revisedDate?: string | null;
}

export interface QaDoneItem {
  id: number | null;
  iteration_path?: string | null;
  qa_retorno_count?: number;
  state_history?: QaStateHistoryEntry[] | null;
}

const DONE_STATES = new Set(['done', 'closed', 'resolved']);
const QA_ORIGIN_STATES = new Set(['em teste', 'in test', 'testing']);
const DEV_DEST_STATES = new Set([
  'em desenvolvimento',
  'in progress',
  'in development',
  'to do',
  'new',
  'committed',
  'prioritized',
  'active',
  'approved',
]);

export function isDoneState(state: string | null | undefined): boolean {
  return DONE_STATES.has((state || '').toLowerCase().trim());
}

function normalizeState(value: string | null | undefined): string {
  return (value || '').toLowerCase().trim();
}

export function countQaReturnsFromStateHistory(stateHistory: QaStateHistoryEntry[] | null | undefined): {
  count: number;
  lastReturnBy: string | null;
  lastReturnAt: string | null;
  lastDestinationState: string | null;
} {
  if (!stateHistory || stateHistory.length === 0) {
    return { count: 0, lastReturnBy: null, lastReturnAt: null, lastDestinationState: null };
  }

  let count = 0;
  let lastReturnBy: string | null = null;
  let lastReturnAt: string | null = null;
  let lastDestinationState: string | null = null;

  for (const entry of stateHistory) {
    const oldVal = normalizeState(entry.oldValue);
    const newVal = normalizeState(entry.newValue);

    if (QA_ORIGIN_STATES.has(oldVal) && DEV_DEST_STATES.has(newVal)) {
      count += 1;

      const who = typeof entry.revisedBy === 'string'
        ? entry.revisedBy
        : ((entry.revisedBy as { displayName?: string; uniqueName?: string } | null)?.displayName
            || (entry.revisedBy as { displayName?: string; uniqueName?: string } | null)?.uniqueName
            || null);

      if (who) lastReturnBy = who;
      if (entry.revisedDate) lastReturnAt = entry.revisedDate;
      if (entry.newValue) lastDestinationState = entry.newValue;
    }
  }

  return { count, lastReturnBy, lastReturnAt, lastDestinationState };
}

export function isIterationPathFromYear(iterationPath: string | null | undefined, year: number): boolean {
  const sprintCode = extractSprintCodeFromPath(iterationPath);
  if (!sprintCode) return false;
  const parsed = parseSprintCode(sprintCode);
  return parsed?.year === year;
}

export function getSprintCode(iterationPath: string | null | undefined): string | null {
  return extractSprintCodeFromPath(iterationPath);
}

export function filterDoneItemsBySprintAndYear<T extends QaDoneItem>(
  items: T[],
  year: number,
  selectedSprintCode: string | null
): T[] {
  return items.filter((item) => {
    const sprintCode = getSprintCode(item.iteration_path);
    if (!sprintCode) return false;

    const parsed = parseSprintCode(sprintCode);
    if (!parsed || parsed.year !== year) return false;

    if (!selectedSprintCode) return true;
    return sprintCode === selectedSprintCode;
  });
}

export function computeQaReworkMetrics<T extends QaDoneItem>(items: T[]): {
  totalConcluidos: number;
  itensComRetornoQa: number;
  ciclosTotaisRetornoQa: number;
  percentualComRetornoQa: number;
  mediaRetornoPorItemAfetado: number;
} {
  const totalConcluidos = items.length;
  const itensComRetornoQa = items.filter((item) => (item.qa_retorno_count ?? 0) > 0).length;
  const ciclosTotaisRetornoQa = items.reduce((sum, item) => sum + (item.qa_retorno_count ?? 0), 0);

  const percentualComRetornoQa = totalConcluidos > 0
    ? Math.round((itensComRetornoQa / totalConcluidos) * 1000) / 10
    : 0;

  const mediaRetornoPorItemAfetado = itensComRetornoQa > 0
    ? Math.round((ciclosTotaisRetornoQa / itensComRetornoQa) * 100) / 100
    : 0;

  return {
    totalConcluidos,
    itensComRetornoQa,
    ciclosTotaisRetornoQa,
    percentualComRetornoQa,
    mediaRetornoPorItemAfetado,
  };
}
