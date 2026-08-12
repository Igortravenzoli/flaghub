/**
 * Trilha de registro do TimeLog — quando o lançamento chegou ao portal.
 *
 * A coleta roda de 15 em 15 min (`cron.job` sync-devops-timelog), então
 * `ingested_at` tem precisão de ±15 min sobre o momento real do lançamento no
 * DevOps. É o suficiente para a leitura que interessa ao gestor: em que DIA a
 * pessoa registrou o que declarou ter trabalhado.
 */

/**
 * Em 17/07/2026 ~19:15 BRT a tabela devops_time_logs foi recarregada do zero
 * (reseed): TODOS os lançamentos existentes até ali ganharam esse ingested_at.
 * Para essas linhas o momento real do registro é desconhecido — não exibimos
 * badge de atraso nem "após a sprint". A trilha é confiável daí em diante.
 */
export const RECARGA_ESPELHO_MS = Date.parse('2026-07-17T22:30:00Z'); // 19:30 BRT, folga sobre o lote de 19:15

/** true quando o `ingested_at` da linha não é rastreável (veio da recarga). */
export function semTrilha(ingestedAt: string): boolean {
  return new Date(ingestedAt).getTime() <= RECARGA_ESPELHO_MS;
}

/** Dias entre o dia trabalhado (declarado) e o momento do registro no portal. */
export function lagDias(logDate: string, ingestedAt: string): number {
  const [y, m, d] = logDate.split('-').map(Number);
  return Math.floor((new Date(ingestedAt).getTime() - Date.UTC(y, m - 1, d)) / 86400000);
}

/** "2026-07-17" → "17/07" sem passar por new Date (evita o -1 dia do fuso). */
export function fmtDia(logDate: string): string {
  const [, m, d] = logDate.split('-');
  return `${d}/${m}`;
}

/** ISO date (YYYY-MM-DD) de uma Date local, sem passar por toISOString. */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Segunda-feira da semana de `iso` (semana ISO: segunda a domingo). */
export function segundaDaSemana(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // 0 = segunda
  dt.setDate(dt.getDate() - dow);
  return isoLocal(dt);
}
