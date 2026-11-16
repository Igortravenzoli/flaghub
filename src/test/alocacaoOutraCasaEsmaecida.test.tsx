import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect } from 'vitest';

/**
 * Quem divide o tempo entre duas casas (15/11/2026).
 *
 * Ao abrir a pessoa no drill de uma fábrica, a lista traz TODOS os lançamentos
 * dela. Sem marcação, o trabalho da outra casa parecia somado à fábrica aberta
 * (e à capacidade dela). Agora ele fica esmaecido, como indicador de trabalho
 * cruzado, e o rodapé diz quanto conta ali.
 */

const dados = vi.hoisted(() => ({
  v_devops_time_logs_ativos: [
    { user_name: 'dev lab', work_item_id: 101, log_date: '2026-08-04', start_time: '09:00', time_minutes: 600, notes: null, ingested_at: '2026-08-04T20:00:00Z', etag: '1' },
    { user_name: 'dev lab', work_item_id: 202, log_date: '2026-08-05', start_time: '09:00', time_minutes: 300, notes: null, ingested_at: '2026-08-05T20:00:00Z', etag: '1' },
  ],
  devops_collaborator_map: [] as unknown[],
  devops_work_items: [
    { id: 101, title: 'Item da fábrica', work_item_type: 'Task', web_url: null },
    { id: 202, title: 'Item de infra', work_item_type: 'Task', web_url: null },
  ],
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (t: string) => {
    const res = Promise.resolve({ data: (dados as Record<string, unknown[]>)[t] ?? [], error: null });
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'gte', 'lte', 'eq']) b[m] = () => b;
    b.limit = () => res;
    b.in = () => res;
    b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => res.then(ok, ko);
    return b;
  };
  return { supabase: { from: (t: string) => builder(t) } };
});

vi.mock('@/hooks/useFabricaRoster', () => ({
  useFabricaRoster: () => ({
    data: [
      { colaborador: 'dev lab', squad: 'LAB', papel: 'dev', ativo: true, capacidade_h_dia: 7, conta_horas: true, alocacao_pct: 50 },
      { colaborador: 'dev lab', squad: 'INFRA', papel: 'dev', ativo: true, capacidade_h_dia: 7, conta_horas: true, alocacao_pct: 50 },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useColaboradorAusencias', () => ({
  useColaboradorAusencias: () => ({ data: [] }),
}));

import { AlocacaoLeadDevCard } from '@/components/fabrica/AlocacaoLeadDevCard';

// 10 h num Épico de squad (formato anterior) e 5 h no Épico de Infra.
const fabricaRows = [{ key: '[K8] - Squad', collaborators: [{ name: 'dev lab', minutes: 600 }], taskIds: [101] }];
const foraDasFabricas = [{ key: 'Outras', collaborators: [{ name: 'dev lab', minutes: 300 }], taskIds: [202] }];
// 03 a 14/08/2026 = 10 dias úteis → 35 h a 50% de 7 h.
const periodo = { dateFrom: new Date(2026, 7, 3), dateTo: new Date(2026, 7, 14) };

function montar(squad: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AlocacaoLeadDevCard fabricaRows={fabricaRows} foraDasFabricas={foraDasFabricas} {...periodo} squadEmbutida={squad} />
    </QueryClientProvider>,
  );
}

describe('drill de quem divide o tempo: a outra casa aparece esmaecida', () => {
  it('na linha, o trabalho da outra casa vira selo tracejado e não soma', () => {
    const { container } = montar('LAB');
    const linha = screen.getByText('dev lab').closest('button')!;
    expect(linha.textContent).toContain('10:00/35:00');
    const selo = container.querySelector('[data-fora-daqui="INFRA"]')!;
    expect(selo.textContent).toContain('5:00');
    expect(selo.className).toContain('border-dashed');
  });

  it('ao abrir, o lançamento da outra casa fica esmaecido e o rodapé diz quanto conta aqui', async () => {
    const { container } = montar('LAB');
    fireEvent.click(screen.getByText('dev lab').closest('button')!);
    await waitFor(() => expect(container.querySelector('[data-conta-aqui="nao"]')).not.toBeNull());

    const nao = container.querySelector('[data-conta-aqui="nao"]')!;
    expect(nao.textContent).toContain('#202');
    expect(nao.textContent).toContain('não conta aqui');
    expect(nao.className).toContain('opacity-50');
    expect(container.querySelector('[data-conta-aqui="sim"]')!.textContent).toContain('#101');

    const total = screen.getByTestId('conta-aqui-total').textContent ?? '';
    expect(total).toContain('10:00');
    expect(total).toContain('15:00');
  });

  it('na Infra é o contrário: o item da fábrica fica esmaecido', async () => {
    const { container } = montar('INFRA');
    const linha = screen.getByText('dev lab').closest('button')!;
    expect(linha.textContent).toContain('5:00/35:00');
    expect(container.querySelector('[data-fora-daqui="LAB"]')!.textContent).toContain('10:00');

    fireEvent.click(linha);
    await waitFor(() => expect(container.querySelector('[data-conta-aqui="nao"]')).not.toBeNull());
    expect(container.querySelector('[data-conta-aqui="nao"]')!.textContent).toContain('#101');
    expect(container.querySelector('[data-conta-aqui="sim"]')!.textContent).toContain('#202');
  });
});
