import { describe, expect, it } from 'vitest';
import {
  agruparPorHierarquia,
  chavesRecolhiveis,
  filtrarAtividades,
  resumoRisco,
  type ItemDevops,
} from '@/lib/minhasAtividades';
import { diasUteisEntre, prazoSprint, textoPrazo } from '@/lib/prazoSprint';

// Calendário oficial 2026: S1 começa em 05/01. S22 = 26/10–06/11, S23 = 09/11–20/11.
const S22 = 'Flag.Planejamento\\S22-2026';
const S23 = 'Flag.Planejamento\\S23-2026';
const RAIZ = 'Flag.Planejamento';
const HOJE = '2026-11-16';

function wi(id: number, over: Partial<ItemDevops> = {}): ItemDevops {
  return {
    id,
    title: `Item ${id}`,
    state: 'To Do',
    work_item_type: 'Task',
    parent_id: null,
    iteration_path: S23,
    web_url: null,
    tags: null,
    ...over,
  };
}

describe('prazoSprint (calendário S{n}-{ano})', () => {
  const nivel = (hoje: string, over: Partial<ItemDevops> = {}) =>
    prazoSprint(wi(1, over), hoje).nivel;

  it('sprint de 2 semanas tem 10 dias úteis', () => {
    expect(diasUteisEntre('2026-11-09', '2026-11-20')).toBe(10);
    expect(prazoSprint(wi(1), '2026-11-10')).toMatchObject({
      sprint: 'S23-2026',
      inicio: '2026-11-09',
      fim: '2026-11-20',
      total: 10,
    });
  });
  it('ok, reta final nos 3 últimos dias úteis, último dia e vencida', () => {
    expect(nivel('2026-11-17')).toBe('ok'); // faltam 4
    expect(nivel('2026-11-18')).toBe('reta_final'); // faltam 3
    expect(nivel('2026-11-19')).toBe('reta_final'); // faltam 2
    expect(nivel('2026-11-20')).toBe('ultimo_dia');
    expect(nivel('2026-11-21')).toBe('vencida');
  });
  it('fechado não alerta; raiz é sem sprint; fora do padrão é desconhecida', () => {
    expect(nivel('2026-11-21', { state: 'Done' })).toBe('concluido');
    expect(nivel(HOJE, { iteration_path: RAIZ })).toBe('sem_sprint');
    expect(nivel(HOJE, { iteration_path: 'Flag.Planejamento\\Backlog' })).toBe('desconhecida');
  });
  it('vencida vira "transbordo" só quando o gestor pôs a tag', () => {
    const p = prazoSprint(wi(1, { iteration_path: S22 }), HOJE);
    expect(textoPrazo(p).rotulo).toBe('S22-2026 · vencida');
    expect(textoPrazo(p, 'BUG; TRANSBORDO').rotulo).toBe('S22-2026 · transbordo');
  });
});

// Epic 1 > Feature 10 > PBI 100 ; Epic 2 > Feature 20 > PBI 200
const epic1 = wi(1, { work_item_type: 'Epic', title: 'SQUADLAB', iteration_path: RAIZ });
const feat10 = wi(10, { work_item_type: 'Feature', title: 'Plataforma de BIs', parent_id: 1, iteration_path: RAIZ });
const pbi100 = wi(100, { work_item_type: 'Product Backlog Item', parent_id: 10 });
const epic2 = wi(2, { work_item_type: 'Epic', title: 'Infra', iteration_path: RAIZ });
const feat20 = wi(20, { work_item_type: 'Feature', title: 'Monitoramento', parent_id: 2, iteration_path: RAIZ });
const pbi200 = wi(200, { work_item_type: 'Product Backlog Item', parent_id: 20, iteration_path: S22 });

describe('agruparPorHierarquia', () => {
  it('monta Epic > Feature > PBI > Task com os ancestrais de contexto', () => {
    const itens = [wi(1001, { parent_id: 100 }), wi(1002, { parent_id: 100, state: 'In Progress' }), pbi100];
    const g = agruparPorHierarquia(itens, [epic1, feat10], HOJE);
    expect(g).toHaveLength(1);
    expect(g[0].epic?.title).toBe('SQUADLAB');
    expect(g[0].total).toBe(3);
    const f = g[0].features[0];
    expect(f.feature?.title).toBe('Plataforma de BIs');
    expect(f.pbis[0].pbi?.id).toBe(100);
    expect(f.pbis[0].pbiAtribuido).toBe(true);
    expect(f.pbis[0].tasks.map((t) => t.id)).toEqual([1002, 1001]);
  });

  it('a Epic com item vencido sobe, mesmo fora da ordem alfabética', () => {
    const itens = [wi(1001, { parent_id: 100 }), wi(2001, { parent_id: 200, iteration_path: S22 })];
    const g = agruparPorHierarquia(itens, [epic1, feat10, pbi100, epic2, feat20, pbi200], HOJE);
    expect(g.map((e) => e.epic?.title)).toEqual(['Infra', 'SQUADLAB']);
    expect(g[0].features[0].pbis[0].pbiAtribuido).toBe(false);
  });

  it('hierarquia incompleta cai em Sem Epic / Sem Feature / Sem PBI, no fim', () => {
    const solto = wi(5000);
    const pbiSemFeature = wi(300, { work_item_type: 'Product Backlog Item' });
    const g = agruparPorHierarquia([solto, pbiSemFeature, wi(1001, { parent_id: 100 })], [epic1, feat10, pbi100], HOJE);
    expect(g.map((e) => e.epic?.title ?? null)).toEqual(['SQUADLAB', null]);
    const semEpic = g[1].features[0];
    expect(semEpic.feature).toBeNull();
    expect(semEpic.pbis.map((p) => p.pbi?.id ?? null)).toEqual([300, null]);
  });

  it('PBI pendurado direto na Epic fica em "Sem Feature" dentro dela', () => {
    const pbi = wi(400, { work_item_type: 'Product Backlog Item', parent_id: 1 });
    const g = agruparPorHierarquia([pbi], [epic1], HOJE);
    expect(g[0].epic?.id).toBe(1);
    expect(g[0].features[0].feature).toBeNull();
  });

  it('chavesRecolhiveis lista Epics e Features', () => {
    const g = agruparPorHierarquia([pbi100], [epic1, feat10], HOJE);
    expect(chavesRecolhiveis(g)).toEqual(['1', '1/10']);
  });
});

describe('filtrarAtividades e resumoRisco', () => {
  it('bater no título da Epic traz os itens de baixo; #id é exato', () => {
    const itens = [wi(1001, { parent_id: 100 }), wi(9, { title: 'Outra coisa' })];
    const anc = [epic1, feat10, pbi100];
    expect(filtrarAtividades(itens, anc, 'squad').map((w) => w.id)).toEqual([1001]);
    expect(filtrarAtividades(itens, anc, '#9').map((w) => w.id)).toEqual([9]);
  });
  it('conta vencidas e fim de sprint', () => {
    const itens = [wi(1, { iteration_path: S22 }), wi(2), wi(3, { state: 'Done', iteration_path: S22 })];
    expect(resumoRisco(itens, '2026-11-19')).toEqual({ vencidas: 1, fimDeSprint: 1 });
  });
});
