import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContagem } from '@/hooks/useContagem';
import { fmtDias } from '@/lib/slaFormat';

/**
 * Contagem animada dos números do telão.
 *
 * O teste que mais importa aqui é o da REDE DE SEGURANÇA: `requestAnimationFrame`
 * não dispara em aba oculta (o navegador para de compositar). Sem a rede, um
 * telão numa aba de fundo exibiria 0,00d para sempre — o defeito foi medido no
 * mock antes de virar código, e este arquivo existe para ele não voltar.
 */

function Sonda({ valor, ativo = true }: { valor: number | null; ativo?: boolean }) {
  const v = useContagem(valor, { duracaoMs: 900, ativo });
  return <span data-testid="v">{fmtDias(v)}</span>;
}

const texto = () => screen.getByTestId('v').textContent;

/** Silencia o rAF: é exatamente o que o navegador faz com a aba escondida. */
function abaOculta() {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
}

/** rAF controlado: cada `avanca(ms)` entrega um quadro naquele instante. */
function abaVisivel() {
  let pendentes: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pendentes.push(cb);
    return pendentes.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  return (ms: number) => {
    const fila = pendentes;
    pendentes = [];
    act(() => { fila.forEach((cb) => cb(performance.now() + ms)); });
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useContagem', () => {
  it('REDE DE SEGURANÇA: sem requestAnimationFrame (aba oculta) o valor final aparece assim mesmo', () => {
    abaOculta();
    render(<Sonda valor={5.5} />);
    // durante a animação o número parte de zero...
    expect(texto()).toBe('0,00d');
    // ...e mesmo sem NENHUM quadro de rAF, a rede entrega o valor verdadeiro
    act(() => { vi.advanceTimersByTime(900 + 250 + 10); });
    expect(texto()).toBe('5,50d');
  });

  it('anima de zero até o valor quando a aba está visível', () => {
    const avanca = abaVisivel();
    render(<Sonda valor={5.5} />);
    expect(texto()).toBe('0,00d');

    avanca(450);                       // metade da duração
    const meio = texto()!;
    expect(meio).not.toBe('0,00d');
    expect(meio).not.toBe('5,50d');    // ainda a caminho

    avanca(900);                       // fim
    expect(texto()).toBe('5,50d');     // fecha no valor EXATO, não no interpolado
  });

  it('sem base (null) passa direto para o traço, sem animar', () => {
    abaOculta();
    render(<Sonda valor={null} />);
    expect(texto()).toBe('—');
  });

  it('respeita prefers-reduced-motion mostrando o número de imediato', () => {
    abaOculta();
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('reduced-motion'), media: q, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    render(<Sonda valor={5.5} />);
    expect(texto()).toBe('5,50d');
  });

  it('ativo=false entrega o valor direto (fora do modo TV a contagem é ruído)', () => {
    abaOculta();
    render(<Sonda valor={5.5} ativo={false} />);
    expect(texto()).toBe('5,50d');
  });

  it('valor repetido não reanima — o refetch do kiosk não pode fazer o painel dançar', () => {
    abaOculta();
    const { rerender } = render(<Sonda valor={5.5} />);
    act(() => { vi.advanceTimersByTime(1200); });
    expect(texto()).toBe('5,50d');

    rerender(<Sonda valor={5.5} />);   // mesmo número, novo render
    expect(texto()).toBe('5,50d');     // não voltou a zero
  });

  it('valor novo parte do anterior, não de zero', () => {
    const avanca = abaVisivel();
    const { rerender } = render(<Sonda valor={5.5} />);
    avanca(900);
    expect(texto()).toBe('5,50d');

    rerender(<Sonda valor={6} />);
    const primeiro = texto()!;
    // 5,50 → 6,00 percorre a diferença; nunca despenca para 0,00
    expect(primeiro).not.toBe('0,00d');
    avanca(900);
    expect(texto()).toBe('6,00d');
  });
});
