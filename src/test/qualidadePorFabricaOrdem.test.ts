import { describe, expect, it } from 'vitest';
import { ordenaColuna, type CelulaFabricaMetricas } from '@/components/fabrica/QualidadePorFabricaCharts';

// Q3 do print do gestor: STAGING 18 / FLEXX 39 / APP 21 / K8 27 de entrega.
const Q3: Record<string, CelulaFabricaMetricas> = {
  STAGING: { entrega: 18, bug: 36, retorno: 27 },
  FLEXX: { entrega: 39, bug: 33, retorno: 35 },
  APP: { entrega: 21, bug: 21, retorno: 42 },
  K8: { entrega: 27, bug: 36, retorno: 3 },
};
// Ordem do ranking Desempenho × Qualidade (a da legenda) — é a entrada, não a saída.
const LEGENDA = ['STAGING', 'FLEXX', 'APP', 'K8'];

describe('ordenaColuna — melhor barra primeiro dentro do grupo', () => {
  it('Entregas: do maior para o menor', () => {
    expect(ordenaColuna(Q3, LEGENDA, 'entrega', true).map((i) => i.f))
      .toEqual(['FLEXX', 'K8', 'APP', 'STAGING']);
  });

  it('Bug: do menor para o maior', () => {
    expect(ordenaColuna(Q3, LEGENDA, 'bug', false).map((i) => `${i.f}:${i.v}`))
      .toEqual(['APP:21', 'FLEXX:33', 'STAGING:36', 'K8:36']);
  });

  it('Retorno QA: do menor para o maior', () => {
    expect(ordenaColuna(Q3, LEGENDA, 'retorno', false).map((i) => i.f))
      .toEqual(['K8', 'STAGING', 'FLEXX', 'APP']);
  });

  it('fábrica sem escopo na coluna não vira barra de 0%', () => {
    const semApp: Record<string, CelulaFabricaMetricas> = { ...Q3 };
    delete semApp.APP;
    const bug = ordenaColuna(semApp, LEGENDA, 'bug', false);
    expect(bug.map((i) => i.f)).toEqual(['FLEXX', 'STAGING', 'K8']);
    expect(bug.some((i) => i.f === 'APP')).toBe(false);
  });

  it('empate preserva a ordem do ranking (sort estável)', () => {
    const empate: Record<string, CelulaFabricaMetricas> = {
      STAGING: { entrega: 50, bug: 10, retorno: 10 },
      FLEXX: { entrega: 50, bug: 10, retorno: 10 },
    };
    expect(ordenaColuna(empate, ['STAGING', 'FLEXX'], 'entrega', true).map((i) => i.f))
      .toEqual(['STAGING', 'FLEXX']);
  });
});
