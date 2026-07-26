import { describe, expect, it } from 'vitest';
import { horasHM, horasHMComSinal, horasHMdeDecimal } from '@/lib/formatHoras';

describe('horasHM', () => {
  it('escreve minutos como h:mm', () => {
    expect(horasHM(2082)).toBe('34:42');   // o "34.7h" que virou confusão na S14
    expect(horasHM(5062)).toBe('84:22');   // Kallel na conferência
    expect(horasHM(0)).toBe('0:00');
    expect(horasHM(7)).toBe('0:07');
    expect(horasHM(60)).toBe('1:00');
  });

  it('não abrevia acima de 100h', () => {
    expect(horasHM(6000)).toBe('100:00');
    expect(horasHM(19200)).toBe('320:00'); // capacidade da K8 no período
  });

  it('arredonda para o minuto mais próximo', () => {
    expect(horasHM(59.6)).toBe('1:00');
    expect(horasHM(59.4)).toBe('0:59');
  });

  it('mostra o sinal quando o saldo é negativo', () => {
    expect(horasHM(-750)).toBe('−12:30');
    expect(horasHM(-0.2)).toBe('0:00'); // −0 não vira "−0:00"
  });
});

describe('horasHMComSinal', () => {
  it('sempre traz o sinal — é delta de capacidade', () => {
    expect(horasHMComSinal(150)).toBe('+2:30');
    expect(horasHMComSinal(-150)).toBe('−2:30');
    expect(horasHMComSinal(0)).toBe('+0:00');
  });
});

describe('horasHMdeDecimal', () => {
  it('converte a hora decimal já arredondada da origem', () => {
    expect(horasHMdeDecimal(34.7)).toBe('34:42');
    expect(horasHMdeDecimal(6.5)).toBe('6:30');
    expect(horasHMdeDecimal(0)).toBe('0:00');
  });
});
