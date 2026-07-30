import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

// LAY-4 — contrato do modo TV. O kiosk renderiza a MESMA tab sem filterBar.
// Este arquivo documenta por que a prop é `totalMinutos` e não `totalHoras`:
// o TS já quebra o build se ela faltar, mas não impede alguém de "consertar"
// passando `k.totalHoras * 60` — o que degradaria o TMA.

const semDados = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };

// Os cards de SLA precisam de DADO: sem dado eles caem no DashboardEmptyState,
// que renderiza um h3 próprio e falsearia a contagem de seções.
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

// `useHelpdeskKpis` devolve totalMinutos nos dois ramos (API e Supabase).
vi.mock('@/hooks/useHelpdeskKpis', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useHelpdeskKpis')>()),
  useHelpdeskKpis: () => ({
    totalRegistros: 1284,
    totalMinutos: 29900,
    totalHoras: 498.3,
    totalConsultores: 9,
    registrosPorConsultor: [{ nome: 'Ailton', quantidade: 10, totalRegistros: 10, totalMinutos: 200 }],
    tipoChamadoTempoMedio: [{ tipo: 'Dúvida', quantidade: 10, tempoMedio: 16.2 }],
    registrosPorSistema: [{ nome: 'FlexxSales', quantidade: 40 }],
    registrosPorBandeira: [{ nome: 'Nestlé', quantidade: 60 }],
    registrosPorCliente: [{ nome: 'Cliente A', quantidade: 5 }],
    historico: [{ date: '2026-07-01', totalRegistros: 40, totalMinutos: 900, totalHoras: 15 }],
  }),
}));

import HelpdeskKiosk from '@/components/home/kiosk/HelpdeskKiosk';

describe('HelpdeskKiosk — modo TV', () => {
  it('encaminha MINUTOS BRUTOS: o TMA sai 23min (de 29900 ÷ 1284)', () => {
    render(<HelpdeskKiosk />);
    expect(screen.getByText('23min')).toBeInTheDocument();
  });

  it('as horas saem em h:mm dos minutos brutos, não do decimal arredondado', () => {
    const { container } = render(<HelpdeskKiosk />);
    expect(screen.getByText('498:20')).toBeInTheDocument();
    expect(container.textContent).not.toContain('498.3h');
  });

  it('a TV recebe 4 seções, não 5 (o Comparativo mensal não volta pelo kiosk)', () => {
    const { container } = render(<HelpdeskKiosk />);
    expect([...container.querySelectorAll('h3')].map((h) => h.textContent))
      .toEqual(['Resultado', 'Indicadores', 'Análise', 'Incidentes declarados']);
  });

  it('nenhum DashboardFilterBar aparece — a tab não ganha filtro implícito na TV', () => {
    const { container } = render(<HelpdeskKiosk />);
    expect(screen.queryByText('Período')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    // e o escopo fixo do kiosk fica declarado no cabeçalho
    const sub = [...container.querySelectorAll('p')].find((p) => p.textContent?.includes('Customer Service'));
    expect(sub?.textContent).toContain('Mês atual');
  });

  it('nenhum número da tela sai como undefined/NaN com os dados do kiosk', () => {
    const { container } = render(<HelpdeskKiosk />);
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });
});
