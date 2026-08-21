import { describe, expect, it } from 'vitest';
import { corValorVsMeta } from '@/lib/slaFormat';
import { HEALTH_COLORS } from '@/lib/chartColors';

/**
 * Régua de cor de um valor contra a meta — QUATRO estados (21/08/2026):
 * sem meta = sem cor · fora = vermelho · dentro = verde · muito além = azul.
 *
 * Não é o semáforo do contrato: a escada de três degraus do gateway (meta,
 * meta×1,5, meta×0,85) continua sem réplica no front e é ela que pinta o valor
 * ANUAL. Esta régua vale para os valores mensais, que o contrato não julga —
 * e estes testes existem para que ninguém as confunda.
 */

const { vermelho, verde, azul } = HEALTH_COLORS;

describe('menor é melhor (TTR em dias, meta ≤ 10d)', () => {
  const cor = (v: number | null) => corValorVsMeta(v, 10, true);

  it('acima da meta → vermelho', () => {
    expect(cor(10.01)).toBe(vermelho);
    expect(cor(99)).toBe(vermelho);
  });

  it('dentro da meta → verde', () => {
    expect(cor(9.46)).toBe(verde);   // caso real: Heineken, quase no teto
    expect(cor(7.01)).toBe(verde);
  });

  it('30% ou mais abaixo da meta → azul (superação)', () => {
    expect(cor(7)).toBe(azul);       // limite exato do fator
    expect(cor(2.58)).toBe(azul);    // caso real: Heineken no mês
  });

  it('na meta exata ainda ATINGE — a régua do gateway é <=, não <', () => {
    expect(cor(10)).toBe(verde);
  });
});

describe('maior é melhor (% em 24h, piso ≥ 55%)', () => {
  const cor = (v: number | null) => corValorVsMeta(v, 55, false);

  it('abaixo do piso → vermelho', () => {
    expect(cor(54.99)).toBe(vermelho);
    expect(cor(39.8)).toBe(vermelho);
  });

  it('acima do piso → verde', () => {
    expect(cor(60)).toBe(verde);
    expect(cor(71.49)).toBe(verde);
  });

  it('30% ou mais acima do piso → azul', () => {
    expect(cor(71.5)).toBe(azul);    // 55 × 1,3
    expect(cor(90.7)).toBe(azul);    // caso real: Heineken no mês
  });

  it('no piso exato ATINGE (>=)', () => {
    expect(cor(55)).toBe(verde);
  });
});

describe('o que não se julga', () => {
  it('sem base fica sem cor — null nunca é zero', () => {
    expect(corValorVsMeta(null, 3.9, true)).toBeUndefined();
    expect(corValorVsMeta(undefined, 3.9, true)).toBeUndefined();
  });

  it('sem meta definida fica sem cor (branco) — é o caso NEUTRO do contrato', () => {
    expect(corValorVsMeta(9.46, null, true)).toBeUndefined();
    expect(corValorVsMeta(78.4, undefined, false)).toBeUndefined();
  });

  it('zero é valor legítimo e é julgado', () => {
    // 0 dia de TTR é real com DATEDIFF(DAY) — e é superação de qualquer meta
    expect(corValorVsMeta(0, 3.9, true)).toBe(azul);
    // 0% em 24h fura qualquer piso
    expect(corValorVsMeta(0, 48, false)).toBe(vermelho);
  });
});

describe('não é a escada do gateway', () => {
  it('do lado ruim há UM degrau só: pouco acima e muito acima são o mesmo vermelho', () => {
    // se alguém replicar aqui o meta×1,5 do gateway, este teste quebra
    expect(corValorVsMeta(3.91, 3.9, true)).toBe(corValorVsMeta(99, 3.9, true));
  });

  it('o azul é do lado BOM — nunca aparece com o valor fora da meta', () => {
    for (const v of [3.91, 10, 99]) {
      expect(corValorVsMeta(v, 3.9, true), String(v)).toBe(vermelho);
    }
  });
});
