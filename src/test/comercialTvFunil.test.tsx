import { render, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ComercialTvView } from '@/components/comercial/ComercialTvView';

/**
 * Comercial no telão — UMA tela com tudo (19/08/2026).
 *
 * O que estes testes travam:
 *  • funis + operação numa tela só, sem paginação — e SEM a faixa de
 *    comparativo (Julho/Agosto/Acumulado/Taxa de conversão saiu em 20/08);
 *  • título SEM nome de pessoa (o modelo dizia "Funil SDR — Arthur");
 *  • as visões do trimestre como abas CLICÁVEIS, não páginas da rotação;
 *  • nenhum trimestre escrito em rótulo — a virada do Q4 não pode pedir build;
 *  • os tetos de produtos e alertas DECLARADOS: o container é overflow-hidden,
 *    então item cortado em silêncio seria "cobri tudo" mentindo.
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

// 9 produtos e 7 alertas de proposito: os tetos da tela sao 8 e 6 (subiram em
// 20/08, quando a faixa de comparativo saiu e a operação ficou com a altura).
// `execCalls` grava a janela pedida ao hook — desde 20/08 a aba de período
// governa a tela toda, então trocar de aba TEM de mudar a janela da operação.
const { execCalls } = vi.hoisted(() => ({ execCalls: [] as Array<[Date, Date]> }));
vi.mock('@/hooks/useComercialExecutivo', () => ({
  useComercialExecutivo: (from: Date, to: Date) => (execCalls.push([from, to]), {
    movimento: { ganhos: 6, perdas: 3, saldo: 3, valorPerdido: 0 },
    receita: { total: 0, negocios: 0, orgs: 0 },
    produtos: [
      { nome: 'ConnectMerchan', metaQty: 10, realQty: 12, pct: 118 },
      { nome: 'Flag ERP', metaQty: 20, realQty: 16, pct: 82 },
      { nome: 'Broker', metaQty: 14, realQty: 10, pct: 71 },
      { nome: 'FlexxPromo', metaQty: 17, realQty: 7, pct: 41 },
      { nome: 'Flag Analytics', metaQty: 8, realQty: 2, pct: 25 },
      { nome: 'Flag Pay', metaQty: 5, realQty: 5, pct: 100 },
      { nome: 'Flexx Power', metaQty: 6, realQty: 3, pct: 50 },
      { nome: 'Portal RH', metaQty: 4, realQty: 1, pct: 25 },
      { nome: 'Flag BI', metaQty: 3, realQty: 3, pct: 100 },
    ],
    satisfacao: { nota: 4.3, csat: 87, respostas: 34, detratores: 2, detratoresNomes: ['Alfa', 'Beta'] },
    alertas: [
      { texto: 'FlexxPromo: 41% da meta (7/17)', nivel: 'alto' },
      { texto: 'Flag Analytics: 25% da meta (2/8)', nivel: 'alto' },
      { texto: '3 perdas de cliente no periodo', nivel: 'alto' },
      { texto: '2 clientes detratores na pesquisa', nivel: 'medio' },
      { texto: 'Portal RH: 25% da meta (1/4)', nivel: 'alto' },
      { texto: 'Flexx Power: 50% da meta (3/6)', nivel: 'medio' },
      { texto: 'Broker: 71% da meta (10/14)', nivel: 'medio' },
    ],
    isLoading: false,
  }),
}));

// Relógio injetado: 18/08/2026 → Q3 vigente com Julho, Agosto e Acumulado
// (setembro não iniciou). O teste de setembro injeta 30/09.
const HOJE = new Date(2026, 7, 18);

const renderTv = (visaoInicial?: string, hoje = HOJE) =>
  render(
    <ComercialTvView
      qKeyInicial="2026-Q3"
      hoje={hoje}
      clientesAtivos={128}
      clientesBloqueados={9}
      visaoInicial={visaoInicial}
    />,
  );

/** As abas — "Julho" também é rótulo de bloco no comparativo. */
const abasDe = (container: HTMLElement) =>
  container.querySelector('[aria-label="Visão exibida"]') as HTMLElement;

describe('ComercialTvView — o Comercial inteiro numa tela', () => {
  it('traz funis, operação e abas numa tela — sem a faixa de comparativo', () => {
    const t = renderTv('2026-07').container.textContent ?? '';
    for (const bloco of [
      'Funil SDR', 'Funil Comercial',
      'Carteira e movimento', 'Produtos · meta × realizado', 'Satisfação', 'Alertas',
      'Julho', 'Agosto', 'Acumulado', // abas do trimestre continuam no topo
    ]) {
      expect(t).toContain(bloco);
    }
    // O comparativo saiu em 20/08 (pedido do Igor): sem taxa ponta a ponta,
    // sem KPIs mensais "fechadas" e sem referência ao trimestre anterior.
    expect(t).not.toContain('Taxa de conversão');
    expect(t).not.toMatch(/vs Q2/);
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
    expect(t).toContain('12/10');                 // realizado/meta visível na linha (20/08)
    expect(t).toContain('+1 produto');            // 9 produtos, teto de 8
    expect(t).toContain('+1 ponto de atenção');   // 7 alertas, teto de 6
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

  it('a aba de período governa a operação toda, não só o funil (decisão 20/08)', () => {
    const { container } = renderTv('2026-07');
    // render inicial: janela = julho inteiro
    const [f1, t1] = execCalls[execCalls.length - 1];
    expect([f1.getFullYear(), f1.getMonth(), f1.getDate()]).toEqual([2026, 6, 1]);
    expect([t1.getMonth(), t1.getDate()]).toEqual([6, 31]);

    // ...e a janela é DECLARADA no título dos blocos janelados
    expect(container.textContent).toContain('Produtos · meta × realizado · jul/26');
    expect(container.textContent).toContain('Alertas · jul/26');

    fireEvent.click(within(abasDe(container)).getByText('Acumulado'));
    // acumulado Q3 em agosto: jul + ago → 01/07 a 31/08
    const [f2, t2] = execCalls[execCalls.length - 1];
    expect([f2.getMonth(), f2.getDate()]).toEqual([6, 1]);
    expect([t2.getMonth(), t2.getDate()]).toEqual([7, 31]);
    expect(container.textContent).toContain('Produtos · meta × realizado · Q3 2026');
  });

  it('em setembro a aba nova entra sem estourar o layout (abas = meses + acumulado)', () => {
    const ago = renderTv('2026-07').container.textContent ?? '';
    expect(ago).not.toContain('Setembro');

    const { container } = renderTv('2026-07', new Date(2026, 8, 30));
    const abas = abasDe(container);
    expect(abas.querySelectorAll('button')).toHaveLength(4);
    expect(within(abas).getByText('Setembro')).toBeInTheDocument();
  });

  it('seletor de trimestre: ‹ recalcula abas, funil e operação; › tem teto no vigente', () => {
    const { container } = renderTv();
    const voltar = container.querySelector('[aria-label="Trimestre anterior"]') as HTMLButtonElement;
    const avancar = container.querySelector('[aria-label="Próximo trimestre"]') as HTMLButtonElement;

    // No vigente o avançar é teto (desabilitado); o selo mostra o Q3
    expect(avancar.disabled).toBe(true);
    expect(container.textContent).toContain('Q3 2026 · jul–set');

    fireEvent.click(voltar);

    // Q2 fechado: selo, 3 meses + acumulado, funil somando o trimestre inteiro
    expect(container.textContent).toContain('Q2 2026 · abr–jun');
    const abas = abasDe(container);
    expect(abas.querySelectorAll('button')).toHaveLength(4);
    expect(within(abas).getByText('Abril')).toBeInTheDocument();
    expect(within(abas).getByText('Acumulado').getAttribute('aria-current')).toBe('true');
    expect(container.textContent).toContain('895');   // topo SDR Q2 = 300+290+305
    // operação segue a janela do trimestre exibido: abr–jun
    const [f, t] = execCalls[execCalls.length - 1];
    expect([f.getMonth(), f.getDate()]).toEqual([3, 1]);
    expect([t.getMonth(), t.getDate()]).toEqual([5, 30]);

    // ...e dá para voltar ao vigente
    expect(avancar.disabled).toBe(false);
    fireEvent.click(avancar);
    expect(container.textContent).toContain('Q3 2026 · jul–set');
    expect(avancar.disabled).toBe(true);
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
