import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns';

export interface SprintCode {
  num: number;
  year: number;
}

function getFirstSprintStart(year: number): Date {
  const jan1 = new Date(year, 0, 1);
  const day = jan1.getDay();
  const deltaToMonday = (8 - (day === 0 ? 7 : day)) % 7;
  return startOfDay(addDays(jan1, deltaToMonday));
}

export function parseSprintCode(label: string): SprintCode | null {
  const match = label.match(/S(\d+)-(\d{4})/i);
  if (!match) return null;

  const num = Number.parseInt(match[1], 10);
  const year = Number.parseInt(match[2], 10);
  if (!Number.isFinite(num) || !Number.isFinite(year) || num <= 0) return null;

  return { num, year };
}

export function extractSprintCodeFromPath(iterationPath: string | null | undefined): string | null {
  if (!iterationPath) return null;
  const match = iterationPath.match(/S\d+-\d{4}/i);
  return match ? match[0].toUpperCase() : null;
}

export function getOfficialSprintRange(sprintCode: string): { from: Date; to: Date } | null {
  const parsed = parseSprintCode(sprintCode);
  if (!parsed) return null;

  const firstSprintStart = getFirstSprintStart(parsed.year);
  const from = addDays(firstSprintStart, (parsed.num - 1) * 14);
  const to = addDays(from, 11);
  return { from, to };
}

/**
 * Fins de sprint dentro de [from, to], em ordem.
 *
 * Serve para marcar a virada no gráfico de atividade: um pico de lançamentos
 * colado no fim da sprint é a assinatura de quem registra em lote. Com o filtro
 * numa sprint só, o fim coincide com a borda do período e não vale a linha —
 * quem consome decide se desenha.
 */
export function sprintEndsBetween(from: Date, to: Date): Array<{ code: string; end: Date }> {
  const out: Array<{ code: string; end: Date }> = [];
  const inicio = startOfDay(from);
  const fim = startOfDay(to);
  let code = getCurrentOfficialSprintCode(inicio);

  // 27 sprints cobrem mais de um ano — teto só para não girar em falso.
  for (let i = 0; i < 30; i++) {
    const range = getOfficialSprintRange(code);
    if (!range) break;
    if (startOfDay(range.to) > fim) break;
    if (startOfDay(range.to) >= inicio) out.push({ code, end: startOfDay(range.to) });

    const proximo = getCurrentOfficialSprintCode(addDays(range.from, 14));
    const rangeProximo = getOfficialSprintRange(proximo);
    if (!rangeProximo || rangeProximo.from.getTime() <= range.from.getTime()) break;
    code = proximo;
  }
  return out;
}

export function getCurrentOfficialSprintCode(baseDate: Date = new Date()): string {
  const year = baseDate.getFullYear();
  const firstSprintStart = getFirstSprintStart(year);
  const days = differenceInCalendarDays(startOfDay(baseDate), firstSprintStart);
  const sprintNum = days < 0 ? 1 : Math.floor(days / 14) + 1;
  return `S${sprintNum}-${year}`;
}

/**
 * Quarter da sprint pelo mês em que ela TERMINA (regra do gestor:
 * "considerar o final da Sprint"). Jan/Fev/Mar → Q1, Abr/Mai/Jun → Q2, etc.
 * Robusto ao calendário real (usa a data de término), sem hard-code de
 * números de sprint — Q1 cai em S1..S6 naturalmente.
 */
export function quarterFromSprintCode(sprintCode: string): { quarter: number; year: number } | null {
  const range = getOfficialSprintRange(sprintCode);
  if (!range) return null;
  return { quarter: Math.floor(range.to.getMonth() / 3) + 1, year: range.to.getFullYear() };
}

/** Rótulo curto do quarter da sprint, ex.: "Q1". Null se o código for inválido. */
export function quarterLabel(sprintCode: string): string | null {
  const q = quarterFromSprintCode(sprintCode);
  return q ? `Q${q.quarter}` : null;
}

/**
 * Dias úteis (seg–sex) no intervalo [from, to] inclusive. Base da capacidade do
 * período (capacidade = horas/dia × dias úteis). Não considera feriados — a
 * planilha do gestor também não considera.
 */
export function businessDaysBetween(from: Date, to: Date): number {
  const start = startOfDay(from);
  const end = startOfDay(to);
  const days = differenceInCalendarDays(end, start);
  if (days < 0) return 0;
  let count = 0;
  for (let i = 0; i <= days; i++) {
    const dow = addDays(start, i).getDay(); // 0=dom, 6=sáb
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export function formatSprintIntervalLabel(sprintCode: string): string {
  const range = getOfficialSprintRange(sprintCode);
  if (!range) return sprintCode;
  return `${sprintCode} - ${format(range.from, 'dd/MM/yyyy')} a ${format(range.to, 'dd/MM/yyyy')}`;
}
