import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useDashboardExport } from '@/hooks/useDashboardExport';

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
  },
}));

/**
 * Regressão do "exportar não faz nada" reportado pelo gestor em 08/2026.
 * Dois defeitos cobertos aqui:
 *   1. filtro sem linhas baixava um CSV só com cabeçalho dizendo "sucesso";
 *   2. o object URL era revogado na mesma tick do click(), o que cancela o
 *      download em Chromium — o anchor tem que estar no DOM e sobreviver ao click.
 */

let clicks: Array<{ download: string; noDom: boolean }> = [];
let revogadosCedo: string[] = [];
let criados: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  clicks = [];
  revogadosCedo = [];
  criados = [];
  toastError.mockClear();
  toastSuccess.mockClear();

  let n = 0;
  URL.createObjectURL = vi.fn(() => {
    const u = `blob:teste/${++n}`;
    criados.push(u);
    return u;
  });
  URL.revokeObjectURL = vi.fn((u: string) => {
    // revogar antes do click ter sido processado = download cancelado
    if (clicks.length === 0) revogadosCedo.push(u);
  });

  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    clicks.push({ download: this.download, noDom: document.body.contains(this) });
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const config = {
  title: 'TimeLog por Colaborador',
  area: 'Fábrica',
  periodLabel: '01/07/2026 a 31/07/2026',
  columns: ['colaborador', 'horas_consolidado'],
  rows: [
    { colaborador: 'Douglas J. Soares', horas_consolidado: '161h 9m' },
    { colaborador: 'Ana Luiza J. Figueiredo, Design', horas_consolidado: '27h 20m' },
  ],
};

describe('useDashboardExport — CSV', () => {
  it('baixa o arquivo com o anchor no DOM e só revoga a URL depois', () => {
    const { result } = renderHook(() => useDashboardExport());
    result.current.exportCSV(config);

    expect(clicks).toHaveLength(1);
    expect(clicks[0].noDom).toBe(true);
    expect(revogadosCedo).toEqual([]);
    expect(toastSuccess).toHaveBeenCalled();

    // a limpeza acontece, só que depois
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(criados[0]);
  });

  it('nomeia o arquivo por área + título, sem acento', () => {
    const { result } = renderHook(() => useDashboardExport());
    result.current.exportCSV(config);

    expect(clicks[0].download).toMatch(/^fabrica-timelog-por-colaborador-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('não baixa nada e avisa quando o filtro não retornou linhas', () => {
    const { result } = renderHook(() => useDashboardExport());
    result.current.exportCSV({ ...config, rows: [] });

    expect(clicks).toHaveLength(0);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('Nada para exportar', expect.anything());
  });
});
