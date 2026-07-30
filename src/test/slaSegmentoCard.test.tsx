import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { GestaoSlaMensalResponse } from '@/hooks/useGestaoKpis';

// O card é presentacional (props in) — só o Sheet de drill-down usa hook, e ele
// não é montado por estes testes. Mockamos o módulo para não precisar de
// QueryClientProvider.
vi.mock('@/hooks/useGestaoKpis', async (orig) => ({
  ...(await orig<typeof import('@/hooks/useGestaoKpis')>()),
  useGestaoSlaNestleDetalhe: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { SlaSegmentoCard } from '@/components/helpdesk/SlaSegmentoCard';

// ── Fixture ────────────────────────────────────────────────────────────

const REFERENCIA = {
  mesAtual: '2026-07',
  mesAnterior: '2026-06',
  ano: 2026,
  inicioMesAtual: '2026-07-01',
  fimJanelaExclusivo: '2026-08-01',
  inicioAno: '2026-01-01',
  hoje: '2026-07-30',
};

/** Nestlé completa: TTR ALERT, 24h OK, INC no rodapé. */
function fixture(over: Record<string, unknown> = {}): GestaoSlaMensalResponse {
  const base: GestaoSlaMensalResponse = {
    success: true, message: 'ok', timestamp: '2026-07-30T12:00:00Z',
    segmento: 'nestle', formulaVersao: 'planilha-cs-v1',
    referencia: REFERENCIA,
    metas: { metaTTRDias: 3.9, metaTTR24hPct: 48, metaDefinida: true },
    ttr: {
      mesAtual: 3.42, mesAnterior: 3.91, variacaoPct: -12.53, variacaoDias: -0.49,
      anual: 4.35, atingiuMetaAnual: false, statusAnual: 'ALERT',
      menorMelhor: true, unidadeVariacao: '%',
    },
    ttr24h: {
      mesAtual: 51.2, mesAnterior: 44.9, variacaoPp: 6.3,
      anual: 48.7, atingiuMetaAnual: true, statusAnual: 'OK',
      menorMelhor: false, unidadeVariacao: 'p.p.',
    },
    abertos: { totalAbertos: 61, maior5Dias: 53, maior30Dias: 9, incMaior5Dias: 23, incMaior30Dias: 7 },
    volumes: { fechadosMesAtual: 131, fechadosMesAnterior: 549, fechadosAno: 3204 },
    qualidade: { ttrNegativoMesAtual: 0, ttrNegativoMesAnterior: 2, ttrNegativoAno: 5, osDuplicadasJanela: 0 },
  };
  return { ...base, ...over } as GestaoSlaMensalResponse;
}

const renderCard = (props: Partial<React.ComponentProps<typeof SlaSegmentoCard>> = {}) =>
  render(
    <SlaSegmentoCard
      titulo="Nestlé"
      data={fixture()}
      isLoading={false}
      isError={false}
      refetch={vi.fn()}
      {...props}
    />
  );

// ── SLA-8: janela visível, não deduzida ────────────────────────────────

describe('SLA-8 — a janela de calendário é VISÍVEL (modo TV: nada só no hover)', () => {
  it('o selo do header traz o mês e diz "fora do filtro"', () => {
    renderCard();
    expect(screen.getByText(/jul\/26 · fora do filtro/)).toBeInTheDocument();
  });

  it('os rótulos de período vêm de referencia.* — jul/26, jun/26 e 2026', () => {
    renderCard();
    expect(screen.getAllByText('jul/26').length).toBeGreaterThan(0);
    expect(screen.getAllByText('jun/26').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2026').length).toBeGreaterThan(0);
  });

  it('virada de janeiro: mesAnterior 2025-12 imprime dez/25', () => {
    renderCard({
      data: fixture({
        referencia: { ...REFERENCIA, mesAtual: '2026-01', mesAnterior: '2025-12' },
      }),
    });
    expect(screen.getAllByText('dez/25').length).toBeGreaterThan(0);
    expect(screen.getAllByText('jan/26').length).toBeGreaterThan(0);
  });

  it('rótulo de cada métrica visível (mês atual / mês anterior / ano)', () => {
    renderCard();
    expect(screen.getAllByText('mês atual').length).toBe(2);   // TTR e 24h
    expect(screen.getAllByText('mês anterior').length).toBe(2);
    expect(screen.getAllByText('ano (média)').length).toBe(2);
  });

  it('título do card não é truncado e nomeia o segmento', () => {
    const { container } = renderCard({ titulo: 'Outras Bandeiras' });
    const titulo = screen.getByText('SLA Outras Bandeiras');
    expect(titulo).toBeInTheDocument();
    expect(titulo.className).not.toContain('truncate');
    expect(container.querySelector('.truncate')).toBeNull();
  });
});

// ── null nunca vira 0 ──────────────────────────────────────────────────

describe('null ≠ 0', () => {
  it('mesAtual null nos dois grupos → "—" e NENHUM "0,00d"/"0,0%" no card', () => {
    const { container } = renderCard({
      titulo: 'Outras Bandeiras',
      data: fixture({
        ttr: {
          mesAtual: null, mesAnterior: 4.12, variacaoPct: null, variacaoDias: null,
          anual: 4.12, atingiuMetaAnual: false, statusAnual: 'ALERT',
          menorMelhor: true, unidadeVariacao: '%',
        },
        ttr24h: {
          mesAtual: null, mesAnterior: 39.8, variacaoPp: null,
          anual: 39.8, atingiuMetaAnual: false, statusAnual: 'CRITICAL',
          menorMelhor: false, unidadeVariacao: 'p.p.',
        },
      }),
    });
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).not.toContain('0,00d');
    expect(container.textContent).not.toContain('0,0%');
  });

  it('variação null renderiza "sem base", não "0,0%"', () => {
    renderCard({
      data: fixture({
        ttr: {
          mesAtual: null, mesAnterior: 4.12, variacaoPct: null, variacaoDias: null,
          anual: 4.12, atingiuMetaAnual: false, statusAnual: 'ALERT',
          menorMelhor: true, unidadeVariacao: '%',
        },
      }),
    });
    expect(screen.getAllByText('sem base').length).toBeGreaterThan(0);
  });

  it('metaTTRDias null → "sem meta" e NENHUM texto "meta ≤"', () => {
    const { container } = renderCard({
      titulo: 'Heineken',
      data: fixture({ metas: { metaTTRDias: null, metaTTR24hPct: null, metaDefinida: false } }),
    });
    expect(screen.getAllByText('sem meta').length).toBe(2);
    expect(container.textContent).not.toContain('meta ≤');
    expect(container.textContent).not.toContain('meta ≥');
  });

  it('incMaior5Dias = 0 (não null) é IMPRESSO como 0 — zero de contagem é verdade', () => {
    renderCard({
      data: fixture({
        abertos: { totalAbertos: 61, maior5Dias: 53, maior30Dias: 9, incMaior5Dias: 0, incMaior30Dias: 0 },
      }),
    });
    expect(screen.getByText(/INC em aberto/)).toBeInTheDocument();
    expect(screen.getByText('> 5 dias:').parentElement?.textContent).toContain('0');
  });
});

// ── o card NÃO recalcula status ────────────────────────────────────────

describe('semáforo vem do gateway, não do front', () => {
  it('anual 4,35 com meta 3,9 e statusAnual="OK" forjado mostra META OK', () => {
    renderCard({
      data: fixture({
        ttr: { ...fixture().ttr, anual: 4.35, statusAnual: 'OK' },
      }),
    });
    // se o front recalculasse a escada, 4,35 > 3,9 daria ALERTA
    expect(screen.getAllByText('META OK').length).toBeGreaterThanOrEqual(1);
  });

  it('os 5 status aparecem com PALAVRA (não só cor)', () => {
    renderCard({ data: fixture({ ttr: { ...fixture().ttr, statusAnual: 'CRITICAL' } }) });
    expect(screen.getByText('CRÍTICO')).toBeInTheDocument();
    expect(screen.getByText('META OK')).toBeInTheDocument();   // ttr24h segue OK
  });

  it('SEM_DADO mostra SEM BASE na pílula', () => {
    renderCard({ data: fixture({ ttr: { ...fixture().ttr, anual: null, statusAnual: 'SEM_DADO' } }) });
    expect(screen.getByText('SEM BASE')).toBeInTheDocument();
  });
});

// ── regra por DADO, não por segmento ───────────────────────────────────

describe('a regra é dirigida pelo DADO, não pelo nome do segmento', () => {
  const semMetaSemInc = {
    metas: { metaTTRDias: null, metaTTR24hPct: null, metaDefinida: false },
    ttr: { ...fixture().ttr, atingiuMetaAnual: null, statusAnual: 'NEUTRO' as const },
    ttr24h: { ...fixture().ttr24h, atingiuMetaAnual: null, statusAnual: 'NEUTRO' as const },
    abertos: { totalAbertos: 34, maior5Dias: 9, maior30Dias: 4, incMaior5Dias: null, incMaior30Dias: null },
  };

  it('metaDefinida=false → pílula SEM META nos dois grupos, sem badge de meta', () => {
    renderCard({ titulo: 'Heineken', data: fixture(semMetaSemInc) });
    expect(screen.getAllByText('SEM META').length).toBe(2);
  });

  it('incMaior* null → rodapé troca para "OS em aberto" e "INC em aberto" desaparece', () => {
    renderCard({ titulo: 'Heineken', data: fixture(semMetaSemInc) });
    expect(screen.getByText(/OS em aberto/)).toBeInTheDocument();
    expect(screen.queryByText(/INC em aberto/)).toBeNull();
  });

  it('um segmento FICTÍCIO com os mesmos dados renderiza igual — prova que não há if por nome', () => {
    const { container: hnk } = renderCard({ titulo: 'Heineken', data: fixture({ ...semMetaSemInc, segmento: 'heineken' }) });
    const textoHnk = hnk.textContent!.replace(/Heineken/g, 'X');
    const { container: novo } = render(
      <SlaSegmentoCard
        titulo="Bandeira Nova"
        data={fixture({ ...semMetaSemInc, segmento: 'outros' })}
        isLoading={false} isError={false} refetch={vi.fn()}
      />
    );
    const textoNovo = novo.textContent!.replace(/Bandeira Nova/g, 'X');
    expect(textoNovo).toBe(textoHnk);
  });
});

// ── estados e rodapé ───────────────────────────────────────────────────

describe('estados obrigatórios', () => {
  it('isLoading: skeleton (nenhum spinner) e o título do card continua visível', () => {
    const { container } = renderCard({ isLoading: true, data: undefined });
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(screen.getByText('SLA Nestlé')).toBeInTheDocument();
  });

  it('isError: mensagem citando a VPN + botão que chama refetch', async () => {
    const refetch = vi.fn();
    renderCard({ isError: true, data: undefined, refetch });
    expect(screen.getByText(/SLA Nestlé — erro ao carregar/)).toBeInTheDocument();
    expect(screen.getByText(/VPN da Flag/)).toBeInTheDocument();
    screen.getByRole('button', { name: /Tentar novamente/i }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it('sem data e sem erro: empty state com instrução (não crash no destructuring)', () => {
    renderCard({ data: undefined });
    expect(screen.getByText(/SLA Nestlé — sem retorno/)).toBeInTheDocument();
  });

  it('volumes todos 0 → frase de empty state com instrução de janela/sincronização', () => {
    renderCard({
      data: fixture({ volumes: { fechadosMesAtual: 0, fechadosMesAnterior: 0, fechadosAno: 0 } }),
    });
    expect(screen.getByText(/sincronização do VDESK/)).toBeInTheDocument();
  });

  it('sinais de qualidade acendem o aviso, citando os dois números', () => {
    const { container } = renderCard({
      data: fixture({
        qualidade: { ttrNegativoMesAtual: 1, ttrNegativoMesAnterior: 0, ttrNegativoAno: 4, osDuplicadasJanela: 4 },
      }),
    });
    expect(container.textContent).toContain('Lançamento inconsistente');
    expect(container.textContent).toContain('4 OS duplicadas na janela do cálculo');
    expect(container.textContent).toContain('1 OS com TTR negativo em jul/26');
  });

  it('qualidade toda 0 NÃO acende aviso nenhum', () => {
    const { container } = renderCard();   // fixture padrão: duplicadas 0, negativo do mês 0
    expect(container.textContent).not.toContain('Lançamento inconsistente');
  });

  it('volumes de OS fechadas aparecem com rótulo de período (modo TV)', () => {
    renderCard();
    expect(screen.getByText(/OS fechadas/)).toBeInTheDocument();
    expect(screen.getByText('3.204')).toBeInTheDocument();
  });
});

describe('drill-down de INC', () => {
  it('sem onDrillInc (modo TV) o rodapé não tem botão', () => {
    const { container } = renderCard();
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('com onDrillInc, clicar em "> 5 dias" chama com filtro inc5 e o total do card', () => {
    const onDrillInc = vi.fn();
    renderCard({ onDrillInc });
    screen.getByText('> 5 dias:').closest('button')!.click();
    expect(onDrillInc).toHaveBeenCalledWith(
      expect.objectContaining({ filtro: 'inc5', totalCard: 23 })
    );
  });

  it('clicar em "> 30 dias" chama com filtro inc30', () => {
    const onDrillInc = vi.fn();
    renderCard({ onDrillInc });
    screen.getByText('> 30 dias:').closest('button')!.click();
    expect(onDrillInc).toHaveBeenCalledWith(
      expect.objectContaining({ filtro: 'inc30', totalCard: 7 })
    );
  });

  it('segmento sem INC não ganha clique nem com onDrillInc (nada a drillar)', () => {
    const { container } = renderCard({
      onDrillInc: vi.fn(),
      data: fixture({
        abertos: { totalAbertos: 34, maior5Dias: 9, maior30Dias: 4, incMaior5Dias: null, incMaior30Dias: null },
      }),
    });
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});
