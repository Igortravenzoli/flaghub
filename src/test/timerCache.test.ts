import { describe, expect, it } from 'vitest';
import { CacheCurto } from '../../supabase/functions/timer-devops/cache';

describe('CacheCurto (minhas tarefas na edge)', () => {
  it('devolve dentro do prazo e esquece depois', () => {
    const c = new CacheCurto<string>(3 * 60_000);
    c.gravar('u1', 'lista', 1_000);
    expect(c.ler('u1', 1_000 + 2 * 60_000)?.valor).toBe('lista');
    expect(c.ler('u1', 1_000 + 3 * 60_000 + 1)).toBeNull();
    expect(c.tamanho).toBe(0);
  });

  it('cada pessoa tem a sua entrada; apagar limpa só a dela', () => {
    const c = new CacheCurto<string>(60_000);
    c.gravar('u1', 'a', 0);
    c.gravar('u2', 'b', 0);
    c.apagar('u1');
    expect(c.ler('u1', 10)).toBeNull();
    expect(c.ler('u2', 10)?.valor).toBe('b');
  });

  it('respeita o teto de itens, saindo o mais antigo', () => {
    const c = new CacheCurto<number>(60_000, 2);
    c.gravar('a', 1, 0);
    c.gravar('b', 2, 1);
    c.gravar('c', 3, 2);
    expect(c.ler('a', 3)).toBeNull();
    expect(c.ler('b', 3)?.valor).toBe(2);
    expect(c.ler('c', 3)?.valor).toBe(3);
  });

  it('regravar renova a posição e o relógio', () => {
    const c = new CacheCurto<number>(60_000, 2);
    c.gravar('a', 1, 0);
    c.gravar('b', 2, 1);
    c.gravar('a', 9, 2); // a volta a ser a mais nova
    c.gravar('c', 3, 3); // sai b
    expect(c.ler('b', 4)).toBeNull();
    expect(c.ler('a', 4)?.valor).toBe(9);
  });
});
