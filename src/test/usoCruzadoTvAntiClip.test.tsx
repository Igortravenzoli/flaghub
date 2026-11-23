import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Anti-clip do card Capacidade × Realizado no telão — 25/08/2026.
 *
 * Ao passar a exibir capacidade também das áreas de apoio, a lista foi de 4
 * para 8 linhas e estourou a altura do card na TV. O `justify-center` puro
 * transborda para os DOIS lados quando o conteúdo excede a área: a sobra de
 * cima cobriu o título e a legenda ficou cortada embaixo — a MESMA classe de
 * bug de 20/08/2026 no bloco Produtos do Comercial.
 *
 * Medido no CSS compilado, caixa de 524×286 (a faixa de baixo da FabricaTvView):
 *   antes  → 236px úteis para 282px de conteúdo  (−46px, transborda)
 *   depois → 256px úteis para 222px de conteúdo  (+34px de folga)
 *   e a folga acaba na 10ª linha (9 linhas ainda cabem: +10px) — daí TV_MAX_LINHAS = 9.
 *
 * 11/2026: o organograma passou a ter 12 casas (9 fábricas + 3 áreas). No telão
 * o card mostra só o CONSOLIDADO POR GRUPO — 4 linhas, bem abaixo do teto — e a
 * fábrica aparece como trecho da barra empilhada. Na mesa o grupo abre.
 *
 * Este arquivo existe para a terceira vez não acontecer.
 */

// Sustentação tem uma pessoa a 50% em duas fábricas; as demais, uma por casa.
const CASAS = ['GPS_GO', 'APP', 'PROMO_SUITE', 'ERP_SUST', 'ERP_EVOL', 'IR', 'LAB', 'INFRA', 'STAGING', 'QUALIDADE', 'DESIGN', 'PRODUTOS'];

vi.mock('@/hooks/useFabricaRoster', () => ({
  useFabricaRoster: () => ({
    data: [
      ...['GPS_GO', 'APP', 'PROMO_SUITE', 'ERP_SUST', 'ERP_EVOL', 'IR', 'LAB', 'INFRA', 'STAGING', 'QUALIDADE', 'DESIGN', 'PRODUTOS']
        .map((squad) => ({ colaborador: `dev ${squad}`, squad, papel: 'dev', ativo: true, capacidade_h_dia: 8, conta_horas: true, alocacao_pct: 100 })),
      { colaborador: 'dev dividido', squad: 'APP', papel: 'dev', ativo: true, capacidade_h_dia: 8, conta_horas: true, alocacao_pct: 50 },
      { colaborador: 'dev dividido', squad: 'IR', papel: 'dev', ativo: true, capacidade_h_dia: 8, conta_horas: true, alocacao_pct: 50 },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useColaboradorAusencias', () => ({
  useColaboradorAusencias: () => ({ data: [] }),
}));

import { UsoCruzadoCard } from '@/components/fabrica/UsoCruzadoCard';

// Todo mundo apontou 10 h num Épico do formato anterior; o dividido, 20 h.
const fabricaRows = [{
  key: 'epico:K8',
  collaborators: [
    ...CASAS.map((c) => ({ name: `dev ${c}`, minutes: 600 })),
    { name: 'dev dividido', minutes: 1200 },
  ],
}];

// 03 a 14/08/2026 = 10 dias úteis → 80 h por pessoa cheia.
const periodo = { dateFrom: new Date(2026, 7, 3), dateTo: new Date(2026, 7, 14) };

function montar(props: { compact?: boolean; fill?: boolean }) {
  return render(
    <TooltipProvider>
      <UsoCruzadoCard fabricaRows={fabricaRows} {...periodo} {...props} />
    </TooltipProvider>,
  );
}

/** O miolo do card: o filho do Card que recebe as classes de fill. */
function miolo(container: HTMLElement) {
  return container.querySelector('.flex-1.min-h-0') as HTMLElement;
}

/**
 * A lista de barras (grupos e fábricas). As buscas por nome passam por aqui: a
 * matriz logo abaixo repete os nomes das fábricas e confundiria o teste.
 */
function lista(container: HTMLElement) {
  // Mesa: respiro original; telão: primeiro filho do miolo (lista densa).
  const el = container.querySelector('.space-y-2\\.5') ?? miolo(container).firstElementChild;
  return within(el as HTMLElement);
}

/** Texto da linha (grupo ou fábrica) que tem este rótulo. */
function linhaDe(container: HTMLElement, rotulo: string): string {
  return lista(container).getByText(rotulo).closest('.grid')!.textContent ?? '';
}

describe('UsoCruzadoCard — telão (compact + fill)', () => {
  it('centraliza com safe_center e recorta, nunca com justify-center puro', () => {
    const { container } = montar({ compact: true, fill: true });
    const box = miolo(container);

    // `justify-center` puro é exatamente o que cobria o título.
    expect(box.className).not.toMatch(/(^|\s)justify-center(\s|$)/);
    expect(box.className).toContain('justify-content:safe_center');
    // Sem isso, o que não couber vaza para fora do card em vez de ser cortado.
    expect(box.className).toContain('overflow-hidden');
  });

  it('usa espaçamento denso na lista — é dele que sai a altura recuperada', () => {
    const { container } = montar({ compact: true, fill: true });
    const lista = miolo(container).firstElementChild as HTMLElement;

    expect(lista.className).toContain('space-y-1');
    expect(lista.className).not.toContain('space-y-2.5');
  });

  it('mostra só o consolidado dos grupos: 4 linhas para 12 casas, sem esconder nenhuma', () => {
    const { container } = montar({ compact: true, fill: true });

    for (const g of ['Sustentação', 'Evolução', 'Híbrida', 'Áreas de apoio']) {
      expect(screen.getByText(g)).toBeInTheDocument();
    }
    expect(miolo(container).firstElementChild!.children).toHaveLength(4);
    // Telão não tem mouse: o grupo não abre. A fábrica vira trecho da barra
    // empilhada e uma linha de texto com a utilização, sob o grupo.
    expect(screen.getByTitle('GPS / GO: 10:00')).toBeInTheDocument();
    const gpsGo = lista(container).getByText('GPS / GO');
    expect(gpsGo.closest('p')!.className).toContain('whitespace-nowrap');
    expect(gpsGo.textContent).toContain('13%'); // 10 h de 80 h
    expect(container.querySelector('.rotate-90, [aria-expanded]')).toBeNull();
    expect(screen.queryByText(/Abrir todas as fábricas/)).not.toBeInTheDocument();
    // Nada foi cortado, então não existe rodapé de excedente.
    expect(screen.queryByText(/não exibid/)).not.toBeInTheDocument();
  });

  it('esconde a matriz detalhada — telão não tem mouse para explorar tabela', () => {
    const { container } = montar({ compact: true, fill: true });
    expect(container.querySelector('table')?.closest('div')?.className).toContain('hidden');
  });
});

describe('UsoCruzadoCard — visão de mesa (sem fill)', () => {
  it('mantém o respiro original: a densidade é concessão do telão, não regra geral', () => {
    const { container } = montar({});
    const lista = container.querySelector('.space-y-2\\.5');

    expect(lista).toBeTruthy();
    expect(container.querySelector('.space-y-1')).toBeNull();
    // Fora do fill não há caixa de altura fixa para recortar.
    expect(miolo(container)).toBeNull();
  });

  it('o grupo é a SOMA das fábricas: capacidade pela alocação, hora pela pessoa', () => {
    const { container } = montar({});
    // Sustentação: 4 pessoas cheias (320 h) + meia jornada do dividido (40 h) = 360 h.
    // As 20 h do dividido (APP + I & R) caíram no Épico K8, que não é casa dele:
    // a hora continua dele e divide pelo percentual, 10 h em cada casa (22/11/2026).
    // Realizado da Sustentação = 4 × 10 h + 10 h = 50 h.
    expect(linhaDe(container, 'Sustentação')).toContain('50:00/360:00');
    // Evolução: 4 pessoas cheias (Infra inclusa) + meia = 360 h; realizado 4 × 10 + 10 = 50 h.
    expect(linhaDe(container, 'Evolução')).toContain('50:00/360:00');
    expect(linhaDe(container, 'Híbrida')).toContain('10:00/80:00');
    // 9 fábricas + 3 áreas cheias + 1 dividido = 13 pessoas; nada some no rateio.
    expect(linhaDe(container, 'Áreas de apoio')).toContain('30:00/240:00');
  });

  it('confere à vista que nenhuma hora sumiu: 12 × 10 h + 20 h = 140 h', () => {
    montar({});
    expect(screen.getByTestId('horas-conferencia').textContent).toContain('140:00 de 140:00 lançadas');
  });

  it('abre do grupo para as fábricas, e "ERP" aparece uma vez em cada grupo', () => {
    const { container } = montar({});
    const barras = lista(container);
    // Fechado por padrão: a primeira leitura é o consolidado.
    expect(barras.queryByText('PROMO / SUITE')).not.toBeInTheDocument();

    fireEvent.click(barras.getByText('Sustentação'));
    expect(barras.getByText('PROMO / SUITE')).toBeInTheDocument();
    // APP: 1 pessoa cheia + meia jornada = 120 h; 10 h da pessoa cheia + 10 h do dividido.
    expect(linhaDe(container, 'APP')).toContain('20:00/120:00');
    expect(barras.queryByText('I & R')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Abrir todas as fábricas'));
    expect(barras.getByText('I & R')).toBeInTheDocument();
    expect(barras.getAllByText('ERP')).toHaveLength(2);
    expect(screen.getByText('Recolher grupos')).toBeInTheDocument();
  });

  it('Épico do formato anterior é "a orientar", não cruzado: ninguém tem casa no K8', () => {
    const { container } = montar({});
    // Toda hora foi para o Épico K8, que não é casa de ninguém do organograma.
    expect(container.querySelectorAll('tbody td[data-marca="cruzado"]')).toHaveLength(0);
    // As 12 casas têm hora: todas marcadas como formato anterior na matriz.
    expect(container.querySelectorAll('tbody td[data-marca="anterior"]')).toHaveLength(12);
    expect(screen.getByText('lançado em →', { exact: false })).toBeInTheDocument();
  });
});

describe('UsoCruzadoCard — regra de 22/11/2026: a hora é da pessoa, o lugar vira marca', () => {
  // Uma pessoa do IR: 6 h na área do time, 4 h na área ERP e 2 h soltas na raiz.
  const linhas = [
    { key: 'area:IR', collaborators: [{ name: 'dev IR', minutes: 360 }] },
    { key: 'area:ERP', collaborators: [{ name: 'dev IR', minutes: 240 }] },
    { key: 'nenhum', collaborators: [{ name: 'dev IR', minutes: 120 }] },
  ];

  it('tudo conta no IR; a matriz marca o cruzado e o sem área', () => {
    const { container } = render(
      <TooltipProvider>
        <UsoCruzadoCard fabricaRows={linhas} {...periodo} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByText('Abrir todas as fábricas'));
    expect(linhaDe(container, 'I & R')).toContain('12:00/');
    const marca = (m: string) => [...container.querySelectorAll(`tbody td[data-marca="${m}"]`)].map((td) => td.textContent);
    expect(marca('casa')).toEqual(['6:00']);
    expect(marca('cruzado')).toEqual(['4:00']);
    expect(marca('sem_destino')).toEqual(['2:00']);
    expect(screen.getByTestId('horas-conferencia').textContent).toContain('12:00 de 12:00 lançadas');
  });
});
