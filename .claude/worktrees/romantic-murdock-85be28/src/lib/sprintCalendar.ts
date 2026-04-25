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

export function getCurrentOfficialSprintCode(baseDate: Date = new Date()): string {
  const year = baseDate.getFullYear();
  const firstSprintStart = getFirstSprintStart(year);
  const days = differenceInCalendarDays(startOfDay(baseDate), firstSprintStart);
  const sprintNum = days < 0 ? 1 : Math.floor(days / 14) + 1;
  return `S${sprintNum}-${year}`;
}

export function formatSprintIntervalLabel(sprintCode: string): string {
  const range = getOfficialSprintRange(sprintCode);
  if (!range) return sprintCode;
  return `${sprintCode} - ${format(range.from, 'dd/MM/yyyy')} a ${format(range.to, 'dd/MM/yyyy')}`;
}
