import { describe, it, expect } from 'vitest';
import type { HoraNegocioRow } from '@/hooks/useHorasNegocio';
import {
  montarRelatorio, renderizarRelatorioHtml, rotuloPeriodo, SEM_GRUPO,
  type EntradaRelatorio, type SnapshotRelatorio,
} from '@/lib/relatorioHoras';

/** Linha de `v_horas_negocio` já consolidada: `horas` é o maior entre as fontes. */
function linha(p: Partial<HoraNegocioRow> & { colaborador: string; log_date: string }): HoraNegocioRow {
  const md = p.minutes_devops ?? 0;
  const mv = p.minutes_vdesk ?? 0;
  return {
    work_item_id: 1, minutos: Math.max(md, mv), horas: Math.max(md, mv) / 60,
    minutes_vdesk: mv, minutes_devops: md,
    lancamentos_vdesk: mv ? 1 : 0, lancamentos_devops: md ? 1 : 0,
    conciliacao: 'only_devops',
    cliente: null, cliente_origem: null, cliente_herdado: null, cliente_ambiguo: null,
    produto: null, produto_origem: null, produto_herdado: null, produto_ambiguo: null,
    work_item_type: 'Task', work_item_title: 'Item', work_item_state: 'Done',
    iteration_path: null, sprint_code: null,
    pbi_id: null, pbi_title: null, pbi_type: null, pbi_cliente: null, pbi_produto: null,
    pbi_cliente_origem: null, pbi_produto_origem: null,
    ...p,
  };
}

const escopo = (total: number, bug = 0, aviao = 0, rqa = 0) => ({
  total,
  cats: { priorizacao: total - bug - aviao - rqa, priorizacao_transbordo: 0, bug, retorno_qa: rqa, aviao_sprint: aviao, aviao_transbordado: 0 },
  entregue: { total: 1, bug: 0, retorno_qa: 0, priorizacao: 1, aviao: 0 },
  done: { total: 2, bug: 0, retorno_qa: 0, priorizacao: 2, aviao: 0 },
  priorizado_done: 2, priorizado_em_dev: 0,
});

const foto = (code: string, ini: string, fim: string): SnapshotRelatorio => ({
  sprint_code: code, sprint_start_date: ini, sprint_end_date: fim,
  total_demands: 10, planned_demands: 4, unplanned_demands: 6, delivered_demands: 3, finalized_demands: 5,
  transbordo_count: 2, avg_lead_time_days: 12.5, qa_concluidos: 4, qa_concluidos_com_retorno: 1,
  qa_return_rate_pct: 25, qa_avg_return_cycles: 1,
  category_breakdown: {
    geral: escopo(10, 3, 2, 1),
    fabricas: { '[K8] - Squad': escopo(6, 2, 1, 0), 'Épico avulso': escopo(4, 1, 1, 1) },
  },
});

const base = (extra: Partial<EntradaRelatorio> = {}): EntradaRelatorio => ({
  dateFrom: '2026-10-01', dateTo: '2026-10-31',
  rows: [
    // Ana: mesma hora nas duas fontes — consolida em 8h, não em 15,5h.
    linha({ colaborador: 'Ana Souza', log_date: '2026-10-05', work_item_id: 10, minutes_devops: 450, minutes_vdesk: 480, produto: 'Flexx', cliente: 'Nestle' }),
    linha({ colaborador: 'Ana Souza', log_date: '2026-10-06', work_item_id: 10, minutes_devops: 240, produto: 'Flexx', cliente: 'Nestle' }),
    linha({ colaborador: 'Ana Souza', log_date: '2026-10-06', work_item_id: 11, minutes_devops: 120, produto: 'Portal' }),
    linha({ colaborador: 'Bruno Lima', log_date: '2026-10-07', work_item_id: 12, minutes_devops: 600, produto: 'Flexx', cliente: 'Nestle' }),
    linha({ colaborador: 'Visitante', log_date: '2026-10-08', work_item_id: 13, minutes_devops: 60 }),
  ],
  roster: [
    { colaborador: 'Ana Souza', squad: 'ERP_SUST', papel: 'lead' },
    { colaborador: 'Bruno Lima', squad: 'QUALIDADE', papel: 'dev' },
    { colaborador: 'Caio Reis', squad: 'GPS_GO', papel: 'dev' },
  ],
  ausencias: [{ colaborador: 'Bruno Lima', tipo: 'ferias', data_inicio: '2026-10-13', data_fim: '2026-10-18' }],
  snapshots: [foto('S21-2026', '2026-10-12', '2026-10-23'), foto('S10-2026', '2026-05-11', '2026-05-22')],
  extraidoEm: new Date(2026, 10, 9, 23, 16),
  ...extra,
});

describe('montarRelatorio', () => {
  it('usa a hora consolidada da view, sem somar VDESK e DevOps', () => {
    const m = montarRelatorio(base());
    const ana = m.pessoas.find((p) => p.nome === 'Ana Souza')!;
    expect(ana.devops).toBeCloseTo(13.5);
    expect(ana.vdesk).toBeCloseTo(8);
    expect(ana.horas).toBeCloseTo(14); // 8 + 4 + 2
    expect(ana.dias).toBe(2);
    expect(ana.itens.map((i) => i.id)).toEqual([10, 11]);
    expect(ana.itens[0].horas).toBeCloseTo(12);
    expect(m.total.horas).toBeCloseTo(25);
  });

  it('agrupa pelo roster, com fábrica antes de área e sem cadastro por último', () => {
    const m = montarRelatorio(base());
    expect(m.grupos).toEqual(['ERP_SUST', 'QUALIDADE', SEM_GRUPO]);
    expect(m.pessoas.find((p) => p.nome === 'Ana Souza')!.lead).toBe(true);
    expect(m.pessoas.find((p) => p.nome === 'Visitante')!.grupo).toBe(SEM_GRUPO);
    expect(m.semApontamento).toEqual([{ nome: 'Caio Reis', grupo: 'GPS / GO' }]);
  });

  it('resume por grupo › fábrica e rateia quem divide o tempo entre duas fábricas', () => {
    // Ana: 14 h, metade em ERP (Sustentação) e metade em ERP (Evolução).
    const m = montarRelatorio(base({
      roster: [
        { colaborador: 'Ana Souza', squad: 'ERP_SUST', papel: 'dev', alocacao_pct: 50 },
        { colaborador: 'Ana Souza', squad: 'ERP_EVOL', papel: 'dev', alocacao_pct: 50 },
        { colaborador: 'Bruno Lima', squad: 'IR', papel: 'lead' },
        { colaborador: 'Caio Reis', squad: 'GPS_GO', papel: 'dev', alocacao_pct: 50 },
        { colaborador: 'Caio Reis', squad: 'APP', papel: 'dev', alocacao_pct: 50 },
      ],
    }));
    const resumo = m.resumoGrupos.map((g) => [g.rotulo, Math.round(g.horas), g.pessoas, g.fabricas.map((x) => [x.codigo, Math.round(x.horas)])]);
    expect(resumo).toEqual([
      ['Sustentação', 7, 1, [['ERP_SUST', 7]]],
      ['Evolução', 17, 2, [['ERP_EVOL', 7], ['IR', 10]]],
      ['Sem cadastro', 1, 1, []],
    ]);
    // O rateio não cria nem some com hora: os grupos somam o total geral.
    expect(m.resumoGrupos.reduce((s, g) => s + g.horas, 0)).toBeCloseTo(m.total.horas);
    // A pessoa aparece UMA vez na lista, na fábrica principal, com as duas casas.
    const ana = m.pessoas.filter((p) => p.nome === 'Ana Souza');
    expect(ana).toHaveLength(1);
    expect(ana[0].casas.map((c) => [c.squad, c.peso])).toEqual([['ERP_SUST', 0.5], ['ERP_EVOL', 0.5]]);
    // Quem está em duas fábricas e não apontou é citado uma vez só.
    expect(m.semApontamento).toEqual([{ nome: 'Caio Reis', grupo: 'GPS / GO + APP' }]);

    const html = renderizarRelatorioHtml(m);
    expect(html).toContain('Resumo por fábrica');
    expect(html).toContain('ERP · Sustentação 50% + ERP · Evolução 50%');
  });

  it('conta férias em dias úteis e marca os dias corridos no calendário', () => {
    const m = montarRelatorio(base());
    const bruno = m.pessoas.find((p) => p.nome === 'Bruno Lima')!;
    expect(bruno.ferias).toBe(4); // 13 a 16/10; 17 e 18 são fim de semana
    expect(bruno.diasAusentes.size).toBe(6);
    expect(m.diasUteis).toBe(22);
  });

  it('soma por sistema e por cliente e mantém a linha sem classificação', () => {
    const m = montarRelatorio(base());
    expect(m.sistemas.map((s) => [s.chave, Math.round(s.horas)])).toEqual([['Flexx', 22], ['Portal', 2], ['Sem produto', 1]]);
    expect(m.sistemas[0].pessoas).toBe(2);
    const sem = m.clientes.find((c) => c.semClassificacao)!;
    expect(sem.chave).toBe('Sem cliente');
    expect(sem.horas).toBeCloseTo(3);
  });

  it('só leva as sprints que tocam o período', () => {
    expect(montarRelatorio(base()).sprints.map((s) => s.sprint_code)).toEqual(['S21-2026']);
  });
});

describe('renderizarRelatorioHtml', () => {
  it('gera uma seção por colaborador, sistemas, clientes e sprints', () => {
    const html = renderizarRelatorioHtml(montarRelatorio(base()));
    expect(html).toContain('Outubro de 2026');
    expect(html).toContain('09/11/2026 às 23:16');
    for (const t of ['Ana Souza', 'Bruno Lima', 'Horas por sistema', 'Horas por cliente', 'Sprints do período', 'S21-2026']) {
      expect(html).toContain(t);
    }
    // consolidado + 3 pessoas + 2 dimensões + sprints = 6 quebras de página
    expect(html.match(/class="pb"/g)).toHaveLength(6);
  });

  it('omite a página de sprints quando não há foto no período', () => {
    const html = renderizarRelatorioHtml(montarRelatorio(base({ snapshots: [] })));
    expect(html).not.toContain('Sprints do período');
  });

  it('escapa texto vindo do DevOps', () => {
    const rows = [linha({ colaborador: 'Ana <b>', log_date: '2026-10-05', minutes_devops: 60, work_item_title: '<script>x</script>' })];
    const html = renderizarRelatorioHtml(montarRelatorio(base({ rows, roster: [], ausencias: [] })));
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('rotuloPeriodo', () => {
  it('nomeia o mês cheio e escreve o intervalo nos demais casos', () => {
    expect(rotuloPeriodo('2026-10-01', '2026-10-31')).toBe('Outubro de 2026');
    expect(rotuloPeriodo('2026-10-01', '2026-10-15')).toBe('01/10/2026 a 15/10/2026');
  });
});
