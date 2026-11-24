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
    // F3: um gráfico por GRUPO (Sustentação, Evolução, Híbrida), nada escondido.
    expect(container.querySelectorAll('.recharts-responsive-container')).toHaveLength(3);
    expect(screen.queryByTestId('ranking-ocultas')).toBeNull();
    // As fábricas do grupo aparecem embaixo, com o score de cada uma.
    const sust = screen.getByTestId('grupo-SUSTENTACAO').textContent ?? '';
    for (const f of ['GPS / GO', 'APP', 'PROMO / SUITE', 'ERP']) expect(sust).toContain(f);
    expect(screen.getByTestId('grupo-HIBRIDA').textContent).toContain('STAGING');
    // "Sem fábrica" nunca entra no pódio.
    expect(screen.queryByText('Sem fábrica')).toBeNull();
  });

  it('o grupo é a SOMA das fábricas, não a média dos scores', () => {
    render(<RankingFabricasCard columns={4} maxSprints={3} chartHeight="100%" />);
    // Evolução: ERP 1/4 + I & R 6/8 + LAB 2/7 = 9/19 encerrados → 47,4 (sem bug nem retorno no fixture).
    expect(screen.getByTestId('grupo-EVOLUCAO').textContent).toContain('score 47.4');
  });

  it('mesa: grupo › fábrica, as 8 fábricas e o "ERP" uma vez em cada grupo', () => {
    const { container } = render(<RankingFabricasCard />);
    expect(container.querySelectorAll('.recharts-responsive-container')).toHaveLength(8);
    expect(screen.queryByTestId('ranking-ocultas')).toBeNull();
    for (const g of ['SUSTENTACAO', 'EVOLUCAO', 'HIBRIDA']) expect(screen.getByTestId(`grupo-${g}`)).toBeTruthy();
    expect(screen.getByTestId('grupo-SUSTENTACAO').textContent).toContain('ERP');
    expect(screen.getByTestId('grupo-EVOLUCAO').textContent).toContain('ERP');
    expect(screen.getByTestId('grupo-SUSTENTACAO').textContent).toContain('4 fábricas');
  });

  it('mesa: cada grupo ocupa uma coluna por fábrica numa grade de 4, sem cartão sozinho a meia largura', () => {
    const { container } = render(<RankingFabricasCard />);
    const grade = screen.getByTestId('grupo-SUSTENTACAO').parentElement!;
    expect(grade.className).toContain('xl:grid-cols-4');
    // `dense`: o grupo de 1 fábrica entra no buraco ao lado do de 3.
    expect(grade.className).toContain('xl:grid-flow-row-dense');
    expect(screen.getByTestId('grupo-SUSTENTACAO').className).toContain('xl:col-span-4');
    expect(screen.getByTestId('grupo-EVOLUCAO').className).toContain('xl:col-span-3');
    expect(screen.getByTestId('grupo-HIBRIDA').className).toContain('xl:col-span-1');
    // Dentro do grupo, uma coluna por fábrica: as 3 da Evolução lado a lado.
    expect(screen.getByTestId('grupo-EVOLUCAO').querySelector('.xl\\:grid-cols-3')).toBeTruthy();
    expect(container.querySelectorAll('section[data-testid^="grupo-"]')).toHaveLength(3);
  });
});
