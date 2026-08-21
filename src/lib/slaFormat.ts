import { HEALTH_COLORS } from '@/lib/chartColors';
import type { SlaMensalStatusAnual } from '@/hooks/useGestaoKpis';

/**
 * Formatação e semáforo dos cards de SLA (SLA-3/4/5).
 *
 * REGRA CENTRAL: `null` do contrato é "sem base" e renderiza '—' — NUNCA 0 nem
 * 0,00. A checagem é `v == null` (pega null e undefined) e nunca `??`/`||`
 * sobre o valor, porque 0,00 dia é caso real com DATEDIFF(DAY) e um `||`
 * transformaria esse zero legítimo em '—'.
 *
 * O semáforo NÃO é recalculado aqui: mapeia `statusAnual` do gateway, onde a
 * escada (meta, meta×1,5, meta×0,85) já foi aplicada.
 */

/** Ausência de base. Reservado — nunca usar para zero. */
export const DASH = '—';

const NF_DIAS = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF_UMA = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NF_INT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export const fmtDias = (v: number | null | undefined) => (v == null ? DASH : `${NF_DIAS.format(v)}d`);
export const fmtPct = (v: number | null | undefined) => (v == null ? DASH : `${NF_UMA.format(v)}%`);
export const fmtInt = (v: number | null | undefined) => (v == null ? DASH : NF_INT.format(v));

export const COR_STATUS_ANUAL: Record<SlaMensalStatusAnual, string> = {
  OK: HEALTH_COLORS.verde,
  ALERT: HEALTH_COLORS.amarelo,
  CRITICAL: HEALTH_COLORS.vermelho,
  NEUTRO: HEALTH_COLORS.cinza,
  SEM_DADO: HEALTH_COLORS.cinza,
};

/** Palavra JUNTO da cor: TV a 5 m e daltonismo não leem "verde". */
export const ROTULO_STATUS_ANUAL: Record<SlaMensalStatusAnual, string> = {
  OK: 'META OK',
  ALERT: 'ALERTA',
  CRITICAL: 'CRÍTICO',
  NEUTRO: 'SEM META',
  SEM_DADO: 'SEM BASE',
};

/** Fallback cinza: status desconhecido no JSON não deixa o card sem cor. */
export const corStatus = (s: SlaMensalStatusAnual) => COR_STATUS_ANUAL[s] ?? HEALTH_COLORS.cinza;
export const rotuloStatus = (s: SlaMensalStatusAnual) => ROTULO_STATUS_ANUAL[s] ?? 'SEM BASE';

/**
 * Distância da meta, na direção boa, a partir da qual o resultado deixa de ser
 * "dentro" e passa a ser SUPERAÇÃO. 30% simétrico nos dois sentidos: com meta
 * de 10 dias, ≤ 7 dias é superação; com piso de 55%, ≥ 71,5% é superação.
 */
const FATOR_SUPERACAO = 0.3;

/**
 * Cor de um valor contra a meta — régua de QUATRO estados (21/08/2026, pedido
 * do Igor):
 *
 *   sem meta / sem base → `undefined` (o texto fica na cor normal, branco)
 *   fora da meta ........ vermelho
 *   dentro da meta ...... verde
 *   muito além dela ..... azul (ver `FATOR_SUPERACAO`)
 *
 * Vale para as duas direções: em TTR (menor é melhor) "fora" é ACIMA da meta e
 * superação é bem abaixo; em %24h (maior é melhor) é o espelho.
 *
 * DUAS COISAS QUE ESTA FUNÇÃO NÃO É:
 *
 * 1. Não é o semáforo do contrato. A escada de três degraus do gateway
 *    (meta, meta×1,5, meta×0,85) segue sem réplica aqui, como manda a regra do
 *    topo deste arquivo — é ela que pinta o valor ANUAL, via `statusAnual`.
 *    Esta régua é de EXIBIÇÃO e vale para os valores mensais, que o contrato
 *    não julga.
 * 2. Não inventa alvo. Usa só o que o contrato entrega: `metas.*` e a direção
 *    (`menorMelhor`). Sem meta definida não há julgamento — é o caso `NEUTRO`.
 */
export function corValorVsMeta(
  valor: number | null | undefined,
  meta: number | null | undefined,
  menorMelhor: boolean,
): string | undefined {
  if (valor == null || meta == null) return undefined;

  if (menorMelhor) {
    if (valor > meta) return HEALTH_COLORS.vermelho;
    return valor <= meta * (1 - FATOR_SUPERACAO) ? HEALTH_COLORS.azul : HEALTH_COLORS.verde;
  }
  if (valor < meta) return HEALTH_COLORS.vermelho;
  return valor >= meta * (1 + FATOR_SUPERACAO) ? HEALTH_COLORS.azul : HEALTH_COLORS.verde;
}
