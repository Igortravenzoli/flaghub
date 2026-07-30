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
