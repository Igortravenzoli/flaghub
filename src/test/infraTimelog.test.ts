import {
  aggregateInfraTimelog,
  buildDailySeries,
  collaboratorMatchesInclude,
  INFRA_TIMELOG_DEFAULT_COLLABS,
  InfraTimelogRow,
  InfraTimelogDailyRow,
} from '@/hooks/useInfraTimelog';

// Regras do timelog da Infra: reuso do pipeline da fábrica com include-list
// de colaboradores — por padrão somente Igor e Rodolfo aparecem.

const include = new Set<string>(INFRA_TIMELOG_DEFAULT_COLLABS);

describe('collaboratorMatchesInclude', () => {
  it('aceita variações de nome com acento e sobrenome', () => {
    expect(collaboratorMatchesInclude('Igor Cardoso', include)).toBe(true);
    expect(collaboratorMatchesInclude('ÍGOR C.', include)).toBe(true);
    expect(collaboratorMatchesInclude('Rodolfo Almeida Souza', include)).toBe(true);
    expect(collaboratorMatchesInclude('rodolfo', include)).toBe(true);
  });

  it('rejeita quem não está na include-list', () => {
    expect(collaboratorMatchesInclude('Bruna Lima', include)).toBe(false);
    expect(collaboratorMatchesInclude('Henrique', include)).toBe(false);
    expect(collaboratorMatchesInclude(null, include)).toBe(false);
  });

  it('include vazia não mostra ninguém', () => {
    expect(collaboratorMatchesInclude('Igor Cardoso', new Set())).toBe(false);
  });
});

describe('aggregateInfraTimelog', () => {
  const rows: InfraTimelogRow[] = [
    { work_item_id: 101, user_name: 'Igor Cardoso', total_minutes: 120, max_log_date: '2026-06-10' },
    { work_item_id: 101, user_name: 'Rodolfo Almeida', total_minutes: 60, max_log_date: '2026-06-09' },
    { work_item_id: 202, user_name: 'Igor Cardoso', total_minutes: 90, max_log_date: '2026-06-11' },
    { work_item_id: 202, user_name: 'Bruna Lima', total_minutes: 240, max_log_date: '2026-06-08' },
  ];
  const titles = new Map<number, string | null>([
    [101, 'Hardening AD'],
    [202, 'DR Site'],
  ]);

  it('agrega horas apenas dos colaboradores marcados', () => {
    const agg = aggregateInfraTimelog(rows, include, titles);

    expect(agg.totalMinutes).toBe(270); // Bruna (240) fora
    expect(agg.totalHoras).toBe(4.5);
    expect(agg.apontamentos).toBe(3);
    expect(agg.itensComApontamento).toBe(2);
    expect(agg.colaboradoresAtivos).toEqual(['Igor Cardoso', 'Rodolfo Almeida']);

    expect(agg.porColaborador[0]).toMatchObject({ name: 'Igor Cardoso', hours: 3.5 });
    expect(agg.porColaborador[1]).toMatchObject({ name: 'Rodolfo Almeida', hours: 1 });

    expect(agg.porItem[0]).toMatchObject({ workItemId: 101, name: '#101 Hardening AD', hours: 3 });
    expect(agg.porItem[1]).toMatchObject({ workItemId: 202, hours: 1.5 });

    // detalhe ordenado do apontamento mais recente para o mais antigo
    expect(agg.detalhe[0].max_log_date).toBe('2026-06-11');
  });

  it('desmarcar um colaborador remove só as horas dele', () => {
    const soIgor = new Set(['igor']);
    const agg = aggregateInfraTimelog(rows, soIgor, titles);
    expect(agg.totalMinutes).toBe(210);
    expect(agg.colaboradoresAtivos).toEqual(['Igor Cardoso']);
  });
});

describe('buildDailySeries (capacidade 7h/dia)', () => {
  const daily: InfraTimelogDailyRow[] = [
    // Seg 08/06: Igor 9h (2h extra), Rodolfo 0h
    { work_item_id: 1, user_name: 'Igor Cardoso', log_date: '2026-06-08', time_minutes: 540 },
    // Ter 09/06: Igor 4h em 2 tasks
    { work_item_id: 1, user_name: 'Igor Cardoso', log_date: '2026-06-09', time_minutes: 120 },
    { work_item_id: 2, user_name: 'Igor Cardoso', log_date: '2026-06-09', time_minutes: 120 },
    // Bruna não está na include-list
    { work_item_id: 3, user_name: 'Bruna Lima', log_date: '2026-06-09', time_minutes: 480 },
  ];
  const include = new Set<string>(INFRA_TIMELOG_DEFAULT_COLLABS);

  it('divide horas em base/extra/silhueta e conta tasks por dia útil', () => {
    const serie = buildDailySeries(daily, include, new Date('2026-06-08T00:00:00'), new Date('2026-06-10T00:00:00'));

    expect(serie.map(p => p.date)).toEqual(['2026-06-08', '2026-06-09', '2026-06-10']);

    const seg = serie[0];
    expect(seg.igor_base).toBe(7);     // capacidade cheia
    expect(seg.igor_extra).toBe(2);    // trabalho extra
    expect(seg.igor_rest).toBe(0);
    expect(seg.rodolfo_base).toBe(0);
    expect(seg.rodolfo_rest).toBe(7);  // silhueta vazia (sem horas)
    expect(seg.tasks).toBe(1);

    const ter = serie[1];
    expect(ter.igor_base).toBe(4);
    expect(ter.igor_rest).toBe(3);
    expect(ter.tasks).toBe(2);

    const qua = serie[2]; // dia sem apontamento: só silhuetas
    expect(qua.igor_rest).toBe(7);
    expect(qua.tasks).toBe(0);
  });

  it('fim de semana fica fora do eixo', () => {
    const serie = buildDailySeries(daily, include, new Date('2026-06-06T00:00:00'), new Date('2026-06-08T00:00:00'));
    // 06/06 = sábado, 07/06 = domingo → só segunda 08/06
    expect(serie.map(p => p.date)).toEqual(['2026-06-08']);
  });
});
