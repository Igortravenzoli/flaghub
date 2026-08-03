import { describe, expect, it } from 'vitest';
import { ehEstadoConcluido, ehEstadoDone, ehEstadoEntregue } from '@/lib/fabricaEstados';

/**
 * Régua do gestor da Fábrica: Concluído = Entregue + Done, e a lista de estados
 * é a mesma do banco (`fn_estado_entregue` / `fn_estado_done`, SN-7).
 */
describe('régua de estado da Fábrica', () => {
  it('entregue cobre toda a saída do dev, inclusive Aguardando Teste', () => {
    for (const s of ['Aguardando Teste', 'Em Teste', 'Aguardando Deploy', 'Deploy', 'Homologação']) {
      expect(ehEstadoEntregue(s)).toBe(true);
    }
  });

  it('em desenvolvimento e new não são entregues', () => {
    for (const s of ['Em Desenvolvimento', 'New', 'To Do', 'Removed']) {
      expect(ehEstadoEntregue(s)).toBe(false);
    }
  });

  it('done não é entregue — os conjuntos são disjuntos, senão Concluído contaria duplicado', () => {
    expect(ehEstadoEntregue('Done')).toBe(false);
    expect(ehEstadoDone('Done')).toBe(true);
  });

  it('comparação é insensível a caixa e espaço (a versão antiga exigia "Done" exato)', () => {
    expect(ehEstadoDone('done')).toBe(true);
    expect(ehEstadoDone('  DONE ')).toBe(true);
    expect(ehEstadoEntregue('em teste')).toBe(true);
    expect(ehEstadoEntregue(' Aguardando Deploy ')).toBe(true);
  });

  it('homologação vale com e sem acento', () => {
    expect(ehEstadoEntregue('homologacao')).toBe(true);
    expect(ehEstadoEntregue('HOMOLOGAÇÃO')).toBe(true);
  });

  it('concluído = done ou entregue; nulo/vazio não conta', () => {
    expect(ehEstadoConcluido('Done')).toBe(true);
    expect(ehEstadoConcluido('Em Teste')).toBe(true);
    expect(ehEstadoConcluido('Em Desenvolvimento')).toBe(false);
    expect(ehEstadoConcluido(null)).toBe(false);
    expect(ehEstadoConcluido('')).toBe(false);
  });
});
