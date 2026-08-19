import { describe, it, expect } from 'vitest';
import { visoesDoTrimestre, ymAnterior, qKeyAnterior } from '@/lib/comercialPeriodo';

/**
 * Filtro do funil (18/08/2026): uma visão por mês JÁ INICIADO do trimestre
 * vigente + o acumulado. A lista sai do calendário — se voltar a ser constante
 * no código, estes testes quebram.
 */
describe('visoesDoTrimestre', () => {
  it('agosto de um Q3 → Julho · Agosto · Acumulado (o caso do modelo)', () => {
    const v = visoesDoTrimestre(new Date(2026, 7, 18));
    expect(v.map(x => x.label)).toEqual(['Julho', 'Agosto', 'Acumulado']);
    expect(v[0].meses).toEqual(['2026-07']);
    expect(v[1].meses).toEqual(['2026-08']);
    expect(v[2].meses).toEqual(['2026-07', '2026-08']);
    expect(v[2].tipo).toBe('acumulado');
    expect(v[2].labelCurto).toBe('Q3 2026');
  });

  it('o rótulo do acumulado NÃO cita o trimestre — a virada do Q4 não pede build', () => {
    for (const ref of [new Date(2026, 7, 18), new Date(2026, 10, 5), new Date(2027, 1, 2)]) {
      const acumulado = visoesDoTrimestre(ref).find(v => v.tipo === 'acumulado');
      expect(acumulado?.label).toBe('Acumulado');
      expect(acumulado?.label).not.toMatch(/Q[1-4]/);
    }
    // O trimestre continua saindo do calendário no selo curto, esse sim datado.
    expect(visoesDoTrimestre(new Date(2026, 10, 5)).at(-1)?.labelCurto).toBe('Q4 2026');
  });

  it('setembro ainda não iniciado não vira aba nem entra no acumulado', () => {
    const v = visoesDoTrimestre(new Date(2026, 7, 18));
    expect(v.some(x => x.label === 'Setembro')).toBe(false);
    expect(v.flatMap(x => x.meses)).not.toContain('2026-09');
  });

  it('primeiro mês do trimestre não ganha aba de acumulado (seria cópia do mês)', () => {
    const v = visoesDoTrimestre(new Date(2026, 6, 3));
    expect(v).toHaveLength(1);
    expect(v[0].label).toBe('Julho');
    expect(v[0].tipo).toBe('mes');
  });

  it('último mês do trimestre → 3 meses + acumulado dos 3', () => {
    const v = visoesDoTrimestre(new Date(2026, 8, 30));
    expect(v.map(x => x.label)).toEqual(['Julho', 'Agosto', 'Setembro', 'Acumulado']);
    expect(v[3].meses).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('vale para qualquer trimestre, não só o Q3', () => {
    const v = visoesDoTrimestre(new Date(2026, 1, 10)); // fevereiro → Q1
    expect(v.map(x => x.label)).toEqual(['Janeiro', 'Fevereiro', 'Acumulado']);
    expect(v[2].labelCurto).toBe('Q1 2026');
  });

  it('a chave do mês é o próprio YYYY-MM e a do acumulado é o trimestre', () => {
    const v = visoesDoTrimestre(new Date(2026, 10, 5)); // novembro → Q4
    expect(v[0].key).toBe('2026-10');
    expect(v[v.length - 1].key).toBe('2026-Q4');
  });
});

describe('período anterior (comparativos da faixa de KPIs)', () => {
  it('mês anterior atravessa a virada de ano', () => {
    expect(ymAnterior('2026-01')).toBe('2025-12');
    expect(ymAnterior('2026-08')).toBe('2026-07');
    expect(ymAnterior('2026-10')).toBe('2026-09');
  });

  it('trimestre anterior atravessa a virada de ano', () => {
    expect(qKeyAnterior('2026-Q1')).toBe('2025-Q4');
    expect(qKeyAnterior('2026-Q3')).toBe('2026-Q2');
  });
});
