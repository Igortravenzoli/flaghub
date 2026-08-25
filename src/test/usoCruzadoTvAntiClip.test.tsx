import { render, screen } from '@testing-library/react';
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
 * Este arquivo existe para a terceira vez não acontecer.
 */

vi.mock('@/hooks/useFabricaRoster', () => ({
  useFabricaRoster: () => ({
    data: ['K8', 'FLEXX', 'STAGING', 'APP', 'INFRA', 'DESIGN', 'QUALIDADE', 'PRODUTOS'].map((squad) => ({
      colaborador: `dev ${squad}`,
      squad,
      papel: 'dev',
      ativo: true,
      capacidade_h_dia: 8,
      conta_horas: true,
    })),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useColaboradorAusencias', () => ({
  useColaboradorAusencias: () => ({ data: [] }),
}));

import { UsoCruzadoCard } from '@/components/fabrica/UsoCruzadoCard';

const GRUPOS = ['K8', 'FLEXX', 'STAGING', 'APP', 'INFRA', 'DESIGN', 'QUALIDADE', 'PRODUTOS'];

// Uma linha de horas por grupo, para que nenhuma seja filtrada por "sem dado".
const fabricaRows = GRUPOS.map((g) => ({
  key: g,
  collaborators: [{ name: `dev ${g}`, minutes: 600 }],
}));

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

  it('mostra as 8 linhas (4 fábricas + 4 áreas) sem esconder nenhuma', () => {
    montar({ compact: true, fill: true });

    for (const g of GRUPOS) expect(screen.getByTitle(g)).toBeInTheDocument();
    expect(screen.getByText('áreas de apoio')).toBeInTheDocument();
    // Nada foi cortado, então não existe rodapé de excedente.
    expect(screen.queryByText(/não exibida/)).not.toBeInTheDocument();
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
});
