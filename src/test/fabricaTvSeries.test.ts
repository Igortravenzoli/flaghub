import { describe, expect, it } from 'vitest';
import type { SnapshotScopeBreakdown, SprintSnapshotRow } from '@/hooks/useSprintSnapshots';
import {
  agregaLivePorFabrica, categoriaDoItem, concluidoDoEscopo,
  matrizFabricaSprint, serieEntregaGeral,
} from '@/lib/fabricaTvSeries';
import { calcRitmoSprint, META_ENTREGA_PCT } from '@/lib/fabricaMetas';

const SQUADS = ['K8', 'FLEXX'];

function escopo(p: {
  total: number; done: number; entregue: number; bug?: number; retorno?: number;
}): SnapshotScopeBreakdown {
  const zero = { total: 0, bug: 0, retorno_qa: 0, priorizacao: 0, aviao: 0 };
  return {
    total: p.total,
    cats: {
      priorizacao: 0, priorizacao_transbordo: 0,
      bug: p.bug ?? 0, retorno_qa: p.retorno ?? 0,
      aviao_sprint: 0, aviao_transbordado: 0,
    },
    entregue: { ...zero, total: p.entregue },
    done: { ...zero, total: p.done },
    priorizado_done: 0,
    priorizado_em_dev: 0,
  };
}

function snap(code: string, geral: SnapshotScopeBreakdown, fabricas: Record<string, SnapshotScopeBreakdown> = {}): SprintSnapshotRow {
  return { sprint_code: code, snapshot_source: 'teste', as_of_datetime: null, category_breakdown: { geral, fabricas } };
}

const ANO = 2026;

describe('concluído = done + entregue', () => {
  it('soma os dois estados da fotografia', () => {
    expect(concluidoDoEscopo(escopo({ total: 50, done: 30, entregue: 8 }))).toBe(38);
  });

  it('a régua usa a soma, não só o done', () => {
    const snapshots = { 'S14-2026': snap('S14-2026', escopo({ total: 50, done: 30, entregue: 8, bug: 10, retorno: 5 })) };
    const [ponto] = serieEntregaGeral(snapshots, { ano: ANO, maxSprints: 3 });
    expect(ponto.concluido).toBe(38);
    expect(ponto.pct).toBe(76); // 38/50 — com só "done" seriam 60%
    expect(ponto.bugPct).toBe(20);
    expect(ponto.retornoPct).toBe(10);
    expect(ponto.emCurso).toBe(false);
  });

  it('mantém só as N sprints mais recentes, em ordem cronológica', () => {
    const snapshots = {
      'S11-2026': snap('S11-2026', escopo({ total: 10, done: 5, entregue: 0 })),
      'S12-2026': snap('S12-2026', escopo({ total: 10, done: 6, entregue: 0 })),
      'S13-2026': snap('S13-2026', escopo({ total: 10, done: 7, entregue: 0 })),
      'S14-2026': snap('S14-2026', escopo({ total: 10, done: 8, entregue: 0 })),
    };
    expect(serieEntregaGeral(snapshots, { ano: ANO, maxSprints: 3 }).map((p) => p.sprint))
      .toEqual(['S12', 'S13', 'S14']);
  });
});

describe('matrizFabricaSprint', () => {
  const snapshots = {
    'S13-2026': snap('S13-2026', escopo({ total: 20, done: 16, entregue: 2 }), {
      '[K8] - Squad': escopo({ total: 10, done: 8, entregue: 1 }),
      'FLEXX Squad': escopo({ total: 10, done: 8, entregue: 1 }),
      'Sem fábrica': escopo({ total: 4, done: 0, entregue: 0 }),
    }),
    'S14-2026': snap('S14-2026', escopo({ total: 20, done: 14, entregue: 4 }), {
      '[K8] - Squad': escopo({ total: 10, done: 9, entregue: 0, bug: 3 }),
      'FLEXX Squad': escopo({ total: 10, done: 5, entregue: 4, retorno: 2 }),
    }),
  };

  it('normaliza o rótulo da fábrica e ignora quem está fora do roster', () => {
    const m = matrizFabricaSprint(snapshots, { ano: ANO, maxSprints: 2, squads: SQUADS });
    expect(m.linhas.map((l) => l.fabrica).sort()).toEqual(['FLEXX', 'K8']);
    expect(m.sprints).toEqual(['S13', 'S14']);
  });

  it('ordena pelas entregas da sprint mais recente', () => {
    const m = matrizFabricaSprint(snapshots, { ano: ANO, maxSprints: 2, squads: SQUADS });
    // S14: K8 = 9 encerrados, FLEXX = 9 -> empate; K8 vem antes por estabilidade do sort
    expect(m.linhas[0].celulas['S14']?.pct).toBe(90);
    expect(m.linhas.find((l) => l.fabrica === 'FLEXX')?.celulas['S14']?.concluido).toBe(9);
  });

  it('acrescenta a coluna ao vivo e reordena por ela', () => {
    const m = matrizFabricaSprint(snapshots, {
      ano: ANO, maxSprints: 2, squads: SQUADS,
      live: { sprint: 'S15', porFabrica: { K8: { total: 10, concluido: 3, bug: 1, retorno: 0 }, FLEXX: { total: 10, concluido: 7, bug: 0, retorno: 1 } } },
    });
    expect(m.sprints).toEqual(['S13', 'S14', 'S15']);
    expect(m.linhas[0].fabrica).toBe('FLEXX'); // 7 > 3 na sprint em curso
    expect(m.linhas[0].celulas['S15']?.pct).toBe(70);
    expect(m.linhas[0].retornoPct).toBe(10);
  });

  it('marca célula vazia quando a fábrica não teve escopo na sprint', () => {
    const m = matrizFabricaSprint(snapshots, {
      ano: ANO, maxSprints: 2, squads: SQUADS,
      live: { sprint: 'S15', porFabrica: { K8: { total: 10, concluido: 3, bug: 0, retorno: 0 } } },
    });
    expect(m.linhas.find((l) => l.fabrica === 'FLEXX')?.celulas['S15']).toBeNull();
  });
});

describe('agregaLivePorFabrica', () => {
  const isConcluido = (s: string | null | undefined) => ['done', 'em teste'].includes((s ?? '').toLowerCase());
  const fabricaByItemId = { 1: '[K8] - Squad', 2: '[K8] - Squad', 3: 'FLEXX Squad', 4: 'DESIGN', 5: '[K8] - Squad' };

  it('agrupa pelo Épico raiz normalizado e conta done + entregue', () => {
    const out = agregaLivePorFabrica(
      [
        { id: 1, state: 'Done', work_item_type: 'Product Backlog Item' },
        { id: 2, state: 'Em Teste', work_item_type: 'Bug' },
        { id: 3, state: 'Em desenvolvimento', work_item_type: 'Product Backlog Item' },
        { id: 5, state: 'A Fazer', work_item_type: 'Product Backlog Item' },
      ],
      fabricaByItemId, SQUADS, isConcluido,
    );
    expect(out.K8).toEqual({ total: 3, concluido: 2, bug: 1, retorno: 0 });
    expect(out.FLEXX).toEqual({ total: 1, concluido: 0, bug: 0, retorno: 0 });
  });

  it('descarta Épico fora do roster (DESIGN/FLG/Sem fábrica) e item sem Épico', () => {
    const out = agregaLivePorFabrica(
      [
        { id: 4, state: 'Done', work_item_type: 'Product Backlog Item' },
        { id: 99, state: 'Done', work_item_type: 'Product Backlog Item' },
      ],
      fabricaByItemId, SQUADS, isConcluido,
    );
    expect(out).toEqual({});
  });
});

describe('categoriaDoItem', () => {
  it('retorno de QA vence bug (mesma precedência do fn_classifica_demanda)', () => {
    expect(categoriaDoItem({ work_item_type: 'Bug', tags: 'RETORNO QA; urgente' })).toBe('retorno_qa');
    expect(categoriaDoItem({ work_item_type: 'Bug', tags: null })).toBe('bug');
    expect(categoriaDoItem({ work_item_type: 'Product Backlog Item', tags: 'Avião' })).toBe('aviao');
    expect(categoriaDoItem({ work_item_type: 'Product Backlog Item', tags: 'priorizacao' })).toBe('outro');
  });

  /**
   * Regressão de 29/07/2026: esta função tinha a sua própria cópia da regra e
   * IGNORAVA a tag Priorização, então bug priorizado contava como bug aqui e
   * como priorizado na fotografia de sprint. Agora delega ao classificador
   * canônico (`@/lib/fabricaClassificacao`).
   */
  it('bug com tag Priorização NÃO é bug (é priorizado)', () => {
    expect(categoriaDoItem({ work_item_type: 'Bug', tags: 'PRIORIZACAO; FLEXX' })).toBe('outro');
    expect(categoriaDoItem({ work_item_type: 'Bug', tags: 'PRIORIZAÇÃO' })).toBe('outro');
  });

  it('avião composto legado conta como avião, e substring não conta', () => {
    expect(categoriaDoItem({ work_item_type: 'Bug', tags: 'AVIAO ANTIGO' })).toBe('aviao');
    expect(categoriaDoItem({ work_item_type: 'Bug', tags: 'AVIAO; TRANSBORDO' })).toBe('aviao');
    // "DEBUG" contém "bug" mas não é o segmento da tag
    expect(categoriaDoItem({ work_item_type: 'Product Backlog Item', tags: 'DEBUG' })).toBe('outro');
  });
});

describe('calcRitmoSprint', () => {
  // Sprint de 27/07 (seg) a 07/08 (sex) = 10 dias úteis.
  const from = new Date(2026, 6, 27);
  const to = new Date(2026, 7, 7);

  it('mede dias úteis decorridos e o ritmo necessário para a meta', () => {
    const r = calcRitmoSprint({ total: 68, encerrados: 42, from, to, hoje: new Date(2026, 7, 4) })!;
    expect(r.diasUteis).toBe(10);
    expect(r.diasDecorridos).toBe(7);
    expect(r.diasRestantes).toBe(3);
    expect(r.ritmoAtual).toBeCloseTo(6, 5);
    // alvo = ceil(68 * 88%) = 60 -> faltam 18 em 3 dias
    expect(r.ritmoNecessario).toBeCloseTo(6, 5);
    expect(r.esperadoPct).toBeCloseTo((7 / 10) * META_ENTREGA_PCT, 5);
  });

  it('antes do início não conta dia decorrido; depois do fim satura no total', () => {
    expect(calcRitmoSprint({ total: 10, encerrados: 0, from, to, hoje: new Date(2026, 6, 20) })!.diasDecorridos).toBe(0);
    expect(calcRitmoSprint({ total: 10, encerrados: 9, from, to, hoje: new Date(2026, 7, 20) })!.diasDecorridos).toBe(10);
  });

  it('devolve null quando o intervalo não tem dia útil', () => {
    const sabado = new Date(2026, 7, 1);
    const domingo = new Date(2026, 7, 2);
    expect(calcRitmoSprint({ total: 10, encerrados: 1, from: sabado, to: domingo })).toBeNull();
  });
});
