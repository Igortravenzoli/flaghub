import { render, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ComercialTvView } from '@/components/comercial/ComercialTvView';
import { visoesDoTrimestre } from '@/lib/comercialPeriodo';

/**
 * Comercial no telão — UMA tela com tudo (19/08/2026).
 *
 * O que estes testes travam:
 *  • os 11 blocos numa tela só, sem paginação;
 *  • título SEM nome de pessoa (o modelo dizia "Funil SDR — Arthur");
 *  • as visões do trimestre como abas CLICÁVEIS, não páginas da rotação;
 *  • nenhum trimestre escrito em rótulo — a virada do Q4 não pode pedir build;
 *  • os tetos de produtos e alertas DECLARADOS: o container é overflow-hidden,
 *    então item cortado em silêncio seria "cobri tudo" mentindo;
 *  • a faixa de comparativo acompanha quantos meses o trimestre já tem — num
 *    grid fixo de 4 colunas, setembro empurraria um card para fora da tela.
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
    '2026-09': { sdr: [280, 214, 147, 98, 65, 41], comercial: [41, 35, 28, 21, 14, 8] },
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

// 5 produtos e 4 alertas de proposito: os tetos da tela sao 4 e 3.
vi.mock('@/hooks/useComercialExecutivo', () => ({
  useComercialExecutivo: () => ({
    movimento: { ganhos: 6, perdas: 3, saldo: 3, valorPerdido: 0 },
    receita: { total: 0, negocios: 0, orgs: 0 },
    produtos: [
      { nome: 'ConnectMerchan', metaQty: 10, realQty: 12, pct: 118 },
      { nome: 'Flag ERP', metaQty: 20, realQty: 16, pct: 82 },
      { nome: 'Broker', metaQty: 14, realQty: 10, pct: 71 },
      { nome: 'FlexxPromo', metaQty: 17, realQty: 7, pct: 41 },
      { nome: 'Flag Analytics', metaQty: 8, realQty: 2, pct: 25 },
    ],
    satisfacao: { nota: 4.3, csat: 87, respostas: 34, detratores: 2, detratoresNomes: ['Alfa', 'Beta'] },
    alertas: [
      { texto: 'FlexxPromo: 41% da meta (7/17)', nivel: 'alto' },
      { texto: 'Flag Analytics: 25% da meta (2/8)', nivel: 'alto' },
      { texto: '3 perdas de cliente no periodo', nivel: 'alto' },
      { texto: '2 clientes detratores na pesquisa', nivel: 'medio' },
    ],
    isLoading: false,
  }),
}));

// 18/08/2026 → Q3 com Julho, Agosto e Acumulado (setembro não iniciou).
const VISOES = visoesDoTrimestre(new Date(2026, 7, 18));
// 30/09/2026 → Q3 fechado: Julho, Agosto, Setembro e Acumulado.
const VISOES_SET = visoesDoTrimestre(new Date(2026, 8, 30));

const renderTv = (visaoInicial?: string, visoes = VISOES) =>
  render(
    <ComercialTvView
      visoes={visoes}
      trimestreLabel="Q3 2026 · jul–set"
      qKey="2026-Q3"
      dateFrom={new Date(2026, 6, 1)}
      dateTo={new Date(2026, 8, 30)}
      clientesAtivos={128}
      clientesBloqueados={9}
      visaoInicial={visaoInicial}
    />,
  );

/** As abas — "Julho" também é rótulo de bloco no comparativo. */
const abasDe = (container: HTMLElement) =>
  container.querySelector('[aria-label="Visão exibida"]') as HTMLElement;

describe('ComercialTvView — o Comercial inteiro numa tela', () => {
  it('traz os 11 blocos juntos, sem paginação', () => {
    const t = renderTv('2026-07').container.textContent ?? '';
    for (const bloco of [
      'Funil SDR', 'Funil Comercial',
      'Carteira e movimento', 'Produtos · meta × realizado', 'Satisfação', 'Alertas',
      'Julho', 'Agosto', 'Acumulado', 'Taxa de conversão',
    ]) {
      expect(t).toContain(bloco);
    }
  });

  it('não usa nome de pessoa no título dos funis', () => {
    const { container } = renderTv('2026-07');
    expect(container.textContent).not.toMatch(/Arthur/i);
  });

  it('mostra a carteira e o movimento do trimestre', () => {
    const t = renderTv('2026-07').container.textContent ?? '';
    expect(t).toContain('128');   // clientes ativos, ja sem internos
    expect(t).toContain('clientes ativos');
    expect(t).toContain('bloqueados');
    expect(t).toContain('+3');    // saldo de 6 ganhos - 3 perdas
  });

  it('declara o que cortou em produtos e alertas em vez de sumir com o excedente', () => {
    const t = renderTv('2026-07').container.textContent ?? '';
    expect(t).toContain('ConnectMerchan');
    expect(t).toContain('+1 produto');            // 5 produtos, teto de 4
    expect(t).toContain('+1 ponto de atenção');   // 4 alertas, teto de 3
  });

  it('desenha as visões do trimestre e marca a que está no ar', () => {
    const { container } = renderTv('2026-08');
    const { getByText } = within(abasDe(container));
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
    expect(container.textContent).toContain('320');   // topo do SDR so de julho
  });

  it('o acumulado soma os meses já iniciados e diz quais', () => {
    const t = renderTv('2026-Q3').container.textContent ?? '';
    expect(t).toContain('612');
    expect(t).toContain('Soma de jul/26 + ago/26');
  });

  it('o comparativo é o mesmo em todas as visões', () => {
    const mes = renderTv('2026-07').container.textContent ?? '';
    const acumulado = renderTv('2026-Q3').container.textContent ?? '';
    for (const trecho of ['+22,2% vs jun/26', '−9,1% vs jul/26', '+16,7% vs Q2']) {
      expect(mes).toContain(trecho);
      expect(acumulado).toContain(trecho);
    }
  });

  it('o comparativo ganha uma coluna quando o trimestre ganha um mês', () => {
    const ago = renderTv('2026-07').container.textContent ?? '';
    expect(ago).not.toContain('Setembro');

    // Em setembro sao 5 blocos na faixa (3 meses + acumulado + conversao) —
    // num grid fixo de 4 colunas o quinto cairia fora da area visivel.
    const { container } = renderTv('2026-07', VISOES_SET);
    const abas = abasDe(container);
    const titulos = [...container.querySelectorAll('p')]
      .map(p => p.textContent?.trim())
      .filter(t => ['Julho', 'Agosto', 'Setembro', 'Acumulado', 'Taxa de conversão'].includes(t ?? ''));
    // Descontando as 4 abas do filtro, sobram os 5 blocos do comparativo.
    expect(abas.querySelectorAll('button')).toHaveLength(4);
    expect(titulos).toHaveLength(5);
  });

  it('taxa de conversão é ponta a ponta (lead captado → fechado) do acumulado', () => {
    const t = renderTv('2026-07').container.textContent ?? '';
    // 21 fechados ÷ 612 leads = 3,4% · Q2 fez 18 ÷ 895 = 2,0% → +1,4 p.p.
    expect(t).toContain('3,4%');
    expect(t).toContain('+1,4 p.p. vs Q2');
  });

  it('conversão do card é a do próprio funil, não a ponta a ponta', () => {
    const t = renderTv('2026-07').container.textContent ?? '';
    expect(t).toContain('15,0%');  // SDR: 48 ÷ 320
    expect(t).toContain('22,9%');  // Comercial: 11 ÷ 48
  });

  it('as faixas entram em cascata — cada uma com seu lugar na fila', () => {
    const { container } = renderTv('2026-07');
    const faixas = container.querySelectorAll('.funil-band-enter');
    expect(faixas).toHaveLength(12); // 6 etapas × 2 funis
    const indices = Array.from(faixas).map(f => (f as HTMLElement).style.getPropertyValue('--i'));
    expect(indices.slice(0, 6)).toEqual(['0', '1', '2', '3', '4', '5']);
  });
});
