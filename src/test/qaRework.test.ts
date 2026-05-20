import { describe, expect, it } from 'vitest';
import {
  countQaReturnsFromStateHistory,
  filterDoneItemsBySprintAndYear,
  computeQaReworkMetrics,
} from '@/lib/qaRework';

describe('qaRework', () => {
  it('counts QA returns only when leaving test to dev', () => {
    const result = countQaReturnsFromStateHistory([
      { oldValue: 'Em Teste', newValue: 'Em desenvolvimento', revisedBy: 'QA 1', revisedDate: '2026-01-10T00:00:00Z' },
      { oldValue: 'Em desenvolvimento', newValue: 'Em Teste', revisedBy: 'DEV 1', revisedDate: '2026-01-11T00:00:00Z' },
      { oldValue: 'In Test', newValue: 'To Do', revisedBy: { displayName: 'QA 2' }, revisedDate: '2026-01-12T00:00:00Z' },
    ]);

    expect(result.count).toBe(2);
    expect(result.lastReturnBy).toBe('QA 2');
    expect(result.lastDestinationState).toBe('To Do');
  });

  it('filters done items by year and selected sprint code', () => {
    const items = [
      { id: 1, iteration_path: 'Team\\S1-2026' },
      { id: 2, iteration_path: 'Team\\S3-2026' },
      { id: 3, iteration_path: 'Team\\S4-2025' },
    ];

    expect(filterDoneItemsBySprintAndYear(items, 2026, null).map(i => i.id)).toEqual([1, 2]);
    expect(filterDoneItemsBySprintAndYear(items, 2026, 'S1-2026').map(i => i.id)).toEqual([1]);
  });

  it('computes KPI concepts without mixing affected items and cycles', () => {
    const metrics = computeQaReworkMetrics([
      { id: 1, qa_retorno_count: 0 },
      { id: 2, qa_retorno_count: 1 },
      { id: 3, qa_retorno_count: 6 },
    ]);

    expect(metrics.totalConcluidos).toBe(3);
    expect(metrics.itensComRetornoQa).toBe(2);
    expect(metrics.ciclosTotaisRetornoQa).toBe(7);
    expect(metrics.percentualComRetornoQa).toBeCloseTo(66.7, 1);
    expect(metrics.mediaRetornoPorItemAfetado).toBe(3.5);
  });
});
