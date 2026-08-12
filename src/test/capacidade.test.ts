import { describe, it, expect } from 'vitest';
import {
  capacidadeMinutos,
  diasUteisAusentes,
  diasUteisAusentesNoPeriodo,
  indexarAusencias,
  isoDia,
} from '@/lib/capacidade';

// Sprint S16-2026: 03/08 (seg) a 14/08 (sex) = 10 dias úteis.
const SPRINT_INI = new Date(2026, 7, 3);
const SPRINT_FIM = new Date(2026, 7, 14);

describe('desconto de ausência na capacidade', () => {
  it('caso real: férias do Rodolfo (06/08 a 16/08) dentro da sprint', () => {
    // 06, 07, 10, 11, 12, 13, 14 = 7 dias úteis; 16/08 é domingo e cai fora.
    const dias = diasUteisAusentesNoPeriodo(
      { data_inicio: '2026-08-06', data_fim: '2026-08-16' }, SPRINT_INI, SPRINT_FIM,
    );
    expect(dias).toBe(7);
    // 7h/dia: 10 dias viram 3 disponíveis = 21h, não 70h.
    expect(capacidadeMinutos(7, 10, dias)).toBe(3 * 7 * 60);
  });

  it('ausência inteiramente fora do período não desconta', () => {
    expect(diasUteisAusentesNoPeriodo(
      { data_inicio: '2026-07-02', data_fim: '2026-07-31' }, SPRINT_INI, SPRINT_FIM,
    )).toBe(0);
  });

  it('ausência que engloba o período zera a capacidade', () => {
    const dias = diasUteisAusentesNoPeriodo(
      { data_inicio: '2026-07-01', data_fim: '2026-08-31' }, SPRINT_INI, SPRINT_FIM,
    );
    expect(dias).toBe(10);
    expect(capacidadeMinutos(7, 10, dias)).toBe(0);
  });

  it('fim de semana dentro das férias não conta como dia útil', () => {
    // 08 e 09/08 são sábado e domingo.
    expect(diasUteisAusentesNoPeriodo(
      { data_inicio: '2026-08-08', data_fim: '2026-08-09' }, SPRINT_INI, SPRINT_FIM,
    )).toBe(0);
  });

  it('períodos sobrepostos contam o dia uma vez só', () => {
    const dias = diasUteisAusentes([
      { data_inicio: '2026-08-06', data_fim: '2026-08-16' },
      { data_inicio: '2026-08-10', data_fim: '2026-08-12' },
    ], SPRINT_INI, SPRINT_FIM);
    expect(dias).toBe(7);
  });

  it('períodos separados somam', () => {
    const dias = diasUteisAusentes([
      { data_inicio: '2026-08-03', data_fim: '2026-08-04' }, // 2 úteis
      { data_inicio: '2026-08-13', data_fim: '2026-08-14' }, // 2 úteis
    ], SPRINT_INI, SPRINT_FIM);
    expect(dias).toBe(4);
  });

  it('intervalo invertido é ignorado em vez de virar desconto negativo', () => {
    expect(diasUteisAusentesNoPeriodo(
      { data_inicio: '2026-08-14', data_fim: '2026-08-03' }, SPRINT_INI, SPRINT_FIM,
    )).toBe(0);
  });

  it('sem ausência, capacidade é a cheia', () => {
    expect(diasUteisAusentes([], SPRINT_INI, SPRINT_FIM)).toBe(0);
    expect(capacidadeMinutos(7, 10)).toBe(70 * 60);
  });

  it('desconto maior que o período não gera capacidade negativa', () => {
    expect(capacidadeMinutos(7, 10, 20)).toBe(0);
  });

  it('data não escorrega por fuso: 06/08 é 06/08', () => {
    expect(isoDia(new Date(2026, 7, 6))).toBe('2026-08-06');
  });

  it('indexa ausências por colaborador', () => {
    const mapa = indexarAusencias([
      { colaborador: 'A', tipo: 'ferias', data_inicio: '2026-08-06', data_fim: '2026-08-16' },
      { colaborador: 'A', tipo: 'ferias', data_inicio: '2026-01-02', data_fim: '2026-01-10' },
      { colaborador: 'B', tipo: 'ferias', data_inicio: '2026-08-10', data_fim: '2026-08-12' },
    ]);
    expect(mapa.get('A')).toHaveLength(2);
    expect(mapa.get('B')).toHaveLength(1);
    expect(mapa.get('C')).toBeUndefined();
  });
});
