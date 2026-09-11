import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type { SgsiRawItem } from '@/lib/sgsiFields';

// O hook de verdade, com o Supabase trocado: garante que sprint e calendário montam
// Acessos de jeitos diferentes a partir de UM download do espelho.
const mockFetchAllRows = vi.fn();
vi.mock('@/lib/fetchAllRows', () => ({
  fetchAllRows: (...args: unknown[]) => mockFetchAllRows(...args),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => ({ limit: async () => ({ data: [{ synced_at: '2026-06-11T11:00:00Z' }] }) }) }),
    }),
  },
}));

import { useBIInfraSgsi } from '@/hooks/useBIInfra';

const item = (listKey: string, id: number, fields: Record<string, unknown>, created: string): SgsiRawItem =>
  ({ list_key: listKey, item_id: id, fields, created_sp: created, modified_sp: created });

const ROWS: SgsiRawItem[] = [
  // definitivo revogado com evidência em 20/05: fora de junho no calendário
  item('014', 1, { 'Tipo liberação': 'Definitiva', 'Status solicitação': 'Revogado', '<---Preenchimento TI--->': true, 'Data ultima revisão': '2026-05-20T15:00:00Z' }, '2025-01-10T12:00:00Z'),
  // provisório vencido sem evidência: vigente em qualquer período depois do pedido
  item('014', 2, { 'Tipo liberação': 'Provisória', 'Status solicitação': 'Realizado', 'Data fim liberação provisória': '2026-03-01T00:00:00Z' }, '2026-02-01T12:00:00Z'),
  // mudanças: os outros blocos seguem o período por criação/modificação
  item('010', 10, { Status: 'Realizado' }, '2026-06-05T12:00:00Z'),
  item('010', 11, { Status: 'Realizado' }, '2026-03-05T12:00:00Z'),
];

const JUNHO = { from: new Date(2026, 5, 1), to: new Date(2026, 5, 10) };
const MAIO = { from: new Date(2026, 4, 1), to: new Date(2026, 4, 31) };

function novoWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
const ids = (d: { acessos: { itens: { id: number }[] } } | undefined) => d?.acessos.itens.map((i) => i.id).sort();

describe('useBIInfraSgsi', () => {
  beforeEach(() => {
    mockFetchAllRows.mockReset();
    mockFetchAllRows.mockImplementation(async () => JSON.parse(JSON.stringify(ROWS)));
  });

  it('sprint mantém Acessos na base completa; calendário recorta pela vigência', async () => {
    const wrapper = novoWrapper();
    const sprint = renderHook(() => useBIInfraSgsi(JUNHO.from, JUNHO.to), { wrapper });
    await waitFor(() => expect(ids(sprint.result.current.data)).toEqual([1, 2]));
    const calendario = renderHook(() => useBIInfraSgsi(JUNHO.from, JUNHO.to, true), { wrapper });
    await waitFor(() => expect(ids(calendario.result.current.data)).toEqual([2]));
  });

  it('o período chega aos outros blocos e a data da sincronização ao cabeçalho', async () => {
    const wrapper = novoWrapper();
    const periodo = renderHook(() => useBIInfraSgsi(JUNHO.from, JUNHO.to), { wrapper });
    const base = renderHook(() => useBIInfraSgsi(), { wrapper });
    await waitFor(() => {
      expect(periodo.result.current.data).toBeDefined();
      expect(base.result.current.data).toBeDefined();
    });
    expect(periodo.result.current.data!.mudancas.total).toBe(1);
    expect(periodo.result.current.data!.totalItens).toBe(1);
    expect(base.result.current.data!.mudancas.total).toBe(2);
    expect(base.result.current.data!.totalItens).toBe(4);
    expect(periodo.result.current.data!.atualizadoEm).toBe('2026-06-11T11:00:00Z');
  });

  it('um download serve Visão Executiva, sprint, calendário e base completa', async () => {
    const wrapper = novoWrapper();
    const executiva = renderHook(() => useBIInfraSgsi(JUNHO.from, JUNHO.to), { wrapper });
    const calendario = renderHook(() => useBIInfraSgsi(JUNHO.from, JUNHO.to, true), { wrapper });
    const base = renderHook(() => useBIInfraSgsi(), { wrapper });
    await waitFor(() => {
      expect(executiva.result.current.data).toBeDefined();
      expect(calendario.result.current.data).toBeDefined();
      expect(base.result.current.data).toBeDefined();
    });
    expect(ids(base.result.current.data)).toEqual([1, 2]);
    expect(ids(calendario.result.current.data)).toEqual([2]);
    expect(mockFetchAllRows).toHaveBeenCalledTimes(1);
  });

  it('trocar período ou modo remonta a resposta sem baixar o espelho de novo', async () => {
    const { result, rerender } = renderHook(
      ({ de, ate, cal }: { de: Date; ate: Date; cal: boolean }) => useBIInfraSgsi(de, ate, cal),
      { wrapper: novoWrapper(), initialProps: { de: JUNHO.from, ate: JUNHO.to, cal: false } },
    );
    await waitFor(() => expect(ids(result.current.data)).toEqual([1, 2]));
    rerender({ de: JUNHO.from, ate: JUNHO.to, cal: true });
    await waitFor(() => expect(ids(result.current.data)).toEqual([2]));
    // em maio o definitivo ainda valia (revogado em 20/05)
    rerender({ de: MAIO.from, ate: MAIO.to, cal: true });
    await waitFor(() => expect(ids(result.current.data)).toEqual([1, 2]));
    expect(mockFetchAllRows).toHaveBeenCalledTimes(1);
  });

  it('refetch com as mesmas linhas remonta com a hora atual ("No prazo" vira "Sem evidência")', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-09-10T23:00:00Z')); // 20:00 de 10/09 em Brasília
      const vence = [item('014', 3, { 'Tipo liberação': 'Provisória', 'Status solicitação': 'Realizado', 'Data fim liberação provisória': '2026-09-10T00:00:00Z' }, '2026-09-01T12:00:00Z')];
      mockFetchAllRows.mockImplementation(async () => JSON.parse(JSON.stringify(vence)));
      const { result } = renderHook(() => useBIInfraSgsi(), { wrapper: novoWrapper() });
      await waitFor(() => expect(result.current.data?.acessos.itens[0]?.evidenciaRevogacao).toBe('No prazo'));

      vi.setSystemTime(new Date('2026-09-11T04:00:00Z')); // 01:00 de 11/09: o prazo acabou
      await act(async () => { await result.current.refetch(); });
      await waitFor(() => expect(result.current.data?.acessos.itens[0]?.evidenciaRevogacao).toBe('Sem evidência'));
      expect(mockFetchAllRows).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
