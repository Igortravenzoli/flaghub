import { HEALTH_COLORS } from '@/lib/chartColors';

/**
 * Avaliação de variação mês a mês — a parte PURA do `DeltaBadge`.
 *
 * Fica em lib (e não no componente) porque é a regra mais fácil de errar em
 * silêncio de toda a tela e precisa de teste unitário direto.
 */

export type TomVariacao = 'bom' | 'ruim' | 'neutro';

export interface VariacaoAvaliada {
  /** Se o movimento é bom, ruim ou indiferente — vira COR. */
  tom: TomVariacao;
  /** O que o número fez — vira SETA. */
  direcao: 'sobe' | 'desce' | 'igual';
}

/**
 * Direção = o que o número fez; tom = se isso é bom.
 *
 * TTR (menorMelhor=true) caindo é MELHORA → verde com seta para baixo.
 * %24h (menorMelhor=false) caindo é PIORA → vermelho com seta para baixo.
 *
 * É exatamente aqui que um sinal invertido pinta de verde um SLA que piorou:
 * o código anterior fazia `cor = pct > 0 ? verde : vermelho`, o que mostrava
 * "TTR subiu 12%" em verde. Daí os testes dedicados nos dois sentidos.
 *
 * `null`/`undefined`/`NaN` = SEM BASE de comparação — nunca 0.
 */
export function avaliarVariacao(
  valor: number | null | undefined,
  menorMelhor: boolean,
): VariacaoAvaliada | null {
  if (valor == null || !Number.isFinite(valor)) return null;
  if (valor === 0) return { tom: 'neutro', direcao: 'igual' };
  const subiu = valor > 0;
  return { tom: (menorMelhor ? !subiu : subiu) ? 'bom' : 'ruim', direcao: subiu ? 'sobe' : 'desce' };
}

export const COR_TOM: Record<TomVariacao, string> = {
  bom: HEALTH_COLORS.verde,
  ruim: HEALTH_COLORS.vermelho,
  neutro: HEALTH_COLORS.cinza,
};

/**
 * '%' e 'd' colam no número; 'p.p.' leva espaço — é unidade composta, não é
 * "% de %". Negativo sai com o sinal de menos tipográfico (−, U+2212), que
 * alinha melhor em coluna tabular do que o hífen.
 */
export function fmtVariacao(valor: number, unidade: string, casas = 1): string {
  const abs = Math.abs(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
  const sinal = valor > 0 ? '+' : valor < 0 ? '−' : '';
  return unidade === 'p.p.' ? `${sinal}${abs} ${unidade}` : `${sinal}${abs}${unidade}`;
}

/** Arredonda ANTES de decidir sinal/cor: −0,04% não deve virar "−0,0%" vermelho.
 *  Normaliza −0 para 0 para que o formatador nunca imprima "−0,0%". */
export function arredondaVariacao(valor: number | null | undefined, casas = 1): number | null {
  if (valor == null || !Number.isFinite(valor)) return null;
  const fator = 10 ** casas;
  const r = Math.round(valor * fator) / fator;
  return r === 0 ? 0 : r;
}
