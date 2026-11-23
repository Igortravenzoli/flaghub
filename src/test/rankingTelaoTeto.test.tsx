import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RankingFabricasCard } from '@/components/fabrica/RankingFabricasCard';

/**
 * F2 (23/11/2026): com a foto no organograma o ranking tem até 8 fábricas. No
 * telão, em duas linhas os mini-gráficos somem (harness 1320×742): a TV mostra
 * as `columns` primeiras e declara o resto. Na mesa aparecem todas.
 */
const { FIXTURE } = vi.hoisted(() => {
  const ano = new Date().getFullYear();
  const esc = (total: number, done: number) => ({
    total,
    cats: { priorizacao: 0, priorizacao_transbordo: 0, bug: 0, retorno_qa: 0, aviao_sprint: 0, aviao_transbordado: 0 },
    entregue: { total: 0, bug: 0, retorno_qa: 0, priorizacao: 0, aviao: 0 },
    done: { total: done, bug: 0, retorno_qa: 0, priorizacao: 0, aviao: 0 },
    priorizado_done: 0,
    priorizado_em_dev: 0,
  });
  const org = {
    GPS_GO: esc(6, 5), APP: esc(4, 3), PROMO_SUITE: esc(18, 9), ERP_SUST: esc(20, 8),
    ERP_EVOL: esc(4, 1), IR: esc(8, 6), LAB: esc(7, 2), STAGING: esc(21, 15), 'Sem fábrica': esc(10, 1),
  };
  const code = `S23-${ano}`;
  return {
    FIXTURE: {
      [code]: { sprint_code: code, snapshot_source: 'fim_sprint_selado', as_of_datetime: null, category_breakdown: { geral: esc(98, 50), fabricas: {}, fabricas_org: org } },
    },
  };
});

vi.mock('@/hooks/useSprintSnapshots', () => ({
  useSprintSnapshots: () => ({ data: FIXTURE, isLoading: false }),
}));

describe('RankingFabricasCard — organograma no telão', () => {
  it('telão: 4 mini-gráficos numa linha e "+4" declarado', () => {
    const { container } = render(<RankingFabricasCard columns={4} maxSprints={3} chartHeight="100%" />);
    expect(container.querySelectorAll('.recharts-responsive-container')).toHaveLength(4);
    expect(screen.getByTestId('ranking-ocultas').textContent).toContain('+4 fábricas fora do telão');
    // "Sem fábrica" nunca entra no pódio.
    expect(screen.queryByText('Sem fábrica')).toBeNull();
  });

  it('mesa: as 8 fábricas, com o nome do grupo onde o rótulo se repete', () => {
    const { container } = render(<RankingFabricasCard />);
    expect(container.querySelectorAll('.recharts-responsive-container')).toHaveLength(8);
    expect(screen.queryByTestId('ranking-ocultas')).toBeNull();
    expect(screen.getByText('ERP · Sustentação')).toBeTruthy();
    expect(screen.getByText('ERP · Evolução')).toBeTruthy();
  });
});
