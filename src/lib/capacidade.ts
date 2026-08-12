/**
 * Capacidade do período com desconto de ausência.
 *
 * A régua do gestor é `horas por dia × dias úteis do período`. Quem está de
 * férias no meio do recorte não estava disponível, então entrava na conta como
 * capacidade fantasma: a squad aparecia com utilização baixa sem ter ninguém
 * ocioso. Aqui a capacidade de cada pessoa passa a ser
 * `horas por dia × (dias úteis do período MENOS dias úteis de ausência dentro
 * dele)`.
 *
 * Fail-open de propósito: pessoa sem vínculo com a lista do RH
 * (`sharepoint_nome` nulo) não tem ausência conhecida e mantém capacidade
 * cheia. Errar para mais é visível (a barra não fecha); errar para menos
 * esconderia trabalho que existe.
 *
 * Datas são tratadas como DIA, sem hora: a origem é meia-noite de Brasília e o
 * que interessa é o calendário, não o instante.
 */
import { businessDaysBetween } from '@/lib/sprintCalendar';

/** Período de ausência de um colaborador (view v_colaborador_ausencias). */
export interface Ausencia {
  colaborador: string;
  tipo: string;
  /** yyyy-mm-dd */
  data_inicio: string;
  /** yyyy-mm-dd, inclusivo */
  data_fim: string;
}

/** "2026-08-06" → Date local no início do dia (sem passar por UTC). */
export function diaLocal(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Dias úteis de uma ausência que caem DENTRO do período — a interseção dos dois
 * intervalos. Fora do período, ausência não desconta nada.
 */
export function diasUteisAusentesNoPeriodo(
  ausencia: Pick<Ausencia, 'data_inicio' | 'data_fim'>,
  from: Date,
  to: Date,
): number {
  const ini = diaLocal(ausencia.data_inicio);
  const fim = diaLocal(ausencia.data_fim);
  if (fim < ini) return 0;
  const start = ini > from ? ini : from;
  const end = fim < to ? fim : to;
  if (end < start) return 0;
  return businessDaysBetween(start, end);
}

/**
 * Total de dias úteis ausentes de uma pessoa no período.
 *
 * Períodos sobrepostos são unidos antes de somar (duas linhas para as mesmas
 * férias contariam o mesmo dia duas vezes e zerariam a capacidade de alguém).
 */
export function diasUteisAusentes(
  ausencias: Pick<Ausencia, 'data_inicio' | 'data_fim'>[],
  from: Date,
  to: Date,
): number {
  if (ausencias.length === 0) return 0;

  const janelas = ausencias
    .map((a) => ({ ini: diaLocal(a.data_inicio), fim: diaLocal(a.data_fim) }))
    .filter((a) => a.fim >= a.ini)
    .sort((a, b) => a.ini.getTime() - b.ini.getTime());

  const unidas: { ini: Date; fim: Date }[] = [];
  for (const janela of janelas) {
    const ultima = unidas[unidas.length - 1];
    if (ultima && janela.ini.getTime() <= ultima.fim.getTime() + 86400000) {
      if (janela.fim > ultima.fim) ultima.fim = janela.fim;
    } else {
      unidas.push({ ...janela });
    }
  }

  return unidas.reduce(
    (total, j) => total + diasUteisAusentesNoPeriodo(
      { data_inicio: isoDia(j.ini), data_fim: isoDia(j.fim) }, from, to,
    ),
    0,
  );
}

/** Date → "yyyy-mm-dd" local (sem toISOString, que joga para UTC). */
export function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Índice colaborador → ausências, para não varrer a lista por pessoa. */
export function indexarAusencias(ausencias: Ausencia[]): Map<string, Ausencia[]> {
  const mapa = new Map<string, Ausencia[]>();
  for (const a of ausencias) {
    const atual = mapa.get(a.colaborador);
    if (atual) atual.push(a);
    else mapa.set(a.colaborador, [a]);
  }
  return mapa;
}

/**
 * Capacidade de uma pessoa no período, em MINUTOS, já descontada a ausência.
 * `diasUteis` vem pronto para não recalcular o mesmo período por pessoa.
 */
export function capacidadeMinutos(
  capacidadeHDia: number,
  diasUteis: number,
  diasAusente = 0,
): number {
  const disponiveis = Math.max(0, diasUteis - diasAusente);
  return (Number(capacidadeHDia) || 0) * disponiveis * 60;
}
