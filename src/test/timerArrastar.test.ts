import { describe, expect, it } from 'vitest';
import { ehArrastoDeAnotacao, escreverArrasto, lerArrasto, MIME_ANOTACAO, recebeTask } from '@/lib/timerArrastar';

function dataTransfer() {
  const dados = new Map<string, string>();
  return {
    effectAllowed: 'all' as DataTransfer['effectAllowed'],
    setData: (k: string, v: string) => void dados.set(k, v),
    getData: (k: string) => dados.get(k) ?? '',
    get types() {
      return [...dados.keys()];
    },
  };
}

describe('arrastar anotação até um PBI', () => {
  it('escreve e lê a anotação; texto puro vai junto', () => {
    const dt = dataTransfer();
    escreverArrasto(dt, { id: 'a1', texto: 'Validar deploy' });
    expect(ehArrastoDeAnotacao(dt)).toBe(true);
    expect(lerArrasto(dt)).toEqual({ id: 'a1', texto: 'Validar deploy' });
    expect(dt.getData('text/plain')).toBe('Validar deploy');
    expect(dt.effectAllowed).toBe('copy');
  });

  it('ignora o que não veio da coluna de anotações', () => {
    const dt = dataTransfer();
    dt.setData('text/plain', 'qualquer coisa');
    expect(ehArrastoDeAnotacao(dt)).toBe(false);
    expect(lerArrasto(dt)).toBeNull();
    expect(ehArrastoDeAnotacao(null)).toBe(false);
  });

  it('recusa dado malformado ou vazio', () => {
    const dt = dataTransfer();
    dt.setData(MIME_ANOTACAO, '{quebrado');
    expect(lerArrasto(dt)).toBeNull();
    dt.setData(MIME_ANOTACAO, JSON.stringify({ id: 'a1', texto: '   ' }));
    expect(lerArrasto(dt)).toBeNull();
    dt.setData(MIME_ANOTACAO, JSON.stringify({ id: 7, texto: 'x' }));
    expect(lerArrasto(dt)).toBeNull();
  });

  it('só PBI e Bug recebem Task', () => {
    expect(recebeTask('Product Backlog Item')).toBe(true);
    expect(recebeTask('Bug')).toBe(true);
    expect(recebeTask('Feature')).toBe(false);
    expect(recebeTask('Task')).toBe(false);
    expect(recebeTask(null)).toBe(false);
  });
});
