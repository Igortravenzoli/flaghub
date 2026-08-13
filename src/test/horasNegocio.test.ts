import { describe, expect, it } from 'vitest';

import {
  agregarPorDimensao,
  resumirCobertura,
  SEM_CLIENTE,
  SEM_PRODUTO,
  type HoraNegocioRow,
} from '@/hooks/useHorasNegocio';

function linha(over: Partial<HoraNegocioRow> = {}): HoraNegocioRow {
  return {
    work_item_id: 1,
    log_date: '2026-07-01',
    colaborador: 'Colaborador A',
    minutos: 60,
    horas: 1,
    minutes_vdesk: 60,
    minutes_devops: 60,
    conciliacao: 'match',
    cliente: 'Nestle',
    cliente_origem: 'campo',
    cliente_herdado: false,
    cliente_ambiguo: false,
    produto: 'Portal Broker',
    produto_origem: 'campo',
    produto_herdado: false,
    produto_ambiguo: false,
    work_item_type: 'Task',
    work_item_title: 'Tarefa',
    iteration_path: 'Flag.Planejamento\\S16-2026',
    sprint_code: 'S16-2026',
    ...over,
  };
}

describe('agregarPorDimensao', () => {
  it('separa as horas por origem da classificação', () => {
    const linhas = agregarPorDimensao(
      [
        linha({ horas: 2, cliente_origem: 'campo' }),
        linha({ horas: 3, cliente_origem: 'tag' }),
      ],
      'cliente'
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0].horas).toBe(5);
    expect(linhas[0].horasPorCampo).toBe(2);
    expect(linhas[0].horasPorTag).toBe(3);
  });

  it('mantém a hora sem cliente no relatório em vez de descartá-la', () => {
    // Hora não classificada sumindo do total é o modo de falha que este
    // relatório mais teme: o financeiro leria menos horas do que existem e não
    // teria como perceber.
    const linhas = agregarPorDimensao(
      [linha({ horas: 4 }), linha({ horas: 6, cliente: null, cliente_origem: null })],
      'cliente'
    );

    const semCliente = linhas.find(l => l.chave === SEM_CLIENTE);
    expect(semCliente?.horas).toBe(6);
    expect(semCliente?.semClassificacao).toBe(true);
    expect(linhas.reduce((s, l) => s + l.horas, 0)).toBe(10);
  });

  it('ordena por horas decrescentes', () => {
    const linhas = agregarPorDimensao(
      [
        linha({ cliente: 'Pequeno', horas: 1 }),
        linha({ cliente: 'Grande', horas: 9 }),
        linha({ cliente: 'Medio', horas: 5 }),
      ],
      'cliente'
    );
    expect(linhas.map(l => l.chave)).toEqual(['Grande', 'Medio', 'Pequeno']);
  });

  it('usa a origem do produto quando a dimensão é produto', () => {
    const linhas = agregarPorDimensao(
      [linha({ horas: 3, cliente_origem: 'campo', produto_origem: 'tag' })],
      'produto'
    );
    expect(linhas[0].horasPorTag).toBe(3);
    expect(linhas[0].horasPorCampo).toBe(0);
  });

  it('agrupa produto ausente num balde próprio', () => {
    const linhas = agregarPorDimensao(
      [linha({ produto: null, produto_origem: null, horas: 2 })],
      'produto'
    );
    expect(linhas[0].chave).toBe(SEM_PRODUTO);
    expect(linhas[0].semClassificacao).toBe(true);
  });
});

describe('resumirCobertura', () => {
  it('mede a cobertura sobre horas, não sobre número de registos', () => {
    // Um registo grande sem cliente pesa mais que dois pequenos com cliente.
    // Contar linhas em vez de horas daria 67% de cobertura onde a verdade é 20%.
    const resumo = resumirCobertura([
      linha({ horas: 1 }),
      linha({ horas: 1 }),
      linha({ horas: 8, cliente: null, cliente_origem: null }),
    ]);

    expect(resumo.horasTotal).toBe(10);
    expect(resumo.horasComCliente).toBe(2);
    expect(resumo.pctCliente).toBe(20);
  });

  it('conta clientes, produtos e colaboradores distintos', () => {
    const resumo = resumirCobertura([
      linha({ cliente: 'Nestle', produto: 'Portal Broker', colaborador: 'A' }),
      linha({ cliente: 'Heineken', produto: 'Portal Broker', colaborador: 'B' }),
      linha({ cliente: 'Nestle', produto: 'FlexX Sales', colaborador: 'A' }),
    ]);

    expect(resumo.clientes).toBe(2);
    expect(resumo.produtos).toBe(2);
    expect(resumo.colaboradores).toBe(2);
  });

  it('soma as horas com classificação ambígua por tag', () => {
    const resumo = resumirCobertura([
      linha({ horas: 3, cliente_ambiguo: true }),
      linha({ horas: 2, produto_ambiguo: true }),
      linha({ horas: 5 }),
    ]);
    expect(resumo.horasAmbiguas).toBe(5);
  });

  it('não divide por zero quando não há horas', () => {
    const resumo = resumirCobertura([]);
    expect(resumo.pctCliente).toBe(0);
    expect(resumo.pctProduto).toBe(0);
  });
});
