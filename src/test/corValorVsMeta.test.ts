import { describe, expect, it } from 'vitest';
import { corValorVsMeta } from '@/lib/slaFormat';
import { HEALTH_COLORS } from '@/lib/chartColors';

/**
 * Cor do valor MENSAL contra a meta (21/08/2026).
 *
 * O contrato só publica `statusAnual` — a escada de três degraus é do gateway e
 * NÃO é replicada no front. Esta régua é binária e usa só o que o contrato
 * entrega: o alvo e a direção. Estes testes existem para que ninguém a
 * "melhore" transformando-a numa segunda escada, que divergiria do backend em
 * silêncio.
 */

const VERMELHO = HEALTH_COLORS.vermelho;

describe('corValorVsMeta — menor é melhor (TTR em dias)', () => {
  it('vermelho quando estoura a meta', () => {
    // caso real do print: Nestlé com TTR 5,49d e meta ≤ 3,90d
    expect(corValorVsMeta(5.49, 3.9, true)).toBe(VERMELHO);
  });

  it('cor normal quando atinge — verde aqui viraria semáforo na tela toda', () => {
    expect(corValorVsMeta(3.42, 3.9, true)).toBeUndefined();
  });

  it('exatamente na meta ATINGE (a régua do gateway é <=, não <)', () => {
    expect(corValorVsMeta(3.9, 3.9, true)).toBeUndefined();
  });
});

describe('corValorVsMeta — maior é melhor (% em 24h)', () => {
  it('vermelho quando fica abaixo do piso', () => {
    expect(corValorVsMeta(39.8, 55, false)).toBe(VERMELHO);
  });

  it('cor normal quando passa do piso', () => {
    expect(corValorVsMeta(90.7, 55, false)).toBeUndefined();
  });

  it('exatamente na meta ATINGE (>=)', () => {
    expect(corValorVsMeta(55, 55, false)).toBeUndefined();
  });
});

describe('corValorVsMeta — o que não se julga', () => {
  it('sem base não ganha cor (null nunca é zero)', () => {
    expect(corValorVsMeta(null, 3.9, true)).toBeUndefined();
    expect(corValorVsMeta(undefined, 3.9, true)).toBeUndefined();
  });

  it('sem meta definida não ganha cor — é o caso NEUTRO do contrato', () => {
    expect(corValorVsMeta(9.46, null, true)).toBeUndefined();
  });

  it('zero é valor legítimo e é julgado normalmente', () => {
    // 0 dia de TTR é real com DATEDIFF(DAY): atinge qualquer meta
    expect(corValorVsMeta(0, 3.9, true)).toBeUndefined();
    // e 0% em 24h estoura qualquer piso
    expect(corValorVsMeta(0, 48, false)).toBe(VERMELHO);
  });

  it('NÃO tem terceiro degrau: bem acima da meta é o mesmo vermelho de pouco acima', () => {
    // se alguém replicar a escada do gateway aqui, este teste quebra
    expect(corValorVsMeta(3.91, 3.9, true)).toBe(corValorVsMeta(99, 3.9, true));
  });
});
