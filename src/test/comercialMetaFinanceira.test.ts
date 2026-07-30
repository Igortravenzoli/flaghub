import { describe, it, expect } from 'vitest';
import {
  metaFinanceiraPorMes,
  metaValorDoProduto,
  mesRefParaYm,
  type MetaLike,
} from '@/lib/comercialMetaFinanceira';

const meta = (over: Partial<MetaLike>): MetaLike => ({
  nome_indicador: 'FlexX Sales',
  tipo: 'produto',
  mes: 'jul-2026',
  valor: '',
  valor_unitario: '',
  ...over,
});

describe('comercialMetaFinanceira', () => {
  it('converte mes_referencia para YYYY-MM', () => {
    expect(mesRefParaYm('jul-2026')).toBe('2026-07');
    expect(mesRefParaYm('dez-2026')).toBe('2026-12');
    expect(mesRefParaYm('xxx-2026')).toBeNull();
  });

  it('meta do produto = qtd × unitário', () => {
    expect(metaValorDoProduto(meta({ valor: '400', valor_unitario: '40' }))).toBe(16000);
  });

  it('meta monetária direta tem precedência sobre qtd × unitário', () => {
    expect(
      metaValorDoProduto(meta({ valor: '400', valor_unitario: '40', meta_valor_total: '24,8k' }))
    ).toBe(24800);
  });

  it('meta do mês é a soma dos produtos quando não há faturamento cadastrado', () => {
    const mapa = metaFinanceiraPorMes([
      meta({ nome_indicador: 'FlexX Sales', valor: '400', valor_unitario: '40' }),
      meta({ nome_indicador: 'GO', valor: '80', valor_unitario: '25' }),
    ]);
    expect(mapa.get('2026-07')?.produtos).toBe(18000);
    expect(mapa.get('2026-07')?.efetiva).toBe(18000);
  });

  it('faturamento cadastrado sobrepõe a soma dos produtos (nunca somam)', () => {
    const mapa = metaFinanceiraPorMes([
      meta({ valor: '400', valor_unitario: '40' }),
      meta({ nome_indicador: 'Meta de Faturamento', tipo: 'faturamento', valor: '110000' }),
    ]);
    expect(mapa.get('2026-07')?.produtos).toBe(16000);
    expect(mapa.get('2026-07')?.cadastrada).toBe(110000);
    expect(mapa.get('2026-07')?.efetiva).toBe(110000);
  });

  it('mês sem meta nenhuma devolve 0 — nunca o antigo default de 110k', () => {
    const mapa = metaFinanceiraPorMes([meta({ valor: '', valor_unitario: '' })]);
    expect(mapa.get('2026-07')?.efetiva).toBe(0);
    expect(mapa.get('2026-08')).toBeUndefined();
  });

  it('separa meses distintos', () => {
    const mapa = metaFinanceiraPorMes([
      meta({ mes: 'jul-2026', valor: '10', valor_unitario: '100' }),
      meta({ mes: 'ago-2026', valor: '20', valor_unitario: '100' }),
    ]);
    expect(mapa.get('2026-07')?.efetiva).toBe(1000);
    expect(mapa.get('2026-08')?.efetiva).toBe(2000);
  });
});
