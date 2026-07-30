import { render } from '@testing-library/react';
import { avaliarVariacao, fmtVariacao, arredondaVariacao, COR_TOM } from '@/lib/variacao';
import { DeltaBadge } from '@/components/executivo/DeltaBadge';
import { HEALTH_COLORS } from '@/lib/chartColors';

// O bug corrigido: o DeltaBadge antigo fazia `cor = pct > 0 ? verde : vermelho`,
// então "TTR caiu 12%" (MELHORA de um indicador menor-é-melhor) saía VERMELHO e
// "TTR subiu 12%" saía VERDE. Aqui a seta vem da DIREÇÃO e a cor vem do TOM.

// ── Bloco A — sinal da variação (a maior chance de erro silencioso) ─────

describe('avaliarVariacao — direção × tom', () => {
  it('TTR caindo é MELHORA: negativo com menorMelhor=true → tom bom, seta para baixo', () => {
    expect(avaliarVariacao(-12.53, true)).toEqual({ tom: 'bom', direcao: 'desce' });
  });

  it('TTR subindo é PIORA: positivo com menorMelhor=true → tom ruim, seta para cima', () => {
    // o inverso do teste acima; um `!` trocado passaria no primeiro e falharia aqui
    expect(avaliarVariacao(4.64, true)).toEqual({ tom: 'ruim', direcao: 'sobe' });
  });

  it('%24h subindo é MELHORA e caindo é PIORA (menorMelhor=false)', () => {
    expect(avaliarVariacao(6.3, false)).toEqual({ tom: 'bom', direcao: 'sobe' });
    expect(avaliarVariacao(-2.6, false)).toEqual({ tom: 'ruim', direcao: 'desce' });
  });

  it('variação exatamente 0 é neutra (cinza), nunca verde — 0 é dado, não ausência', () => {
    expect(avaliarVariacao(0, true)).toEqual({ tom: 'neutro', direcao: 'igual' });
    expect(avaliarVariacao(0, false)).toEqual({ tom: 'neutro', direcao: 'igual' });
  });

  it('null / undefined / NaN devolvem null (sem base), não 0', () => {
    expect(avaliarVariacao(null, true)).toBeNull();
    expect(avaliarVariacao(undefined, true)).toBeNull();
    expect(avaliarVariacao(NaN, true)).toBeNull();
  });
});

// ── Bloco B — unidades (% vs p.p.) ─────────────────────────────────────

describe('fmtVariacao — unidade e sinal', () => {
  it('% cola no número, com vírgula pt-BR e sinal só nos positivos', () => {
    expect(fmtVariacao(-12.5, '%')).toBe('−12,5%');
    expect(fmtVariacao(12.5, '%')).toBe('+12,5%');
  });

  it('p.p. leva espaço — garante que não é impresso como %', () => {
    expect(fmtVariacao(6.3, 'p.p.')).toBe('+6,3 p.p.');
    expect(fmtVariacao(-2.6, 'p.p.')).toBe('−2,6 p.p.');
  });

  it('dias colam no número, como o %', () => {
    expect(fmtVariacao(0.5, 'd')).toBe('+0,5d');
  });

  it('zero sai sem sinal', () => {
    expect(fmtVariacao(0, '%')).toBe('0,0%');
  });
});

describe('arredondaVariacao', () => {
  it('arredonda ANTES da decisão de cor: −0,04 vira 0 (neutro), não −0,0 vermelho', () => {
    expect(arredondaVariacao(-0.04, 1)).toBe(0);
    // e o −0 é normalizado, senão fmtVariacao imprimiria "−0,0%"
    expect(Object.is(arredondaVariacao(-0.04, 1), -0)).toBe(false);
    expect(avaliarVariacao(arredondaVariacao(-0.04, 1), true)).toEqual({ tom: 'neutro', direcao: 'igual' });
    expect(fmtVariacao(arredondaVariacao(-0.04, 1)!, '%')).toBe('0,0%');
  });

  it('null/NaN continuam null', () => {
    expect(arredondaVariacao(null)).toBeNull();
    expect(arredondaVariacao(NaN)).toBeNull();
  });
});

// ── DeltaBadge renderizado ─────────────────────────────────────────────
// jsdom normaliza hsl() para rgb() e DESCARTA `hsl(var(--token))` (parser de CSS
// não resolve custom property). Então: cor é comparada sempre normalizada pelo
// mesmo caminho, e a semântica é asseverada por `data-tom`.

/** Passa a cor pelo parser do jsdom, do mesmo jeito que o React faz no elemento. */
const corNormalizada = (valor: string) => {
  const probe = document.createElement('span');
  probe.style.color = valor;
  return probe.style.color;
};
const corDe = (el: HTMLElement) => el.style.color;
const tomDe = (el: HTMLElement) => el.getAttribute('data-tom');

describe('DeltaBadge — render', () => {
  it('TTR de 3,42 vs 3,91 (variacaoPct −12,6, menorMelhor) sai VERDE com seta para baixo', () => {
    const { container } = render(
      <DeltaBadge variacao={-12.6} menorMelhor unidade="%" />
    );
    const span = container.querySelector('span')!;
    expect(span.textContent).toBe('−12,6%');
    expect(container.querySelector('.lucide-trending-down')).not.toBeNull();
    expect(tomDe(span)).toBe('bom');
    expect(corDe(span)).toBe(corNormalizada(HEALTH_COLORS.verde));
    expect(span.getAttribute('aria-label')).toContain('melhora');
  });

  it('TTR subindo sai VERMELHO com seta para cima', () => {
    const { container } = render(<DeltaBadge variacao={12.6} menorMelhor unidade="%" />);
    const span = container.querySelector('span')!;
    expect(container.querySelector('.lucide-trending-up')).not.toBeNull();
    expect(tomDe(span)).toBe('ruim');
    expect(corDe(span)).toBe(corNormalizada(HEALTH_COLORS.vermelho));
    expect(span.getAttribute('aria-label')).toContain('piora');
  });

  it('%24h subindo sai VERDE e imprime p.p.', () => {
    const { container } = render(
      <DeltaBadge variacao={6.3} menorMelhor={false} unidade="p.p." />
    );
    const span = container.querySelector('span')!;
    expect(span.textContent).toBe('+6,3 p.p.');
    expect(tomDe(span)).toBe('bom');
    expect(corDe(span)).toBe(corNormalizada(HEALTH_COLORS.verde));
  });

  it('%24h caindo sai VERMELHO — prova que menorMelhor do contrato é lido', () => {
    const { container } = render(
      <DeltaBadge variacao={-6.3} menorMelhor={false} unidade="p.p." />
    );
    const span = container.querySelector('span')!;
    expect(tomDe(span)).toBe('ruim');
    expect(corDe(span)).toBe(corNormalizada(HEALTH_COLORS.vermelho));
  });

  it('variacao null: "—" com Minus, tom sem-base e NENHUM dígito (null nunca vira 0)', () => {
    const { container } = render(<DeltaBadge variacao={null} menorMelhor unidade="%" />);
    const span = container.querySelector('span')!;
    expect(span.textContent).toBe('—');
    expect(span.textContent).not.toMatch(/[0-9]/);
    expect(container.querySelector('.lucide-minus')).not.toBeNull();
    expect(tomDe(span)).toBe('sem-base');
  });

  it('semBaseTexto customizado ("sem base") é o que os cards de SLA usam', () => {
    const { container } = render(
      <DeltaBadge variacao={null} menorMelhor unidade="%" semBaseTexto="sem base" />
    );
    expect(container.querySelector('span')!.textContent).toBe('sem base');
  });

  it('variacao 0 é neutra: Minus, tom neutro e texto "0,0%" (não verde)', () => {
    const { container } = render(<DeltaBadge variacao={0} menorMelhor unidade="%" />);
    const span = container.querySelector('span')!;
    expect(span.textContent).toBe('0,0%');
    expect(container.querySelector('.lucide-minus')).not.toBeNull();
    expect(tomDe(span)).toBe('neutro');
    expect(corDe(span)).not.toBe(corNormalizada(HEALTH_COLORS.verde));
  });

  it('neutro=true não julga (tom neutro) mas mantém a seta da direção', () => {
    const { container } = render(
      <DeltaBadge variacao={-12.6} menorMelhor unidade="%" neutro />
    );
    const span = container.querySelector('span')!;
    expect(tomDe(span)).toBe('neutro');
    expect(corDe(span)).not.toBe(corNormalizada(HEALTH_COLORS.verde));
    expect(container.querySelector('.lucide-trending-down')).not.toBeNull();
  });

  it('variacao NaN cai em "sem base", não em "NaN%"', () => {
    const { container } = render(<DeltaBadge variacao={NaN} menorMelhor unidade="%" />);
    expect(container.textContent).not.toMatch(/NaN/);
    expect(container.querySelector('span')!.textContent).toBe('—');
  });

  it('COR_TOM aponta para os tokens de HEALTH_COLORS, sem hex literal', () => {
    expect(COR_TOM.bom).toBe(HEALTH_COLORS.verde);
    expect(COR_TOM.ruim).toBe(HEALTH_COLORS.vermelho);
    expect(COR_TOM.neutro).toBe(HEALTH_COLORS.cinza);
  });
});
