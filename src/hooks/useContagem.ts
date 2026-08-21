import { useEffect, useRef, useState } from 'react';

/**
 * Contagem animada de um número — o "sobe até o valor" dos painéis de telão.
 *
 * Devolve NÚMERO, não texto: quem chama formata com o formatador de sempre
 * (`fmtDias`/`fmtPct`/`fmtInt`), então a animação nunca inventa uma formatação
 * paralela e o último quadro é o valor EXATO do contrato, não o interpolado.
 *
 * Três decisões que não são estilo:
 *
 * 1. **Rede de segurança contra `requestAnimationFrame`.** O navegador PARA de
 *    compositar em aba oculta e o rAF simplesmente não dispara. Sem o
 *    `setTimeout` paralelo (que roda mesmo oculto), um telão aberto numa aba de
 *    fundo exibiria `0,00d` / `0%` para sempre — o pior defeito possível num
 *    painel de parede. Medido no mock de 21/08/2026 antes de virar código.
 *
 * 2. **Reanima só quando o VALOR muda**, nunca a cada render: o refetch de 3 min
 *    do kiosk devolve o mesmo número quase sempre, e reanimar ali faria o painel
 *    "dançar" sozinho na parede sem nada ter acontecido.
 *
 * 3. **A origem é o valor anterior**, não zero. Na montagem conta de 0 (o efeito
 *    de entrada que se quer na troca de setor); numa atualização de 5,50 → 5,52
 *    percorre só a diferença, em vez de despencar a zero e subir de novo.
 *
 * `null`/`undefined` é ausência de base (o `DASH` do contrato) e passa direto,
 * sem animação — animar rumo a "sem dado" não significa nada.
 */

function preferMenosMovimento(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Arranca rápido e assenta no fim — o olho acompanha o último dígito. */
function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export interface OpcoesContagem {
  /** Duração da contagem. 900 ms: rápido o bastante para não atrasar a leitura. */
  duracaoMs?: number;
  /** Atraso antes de começar — escalona os números de um card. */
  atrasoMs?: number;
  /** Desliga a animação (ex.: fora do modo TV, onde ela seria ruído). */
  ativo?: boolean;
}

export function useContagem(
  valor: number | null | undefined,
  { duracaoMs = 900, atrasoMs = 0, ativo = true }: OpcoesContagem = {},
): number | null | undefined {
  const [exibido, setExibido] = useState<number | null | undefined>(valor);
  /** Último valor concluído — origem da próxima contagem. */
  const origem = useRef(0);

  useEffect(() => {
    if (valor == null || !ativo || preferMenosMovimento()) {
      if (valor != null) origem.current = valor;
      setExibido(valor);
      return;
    }

    const de = origem.current;
    const ate = valor;
    if (de === ate) { setExibido(ate); return; }

    let vivo = true;
    let frame = 0;
    const inicio = performance.now() + atrasoMs;

    const concluir = () => {
      if (!vivo) return;
      vivo = false;
      origem.current = ate;
      setExibido(ate);
    };

    // Ver decisão 1 no topo: roda mesmo com a aba oculta.
    const rede = setTimeout(concluir, atrasoMs + duracaoMs + 250);

    const passo = (agora: number) => {
      if (!vivo) return;
      const t = (agora - inicio) / duracaoMs;
      if (t < 0) { frame = requestAnimationFrame(passo); return; }
      if (t >= 1) { clearTimeout(rede); concluir(); return; }
      setExibido(de + (ate - de) * easeOutExpo(t));
      frame = requestAnimationFrame(passo);
    };
    frame = requestAnimationFrame(passo);

    setExibido(de);

    return () => {
      vivo = false;
      clearTimeout(rede);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [valor, duracaoMs, atrasoMs, ativo]);

  return exibido;
}
