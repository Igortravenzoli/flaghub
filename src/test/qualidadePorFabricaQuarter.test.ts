import { describe, expect, it } from 'vitest';
import { montaColunasQualidade } from '@/components/fabrica/QualidadePorFabricaCharts';
import type { SnapshotScopeBreakdown, SprintSnapshotRow } from '@/hooks/useSprintSnapshots';

/**
 * Validação pedida pelo gestor (06/08/2026): os números da visão por QUARTER
 * estavam "muito baixos". Causa: o card somava só `done.total` como entrega,
 * enquanto toda a régua do gerencial usa encerrados = done + entregue.
 * Estes testes cravam a régua e as regras de data do quarter.
 *
 * Calendário 2026 (getOfficialSprintRange): S1 começa 05/01; cada sprint tem
 * 14 dias. S10 termina 22/05 (Q2) · S12 termina 19/06 (Q2) · S13 termina
 * 03/07 (Q3) · S14 termina 17/07 (Q3).
 */

function scope(p: { total: number; done: number; entregue: number; bug?: number; retorno?: number }): SnapshotScopeBreakdown {
  return {
    total: p.total,
    cats: {
      priorizacao: 0,
      priorizacao_transbordo: 0,
      bug: p.bug ?? 0,
      retorno_qa: p.retorno ?? 0,
      aviao_sprint: 0,
      aviao_transbordado: 0,
    },
    entregue: { total: p.entregue, bug: 0, retorno_qa: 0, priorizacao: 0, aviao: 0 },
    done: { total: p.done, bug: 0, retorno_qa: 0, priorizacao: 0, aviao: 0 },
    priorizado_done: 0,
    priorizado_em_dev: 0,
  };
}

function snap(code: string, fabricas: Record<string, SnapshotScopeBreakdown>): SprintSnapshotRow {
  return {
    sprint_code: code,
    snapshot_source: 'test',
    as_of_datetime: null,
    category_breakdown: { geral: scope({ total: 0, done: 0, entregue: 0 }), fabricas },
  };
}

const OPTS_Q = { groupBy: 'quarter' as const, maxSprints: 6, anoVigente: 2026 };

describe('montaColunasQualidade — régua de entregas (encerrados = done + entregue)', () => {
  it('conta done + entregue no numerador, não só done', () => {
    const snapshots = {
      'S10-2026': snap('S10-2026', { '[K8] - Squad': scope({ total: 10, done: 1, entregue: 4 }) }),
    };
    const { columns } = montaColunasQualidade(snapshots, OPTS_Q);
    expect(columns).toHaveLength(1);
    expect(columns[0].label).toBe('Q2');
    // Com a régua antiga (só done) daria 10% — o "muito baixo" do gestor.
    expect(columns[0].cells['K8'].entrega).toBe(50);
  });
});

describe('montaColunasQualidade — quarter pela data de TÉRMINO da sprint', () => {
  it('S12 (termina 19/06) cai no Q2; S13 (termina 03/07) cai no Q3', () => {
    const snapshots = {
      'S12-2026': snap('S12-2026', { '[K8] - Squad': scope({ total: 10, done: 5, entregue: 0 }) }),
      'S13-2026': snap('S13-2026', { '[K8] - Squad': scope({ total: 10, done: 5, entregue: 0 }) }),
    };
    const { columns } = montaColunasQualidade(snapshots, OPTS_Q);
    expect(columns.map((c) => c.label)).toEqual(['Q2', 'Q3']);
  });
});

describe('montaColunasQualidade — quarter soma ANTES de dividir (não é média)', () => {
  const snapshots = {
    'S13-2026': snap('S13-2026', { '[K8] - Squad': scope({ total: 10, done: 9, entregue: 0, bug: 2 }) }),
    'S14-2026': snap('S14-2026', { '[K8] - Squad': scope({ total: 30, done: 3, entregue: 0, bug: 4 }) }),
  };

  it('pondera pelo escopo: (9+3) ÷ (10+30) = 30% — média simples daria 55%', () => {
    const { columns } = montaColunasQualidade(snapshots, OPTS_Q);
    const q3 = columns.find((c) => c.label === 'Q3')!;
    expect(q3.cells['K8'].entrega).toBe(30);
    expect(q3.cells['K8'].bug).toBe(15); // (2+4) ÷ 40
  });

  it('detalhes traz a composição por sprint da barra (base do popup)', () => {
    const { detalhes } = montaColunasQualidade(snapshots, OPTS_Q);
    expect(detalhes['Q3::K8']).toEqual([
      { sprint: 'S13', escopo: 10, encerrados: 9, bug: 2, retorno: 0 },
      { sprint: 'S14', escopo: 30, encerrados: 3, bug: 4, retorno: 0 },
    ]);
  });
});

describe('montaColunasQualidade — janelas e filtros', () => {
  it('por sprint respeita maxSprints (últimas N); por quarter agrega o ano inteiro', () => {
    const snapshots = {
      'S10-2026': snap('S10-2026', { '[K8] - Squad': scope({ total: 10, done: 5, entregue: 0 }) }),
      'S13-2026': snap('S13-2026', { '[K8] - Squad': scope({ total: 10, done: 5, entregue: 0 }) }),
      'S14-2026': snap('S14-2026', { '[K8] - Squad': scope({ total: 10, done: 5, entregue: 0 }) }),
    };
    const porSprint = montaColunasQualidade(snapshots, { ...OPTS_Q, groupBy: 'sprint', maxSprints: 2 });
    expect(porSprint.columns.map((c) => c.label)).toEqual(['S13', 'S14']);

    const porQuarter = montaColunasQualidade(snapshots, OPTS_Q);
    expect(porQuarter.columns.map((c) => c.label)).toEqual(['Q2', 'Q3']);
  });

  it('ignora rótulos fora do roster de squads (Sem fábrica, DESIGN…)', () => {
    const snapshots = {
      'S13-2026': snap('S13-2026', {
        'Sem fábrica': scope({ total: 50, done: 0, entregue: 0 }),
        '[APP] - Squad': scope({ total: 10, done: 8, entregue: 1 }),
      }),
    };
    const { columns, fabricasOrdenadas } = montaColunasQualidade(snapshots, OPTS_Q);
    expect(fabricasOrdenadas).toEqual(['APP']);
    expect(columns[0].cells['Sem fábrica']).toBeUndefined();
    expect(columns[0].cells['APP'].entrega).toBe(90);
  });

  it('ignora sprints de outros anos', () => {
    const snapshots = {
      'S13-2025': snap('S13-2025', { '[K8] - Squad': scope({ total: 10, done: 5, entregue: 0 }) }),
      'S13-2026': snap('S13-2026', { '[K8] - Squad': scope({ total: 10, done: 5, entregue: 0 }) }),
    };
    const { columns } = montaColunasQualidade(snapshots, OPTS_Q);
    expect(columns.map((c) => c.label)).toEqual(['Q3']);
    expect(columns[0].cells['K8'].entrega).toBe(50);
  });
});
