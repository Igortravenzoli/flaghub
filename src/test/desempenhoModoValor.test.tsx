import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DesempenhoTrendChart } from '@/components/fabrica/DesempenhoTrendChart';
import { RankingFabricasCard } from '@/components/fabrica/RankingFabricasCard';

/**
 * Chave Percentual | Quantidade (24/11/2026): "LAB 33 de bug na S22" era 33% de
 * um escopo de 3 itens — 1 bug. Em quantidade a bolinha mostra o 1.
 */

// jsdom não mede o ResponsiveContainer: o gráfico ganha tamanho fixo para os pontos existirem.
vi.mock('recharts', async (original) => {
  const m = await original<typeof import('recharts')>();
  return {
    ...m,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <div className="recharts-responsive-container">{React.cloneElement(children, { width: 480, height: 220 })}</div>
    ),
  };
});

vi.mock('@/hooks/useWorkItemsByIds', () => ({ useWorkItemsByIds: () => ({ data: [], isLoading: false }) }));

const { FIXTURE } = vi.hoisted(() => {
  const ano = new Date().getFullYear();
  const esc = (total: number, done: number, bug: number, retorno = 0) => ({
    total,
    cats: { priorizacao: 0, priorizacao_transbordo: 0, bug, retorno_qa: retorno, aviao_sprint: 0, aviao_transbordado: 0 },
    entregue: { total: 0, bug: 0, retorno_qa: 0, priorizacao: 0, aviao: 0 },
    done: { total: done, bug: 0, retorno_qa: 0, priorizacao: 0, aviao: 0 },
    priorizado_done: 0,
    priorizado_em_dev: 0,
  });
  const foto = (n: number, org: Record<string, unknown>) => [`S${n}-${ano}`, {
    sprint_code: `S${n}-${ano}`, snapshot_source: 'fim_sprint_selado', as_of_datetime: null,
    category_breakdown: { geral: esc(40, 20, 5), fabricas: {}, fabricas_org: org },
  }];
  return {
    FIXTURE: Object.fromEntries([
      foto(21, { LAB: esc(6, 4, 1), IR: esc(14, 12, 1, 2) }),
      foto(22, { LAB: esc(3, 1, 1), IR: esc(5, 1, 0) }),
    ]),
  };
});

vi.mock('@/hooks/useSprintSnapshots', () => ({
  useSprintSnapshots: () => ({ data: FIXTURE, isLoading: false }),
}));

/** Números escritos dentro das bolinhas, na ordem do SVG. */
const numerosNasBolinhas = (c: HTMLElement) => [...c.querySelectorAll('g > circle + text')].map((t) => t.textContent);

afterEach(() => window.localStorage.clear());

describe('DesempenhoTrendChart — percentual × quantidade', () => {
  it('percentual: LAB S22 com 1 bug em 3 itens mostra 33', () => {
    const { container } = render(<DesempenhoTrendChart fabrica="LAB" />);
    // Entrega 67/33 · Retorno 0/0 · Bug 17/33 (S21/S22)
    expect(numerosNasBolinhas(container)).toEqual(['67', '33', '0', '0', '17', '33']);
  });

  it('quantidade: a mesma bolinha mostra 1 item', () => {
    const { container } = render(<DesempenhoTrendChart fabrica="LAB" modo="quantidade" />);
    // Entrega 4/1 · Retorno 0/0 · Bug 1/1
    expect(numerosNasBolinhas(container)).toEqual(['4', '1', '0', '0', '1', '1']);
    // Eixo em itens, até o maior escopo (6), sem "%".
    expect(container.querySelector('.recharts-yAxis')?.textContent).not.toContain('%');
  });
});

describe('Ranking da mesa — chave Percentual | Quantidade', () => {
  it('troca os números de todas as fábricas e lembra a escolha', () => {
    const { container } = render(<RankingFabricasCard maxSprints={6} />);
    expect(screen.getByText(/% DO ESCOPO/)).toBeTruthy();
    expect(numerosNasBolinhas(container)).toContain('33');

    fireEvent.click(screen.getByRole('radio', { name: 'Quantidade' }));
    expect(screen.getByText(/QUANTIDADE de itens/)).toBeTruthy();
    expect(numerosNasBolinhas(container)).not.toContain('33');
    expect(window.localStorage.getItem('fabrica.modoValor')).toBe('quantidade');
  });

  it('telão não tem a chave e fica em percentual', () => {
    window.localStorage.setItem('fabrica.modoValor', 'quantidade');
    render(<RankingFabricasCard columns={4} maxSprints={3} chartHeight="100%" />);
    expect(screen.queryByRole('radio', { name: 'Quantidade' })).toBeNull();
  });
});
