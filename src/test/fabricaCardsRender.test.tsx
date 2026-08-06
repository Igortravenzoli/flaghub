import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QualidadePorFabricaCharts } from '@/components/fabrica/QualidadePorFabricaCharts';
import { RankingFabricasCard } from '@/components/fabrica/RankingFabricasCard';

/**
 * Ajustes de 06/08/2026:
 *  - "Qualidade das Fábricas" abre em QUARTER no painel (pedido do gestor) e
 *    continua por sprint no TV (fill), onde ninguém clica no toggle;
 *  - "Desempenho por Fábrica — ranking" virou grade de gráficos de LINHA
 *    (mesma leitura do "Desempenho · evolução por sprint", uma por fábrica).
 */

const { FIXTURE } = vi.hoisted(() => {
  const ano = new Date().getFullYear();
  const scope = (p: { total: number; done: number; entregue: number; bug?: number; retorno?: number }) => ({
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
  });
  const snap = (code: string, fabricas: Record<string, unknown>) => ({
    sprint_code: code,
    snapshot_source: 'test',
    as_of_datetime: null,
    category_breakdown: { geral: scope({ total: 0, done: 0, entregue: 0 }), fabricas },
  });
  const FIXTURE = {
    [`S13-${ano}`]: snap(`S13-${ano}`, {
      '[K8] - Squad': scope({ total: 10, done: 8, entregue: 1, bug: 1 }),
      '[APP] - Squad': scope({ total: 12, done: 5, entregue: 2, bug: 2 }),
    }),
    [`S14-${ano}`]: snap(`S14-${ano}`, {
      '[K8] - Squad': scope({ total: 8, done: 4, entregue: 2, bug: 1 }),
      '[APP] - Squad': scope({ total: 10, done: 6, entregue: 1, bug: 3 }),
    }),
  };
  return { FIXTURE };
});

vi.mock('@/hooks/useSprintSnapshots', () => ({
  useSprintSnapshots: () => ({ data: FIXTURE, isLoading: false }),
}));

describe('QualidadePorFabricaCharts — visão default', () => {
  it('painel abre em QUARTER e alterna para sprint no toggle', () => {
    render(<QualidadePorFabricaCharts />);
    expect(screen.getByText(/Qualidade das Fábricas — por quarter/)).toBeTruthy();
    expect(screen.getByText(/Clique numa barra para ver a composição/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sprint' }));
    expect(screen.getByText(/Qualidade das Fábricas — por sprint/)).toBeTruthy();
  });

  it('no TV (fill) permanece por sprint, sem toggle', () => {
    render(<QualidadePorFabricaCharts fill />);
    expect(screen.getByText(/Qualidade das Fábricas — por sprint/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Quarter' })).toBeNull();
  });
});

describe('RankingFabricasCard — grade de gráficos de linha por fábrica', () => {
  it('renderiza um gráfico de linhas (evolução) para cada fábrica, com medalha e score', () => {
    const { container } = render(<RankingFabricasCard />);
    expect(screen.getByText('K8')).toBeTruthy();
    expect(screen.getByText('APP')).toBeTruthy();
    // Um LineChart (ResponsiveContainer) por fábrica do fixture.
    expect(container.querySelectorAll('.recharts-responsive-container')).toHaveLength(2);
    // Medalhas do pódio (1º e 2º) seguem no cabeçalho de cada mini-card.
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText(/Linhas por sprint de cada fábrica/)).toBeTruthy();
  });
});
