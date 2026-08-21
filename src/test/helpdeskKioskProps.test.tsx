import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

// LAY-4 — contrato do modo TV. Desde 07/08/2026 o kiosk NÃO renderiza mais a
// HelpdeskExecutivoTab encolhida: ele monta a CsTvView (view própria de telão,
// modo fill, 2 páginas — sem provider de rotação renderiza a página 1, Resultado).
// Este arquivo continua documentando por que o dado é `totalMinutos` e não
// `totalHoras`: a CsTvView deriva h:mm e TMA dos MINUTOS BRUTOS, e nada impede
// alguém de "consertar" passando `k.totalHoras * 60` — o que degradaria o TMA.

const semDados = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };

// Os cards de SLA precisam de DADO: sem dado eles caem no estado de erro de VPN
// e o teste deixaria de exercer o contrato cheio da página 1.
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

// Produtividade com gente de FORA do CS de propósito: os endpoints do techlead
// devolvem o time inteiro (sistemas + infra) e a TV do CS precisa recortar.
const cons = (consultor: string, produtividade: number) => ({ consultor, produtividade });
vi.mock('@/hooks/useTechLeadKpis', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useTechLeadKpis')>()),
  useTechLeadPorDia: () => ({
    data: {
      registros: [
        { consultor: 'Ailton', dataRegistro: '2026-07-01', produtividadeDia: 82 },
        { consultor: 'Lucas Ferreira', dataRegistro: '2026-07-01', produtividadeDia: 74 },
        { consultor: 'Marcos', dataRegistro: '2026-07-01', produtividadeDia: 90 },
      ],
    },
    isLoading: false, isError: false, refetch: vi.fn(),
  }),
  useTechLeadConsultorSistemas: () => ({
    data: { consultores: [cons('Ailton', 82), cons('Lucas Ferreira', 74), cons('Marcos', 90)] },
    isLoading: false, isError: false, refetch: vi.fn(),
  }),
  useTechLeadConsultorInfra: () => ({
    data: { consultores: [cons('Bruna', 71)] },
    isLoading: false, isError: false, refetch: vi.fn(),
  }),
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
import { KioskRotationContext } from '@/contexts/KioskRotationContext';
import { DASH } from '@/lib/slaFormat';
import { HEALTH_COLORS } from '@/lib/chartColors';

/**
 * `HEALTH_COLORS.vermelho` é HSL e o jsdom normaliza o style inline para rgb().
 * Em vez de reimplementar a conversão (que envelheceria com a paleta), pinta-se
 * um elemento com a cor e lê-se de volta o que o DOM guardou.
 */
const corNormalizada = (cor: string) => {
  const el = document.createElement('span');
  el.style.color = cor;
  return el.getAttribute('style') ?? '';
};

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

  it('a TV renderiza a view de telão, não a tab de mesa (o Comparativo mensal não volta pelo kiosk)', () => {
    const { container } = render(<HelpdeskKiosk />);
    // As seções <h3> são anatomia da HelpdeskExecutivoTab — na TV não existe nenhuma.
    expect(container.querySelectorAll('h3')).toHaveLength(0);
    expect(container.textContent).not.toContain('Comparativo mensal');
    // Página 1 (Resultado): os 3 blocos de SLA, na ordem, no wrapper padrão BlocoTv.
    expect([...container.querySelectorAll('p.uppercase.tracking-widest')].map((p) => p.textContent))
      .toEqual(['SLA Nestlé', 'SLA Heineken', 'SLA Outras Bandeiras']);
  });

  it('nenhum DashboardFilterBar aparece — a TV não ganha filtro implícito', () => {
    const { container } = render(<HelpdeskKiosk />);
    expect(screen.queryByText('Período')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    // e o escopo fixo do kiosk fica declarado no card de identidade da faixa
    const sub = [...container.querySelectorAll('p')].find((p) => p.textContent?.includes('Panorama'));
    expect(sub?.textContent).toContain('mês atual');
  });

  it('nenhum número da tela sai como undefined/NaN com os dados do kiosk', () => {
    const { container } = render(<HelpdeskKiosk />);
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });

  // ── Refino do card de SLA (21/08/2026) ──────────────────────────────────
  // O que se trava aqui é LEITURA, não estética: o selo precisa estar na
  // célula do número que ele julga, e o backlog envelhecido precisa ser
  // legível sem decorar a frase do rodapé.

  it('o selo de status fica na célula do ANO — que é o número que statusAnual julga', async () => {
    const { container } = render(<HelpdeskKiosk />);
    // os números entram contando (useContagem): espera a contagem assentar —
    // o que de quebra prova que ela CHEGA no valor exato do contrato.
    // (o mock serve o mesmo payload aos 3 segmentos, daí o findAll)
    await screen.findAllByText('4,35d', {}, { timeout: 3000 });

    const selo = [...container.querySelectorAll('div')]
      .find((d) => d.textContent?.trim() === 'ALERTA');
    expect(selo).toBeTruthy();

    // sobe da badge até a célula e confere que ali dentro está o valor anual
    const celula = selo!.closest('div.min-w-0');
    expect(celula).toBeTruthy();
    expect(celula!.textContent).toContain('ano · média');
    expect(celula!.textContent).toContain('4,35d');   // ttr.anual do fixture
    expect(celula!.textContent).not.toContain('3,42d'); // o mês NÃO mora aqui
  });

  it('mês DENTRO da meta fica verde (régua de 4 cores)', async () => {
    const { container } = render(<HelpdeskKiosk />);
    await screen.findAllByText('4,35d', {}, { timeout: 3000 });   // contagem assentou

    // fixture: TTR do mês 3,42d com meta ≤ 3,90d e %24h 51,2% com meta ≥ 48%
    const verde = corNormalizada(HEALTH_COLORS.verde);
    for (const v of ['3,42d', '51,2%']) {
      const el = [...container.querySelectorAll('p')].find((p) => p.textContent === v);
      expect(el, v).toBeTruthy();
      expect(el!.getAttribute('style'), v).toBe(verde);
    }
  });

  it('mês ACIMA da meta fica VERMELHO (caso reportado: Nestlé 5,49d contra 3,90d)', async () => {
    const estourado = {
      ...slaMensal,
      ttr: { ...slaMensal.ttr, mesAtual: 5.49 },          // > meta 3,90 (menor é melhor)
      ttr24h: { ...slaMensal.ttr24h, mesAtual: 31.5 },    // < meta 48 (maior é melhor)
    };
    const mod = await import('@/hooks/useGestaoKpis');
    const spy = vi.spyOn(mod, 'useGestaoSlaMensal').mockReturnValue(
      { data: estourado, isLoading: false, isError: false, refetch: vi.fn() } as never,
    );

    const { container } = render(<HelpdeskKiosk />);
    await screen.findAllByText('5,49d', {}, { timeout: 3000 });

    for (const v of ['5,49d', '31,5%']) {
      const el = [...container.querySelectorAll('p')].find((p) => p.textContent === v);
      expect(el, v).toBeTruthy();
      expect(el!.getAttribute('style'), v).toBe(corNormalizada(HEALTH_COLORS.vermelho));
    }
    spy.mockRestore();
  });

  it('o backlog > 30 dias aparece com etiqueta própria e destaque', () => {
    const { container } = render(<HelpdeskKiosk />);
    const linha = [...container.querySelectorAll('p')]
      .find((p) => p.textContent?.startsWith('Em aberto'));
    expect(linha).toBeTruthy();
    expect(linha!.textContent).toContain('há mais de 30 dias');
    // Nestlé conta INC do ServiceNow: a fonte é declarada para 7 e 23 não serem
    // comparados com as OS do VDesk das outras bandeiras.
    expect(linha!.textContent).toContain('INC ServiceNow');
    expect(linha!.textContent).toContain('7');       // incMaior30Dias
    expect(linha!.textContent).toContain('23');      // incMaior5Dias
  });

  // ── Recorte do time e limpeza do rodapé (21/08/2026) ───────────────────

  it('a produtividade mostra SÓ os 9 do CS — o time do techlead não vaza para a TV', () => {
    // A produtividade vive na PÁGINA 2 (Operação); sem provider o kiosk para na 1.
    const { container } = render(
      <KioskRotationContext.Provider
        value={{ pagina: 1, paginas: 2, rotacaoLigada: false, pausado: true, registrarPaginas: () => {} }}
      >
        <HelpdeskKiosk />
      </KioskRotationContext.Provider>,
    );
    const bloco = [...container.querySelectorAll('p')]
      .find((p) => p.textContent === 'Produtividade · dias úteis')
      ?.closest('div.p-4');
    expect(bloco).toBeTruthy();
    const txt = bloco!.textContent ?? '';

    expect(txt).toContain('Ailton');
    expect(txt).toContain('Lucas Ferreira');   // entrou no lugar da Bruna
    expect(txt).not.toContain('Marcos');       // fora do CS
    expect(txt).not.toContain('Bruna');        // saiu do time
  });

  it('consultor sem lançamento no techlead aparece com "sem base", não some', () => {
    // O mock do techlead NÃO traz Ricardo, Wilker, Guimaraes, Vagner, Italo,
    // Leandro nem Ronaldo — caso real do Lucas em 21/08: tinha 81 registros de
    // volume e nenhum de produtividade, e sumia da lista.
    const { container } = render(
      <KioskRotationContext.Provider
        value={{ pagina: 1, paginas: 2, rotacaoLigada: false, pausado: true, registrarPaginas: () => {} }}
      >
        <HelpdeskKiosk />
      </KioskRotationContext.Provider>,
    );
    const bloco = [...container.querySelectorAll('p')]
      .find((p) => p.textContent === 'Produtividade · dias úteis')
      ?.closest('div.p-4');
    const txt = bloco!.textContent ?? '';

    // os 9 sempre presentes, mesmo os que a fonte não devolveu
    for (const nome of ['Ailton', 'Lucas Ferreira', 'Ricardo', 'Wilker', 'Guimaraes', 'Vagner', 'Ronaldo']) {
      expect(txt, nome).toContain(nome);
    }
    // quem não tem média entra como '—' (sem base), nunca 0%
    expect(txt).toContain(DASH);
  });

  it('o painel conta os 9 do CS, não os 18 consultores do VDesk', () => {
    const { container } = render(<HelpdeskKiosk />);
    const apoio = [...container.querySelectorAll('p')]
      .find((p) => p.textContent === 'consultores do CS')
      ?.previousElementSibling;
    expect(apoio).toBeTruthy();
    // o mock de useHelpdeskKpis manda totalConsultores: 9 mas só 1 do CS em
    // registrosPorConsultor — o painel segue a lista filtrada, não o total.
    expect(apoio!.textContent).toBe('1');
    expect(container.textContent).not.toContain('consultores do VDesk');
  });

  it('o bloco de sistemas não repete que "nada rola" — o corte já está no header', () => {
    const { container } = render(<HelpdeskKiosk />);
    expect(container.textContent).not.toContain('Na TV nada rola');
  });

  it('sem ServiceNow o rodapé cai para OS e declara o PERCENTUAL do aberto', async () => {
    // Segmento sem incMaior*: o card usa totalAbertos/maior30Dias (9 de 61 = 15%).
    const semInc = { ...slaMensal, abertos: { ...slaMensal.abertos, incMaior5Dias: null, incMaior30Dias: null } };
    const mod = await import('@/hooks/useGestaoKpis');
    const spy = vi.spyOn(mod, 'useGestaoSlaMensal').mockReturnValue(
      { data: semInc, isLoading: false, isError: false, refetch: vi.fn() } as never,
    );

    const { container } = render(<HelpdeskKiosk />);
    const linha = [...container.querySelectorAll('p')]
      .find((p) => p.textContent?.startsWith('Em aberto'));
    expect(linha!.textContent).toContain('15%');
    expect(linha!.textContent).toContain('das 61 abertas');
    expect(linha!.textContent).not.toContain('ServiceNow');
    spy.mockRestore();
  });
});
