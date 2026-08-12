import { describe, expect, it } from 'vitest';

import {
  calcularDiasSobrecarga,
  CAPACIDADE_DIA_HORAS,
  LIMITE_ALERTA_DIA_HORAS,
  LIMITE_ERRO_DIA_HORAS,
} from '@/hooks/useFabricaKpis';

/**
 * Régua de jornada (11/08/2026): capacidade 7 h/dia, alerta acima de 8 h.
 * O apontamento é preservado como foi lançado — isto é sinalização, não saneamento.
 */

const MAPA: Record<string, string> = {
  carlos: 'Carlos Nunes',
  'carlos nunes': 'Carlos Nunes',
};
const canonical = (raw: string | null | undefined) =>
  MAPA[(raw ?? '').trim().toLowerCase()] ?? (raw ?? '').trim();

const dev = (wid: number | null, user: string, dia: string, min: number) =>
  ({ work_item_id: wid, user_name: user, log_date: dia, time_minutes: min });
const vd = (task: number, user: string, dia: string, min: number) =>
  ({ task_devops: task, usuario_vdesk: user, log_date: dia, tempo_segundos: min * 60 });

describe('calcularDiasSobrecarga', () => {
  it('usa 7h de capacidade, 8h de alerta e 12h de suspeita de erro', () => {
    expect(CAPACIDADE_DIA_HORAS).toBe(7);
    expect(LIMITE_ALERTA_DIA_HORAS).toBe(8);
    expect(LIMITE_ERRO_DIA_HORAS).toBe(12);
  });

  it('separa excesso de jornada de suspeita de erro pelo corte de 12h', () => {
    const r = calcularDiasSobrecarga(
      [
        dev(100, 'Alex', '2026-07-22', 9 * 60),        // excesso
        dev(100, 'Ana', '2026-07-20', 30 * 60),        // suspeito
        dev(100, 'Leo', '2026-07-30', 50 * 60),        // suspeito
      ],
      [],
      canonical,
    );
    const suspeitos = r.filter((d) => d.minutes > LIMITE_ERRO_DIA_HORAS * 60);
    expect(suspeitos.map((d) => d.name)).toEqual(['Leo', 'Ana']);
    expect(r.length - suspeitos.length).toBe(1);
  });

  it('não sinaliza jornada normal nem hora extra dentro da folga', () => {
    const r = calcularDiasSobrecarga(
      [
        dev(100, 'Douglas J. Soares', '2026-07-01', 7 * 60),
        dev(100, 'Douglas J. Soares', '2026-07-02', 8 * 60),
      ],
      [],
      canonical,
    );
    expect(r).toEqual([]);
  });

  it('sinaliza o dia somando lançamentos de itens diferentes', () => {
    const r = calcularDiasSobrecarga(
      [
        dev(100, 'Douglas J. Soares', '2026-07-28', 4 * 60),
        dev(200, 'Douglas J. Soares', '2026-07-28', 6 * 60),
      ],
      [],
      canonical,
    );
    expect(r).toEqual([{ name: 'Douglas J. Soares', dia: '2026-07-28', minutes: 600 }]);
  });

  it('pega o lançamento isolado de 30:00 h sem alterá-lo', () => {
    const r = calcularDiasSobrecarga(
      [dev(16934, 'Douglas J. Soares', '2026-07-29', 30 * 60)],
      [],
      canonical,
    );
    expect(r).toHaveLength(1);
    expect(r[0].minutes).toBe(1800);
  });

  it('não dobra a jornada de quem usa a automação VDESK→DevOps', () => {
    // mesma hora replicada nas duas fontes: 6h, não 12h — fica abaixo do limite
    const r = calcularDiasSobrecarga(
      [dev(16255, 'Carlos Nunes', '2026-07-01', 6 * 60)],
      [vd(16255, 'Carlos', '2026-07-01', 6 * 60)],
      canonical,
    );
    expect(r).toEqual([]);
  });

  it('soma tarefas distintas do mesmo dia mesmo com fontes cruzadas', () => {
    const r = calcularDiasSobrecarga(
      [dev(100, 'Carlos Nunes', '2026-07-01', 5 * 60)],
      [vd(200, 'Carlos', '2026-07-01', 5 * 60)],
      canonical,
    );
    expect(r).toEqual([{ name: 'Carlos Nunes', dia: '2026-07-01', minutes: 600 }]);
  });

  it('ordena do pior dia para o menor', () => {
    const r = calcularDiasSobrecarga(
      [
        dev(100, 'Ana', '2026-07-20', 30 * 60),
        dev(100, 'Leo', '2026-07-30', 38 * 60),
        dev(100, 'Alex', '2026-07-22', 9 * 60),
      ],
      [],
      canonical,
    );
    expect(r.map((d) => d.name)).toEqual(['Leo', 'Ana', 'Alex']);
  });

  it('aceita limite customizado', () => {
    const logs = [dev(100, 'Ana', '2026-07-20', 9 * 60)];
    expect(calcularDiasSobrecarga(logs, [], canonical, 10)).toEqual([]);
    expect(calcularDiasSobrecarga(logs, [], canonical, 8)).toHaveLength(1);
  });
});
