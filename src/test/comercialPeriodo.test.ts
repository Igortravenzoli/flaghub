import { describe, it, expect } from 'vitest';
import {
  resolvePeriodo,
  trimestreVigente,
  mesesDoTrimestre,
  qKeyDoMes,
  qLabel,
  mesesEntre,
} from '@/lib/comercialPeriodo';

describe('comercialPeriodo', () => {
  it('mês único → granularidade mes', () => {
    const p = resolvePeriodo(new Date(2026, 6, 1), new Date(2026, 6, 31));
    expect(p.meses).toEqual(['2026-07']);
    expect(p.granularidade).toBe('mes');
    expect(p.labelCurto).toBe('jul/26');
  });

  it('trimestre cheio → granularidade trimestre com meses no rótulo', () => {
    const p = resolvePeriodo(new Date(2026, 6, 1), new Date(2026, 8, 30));
    expect(p.meses).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(p.granularidade).toBe('trimestre');
    expect(p.label).toBe('Q3 2026 · jul–set');
    expect(p.labelCurto).toBe('Q3 2026');
  });

  it('3 meses fora do alinhamento de trimestre NÃO viram trimestre', () => {
    const p = resolvePeriodo(new Date(2026, 7, 1), new Date(2026, 9, 31));
    expect(p.granularidade).toBe('multi');
    expect(p.trimestres).toEqual(['2026-Q3', '2026-Q4']);
  });

  it('período invertido não trava (guarda-corpo do laço)', () => {
    expect(mesesEntre(new Date(2026, 8, 1), new Date(2026, 6, 1))).toEqual(['2026-09']);
  });

  it('trimestre vigente cobre o mês de referência inteiro', () => {
    const t = trimestreVigente(new Date(2026, 7, 15));
    expect(t.qKey).toBe('2026-Q3');
    expect(t.from.getMonth()).toBe(6);   // julho
    expect(t.to.getMonth()).toBe(8);     // setembro
    expect(t.to.getDate()).toBe(30);
    expect(t.label).toBe('Q3 2026 · jul–set');
  });

  it('mapeia mês ↔ trimestre nos dois sentidos', () => {
    expect(qKeyDoMes('2026-02')).toBe('2026-Q1');
    expect(qKeyDoMes('2026-12')).toBe('2026-Q4');
    expect(mesesDoTrimestre('2026-Q4')).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(qLabel('2026-Q1')).toBe('Q1 2026 · jan–mar');
  });
});
