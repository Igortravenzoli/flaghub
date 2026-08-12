import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useDashboardExport } from '@/hooks/useDashboardExport';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

/**
 * Regressão da formatação do PDF (11/08/2026): 15 colunas de largura igual,
 * duas delas com URLs de ~70 caracteres, espremiam o resto a ponto de o
 * cabeçalho sair impresso na vertical.
 */

const chamadas: any[] = [];
const links: any[] = [];
let larguraPagina = 297; // A4 paisagem, mm

vi.mock('jspdf', () => ({
  default: class {
    internal = { pageSize: { getWidth: () => larguraPagina } };
    setFontSize() {}
    setTextColor() {}
    text() {}
    link(x: number, y: number, w: number, h: number, o: any) { links.push({ x, y, w, h, o }); }
    save() {}
  },
}));
vi.mock('jspdf-autotable', () => ({
  autoTable: (_doc: unknown, opts: any) => { chamadas.push(opts); },
}));

const config = {
  title: 'TimeLog detalhado - Alex Amaral',
  area: 'Fábrica',
  periodLabel: '03/08/2026 a 14/08/2026',
  columns: ['pbi', 'pbi_link', 'task', 'task_link', 'task_titulo', 'descricao', 'horas_lancadas'],
  rows: [
    {
      pbi: 14647, pbi_link: 'https://dev.azure.com/FlagIW/Flag.Planejamento/_workitems/edit/14647',
      task: 16258, task_link: 'https://dev.azure.com/FlagIW/Flag.Planejamento/_workitems/edit/16258',
      task_titulo: 'Construir Back-End', descricao: '', horas_lancadas: '5:00',
    },
  ],
  pdfColumns: ['pbi', 'task', 'task_titulo', 'horas_lancadas'],
  columnLabels: { pbi: 'PBI', task: 'Task', task_titulo: 'Task — título', horas_lancadas: 'Horas' },
  pdfLinks: { pbi: 'pbi_link', task: 'task_link' },
  pdfColumnWidths: { pbi: 1, task: 1, task_titulo: 6, horas_lancadas: 1 },
};

beforeEach(() => {
  chamadas.length = 0;
  links.length = 0;
  larguraPagina = 297;
});

/** A última chamada do autoTable é sempre a tabela de dados (a 1ª é o Resumo). */
const tabelaDados = () => chamadas[chamadas.length - 1];

describe('exportPDF — formatação de colunas', () => {
  it('imprime só as colunas de pdfColumns, deixando as URLs cruas fora', async () => {
    const { result } = renderHook(() => useDashboardExport());
    await result.current.exportPDF(config);

    const t = tabelaDados();
    expect(t.head[0]).toEqual(['PBI', 'Task', 'Task — título', 'Horas']);
    expect(t.head[0].join(' ')).not.toContain('link');
    expect(t.body[0]).toEqual(['14647', '16258', 'Construir Back-End', '5:00']);
  });

  it('distribui a largura pelos pesos e cabe na página', async () => {
    const { result } = renderHook(() => useDashboardExport());
    await result.current.exportPDF(config);

    const larguras = Object.values(tabelaDados().columnStyles).map((s: any) => s.cellWidth);
    const util = 297 - 28; // margens de 14 de cada lado
    expect(larguras.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(util, 5);
    // a coluna de título (peso 6) é a mais larga
    expect(Math.max(...larguras)).toBe(larguras[2]);
    expect(larguras[2]).toBeCloseTo((util * 6) / 9, 5);
  });

  it('quebra linha em vez de estourar a célula', async () => {
    const { result } = renderHook(() => useDashboardExport());
    await result.current.exportPDF(config);
    expect(tabelaDados().bodyStyles.overflow).toBe('linebreak');
  });

  it('sem pdfColumns, cai nas colunas normais', async () => {
    const { result } = renderHook(() => useDashboardExport());
    await result.current.exportPDF({ ...config, pdfColumns: undefined, columnLabels: undefined });
    expect(tabelaDados().head[0]).toEqual(config.columns);
  });

  it('transforma PBI e Task em link clicável para o DevOps', async () => {
    const { result } = renderHook(() => useDashboardExport());
    await result.current.exportPDF(config);

    const t = tabelaDados();
    // simula o autoTable desenhando as células da linha 0
    for (let col = 0; col < 4; col++) {
      t.didDrawCell({ section: 'body', column: { index: col }, row: { index: 0 }, cell: { x: 1, y: 2, width: 3, height: 4 } });
    }
    expect(links.map((l) => l.o.url)).toEqual([
      'https://dev.azure.com/FlagIW/Flag.Planejamento/_workitems/edit/14647',
      'https://dev.azure.com/FlagIW/Flag.Planejamento/_workitems/edit/16258',
    ]);
  });

  it('não cria link em coluna sem URL', async () => {
    const { result } = renderHook(() => useDashboardExport());
    await result.current.exportPDF({ ...config, rows: [{ ...config.rows[0], pbi_link: '' }] });

    tabelaDados().didDrawCell({ section: 'body', column: { index: 0 }, row: { index: 0 }, cell: { x: 0, y: 0, width: 1, height: 1 } });
    expect(links).toHaveLength(0);
  });
});
