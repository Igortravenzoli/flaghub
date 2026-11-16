import { describe, expect, it } from 'vitest';
import {
  desfechoDoPost,
  erroDoPreparo,
  itemAceitaHora,
  montarDocumento,
  TIMELOG_DOCS,
  validarPedidoLancar,
} from '../../supabase/functions/timer-devops/lancamento';
import {
  demandasEmEspera,
  dentroDaJanela,
  diaSP,
  gruposPendentes,
  lancadoHojeSeg,
  pendentesDoItem,
  situacao,
} from '@/lib/timerLancamento';
import type { Lancamento, TrechoFechado } from '@/lib/timerRelogio';

describe('validarPedidoLancar', () => {
  it('aceita grupos válidos e limpa notas', () => {
    const v = validarPedidoLancar({ grupos: [{ dia: '2026-11-16', work_item_id: 123, notas: '  revisão  ' }] });
    expect(v).toEqual({ ok: true, valor: [{ dia: '2026-11-16', workItemId: 123, notas: 'revisão' }] });
  });

  it('notas vazias viram null', () => {
    const v = validarPedidoLancar({ grupos: [{ dia: '2026-11-16', work_item_id: 1, notas: '   ' }] });
    expect(v.ok && v.valor[0].notas).toBeNull();
  });

  it('recusa o que não presta', () => {
    expect(validarPedidoLancar({})).toEqual({ ok: false, motivo: 'sem_grupos' });
    expect(validarPedidoLancar({ grupos: [] })).toEqual({ ok: false, motivo: 'sem_grupos' });
    expect(validarPedidoLancar({ grupos: [{ dia: '2026-02-30', work_item_id: 1 }] })).toEqual({ ok: false, motivo: 'dia_invalido' });
    expect(validarPedidoLancar({ grupos: [{ dia: '16/11/2026', work_item_id: 1 }] })).toEqual({ ok: false, motivo: 'dia_invalido' });
    expect(validarPedidoLancar({ grupos: [{ dia: '2026-11-16', work_item_id: -1 }] })).toEqual({ ok: false, motivo: 'item_invalido' });
    expect(validarPedidoLancar({ grupos: [{ dia: '2026-11-16', work_item_id: 1, notas: 'x'.repeat(501) }] })).toEqual({
      ok: false,
      motivo: 'notas_invalidas',
    });
    expect(
      validarPedidoLancar({ grupos: [{ dia: '2026-11-16', work_item_id: 1 }, { dia: '2026-11-16', work_item_id: 1 }] }),
    ).toEqual({ ok: false, motivo: 'grupo_repetido' });
    const muitos = Array.from({ length: 11 }, (_, i) => ({ dia: '2026-11-16', work_item_id: i + 1 }));
    expect(validarPedidoLancar({ grupos: muitos })).toEqual({ ok: false, motivo: 'grupos_demais' });
  });

  it('ignora minutos ou userId que venham no corpo: o servidor soma', () => {
    const v = validarPedidoLancar({ grupos: [{ dia: '2026-11-16', work_item_id: 5, minutos: 600, userId: 'x' }] });
    expect(v.ok && v.valor[0]).toEqual({ dia: '2026-11-16', workItemId: 5, notas: null });
  });
});

describe('itemAceitaHora', () => {
  const item = (over: Record<string, unknown>) =>
    ({ id: 9, title: 'x', state: 'Active', work_item_type: 'Task', parent_id: null, ...over }) as never;
  it('Task, PBI e Bug recebem hora; Epic e Feature não', () => {
    expect(itemAceitaHora(item({}))).toEqual({ ok: true });
    expect(itemAceitaHora(item({ work_item_type: 'Product Backlog Item' }))).toEqual({ ok: true });
    expect(itemAceitaHora(item({ work_item_type: 'Bug', state: 'Done' }))).toEqual({ ok: true });
    expect(itemAceitaHora(item({ work_item_type: 'Feature' })).ok).toBe(false);
  });
  it('removido ou inexistente não', () => {
    expect(itemAceitaHora(item({ state: 'Removed' })).ok).toBe(false);
    expect(itemAceitaHora(undefined).ok).toBe(false);
  });
});

describe('documento e desfecho', () => {
  it('monta o documento plano da TechsBCN com o id do lançamento', () => {
    const doc = montarDocumento(
      {
        id: 'a1b2', work_item_id: 77, dia: '2026-11-16', minutos: 45, inicio: '09:05',
        notas: null, devops_user_id: 'guid', devops_user_display: 'Pessoa',
      },
      'Título',
    );
    expect(doc).toEqual({
      id: 'a1b2', user: 'Pessoa', userId: 'guid', workItemId: 77, workItemName: 'Título',
      startTime: '09:05', date: '2026-11-16', time: 45, notes: 'Timer Flag',
    });
    expect(TIMELOG_DOCS).toContain('/TechsBCN/DevOps-TimeLog/');
    expect(TIMELOG_DOCS).toContain('/Collections/TimeLogData/Documents');
  });

  it('2xx e 409 = lançado; 4xx de recusa = cancela; resto = incerto', () => {
    expect(desfechoDoPost(200)).toBe('lancado');
    expect(desfechoDoPost(201)).toBe('lancado');
    expect(desfechoDoPost(409)).toBe('lancado');
    expect(desfechoDoPost(400)).toBe('cancelado');
    expect(desfechoDoPost(401)).toBe('cancelado');
    expect(desfechoDoPost(403)).toBe('cancelado');
    expect(desfechoDoPost(500)).toBe('erro');
    expect(desfechoDoPost(503)).toBe('erro');
    expect(desfechoDoPost(429)).toBe('erro');
    expect(desfechoDoPost(0)).toBe('erro');
  });

  it('erro do preparo vira mensagem, com o detalhe do teto', () => {
    expect(erroDoPreparo({ message: 'timer_nada_a_lancar' }).motivo).toBe('timer_nada_a_lancar');
    const t = erroDoPreparo({ message: 'timer_teto_dia_timelog', details: 'no TimeLog: 700 min' });
    expect(t.mensagem).toContain('12 h');
    expect(t.mensagem).toContain('700 min');
    expect(erroDoPreparo(null).motivo).toBe('erro_interno');
  });
});

const trecho = (over: Partial<TrechoFechado>): TrechoFechado => ({
  id: Math.random().toString(36),
  work_item_id: 1,
  titulo: 'Item 1',
  tipo: 'Task',
  projeto: null,
  iniciado_em: '2026-11-16T13:00:00.000Z',
  encerrado_em: '2026-11-16T13:30:00.000Z',
  encerrado_original_em: null,
  motivo_fim: 'manual',
  descartado: false,
  lancamento_id: null,
  ...over,
});

describe('gruposPendentes', () => {
  it('soma por item × dia, sem descartado nem já lançado, arredondando como o servidor', () => {
    const g = gruposPendentes([
      trecho({}),
      trecho({ iniciado_em: '2026-11-16T14:00:00.000Z', encerrado_em: '2026-11-16T14:15:29.000Z' }),
      trecho({ descartado: true }),
      trecho({ lancamento_id: 'x' }),
      trecho({ work_item_id: 2, titulo: 'Item 2', iniciado_em: '2026-11-16T15:00:00.000Z', encerrado_em: '2026-11-16T15:10:00.000Z' }),
    ]);
    expect(g.map((x) => [x.dia, x.work_item_id, x.minutos, x.trechos])).toEqual([
      ['2026-11-16', 1, 45, 2],
      ['2026-11-16', 2, 10, 1],
    ]);
  });

  it('o dia é o de São Paulo (23:30 de SP já é dia seguinte em UTC)', () => {
    const g = gruposPendentes([trecho({ iniciado_em: '2026-11-17T02:30:00.000Z', encerrado_em: '2026-11-17T02:50:00.000Z' })]);
    expect(g[0].dia).toBe('2026-11-16');
    expect(diaSP('2026-11-17T02:30:00.000Z')).toBe('2026-11-16');
  });

  it('menos de 1 minuto não vira grupo', () => {
    expect(gruposPendentes([trecho({ encerrado_em: '2026-11-16T13:00:29.000Z' })])).toEqual([]);
  });

  it('janela de 7 dias, sem futuro', () => {
    expect(dentroDaJanela('2026-11-16', '2026-11-16')).toBe(true);
    expect(dentroDaJanela('2026-11-09', '2026-11-16')).toBe(true);
    expect(dentroDaJanela('2026-11-08', '2026-11-16')).toBe(false);
    expect(dentroDaJanela('2026-11-17', '2026-11-16')).toBe(false);
  });
});

describe('demandasEmEspera', () => {
  const ts = [
    trecho({}), // item 1, 16/11, 30 min
    trecho({ iniciado_em: '2026-11-15T13:00:00.000Z', encerrado_em: '2026-11-15T13:20:00.000Z' }), // item 1, 15/11, 20 min
    trecho({ work_item_id: 2, titulo: 'Item 2', iniciado_em: '2026-11-16T16:00:00.000Z', encerrado_em: '2026-11-16T16:10:00.000Z' }),
    trecho({ work_item_id: 3, titulo: 'Item 3', lancamento_id: 'x' }),
    trecho({ work_item_id: 4, titulo: 'Antigo', iniciado_em: '2026-11-01T13:00:00.000Z', encerrado_em: '2026-11-01T14:00:00.000Z' }),
  ];

  const dem = (id: number, ativ: string) => ({
    id: `d${id}`, work_item_id: id, titulo: `Item ${id}`, tipo: 'Task', projeto: null,
    aberta_em: ativ, ultima_atividade_em: ativ,
  });
  const demandas = [dem(1, '2026-11-16T13:30:00Z'), dem(2, '2026-11-16T16:10:00Z'), dem(3, '2026-11-16T12:00:00Z')];

  it('são as demandas abertas, com o que falta lançar e o tempo de hoje', () => {
    const d = demandasEmEspera(demandas, ts, null, '2026-11-16');
    expect(d.map((x) => [x.work_item_id, x.minutos, x.grupos.length, Math.round(x.hojeSeg / 60)])).toEqual([
      [2, 10, 1, 10],
      [1, 50, 2, 30],
      [3, 0, 0, 30], // tudo lançado: segue em espera até encerrar
    ]);
  });

  it('o item que está rodando não fica em espera; item sem demanda não aparece', () => {
    expect(demandasEmEspera(demandas, ts, 1, '2026-11-16').map((x) => x.work_item_id)).toEqual([2, 3]);
    expect(demandasEmEspera([], ts, null, '2026-11-16')).toEqual([]);
  });

  it('pendentes de um item e lançado de hoje', () => {
    expect(pendentesDoItem(ts, 1, '2026-11-16').map((g) => g.minutos)).toEqual([30, 20]);
    expect(Math.round(lancadoHojeSeg(ts, '2026-11-16') / 60)).toBe(30);
  });
});

describe('situacao do lançamento', () => {
  const l = (over: Partial<Lancamento>): Lancamento => ({
    id: 'x', work_item_id: 1, titulo: 't', dia: '2026-11-16', inicio: '09:00', minutos: 45, notas: null,
    status: 'lancado', erro: null, tentativas: 1, enviado_em: null, criado_em: '', minutos_timelog: null,
    conferido: false, excluido_na_origem: false, ...over,
  });
  it('junta o envio com o que o sync trouxe', () => {
    expect(situacao(l({ status: 'enviando' }))).toBe('enviando');
    expect(situacao(l({ status: 'erro' }))).toBe('erro');
    expect(situacao(l({ status: 'cancelado' }))).toBe('cancelado');
    expect(situacao(l({}))).toBe('aguardando_conferencia');
    expect(situacao(l({ conferido: true, minutos_timelog: 45 }))).toBe('conferido');
    expect(situacao(l({ conferido: true, minutos_timelog: 30 }))).toBe('divergente');
    expect(situacao(l({ excluido_na_origem: true }))).toBe('excluido');
  });
});
