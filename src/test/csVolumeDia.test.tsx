import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * "Volume por dia" do TV de Customer Service.
 *
 * Regra de 21/08/2026 (pedido do Igor): TODA barra leva seu número. Antes, com
 * o mês cheio, só máx/mín/último eram rotulados e as outras 18 barras viravam
 * adivinhação. O que cede é a TIPOGRAFIA, nunca a informação — e os cortes de
 * tamanho são medidos no canvas do kiosk (trilha útil de ~399px):
 *   ≤16 dias → 12px · 17–24 → 9px · >24 → 9px + zigue-zague.
 */

const semDados = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };

vi.mock('@/hooks/useGestaoKpis', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useGestaoKpis')>()),
  useGestaoSlaMensal: () => semDados,
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

import { CsTvView } from '@/components/customerservice/CsTvView';
import { KioskRotationContext } from '@/contexts/KioskRotationContext';

/** Série de N dias com valores de 1 a 3 dígitos (113 é o caso largo real). */
const serie = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    totalRegistros: i === 2 ? 113 : (i % 9) + 1,
    totalMinutos: 100,
    totalHoras: 1.7,
  }));

const kpis = (dias: number) => ({
  totalRegistros: 500, totalMinutos: 12000, totalConsultores: 9,
  registrosPorConsultor: [], tipoChamadoTempoMedio: [],
  registrosPorSistema: [], registrosPorBandeira: [], registrosPorCliente: [],
  historico: serie(dias),
  isLoading: false, isError: false, refetch: vi.fn(),
});

/** Renderiza a PÁGINA 2 (Operação), onde vive o bloco. */
function renderDias(dias: number) {
  const r = render(
    <KioskRotationContext.Provider
      value={{ pagina: 1, paginas: 2, rotacaoLigada: false, pausado: true, registrarPaginas: () => {} }}
    >
      <CsTvView k={kpis(dias)} dataInicio={new Date(2026, 7, 1)} dataFim={new Date(2026, 7, dias)} />
    </KioskRotationContext.Provider>,
  );
  const bloco = [...r.container.querySelectorAll('p')]
    .find((p) => p.textContent === 'Volume por dia')!.closest('div.p-4')!;
  const numeros = [...bloco.querySelectorAll('span.font-mono')]
    .filter((s) => /^\d+$/.test(s.textContent ?? ''));
  return { bloco, numeros };
}

describe('Volume por dia — nenhum dia sem número', () => {
  it('mês curto: uma barra, um número', () => {
    const { numeros } = renderDias(10);
    expect(numeros).toHaveLength(10);
  });

  it('mês cheio (21 dias): TODAS continuam rotuladas — era o buraco antigo', () => {
    const { numeros } = renderDias(21);
    expect(numeros).toHaveLength(21);
    // e o valor grande aparece de verdade, não some no corte
    expect(numeros.some((n) => n.textContent === '113')).toBe(true);
  });

  it('mês inteiro (31 dias): ainda todas', () => {
    const { numeros } = renderDias(31);
    expect(numeros).toHaveLength(31);
  });
});

describe('Volume por dia — a tipografia é que cede', () => {
  it('até 16 dias o número fica em 12px', () => {
    const { numeros } = renderDias(15);
    expect(numeros[0].className).toContain('text-[12px]');
  });

  it('de 17 a 24 dias cai para 9px, sem zigue-zague', () => {
    const { numeros } = renderDias(21);
    expect(numeros[0].className).toContain('text-[9px]');
    expect(numeros.every((n) => !n.getAttribute('style')?.includes('margin-bottom'))).toBe(true);
  });

  it('acima de 24 dias os ímpares sobem — cada número ganha 2 colunas de largura', () => {
    const { numeros } = renderDias(31);
    expect(numeros[0].className).toContain('text-[9px]');
    expect(numeros[0].getAttribute('style') ?? '').not.toContain('margin-bottom');
    expect(numeros[1].getAttribute('style') ?? '').toContain('margin-bottom');
  });
});
