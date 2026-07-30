import { describe, it, expect } from 'vitest';
import {
  classificaDemanda, contaCategorias, ehItemDeGestor, ehNaoPriorizado,
  ehPriorizado, itemEhNaoPriorizado, rotuloCategoria,
} from '@/lib/fabricaClassificacao';

/**
 * Trava a precedência de `fn_classifica_demanda` no front. Os casos vêm da
 * auditoria de 29/07/2026 (medição no PROD, sprint S15-2026): os desvios que os
 * 4 classificadores antigos produziam estão aqui como teste de regressão.
 */
describe('classificaDemanda — precedência canônica', () => {
  it('retorno de QA vence tudo, inclusive avião e bug', () => {
    expect(classificaDemanda({ work_item_type: 'Bug', tags: 'AVIAO; FLEXX; RETORNO QA' })).toBe('retorno_qa');
    expect(classificaDemanda({ work_item_type: 'Bug', tags: 'RETORNO DE QA' })).toBe('retorno_qa');
    expect(classificaDemanda({ work_item_type: 'Product Backlog Item', tags: 'Retorno de QA; PRIORIZACAO' })).toBe('retorno_qa');
  });

  it('avião vence priorização e bug, e distingue transbordado', () => {
    expect(classificaDemanda({ work_item_type: 'Product Backlog Item', tags: 'AVIAO; FLEXX' })).toBe('aviao_sprint');
    expect(classificaDemanda({ work_item_type: 'Bug', tags: 'AVIÃO' })).toBe('aviao_sprint');
    expect(classificaDemanda({ work_item_type: 'Bug', tags: 'AVIAO; TRANSBORDO' })).toBe('aviao_transbordado');
    // variantes compostas legadas: o `\b` (o \M do Postgres) é o que faz casar
    expect(classificaDemanda({ work_item_type: 'Bug', tags: 'AVIAO ANTIGO' })).toBe('aviao_transbordado');
    expect(classificaDemanda({ work_item_type: 'Bug', tags: 'AVIAO TRANSBORDADO' })).toBe('aviao_transbordado');
  });

  it('BUG COM TAG PRIORIZAÇÃO é PRIORIZADO — o desvio que causava 89 × 88 em S15', () => {
    const item = { work_item_type: 'Bug', tags: 'PRIORIZACAO; FLEXX' };
    expect(classificaDemanda(item)).toBe('priorizacao');
    expect(ehPriorizado(classificaDemanda(item))).toBe(true);
    expect(itemEhNaoPriorizado(item)).toBe(false);
  });

  it('priorização + transbordo é bucket próprio, e segue priorizado', () => {
    const cat = classificaDemanda({ work_item_type: 'Product Backlog Item', tags: 'PRIORIZAÇÃO; TRANSBORDO' });
    expect(cat).toBe('priorizacao_transbordo');
    expect(ehPriorizado(cat)).toBe(true);
  });

  it('bug por TIPO ou por TAG, quando não há tag de precedência', () => {
    expect(classificaDemanda({ work_item_type: 'Bug', tags: 'FLEXX' })).toBe('bug');
    expect(classificaDemanda({ work_item_type: 'Product Backlog Item', tags: 'BUG; FLEXX' })).toBe('bug');
    expect(ehNaoPriorizado(classificaDemanda({ work_item_type: 'Bug', tags: '' }))).toBe(true);
  });

  it('sem tag relevante cai em priorização (default do SQL)', () => {
    expect(classificaDemanda({ work_item_type: 'Product Backlog Item', tags: 'FLEXX; MELHORIA' })).toBe('priorizacao');
    expect(classificaDemanda({ work_item_type: 'User Story', tags: null })).toBe('priorizacao');
  });

  it('regex é ancorada em SEGMENTO: substring não casa', () => {
    // "DEBUG" contém "bug" mas não é o segmento inteiro
    expect(classificaDemanda({ work_item_type: 'Product Backlog Item', tags: 'DEBUG' })).toBe('priorizacao');
    // "SEM RETORNO QA PENDENTE" não é o segmento "RETORNO QA"
    expect(classificaDemanda({ work_item_type: 'Product Backlog Item', tags: 'SEM RETORNO QA PENDENTE' })).toBe('priorizacao');
    // "AVIAOZINHO" não é avião (fronteira de palavra)
    expect(classificaDemanda({ work_item_type: 'Product Backlog Item', tags: 'AVIAOZINHO' })).toBe('priorizacao');
  });
});

describe('ehItemDeGestor', () => {
  it('aceita PBI/US/Bug e recusa Task e Test Case', () => {
    expect(ehItemDeGestor('Product Backlog Item')).toBe(true);
    expect(ehItemDeGestor('User Story')).toBe(true);
    expect(ehItemDeGestor('Bug')).toBe(true);
    expect(ehItemDeGestor('Task')).toBe(false);
    expect(ehItemDeGestor('Test Case')).toBe(false);
    expect(ehItemDeGestor(null)).toBe(false);
  });
});

describe('contaCategorias — reproduz o gerencial de S15-2026', () => {
  it('separa priorizado de não priorizado como a fotografia', () => {
    const itens = [
      ...Array.from({ length: 51 }, () => ({ work_item_type: 'Bug', tags: 'FLEXX' })),
      ...Array.from({ length: 17 }, () => ({ work_item_type: 'Bug', tags: 'RETORNO QA' })),
      ...Array.from({ length: 20 }, () => ({ work_item_type: 'Product Backlog Item', tags: 'AVIAO; FLEXX' })),
      ...Array.from({ length: 19 }, () => ({ work_item_type: 'Product Backlog Item', tags: 'PRIORIZACAO' })),
      // o item que a Visão Geral contava do lado errado
      { work_item_type: 'Bug', tags: 'PRIORIZACAO; FLEXX' },
    ];
    const c = contaCategorias(itens);
    expect(c.total).toBe(108);
    expect(c.bug).toBe(51);
    expect(c.retornoQa).toBe(17);
    expect(c.aviaoSprint).toBe(20);
    expect(c.naoPriorizado).toBe(88);
    expect(c.priorizado).toBe(20);
  });

  it('avião transbordado entra no não priorizado', () => {
    const c = contaCategorias([
      { work_item_type: 'Bug', tags: 'AVIAO; TRANSBORDO' },
      { work_item_type: 'Product Backlog Item', tags: 'PRIORIZACAO; TRANSBORDO' },
    ]);
    expect(c.aviaoTransbordado).toBe(1);
    expect(c.naoPriorizado).toBe(1);
    expect(c.priorizado).toBe(1);
    expect(c.priorizadoTransbordo).toBe(1);
  });
});

describe('rotuloCategoria', () => {
  it('cobre as seis categorias', () => {
    expect(rotuloCategoria('retorno_qa')).toBe('Retorno QA');
    expect(rotuloCategoria('aviao_sprint')).toBe('Avião');
    expect(rotuloCategoria('aviao_transbordado')).toBe('Avião Transbordado');
    expect(rotuloCategoria('bug')).toBe('Bug');
    expect(rotuloCategoria('priorizacao')).toBe('Priorizado');
    expect(rotuloCategoria('priorizacao_transbordo')).toBe('Priorizado (transbordo)');
  });
});
