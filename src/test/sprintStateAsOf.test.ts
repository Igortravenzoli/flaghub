import { describe, expect, it } from 'vitest';
import { stateAsOf, isDoneState, qaReturnsAsOf, type AsOfInput } from '@/lib/sprintStateAsOf';

const CUT = '2026-06-06T02:59:59Z'; // 05/06 23:59 BRT

describe('stateAsOf', () => {
  it('returns current state when item did not change after the cutoff', () => {
    const item: AsOfInput = { currentState: 'Done', changedDate: '2026-06-01T10:00:00Z', stateHistory: null };
    expect(stateAsOf(item, CUT)).toBe('Done');
  });

  it('rolls back via state_history when changed after the cutoff', () => {
    const item: AsOfInput = {
      currentState: 'Done',
      changedDate: '2026-06-08T09:00:00Z', // mudou depois do corte
      stateHistory: [
        { oldValue: 'Em desenvolvimento', newValue: 'Em Teste', revisedDate: '2026-06-03T12:00:00Z' },
        { oldValue: 'Em Teste', newValue: 'Done', revisedDate: '2026-06-08T09:00:00Z' }, // após o corte
      ],
    };
    // No corte ainda estava "Em Teste"
    expect(stateAsOf(item, CUT)).toBe('Em Teste');
    expect(isDoneState(stateAsOf(item, CUT))).toBe(false);
  });

  it('falls back to earliest oldValue when no transition precedes the cutoff', () => {
    const item: AsOfInput = {
      currentState: 'Done',
      changedDate: '2026-06-10T09:00:00Z',
      stateHistory: [
        { oldValue: 'New', newValue: 'Em desenvolvimento', revisedDate: '2026-06-09T09:00:00Z' },
      ],
    };
    expect(stateAsOf(item, CUT)).toBe('New');
  });

  it('falls back to current state when changed after cutoff and no history (aproximado)', () => {
    const item: AsOfInput = { currentState: 'Done', changedDate: '2026-06-08T09:00:00Z', stateHistory: null };
    expect(stateAsOf(item, CUT)).toBe('Done');
  });
});

describe('qaReturnsAsOf', () => {
  it('counts Em Teste entries up to cutoff minus 1', () => {
    const hist = [
      { oldValue: 'Em desenvolvimento', newValue: 'Em Teste', revisedDate: '2026-06-01T10:00:00Z' },
      { oldValue: 'Em Teste', newValue: 'Em desenvolvimento', revisedDate: '2026-06-02T10:00:00Z' },
      { oldValue: 'Em desenvolvimento', newValue: 'Em Teste', revisedDate: '2026-06-03T10:00:00Z' },
      { oldValue: 'Em Teste', newValue: 'Em Teste', revisedDate: '2026-06-09T10:00:00Z' }, // após corte, ignorado
    ];
    expect(qaReturnsAsOf(hist, CUT)).toBe(1); // 2 entradas até o corte - 1
  });

  it('returns 0 with a single test entry or no history', () => {
    expect(qaReturnsAsOf([{ newValue: 'Em Teste', revisedDate: '2026-06-01T10:00:00Z' }], CUT)).toBe(0);
    expect(qaReturnsAsOf(null, CUT)).toBe(0);
  });
});
