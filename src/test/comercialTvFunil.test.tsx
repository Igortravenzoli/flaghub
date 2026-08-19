import { render, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ComercialTvView } from '@/components/comercial/ComercialTvView';
import { visoesDoTrimestre } from '@/lib/comercialPeriodo';

/**
 * Modo TV do funil (18/08/2026) — modelo da reunião quinzenal.
 *
 * O que estes testes travam:
 *  • título SEM nome de pessoa (o modelo dizia "Funil SDR — Arthur");
 *  • as visões do trimestre como abas CLICÁVEIS na própria tela, não como
 *    páginas extras da rotação entre setores;
 *  • nenhum trimestre escrito no rótulo do acumulado — a virada do Q4 não pode
 *    depender de build novo;
 *  • a faixa de KPIs comparando mês × mês × acumulado — a conta de variação
 *    é o que mais quebra em silêncio quando alguém mexe no recorte.
 */

const { somar } = vi.hoisted(() => {
  const SDR = ['Lead Captado', 'Primeiro Contato', 'Interesse Confirmado', 'Qualificação', 'Reunião Agendada', 'Oportunidade Gerada'];
  const COM = ['Oportunidade Recebida', 'Diagnóstico', 'Apresentação da Solução', 'Proposta Comercial', 'Negociação', 'Oportunidade Fechada'];

  // Q2 fecha 5 + 4 + 9 = 18 · Q3 (jul+ago) fecha 11 + 10 = 21.
  const DADOS: Record<string, { sdr: number[]; comercial: number[] }> = {
    '2026-04': { sdr: [300, 230, 160, 105, 70, 45], comercial: [45, 38, 31, 23, 16, 5] },
    '2026-05': { sdr: [290, 225, 155, 100, 66, 42], comercial: [42, 36, 29, 22, 15, 4] },
    '2026-06': { sdr: [305, 235, 162, 108, 72, 46], comercial: [46, 39, 32, 24, 17, 9] },
    '2026-07': { sdr: [320, 244, 168, 112, 74, 48], comercial: [48, 41, 33, 25, 17, 11] },
    '2026-08': { sdr: [292, 226, 153, 102, 69, 44], comercial: [44, 37, 30, 22, 15, 10] },
  };

  const somar = (meses: string[]) => {
    const acc = { sdr: SDR.map(() => 0), comercial: COM.map(() => 0) };
    for (const m of meses) {
      const d = DADOS[m];
      if (!d) continue;
      d.sdr.forEach((q, i) => { acc.sdr[i] += q; });
      d.comercial.forEach((q, i) => { acc.comercial[i] += q; });
    }
    const etapa = (funil: 'sdr' | 'comercial', nome: string, i: number, quantidade: number) => ({
      id: `${funil}-${i}`, funil, etapa: nome, icone: null, ordem: i, quantidade, updated_at: '',
    });
    return {
      sdr: SDR.map((n, i) => etapa('sdr', n, i, acc.sdr[i])),
      comercial: COM.map((n, i) => etapa('comercial', n, i, acc.comercial[i])),
    };
  };

  return { somar };
});

vi.mock('@/hooks/useComercialFunil', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useComercialFunil')>()),
  useComercialFunil: (escopo?: string | string[]) => {
    const meses = Array.isArray(escopo) ? escopo : [escopo ?? ''];
    return {
      ...somar(meses),
      etapasDe: (recorte: string[]) => somar(recorte),
      fallbackDe: null,
      isLoading: false,
    };
  },
}));

// 18/08/2026 → Q3 com Julho, Agosto e Acumulado (setembro não iniciou).
const VISOES = visoesDoTrimestre(new Date(2026, 7, 18));

const renderTv = (visaoInicial?: string) =>
  render(
    <ComercialTvView
      visoes={VISOES}
      trimestreLabel="Q3 2026 · jul–set"
      qKey="2026-Q3"
      visaoInicial={visaoInicial}
    />,
  );

/** As abas — "Julho" também é rótulo de card na faixa de KPIs. */
const abasDe = (container: HTMLElement) =>
  container.querySelector('[aria-label="Visão exibida"]') as HTMLElement;

describe('ComercialTvView — funil no telão', () => {
  it('não usa nome de pessoa no título dos funis', () => {
    const { container } = renderTv('2026-07');
    expect(container.textContent).toContain('Funil SDR');
    expect(container.textContent).toContain('Funil Comercial');
    expect(container.textContent).not.toMatch(/Arthur/i);
  });

  it('desenha as três visões do trimestre e marca a que está no ar', () => {
    const { container } = renderTv('2026-08');
    const { getByText } = within(abasDe(container));
    expect(getByText('Julho')).toBeInTheDocument();
    expect(getByText('Agosto')).toBeInTheDocument();
    expect(getByText('Acumulado')).toBeInTheDocument();
    expect(getByText('Agosto').getAttribute('aria-current')).toBe('true');
    expect(getByText('Julho').getAttribute('aria-current')).toBeNull();
  });

  it('nenhuma aba cita o trimestre — a virada do Q4 não pede build novo', () => {
    const { container } = renderTv();
    expect(abasDe(container).textContent).not.toMatch(/Q[1-4]/);
    // O trimestre aparece uma vez só, no selo do topo, e vem do calendário.
    expect(container.textContent).toContain('Q3 2026 · jul–set');
  });

  it('abre no acumulado e troca de visão NO CLIQUE, sem página extra na rotação', () => {
    const { container } = renderTv();
    const abas = abasDe(container);
    expect(within(abas).getByText('Acumulado').getAttribute('aria-current')).toBe('true');
    expect(container.textContent).toContain('612');   // 320 + 292 no topo do SDR

    fireEvent.click(within(abas).getByText('Julho'));

    expect(within(abas).getByText('Julho').getAttribute('aria-current')).toBe('true');
    expect(within(abas).getByText('Acumulado').getAttribute('aria-current')).toBeNull();
    expect(container.textContent).toContain('320');   // topo do SDR só de julho
  });

  it('a página do mês mostra o funil DAQUELE mês', () => {
    const { container } = renderTv('2026-07');
    expect(container.textContent).toContain('Lead Captado');
    expect(container.textContent).toContain('320');
    expect(container.textContent).toContain('Oportunidade Fechada');
  });

  it('o acumulado soma os meses já iniciados e diz quais', () => {
    const { container } = renderTv('2026-Q3');
    expect(container.textContent).toContain('612');
    expect(container.textContent).toContain('Soma de jul/26 + ago/26');
  });

  it('a faixa de KPIs é a mesma em todas as visões — comparativo do trimestre', () => {
    const mes = renderTv('2026-07').container.textContent ?? '';
    const acumulado = renderTv('2026-Q3').container.textContent ?? '';
    for (const trecho of ['+22,2% vs jun/26', '−9,1% vs jul/26', '+16,7% vs Q2']) {
      expect(mes).toContain(trecho);
      expect(acumulado).toContain(trecho);
    }
  });

  it('taxa de conversão é ponta a ponta (lead captado → fechado) do acumulado', () => {
    const { container } = renderTv('2026-07');
    // 21 fechados ÷ 612 leads = 3,4% · Q2 fez 18 ÷ 895 = 2,0% → +1,4 p.p.
    expect(container.textContent).toContain('3,4%');
    expect(container.textContent).toContain('+1,4 p.p. vs Q2');
  });

  it('as faixas entram em cascata — cada uma com seu lugar na fila', () => {
    const { container } = renderTv('2026-07');
    const faixas = container.querySelectorAll('.funil-band-enter');
    expect(faixas).toHaveLength(12); // 6 etapas × 2 funis
    // O atraso sai de --i; sem o índice todas animariam juntas e a cascata some.
    const indices = Array.from(faixas).map(f => (f as HTMLElement).style.getPropertyValue('--i'));
    expect(indices.slice(0, 6)).toEqual(['0', '1', '2', '3', '4', '5']);
  });

  it('conversão do card é a do próprio funil, não a ponta a ponta', () => {
    const { container } = renderTv('2026-07');
    expect(container.textContent).toContain('15,0%');  // SDR: 48 ÷ 320
    expect(container.textContent).toContain('22,9%');  // Comercial: 11 ÷ 48
  });
});
