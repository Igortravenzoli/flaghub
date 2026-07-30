import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

// LAY-1/2/3/4 — trava a ORDEM dos cards e a ausência do "Comparativo mensal".
// Todos os hooks de dados são mockados: o teste é sobre estrutura, não sobre dado.

const semDados = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };

// Os 3 cards de SLA precisam de DADO para renderizar o BlocoCard (sem dado eles
// caem no DashboardEmptyState, que não é um card e não tem título de card).
const slaMensal = {
  success: true, message: 'ok', timestamp: '2026-07-30T12:00:00Z',
  segmento: 'nestle' as const, formulaVersao: 'planilha-cs-v1',
  referencia: {
    mesAtual: '2026-07', mesAnterior: '2026-06', ano: 2026,
    inicioMesAtual: '2026-07-01', fimJanelaExclusivo: '2026-08-01',
    inicioAno: '2026-01-01', hoje: '2026-07-30',
  },
  metas: { metaTTRDias: 3.9, metaTTR24hPct: 48, metaDefinida: true },
  ttr: {
    mesAtual: 3.42, mesAnterior: 3.91, variacaoPct: -12.53, variacaoDias: -0.49,
    anual: 4.35, atingiuMetaAnual: false, statusAnual: 'ALERT' as const,
    menorMelhor: true, unidadeVariacao: '%' as const,
  },
  ttr24h: {
    mesAtual: 51.2, mesAnterior: 44.9, variacaoPp: 6.3,
    anual: 48.7, atingiuMetaAnual: true, statusAnual: 'OK' as const,
    menorMelhor: false, unidadeVariacao: 'p.p.' as const,
  },
  abertos: { totalAbertos: 61, maior5Dias: 53, maior30Dias: 9, incMaior5Dias: 23, incMaior30Dias: 7 },
  volumes: { fechadosMesAtual: 131, fechadosMesAnterior: 549, fechadosAno: 3204 },
  qualidade: { ttrNegativoMesAtual: 0, ttrNegativoMesAnterior: 2, ttrNegativoAno: 5, osDuplicadasJanela: 0 },
};

vi.mock('@/hooks/useGestaoKpis', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useGestaoKpis')>()),
  useGestaoSlaMensal: () => ({ data: slaMensal, isLoading: false, isError: false, refetch: vi.fn() }),
  useGestaoCoberturaClientes: () => semDados,
  useGestaoSlaNestleDetalhe: () => semDados,
}));

vi.mock('@/hooks/useTechLeadKpis', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useTechLeadKpis')>()),
  useTechLeadPorDia: () => semDados,
  useTechLeadConsultorSistemas: () => semDados,
  useTechLeadConsultorInfra: () => semDados,
}));

vi.mock('@/hooks/useCsIncidentesDeclarados', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useCsIncidentesDeclarados')>()),
  useCsIncidentesDeclarados: () => semDados,
}));

import { HelpdeskExecutivoTab } from '@/components/helpdesk/HelpdeskExecutivoTab';

const props = {
  totalRegistros: 1284,
  totalMinutos: 29900,
  consultoresAtivos: 9,
  registrosPorConsultor: [{ nome: 'Ailton', quantidade: 10, totalRegistros: 10, totalMinutos: 200 }],
  tipoChamadoTempoMedio: [{ tipo: 'Dúvida', quantidade: 10, tempoMedio: 16.2 }],
  registrosPorSistema: [{ nome: 'FlexxSales', quantidade: 40 }],
  registrosPorBandeira: [{ nome: 'Nestlé', quantidade: 60 }],
  registrosPorCliente: [{ nome: 'Cliente A', quantidade: 5 }],
  historico: [{ date: '2026-07-01', totalRegistros: 40, totalMinutos: 900, totalHoras: 15 }],
  dataInicio: new Date('2026-07-01'),
  dataFim: new Date('2026-07-31'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

/** Títulos de card do BlocoCard, em ordem de documento. */
const titulosDeCard = (container: HTMLElement) =>
  [...container.querySelectorAll('p.uppercase.tracking-\\[0\\.14em\\]')].map((e) => e.textContent);

describe('LAY-1/LAY-2 — ordem dos cards travada', () => {
  it('as 4 seções, na ordem, e nenhuma quinta', () => {
    const { container } = render(<HelpdeskExecutivoTab {...props} />);
    const secoes = [...container.querySelectorAll('h3')].map((h) => h.textContent);
    expect(secoes).toEqual(['Resultado', 'Indicadores', 'Análise', 'Incidentes declarados']);
    expect(container.querySelectorAll('h3')).toHaveLength(4);
  });

  it('os cards saem exatamente na ordem-alvo dos ajustes 4 e 7', () => {
    const { container } = render(<HelpdeskExecutivoTab {...props} />);
    expect(titulosDeCard(container)).toEqual([
      // 1ª linha — Resultado
      'SLA Nestlé',
      'SLA Heineken',
      'SLA Outras Bandeiras',
      // 2ª linha — Indicadores
      'Panorama do Atendimento',
      'Produtividade dos Consultores',
      'Volume de Atendimentos por Consultor',
      // 3ª linha — Análise
      'Volume de Atendimentos por Dia',
      'Volume de Atendimentos por Sistema',
      'Tempo Médio por Tipo de Chamado',
      // 4ª seção — Incidentes
      'Incidentes Declarados',
    ]);
  });

  it('SLA-5: o 3º card do Resultado é "Outras Bandeiras" e "SLA Flag" não existe mais', () => {
    const { container } = render(<HelpdeskExecutivoTab {...props} />);
    expect(titulosDeCard(container)[2]).toBe('SLA Outras Bandeiras');
    expect(screen.queryByText('SLA Flag')).toBeNull();
  });

  it('SLA-8: o selo "resultado calculado" está ao lado do SecHeader de Resultado', () => {
    render(<HelpdeskExecutivoTab {...props} />);
    expect(screen.getByText('resultado calculado')).toBeInTheDocument();
  });

  it('as 3 primeiras linhas usam o MESMO ritmo de breakpoint (md:2 / lg:3)', () => {
    const { container } = render(<HelpdeskExecutivoTab {...props} />);
    const grids = [...container.querySelectorAll('div.grid')]
      .filter((d) => d.className.includes('lg:grid-cols-3'));
    const tresColunas = grids.filter((d) => d.className.includes('md:grid-cols-2'));
    expect(tresColunas.length).toBe(3);   // Resultado, Indicadores, Análise
  });
});

describe('LAY-3 — o Comparativo mensal deixou de existir', () => {
  it('nenhum resquício textual da 4ª seção antiga', () => {
    render(<HelpdeskExecutivoTab {...props} />);
    expect(screen.queryByText(/Comparativo mensal/)).toBeNull();
    expect(screen.queryByText(/Série mensal de registros/)).toBeNull();
    expect(screen.queryByText(/Mês atual × anterior/)).toBeNull();
    expect(screen.queryByText(/Selecione “Ano” no período/)).toBeNull();
  });

  it('o seed fictício de incidentes com parada também sumiu', () => {
    const { container } = render(<HelpdeskExecutivoTab {...props} />);
    for (const ficticio of [
      'Trava versão app Merchan',
      'Trava versão banco Merchan',
      'Lentidão digitação de pedidos',
      'Erro componente NFE',
      'Incidentes com parada · priorização',
    ]) {
      expect(container.textContent).not.toContain(ficticio);
    }
  });
});

describe('LAY-4 — contrato do modo TV', () => {
  it('sem filterBar a tab NÃO ganha filtro implícito', () => {
    const { container } = render(<HelpdeskExecutivoTab {...props} />);
    expect(container.querySelector('[data-testid="dashboard-filter-bar"]')).toBeNull();
    expect(screen.queryByText('Período')).toBeNull();
  });

  it('sem filterBar (TV) nenhum valor de aging vira botão de drill-down', () => {
    const { container } = render(<HelpdeskExecutivoTab {...props} />);
    const botoesAging = [...container.querySelectorAll('button')]
      .filter((b) => /dias:/.test(b.textContent ?? ''));
    expect(botoesAging).toHaveLength(0);
  });

  it('com filterBar, o filtro é renderizado onde a tela espera', () => {
    render(<HelpdeskExecutivoTab {...props} filterBar={<div data-testid="fb">filtro</div>} />);
    expect(screen.getByTestId('fb')).toBeInTheDocument();
  });

  it('o cabeçalho continua identificando Customer Service', () => {
    render(<HelpdeskExecutivoTab {...props} periodLabel="Mês atual" />);
    expect(screen.getByText('Visão Executiva')).toBeInTheDocument();
    expect(screen.getByText(/Customer Service/)).toBeInTheDocument();
    expect(screen.getByText(/Mês atual/)).toBeInTheDocument();
  });
});
