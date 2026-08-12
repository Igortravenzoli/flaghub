import { describe, expect, it } from 'vitest';

import { consolidarApontamentos } from '@/hooks/useFabricaKpis';

/**
 * Regressão da validação TIMELOG × FlagHub de 07/2026.
 *
 * O FlagHub replica no DevOps o apontamento que veio do VDESK (nota "Lançamento
 * automatizado FlagHub"). O card "Horas por Colaborador" somava as duas fontes e
 * dobrava exatamente quem usa a automação — Anderson, Carlos, Emerson, Klélbio e
 * Thales tinham 476 h no VDESK e AS MESMAS 476 h no DevOps.
 */

/** Mapa canônico real: `devops_collaborator_map` cobre os logins curtos do VDESK. */
const MAPA: Record<string, string> = {
  anderson: 'Anderson S. dos Santos',
  'anderson s. dos santos': 'Anderson S. dos Santos',
  carlos: 'Carlos Nunes',
  'carlos nunes': 'Carlos Nunes',
  'emerson luis': 'Emerson L. Baldana',
  'emerson l. baldana': 'Emerson L. Baldana',
};
const canonical = (raw: string | null | undefined) =>
  MAPA[(raw ?? '').trim().toLowerCase()] ?? (raw ?? '').trim();

const horas = (rows: ReturnType<typeof consolidarApontamentos>, nome: string) =>
  rows.filter((r) => r.name === nome).reduce((s, r) => s + r.consolidado, 0) / 60;

describe('consolidarApontamentos', () => {
  it('não conta duas vezes a hora que o FlagHub replicou do VDESK para o DevOps', () => {
    const rows = consolidarApontamentos(
      [{ work_item_id: 16255, user_name: 'Carlos Nunes', time_minutes: 366 }],
      [{ task_devops: 16255, usuario_vdesk: 'Carlos', tempo_segundos: 365 * 60 }],
      canonical,
    );

    expect(rows).toHaveLength(1);
    // soma daria 731 min; o correto é o maior dos dois lados
    expect(rows[0].consolidado).toBe(366);
    expect(rows[0].devops).toBe(366);
    expect(rows[0].vdesk).toBe(365);
  });

  it('casa o login curto do VDESK com o nome canônico do DevOps', () => {
    const rows = consolidarApontamentos(
      [{ work_item_id: 15582, user_name: 'Emerson L. Baldana', time_minutes: 152 }],
      [{ task_devops: 15582, usuario_vdesk: 'Emerson Luis', tempo_segundos: 151 * 60 }],
      canonical,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Emerson L. Baldana');
    expect(rows[0].consolidado).toBe(152);
  });

  it('preserva quem aponta só num dos lados', () => {
    const rows = consolidarApontamentos(
      [{ work_item_id: 16883, user_name: 'Ana Luiza J. Figueiredo', time_minutes: 720 }],
      [{ task_devops: 16530, usuario_vdesk: 'Anderson', tempo_segundos: 480 * 60 }],
      canonical,
    );

    expect(horas(rows, 'Ana Luiza J. Figueiredo')).toBe(12);
    expect(horas(rows, 'Anderson S. dos Santos')).toBe(8);
  });

  it('consolida por work item, não por colaborador — tarefas distintas somam', () => {
    const rows = consolidarApontamentos(
      [
        { work_item_id: 100, user_name: 'Carlos Nunes', time_minutes: 120 },
        { work_item_id: 200, user_name: 'Carlos Nunes', time_minutes: 60 },
      ],
      [
        { task_devops: 100, usuario_vdesk: 'Carlos', tempo_segundos: 120 * 60 },
        // 300 só existe no VDESK: entra inteiro
        { task_devops: 300, usuario_vdesk: 'Carlos', tempo_segundos: 90 * 60 },
      ],
      canonical,
    );

    // 120 (consolidado) + 60 (só devops) + 90 (só vdesk) = 270 min
    expect(horas(rows, 'Carlos Nunes') * 60).toBe(270);
  });

  it('ignora apontamento sem work item em vez de agrupar tudo num balde', () => {
    const rows = consolidarApontamentos(
      [
        { work_item_id: null, user_name: 'Carlos Nunes', time_minutes: 999 },
        { work_item_id: 100, user_name: 'Carlos Nunes', time_minutes: 60 },
      ],
      [],
      canonical,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].taskId).toBe(100);
    expect(rows[0].consolidado).toBe(60);
  });
});
