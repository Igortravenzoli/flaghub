import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import type { ReactNode } from 'react';

// Fiação da página com o período: o que Gestão SG, Timelog e Esteira recebem do
// filtro. As abas e os hooks de dados viram stubs que guardam props/argumentos.
type Props = Record<string, unknown>;
const mockFilterBar: Props[] = [];
const mockSgsiPanel: Props[] = [];
const mockTimelog: Props[] = [];
const mockKpisArgs: unknown[][] = [];
const mockPbiEnabled: boolean[] = [];
let mockPbiLoading = false;

// PBI: só esses tipos entram na busca de saúde (senão ela nunca liga e o teste não prova nada)
const mockTodos = [
  { id: 1, work_item_type: 'Product Backlog Item', title: 'Aberto em julho', state: 'Committed', created_date: '2026-07-20T10:00:00Z', changed_date: '2026-09-05T10:00:00Z', iteration_path: 'Infra\\Sprint A' },
  { id: 2, work_item_type: 'Product Backlog Item', title: 'Item da sprint', state: 'Done', created_date: '2026-09-01T10:00:00Z', changed_date: '2026-09-02T10:00:00Z', iteration_path: 'Infra\\Sprint A' },
];
const mockRecorte = [mockTodos[1]];
const mockBaseKpis = {
  total: 1, pendentes: 0, emAndamento: 0, concluidos: 1, melhorias: 0, iso27001: 0, sprintMigracoes: 0, transbordo: 0,
  backlog: 0, dev: 0, doneBySprint: [], lastSync: null, isLoading: false, isError: false, refetch: () => undefined,
};

vi.mock('@/hooks/useInfraestruturaKpis', () => ({
  useInfraestruturaKpis: (...args: unknown[]) => {
    mockKpisArgs.push(args);
    // 1ª chamada da página: base inteira (sem datas); 2ª: o escopo do filtro
    return args[0] === undefined
      ? { ...mockBaseKpis, items: mockTodos, allItems: mockTodos }
      : { ...mockBaseKpis, items: mockRecorte, allItems: mockRecorte };
  },
  isInfraPendente: () => false,
  isInfraAndamento: () => false,
  isInfraDone: () => true,
}));
vi.mock('@/hooks/useSprintFilter', () => ({ useSprintFilter: () => ({ sortedSprints: ['Infra\\Sprint A'] }) }));
vi.mock('@/hooks/usePbiHealthBatch', () => ({
  usePbiHealthBatch: (_ids: unknown, enabled: boolean) => {
    mockPbiEnabled.push(enabled);
    return { healthById: new Map(), overview: { total: 0, verde: 0, amarelo: 0, vermelho: 0 }, isLoading: enabled && mockPbiLoading };
  },
}));
vi.mock('@/hooks/useDashboardExport', () => ({ useDashboardExport: () => ({ exportCSV: () => undefined, exportPDF: () => undefined }) }));
vi.mock('@/hooks/useCrossSectorSearch', () => ({ useCrossSectorSearch: () => ({ crossSectorResult: null }) }));
vi.mock('@/components/setores/SectorLayout', () => ({ SectorLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/dashboard/DashboardFilterBar', () => ({ DashboardFilterBar: (p: Props) => { mockFilterBar.push(p); return null; } }));
vi.mock('@/components/dashboard/DashboardLastSyncBadge', () => ({ DashboardLastSyncBadge: () => null }));
vi.mock('@/components/infraestrutura/BIInfraSgsiPanel', () => ({
  BIInfraSgsiPanel: (p: Props) => { mockSgsiPanel.push(p); return <div>painel-sgsi</div>; },
  SGSI_SECOES: [{ value: 'acessos', label: 'Acessos', Icon: () => null }],
}));
vi.mock('@/components/infraestrutura/InfraExecutivoTab', () => ({ InfraExecutivoTab: () => <div>executivo</div> }));
vi.mock('@/components/infraestrutura/DevopsCoberturaPanel', () => ({ DevopsCoberturaPanel: () => null }));
vi.mock('@/components/infraestrutura/InfraTimelogTab', () => ({ InfraTimelogTab: (p: Props) => { mockTimelog.push(p); return <div>timelog</div>; } }));
vi.mock('@/components/infraestrutura/HubUptimePanel', () => ({ HubUptimePanel: () => null }));

import InfraestruturaDashboard from '@/pages/setores/InfraestruturaDashboard';

const ultimo = <T,>(xs: T[]): T => xs[xs.length - 1];
const abrirAba = (nome: string) => fireEvent.mouseDown(screen.getByRole('tab', { name: nome }), { button: 0 });
const escolherPeriodo = (de: Date, ate: Date) =>
  act(() => { (ultimo(mockFilterBar).onCustomRange as (a: Date, b: Date) => void)(de, ate); });

describe('InfraestruturaDashboard — período do calendário', () => {
  beforeEach(() => {
    mockFilterBar.length = 0;
    mockSgsiPanel.length = 0;
    mockTimelog.length = 0;
    mockKpisArgs.length = 0;
    mockPbiEnabled.length = 0;
    mockPbiLoading = false;
  });

  it('na Gestão SG o calendário libera qualquer dia; nas abas do DevOps segue a atividade dos itens', () => {
    render(<InfraestruturaDashboard />);
    expect(ultimo(mockFilterBar).availableDateKeys).toBeInstanceOf(Set);
    expect(ultimo(mockFilterBar).minDate).toBeInstanceOf(Date);
    abrirAba('Gestão SG');
    expect(screen.getByText('painel-sgsi')).toBeInTheDocument();
    const barra = ultimo(mockFilterBar);
    expect(barra.availableDateKeys).toBeUndefined();
    expect(barra.minDate).toBeUndefined();
    expect(barra.maxDate).toBeUndefined();
  });

  it('período do calendário liga o recorte de Acessos e sobrepõe a sprint nos dados do DevOps', () => {
    render(<InfraestruturaDashboard />);
    abrirAba('Gestão SG');
    // sprint selecionada por padrão: Acessos na base completa, DevOps pela sprint
    expect(ultimo(mockSgsiPanel).periodoDoCalendario).toBe(false);
    expect(ultimo(mockKpisArgs)[2]).toEqual(['Infra\\Sprint A']);

    const de = new Date(2026, 0, 1);
    const ate = new Date(2026, 5, 30);
    escolherPeriodo(de, ate);

    const painel = ultimo(mockSgsiPanel);
    expect(painel.periodoDoCalendario).toBe(true);
    expect(painel.dateFrom).toBe(de);
    expect(painel.dateTo).toBe(ate);
    expect(ultimo(mockKpisArgs)).toEqual([de, ate, 'all']);
    expect(screen.getByRole('button', { name: /Todas as Sprints/ })).toBeInTheDocument();
  });

  it('Timelog: com o calendário usa todos os itens (as horas já vêm filtradas por data); com a sprint, os da sprint', () => {
    render(<InfraestruturaDashboard />);
    abrirAba('Timelog');
    expect(ultimo(mockTimelog).items).toBe(mockRecorte);
    // o item aberto em julho e trabalhado em agosto não pode sumir das horas de agosto
    escolherPeriodo(new Date(2026, 7, 1), new Date(2026, 7, 31));
    expect(ultimo(mockTimelog).items).toBe(mockTodos);
  });

  it('a saúde dos PBIs só é buscada na Esteira / Saúde, e lista vazia carregando não vira "nenhum item"', () => {
    const { rerender } = render(<InfraestruturaDashboard />);
    expect(mockPbiEnabled.length).toBeGreaterThan(0);
    expect(mockPbiEnabled.every((ligado) => ligado === false)).toBe(true);
    abrirAba('Gestão SG');
    expect(ultimo(mockPbiEnabled)).toBe(false);

    fireEvent.keyDown(screen.getByRole('button', { name: /mais/ }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Esteira/ }));
    expect(ultimo(mockPbiEnabled)).toBe(true);

    // filtro "Crítica" com a busca pronta e sem itens: aviso de vazio é resultado
    fireEvent.click(screen.getByText('Crítica'));
    expect(screen.getByText(/Nenhum item monitorável/)).toBeInTheDocument();
    // busca recomeçando (outro período): a lista vazia é espera
    mockPbiLoading = true;
    rerender(<InfraestruturaDashboard />);
    expect(screen.queryByText(/Nenhum item monitorável/)).not.toBeInTheDocument();
  });
});
