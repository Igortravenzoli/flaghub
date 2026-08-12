import { describe, expect, it } from 'vitest';

import { getOfficialSprintRange, sprintEndsBetween } from '@/lib/sprintCalendar';

/** Sprint de 14 dias a partir da primeira segunda do ano; termina 11 dias depois. */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dia = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

describe('sprintEndsBetween', () => {
  it('ancora no calendário real: S16-2026 vai de 03/08 a 14/08', () => {
    const r = getOfficialSprintRange('S16-2026')!;
    expect(iso(r.from)).toBe('2026-08-03');
    expect(iso(r.to)).toBe('2026-08-14');
  });

  it('julho inteiro tem três viradas de sprint', () => {
    const ends = sprintEndsBetween(dia('2026-07-01'), dia('2026-07-31'));
    expect(ends.map((e) => `${e.code} ${iso(e.end)}`)).toEqual([
      'S13-2026 2026-07-03',
      'S14-2026 2026-07-17',
      'S15-2026 2026-07-31',
    ]);
  });

  it('o próprio fim da sprint entra quando é o último dia do range', () => {
    const ends = sprintEndsBetween(dia('2026-08-03'), dia('2026-08-14'));
    expect(ends).toHaveLength(1);
    expect(iso(ends[0].end)).toBe('2026-08-14');
  });

  it('range que termina antes da virada não devolve nada', () => {
    expect(sprintEndsBetween(dia('2026-08-03'), dia('2026-08-13'))).toEqual([]);
  });

  it('não devolve virada anterior ao início do range', () => {
    // começa em 18/07, um dia depois do fim de S14 (17/07)
    const ends = sprintEndsBetween(dia('2026-07-18'), dia('2026-07-31'));
    expect(ends.map((e) => e.code)).toEqual(['S15-2026']);
  });

  it('atravessa a virada de ano sem repetir nem travar', () => {
    const ends = sprintEndsBetween(dia('2026-12-01'), dia('2027-02-28'));
    const datas = ends.map((e) => iso(e.end));
    expect(datas).toEqual([...new Set(datas)]);          // sem repetição
    expect(datas).toEqual([...datas].sort());            // em ordem
    expect(ends.length).toBeGreaterThanOrEqual(5);
  });

  it('um dia só, fora de virada, não devolve nada', () => {
    expect(sprintEndsBetween(dia('2026-08-05'), dia('2026-08-05'))).toEqual([]);
  });
});
