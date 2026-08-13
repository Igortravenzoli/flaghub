import { describe, expect, it } from 'vitest';

import {
  montarArvore,
  calcularKpis,
  resumirCobertura,
  serieDiaria,
  ranking,
  mesFechadoAnterior,
  SEM_CLIENTE,
  SEM_PRODUTO,
  type HoraNegocioRow,
} from '@/hooks/useHorasNegocio';

function linha(over: Partial<HoraNegocioRow> = {}): HoraNegocioRow {
  return {
    work_item_id: 900,
    log_date: '2026-07-01',
    colaborador: 'Colaborador A',
    minutos: 60,
    horas: 1,
    minutes_vdesk: 60,
    minutes_devops: 60,
    lancamentos_vdesk: 1,
    lancamentos_devops: 1,
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
    work_item_state: 'Done',
    iteration_path: 'Flag.Planejamento\\S16-2026',
    sprint_code: 'S16-2026',
    pbi_id: 100,
    pbi_title: 'PBI pai',
    pbi_type: 'Product Backlog Item',
    pbi_cliente: 'Nestle',
    pbi_produto: 'Portal Broker',
    pbi_cliente_origem: 'campo',
    pbi_produto_origem: 'campo',
    ...over,
  };
}

describe('montarArvore', () => {
  it('desce quatro níveis: dimensão, PBI, task e lançamento', () => {
    const arvore = montarArvore(
      [
        linha({ log_date: '2026-07-01', horas: 2 }),
        linha({ log_date: '2026-07-02', horas: 3 }),
      ],
      'cliente'
    );

    expect(arvore).toHaveLength(1);
    expect(arvore[0].horas).toBe(5);
    expect(arvore[0].pbis).toHaveLength(1);
    expect(arvore[0].pbis[0].tasks).toHaveLength(1);
    // Os dois dias entram como lançamentos separados sob a mesma task.
    expect(arvore[0].pbis[0].tasks[0].lancamentos).toHaveLength(2);
    expect(arvore[0].pbis[0].tasks[0].horas).toBe(5);
  });

  it('separa a mesma task por colaborador', () => {
    // Juntar numa linha só esconderia de quem é a hora, que é exatamente o que
    // o financeiro precisa ver.
    const arvore = montarArvore(
      [linha({ colaborador: 'A', horas: 2 }), linha({ colaborador: 'B', horas: 3 })],
      'cliente'
    );
    expect(arvore[0].pbis[0].tasks).toHaveLength(2);
  });

  it('esconde o work item quando a hora só existe no VDESK', () => {
    // Sem task no DevOps não há o que linkar: a tela mostra a origem VDESK.
    const arvore = montarArvore(
      [linha({ conciliacao: 'only_vdesk', minutes_devops: 0 })],
      'cliente'
    );
    expect(arvore[0].pbis[0].tasks[0].workItemId).toBeNull();
    expect(arvore[0].pbis[0].tasks[0].conciliacao).toBe('only_vdesk');
  });

  it('mantém a hora sem cliente na árvore em vez de descartá-la', () => {
    const arvore = montarArvore(
      [linha({ horas: 4 }), linha({ horas: 6, cliente: null, cliente_origem: null })],
      'cliente'
    );
    const sem = arvore.find((n) => n.chave === SEM_CLIENTE);
    expect(sem?.horas).toBe(6);
    expect(sem?.semClassificacao).toBe(true);
    expect(arvore.reduce((s, n) => s + n.horas, 0)).toBe(10);
  });

  it('usa a origem do produto quando a dimensão é produto', () => {
    const arvore = montarArvore(
      [linha({ horas: 3, cliente_origem: 'campo', produto_origem: 'tag' })],
      'produto'
    );
    expect(arvore[0].horasPorTag).toBe(3);
    expect(arvore[0].horasPorCampo).toBe(0);
  });

  it('agrupa produto ausente num balde próprio', () => {
    const arvore = montarArvore(
      [linha({ produto: null, produto_origem: null, horas: 2 })],
      'produto'
    );
    expect(arvore[0].chave).toBe(SEM_PRODUTO);
  });

  it('ordena por horas decrescentes em todos os níveis', () => {
    const arvore = montarArvore(
      [
        linha({ cliente: 'Pequeno', horas: 1, pbi_id: 1 }),
        linha({ cliente: 'Grande', horas: 9, pbi_id: 2 }),
        linha({ cliente: 'Grande', horas: 4, pbi_id: 3 }),
      ],
      'cliente'
    );
    expect(arvore.map((n) => n.chave)).toEqual(['Grande', 'Pequeno']);
    expect(arvore[0].pbis.map((p) => p.horas)).toEqual([9, 4]);
  });
});

describe('montarArvore com dimensão task', () => {
  it('achata: uma linha por work item, sem hierarquia de PBI', () => {
    const lista = montarArvore(
      [
        linha({ work_item_id: 1, horas: 3 }),
        linha({ work_item_id: 1, horas: 2, log_date: '2026-07-02' }),
        linha({ work_item_id: 2, horas: 1 }),
      ],
      'task'
    );
    expect(lista).toHaveLength(2);
    expect(lista[0].pbis).toEqual([]);
    expect(lista[0].horas).toBe(5);
    // Os dois dias da mesma task viram dois lançamentos sob uma linha só.
    expect(lista[0].task?.lancamentos).toHaveLength(2);
    expect(lista[1].horas).toBe(1);
  });

  it('soma as horas de todos os colaboradores da mesma task', () => {
    // Quem quiser separar por pessoa usa a chave Colaborador; aqui a pergunta
    // é quanto custou o item, não quem trabalhou nele.
    const lista = montarArvore(
      [
        linha({ work_item_id: 7, colaborador: 'A', horas: 2 }),
        linha({ work_item_id: 7, colaborador: 'B', horas: 3 }),
      ],
      'task'
    );
    expect(lista).toHaveLength(1);
    expect(lista[0].horas).toBe(5);
    expect(lista[0].task?.colaboradores).toEqual(['A', 'B']);
  });

  it('agrupa num balde próprio a hora sem work item', () => {
    const lista = montarArvore([linha({ work_item_id: null, horas: 4 })], 'task');
    expect(lista[0].semClassificacao).toBe(true);
    expect(lista[0].task?.workItemId).toBeNull();
  });
});

describe('calcularKpis', () => {
  it('conta PBI uma vez só, mesmo com várias tasks e lançamentos', () => {
    const kpis = calcularKpis([
      linha({ pbi_id: 100, work_item_id: 1 }),
      linha({ pbi_id: 100, work_item_id: 2 }),
      linha({ pbi_id: 101, work_item_id: 3 }),
    ]);
    expect(kpis.pbis).toBe(2);
    expect(kpis.tasks).toBe(3);
  });

  it('não conta como PBI o que não é PBI, User Story ou Bug', () => {
    const kpis = calcularKpis([linha({ pbi_id: 500, pbi_type: 'Feature' })]);
    expect(kpis.pbis).toBe(0);
  });

  it('mede a sincronização sobre os lançamentos do VDESK', () => {
    const kpis = calcularKpis([
      linha({ minutes_vdesk: 60, minutes_devops: 60, lancamentos_vdesk: 1 }),
      linha({ minutes_vdesk: 60, minutes_devops: 0, lancamentos_vdesk: 1, conciliacao: 'only_vdesk' }),
      // Hora que só existe no DevOps não entra no denominador: a pergunta é
      // quanto do VDESK chegou ao DevOps, não o contrário.
      linha({ minutes_vdesk: 0, minutes_devops: 120, lancamentos_vdesk: 0, conciliacao: 'only_devops' }),
    ]);
    expect(kpis.registosVdesk).toBe(2);
    expect(kpis.registosSincronizados).toBe(1);
    expect(kpis.pctSincronizado).toBe(50);
  });

  it('conta lançamentos, não linhas consolidadas', () => {
    // A view agrupa por (work item, dia, colaborador): uma linha pode carregar
    // dois lançamentos do VDESK. Contar linhas subestima o denominador e
    // inflaciona a taxa de sincronização.
    const kpis = calcularKpis([
      linha({ minutes_vdesk: 120, minutes_devops: 120, lancamentos_vdesk: 2 }),
      linha({ minutes_vdesk: 60, minutes_devops: 0, lancamentos_vdesk: 1, conciliacao: 'only_vdesk' }),
    ]);
    expect(kpis.registosVdesk).toBe(3);
    expect(kpis.registosSincronizados).toBe(2);
    expect(kpis.pctSincronizado).toBe(66.7);
  });

  it('classifica PBI como só por tag apenas quando nenhum campo foi preenchido', () => {
    const kpis = calcularKpis([
      linha({ pbi_id: 1, pbi_cliente_origem: 'tag', pbi_produto_origem: 'tag' }),
      linha({ pbi_id: 2, pbi_cliente_origem: 'campo', pbi_produto_origem: 'tag' }),
    ]);
    expect(kpis.pbisSoPorTag).toBe(1);
  });

  it('conta PBI sem cliente, sem produto e sem os dois', () => {
    const kpis = calcularKpis([
      linha({ pbi_id: 1, pbi_cliente: null }),
      linha({ pbi_id: 2, pbi_produto: null }),
      linha({ pbi_id: 3, pbi_cliente: null, pbi_produto: null }),
    ]);
    expect(kpis.pbisSemCliente).toBe(2);
    expect(kpis.pbisSemProduto).toBe(2);
    expect(kpis.pbisSemAmbos).toBe(1);
  });

  it('agrupa os quatro estados de conciliação', () => {
    const kpis = calcularKpis([
      linha({ conciliacao: 'match' }),
      linha({ conciliacao: 'only_vdesk' }),
      linha({ conciliacao: 'only_vdesk' }),
      linha({ conciliacao: 'only_devops' }),
    ]);
    expect(kpis.conciliacao).toEqual({ match: 1, divergent: 0, only_vdesk: 2, only_devops: 1 });
  });

  it('ignora lançamento de tempo zerado no denominador', () => {
    // Hora zero não tem o que sincronizar e o enfileiramento a bloqueia de
    // propósito. Contá-la trava o indicador abaixo de 100% para sempre, com
    // tudo conciliado — foi o que segurou julho/2026 em 98,3%.
    const kpis = calcularKpis([
      linha({ minutes_vdesk: 60, minutes_devops: 60, lancamentos_vdesk: 1 }),
      linha({ minutes_vdesk: 0, minutes_devops: 0, lancamentos_vdesk: 1, conciliacao: 'only_vdesk' }),
    ]);
    expect(kpis.registosVdesk).toBe(1);
    expect(kpis.pctSincronizado).toBe(100);
  });

  it('não divide por zero sem lançamento de VDESK', () => {
    const kpis = calcularKpis([
      linha({ minutes_vdesk: 0, minutes_devops: 60, lancamentos_vdesk: 0 }),
    ]);
    expect(kpis.pctSincronizado).toBe(0);
  });
});

describe('mesFechadoAnterior', () => {
  it('devolve o mês inteiro anterior ao corrente', () => {
    expect(mesFechadoAnterior(new Date(2026, 7, 13))).toEqual({
      dateFrom: '2026-07-01', dateTo: '2026-07-31',
    });
  });

  it('atravessa a virada de ano', () => {
    expect(mesFechadoAnterior(new Date(2026, 0, 5))).toEqual({
      dateFrom: '2025-12-01', dateTo: '2025-12-31',
    });
  });

  it('acerta o último dia de fevereiro em ano bissexto', () => {
    expect(mesFechadoAnterior(new Date(2028, 2, 10))).toEqual({
      dateFrom: '2028-02-01', dateTo: '2028-02-29',
    });
  });
});

describe('serieDiaria e ranking', () => {
  it('soma as horas por dia em ordem cronológica', () => {
    const serie = serieDiaria([
      linha({ log_date: '2026-07-02', horas: 3 }),
      linha({ log_date: '2026-07-01', horas: 2 }),
      linha({ log_date: '2026-07-01', horas: 1 }),
    ]);
    expect(serie).toEqual([
      { dia: '2026-07-01', horas: 3 },
      { dia: '2026-07-02', horas: 3 },
    ]);
  });

  it('corta o ranking no limite pedido, do maior para o menor', () => {
    const top = ranking(
      [
        linha({ cliente: 'A', horas: 1 }),
        linha({ cliente: 'B', horas: 5 }),
        linha({ cliente: 'C', horas: 3 }),
      ],
      'cliente',
      2
    );
    expect(top.map((t) => t.chave)).toEqual(['B', 'C']);
  });
});

describe('resumirCobertura', () => {
  it('mede a cobertura sobre horas, não sobre número de registos', () => {
    // Um registo grande sem cliente pesa mais que dois pequenos com cliente.
    // Contar linhas daria 67% de cobertura onde a verdade é 20%.
    const resumo = resumirCobertura([
      linha({ horas: 1 }),
      linha({ horas: 1 }),
      linha({ horas: 8, cliente: null, cliente_origem: null }),
    ]);
    expect(resumo.horasTotal).toBe(10);
    expect(resumo.pctCliente).toBe(20);
  });

  it('não divide por zero quando não há horas', () => {
    const resumo = resumirCobertura([]);
    expect(resumo.pctCliente).toBe(0);
    expect(resumo.pctProduto).toBe(0);
  });
});
