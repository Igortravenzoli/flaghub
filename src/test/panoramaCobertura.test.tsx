import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { GestaoCoberturaClientesResponse } from '@/hooks/useGestaoKpis';

// PAN-1 (registros · horas · TMA seguem o filtro) e PAN-2 (cobertura é do MÊS
// CORRENTE e ignora o filtro). Hook mockado → sem QueryClientProvider.

let mockCob: {
  data?: GestaoCoberturaClientesResponse;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

const refetch = vi.fn();

vi.mock('@/hooks/useGestaoKpis', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useGestaoKpis')>()),
  useGestaoCoberturaClientes: () => mockCob,
}));

import { PanoramaAtendimentoCard } from '@/components/helpdesk/PanoramaAtendimentoCard';

const cobertura = (over: Partial<GestaoCoberturaClientesResponse> = {}): GestaoCoberturaClientesResponse => ({
  success: true, message: 'ok', timestamp: '2026-07-30T12:00:00Z',
  mesReferencia: '2026-07',
  totalClientesAtivos: 312, atendidosMes: 148, naoAtendidos: 164,
  pctCobertura: 47.4, atendidosSemClienteAtivo: 0, clientesInternosExcluidos: [],
  ...over,
});

const renderPanorama = (props: Partial<React.ComponentProps<typeof PanoramaAtendimentoCard>> = {}) =>
  render(
    <PanoramaAtendimentoCard
      totalRegistros={1284}
      totalMinutos={29900}
      consultoresAtivos={9}
      totalSistemas={12}
      totalBandeiras={4}
      clientesNoPeriodo={87}
      {...props}
    />
  );

beforeEach(() => {
  refetch.mockClear();
  mockCob = { data: cobertura(), isLoading: false, isError: false, refetch };
});

describe('PAN-1 — registros, horas e TMA seguem o filtro', () => {
  it('registros vêm da prop', () => {
    renderPanorama();
    expect(screen.getByText('1284')).toBeInTheDocument();
  });

  it('horas em h:mm (decisão de 26/07), não decimal com sufixo h', () => {
    const { container } = renderPanorama();
    expect(screen.getByText('498:20')).toBeInTheDocument();
    expect(container.textContent).not.toContain('498.3h');
  });

  it('TMA calculado dos MINUTOS BRUTOS ÷ registros', () => {
    renderPanorama();
    expect(screen.getByText('23min')).toBeInTheDocument();
  });

  it('sem registros o TMA é "—", não "0min" nem "NaN"', () => {
    const { container } = renderPanorama({ totalRegistros: 0, totalMinutos: 0 });
    expect(container.textContent).not.toContain('NaN');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('todos os números têm RÓTULO visível (modo TV)', () => {
    renderPanorama();
    for (const rot of ['registros no período', 'horas de atendimento', 'TMA por atendimento',
      'consultores', 'sistemas', 'bandeiras', 'clientes no período', 'cobertura da base']) {
      expect(screen.getByText(rot)).toBeInTheDocument();
    }
  });
});

describe('PAN-2 — cobertura de clientes (mês corrente, fora do filtro)', () => {
  it('pctCobertura 47,4 → 47% e o par bruto 148 de 312 fica VISÍVEL no rodapé', () => {
    renderPanorama();
    expect(screen.getByText('47%')).toBeInTheDocument();
    expect(screen.getByText('148 de 312')).toBeInTheDocument();
  });

  it('pctCobertura null → "—" e NUNCA "0%"; o par bruto continua visível', () => {
    mockCob = { data: cobertura({ pctCobertura: null }), isLoading: false, isError: false, refetch };
    const { container } = renderPanorama();
    expect(container.textContent).not.toContain('0%');
    expect(screen.getByText('148 de 312')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('mesReferencia 2026-07 aparece como jul/26 em TEXTO no rodapé (não só no title do selo)', () => {
    const { container } = renderPanorama();
    const rodape = [...container.querySelectorAll('p')].find((p) => p.textContent?.includes('Cobertura da base'));
    expect(rodape?.textContent).toContain('jul/26');
  });

  it('o selo "cobertura fora do filtro" está no header do card', () => {
    renderPanorama();
    expect(screen.getByText('cobertura fora do filtro')).toBeInTheDocument();
  });

  it('mesReferencia vazio → "—" e nenhum undefined/NaN em lugar nenhum', () => {
    mockCob = { data: cobertura({ mesReferencia: '' }), isLoading: false, isError: false, refetch };
    const { container } = renderPanorama();
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });

  it('atendidosSemClienteAtivo > 0 acende o aviso de grafia divergente', () => {
    mockCob = { data: cobertura({ atendidosSemClienteAtivo: 3 }), isLoading: false, isError: false, refetch };
    renderPanorama();
    expect(screen.getByText(/3 atendimento\(s\) sem cliente ativo/)).toBeInTheDocument();
  });

  it('atendidosSemClienteAtivo 0 não acende aviso', () => {
    renderPanorama();
    expect(screen.queryByText(/sem cliente ativo/)).toBeNull();
  });
});

describe('PAN-2 — estados (skeleton por CÉLULA, não por card)', () => {
  it('isLoading: skeleton na célula da cobertura, e os números de prop CONTINUAM visíveis', () => {
    mockCob = { data: undefined, isLoading: true, isError: false, refetch };
    const { container } = renderPanorama();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.getByText('1284')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('isError: link "tentar novamente" chama refetch; os números de prop seguem visíveis', () => {
    mockCob = { data: undefined, isLoading: false, isError: true, refetch };
    renderPanorama();
    const btn = screen.getByRole('button', { name: /tentar novamente/i });
    expect(btn.textContent).toMatch(/VPN/);
    btn.click();
    expect(refetch).toHaveBeenCalled();
    expect(screen.getByText('1284')).toBeInTheDocument();
  });

  it('sem data e sem erro: cobertura "—", sem crash', () => {
    mockCob = { data: undefined, isLoading: false, isError: false, refetch };
    const { container } = renderPanorama();
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });
});
