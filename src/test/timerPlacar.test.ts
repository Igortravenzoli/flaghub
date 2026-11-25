import { describe, expect, it } from 'vitest';
import { bateFiltro, contarPlacar, numeroCurto } from '@/lib/timerPlacar';
import { marcasDeTag } from '@/lib/fabricaClassificacao';

const it_ = (work_item_type: string, tags: string | null = null, state = 'Active') => ({ work_item_type, tags, state });

describe('marcas de tag (placar do Timer, 25/11/2026)', () => {
  it('cada tag conta por si, sem precedência', () => {
    expect(marcasDeTag('Avião; Transbordo')).toEqual(['aviao', 'transbordo']);
    expect(marcasDeTag('Retorno de QA; Priorização')).toEqual(['retorno_qa', 'priorizacao']);
    expect(marcasDeTag('AVIAO TRANSBORDADO')).toEqual(['aviao', 'transbordo']);
    expect(marcasDeTag('AVIAO ANTIGO')).toEqual(['aviao']);
  });
  it('não casa pedaço de outra tag', () => {
    expect(marcasDeTag('Pré-priorização; Transbordo futuro')).toEqual([]);
    expect(marcasDeTag(null)).toEqual([]);
  });
});

describe('contarPlacar', () => {
  const itens = [
    it_('Product Backlog Item', 'Priorização'),
    it_('Product Backlog Item', 'Priorização; Transbordo'),
    it_('User Story'),
    it_('Bug', 'Avião'),
    it_('Bug', 'Avião', 'Done'), // fechado: fora
    it_('Task'),
    it_('Task', 'Retorno QA'),
    it_('Feature', 'Priorização'), // tipo fora do placar, mas a tag conta
  ];

  it('conta só abertos, na ordem fixa, e esconde o que é zero', () => {
    const p = contarPlacar(itens);
    expect(p.tipos).toEqual([
      { chave: 'pbi', n: 3 },
      { chave: 'bug', n: 1 },
      { chave: 'task', n: 2 },
    ]);
    expect(p.tags).toEqual([
      { chave: 'aviao', n: 1 },
      { chave: 'retorno_qa', n: 1 },
      { chave: 'priorizacao', n: 3 },
      { chave: 'transbordo', n: 1 },
    ]);
  });

  it('sem nada, listas vazias', () => {
    expect(contarPlacar([it_('Task', null, 'Closed')])).toEqual({ tipos: [], tags: [] });
  });

  it('o filtro bate com a contagem', () => {
    expect(itens.filter((i) => bateFiltro(i, 'bug'))).toHaveLength(1);
    expect(itens.filter((i) => bateFiltro(i, 'priorizacao'))).toHaveLength(3);
    expect(itens.filter((i) => bateFiltro(i, 'pbi'))).toHaveLength(3);
  });

  it('número curto', () => {
    expect(numeroCurto(7)).toBe('7');
    expect(numeroCurto(99)).toBe('99');
    expect(numeroCurto(100)).toBe('99+');
  });
});
