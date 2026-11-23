import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { FABRICAS } from '@/lib/fabricaOrganograma';
import {
  avisoForaDoFormato, corFabricaFoto, escoposPorGrupo, FABRICAS_DE_ENTREGA, fabricasDaFoto, formatoDaFoto,
  GRUPOS_DE_ENTREGA, MAX_FABRICAS_FOTO, recortePorFormato, rotuloFabricaFoto, somarEscopos,
} from '@/lib/fabricaFoto';
import { montaColunasQualidade } from '@/components/fabrica/QualidadePorFabricaCharts';
import type { SnapshotScopeBreakdown, SprintSnapshotRow } from '@/hooks/useSprintSnapshots';

/**
 * F2 (23/11/2026): a foto de sprint ganhou `fabricas_org` (fábrica do item pela
 * pessoa) ao lado de `fabricas` (por Épico). Os dois formatos não se somam.
 */

function escopo(total: number, done = 0, entregue = 0, bug = 0, retorno = 0): SnapshotScopeBreakdown {
  return {
    total,
    cats: { priorizacao: 0, priorizacao_transbordo: 0, bug, retorno_qa: retorno, aviao_sprint: 0, aviao_transbordado: 0 },
    entregue: { total: entregue, bug: 0, retorno_qa: 0, priorizacao: 0, aviao: 0 },
    done: { total: done, bug: 0, retorno_qa: 0, priorizacao: 0, aviao: 0 },
    priorizado_done: 0,
    priorizado_em_dev: 0,
  };
}

const anterior = {
  geral: escopo(10),
  fabricas: { '[K8] - Squad': escopo(4, 2), '[APP] - Squad': escopo(3, 1), 'Sem fábrica': escopo(2), 'Dash Dinâmico': escopo(1) },
};
const organograma = {
  ...anterior,
  fabricas_org: { IR: escopo(5, 3), ERP_SUST: escopo(3, 1), QUALIDADE: escopo(1), K8: escopo(1), 'Sem fábrica': escopo(1) },
};

describe('fábricas da foto', () => {
  it('a foto com fabricas_org é do organograma; sem ela, do formato anterior', () => {
    expect(formatoDaFoto(organograma)).toBe('organograma');
    expect(formatoDaFoto(anterior)).toBe('anterior');
    expect(formatoDaFoto(null)).toBe('anterior');
  });

  it('organograma: só fábrica de entrega atual (sem "Sem fábrica", área de apoio nem K8)', () => {
    expect(Object.keys(fabricasDaFoto(organograma)).sort()).toEqual(['ERP_SUST', 'IR']);
  });

  it('formato anterior: Épico limpo e só as squads antigas', () => {
    expect(Object.keys(fabricasDaFoto(anterior)).sort()).toEqual(['APP', 'K8']);
    // A mesma foto lida no formato anterior ignora a chave nova.
    expect(Object.keys(fabricasDaFoto(organograma, 'anterior')).sort()).toEqual(['APP', 'K8']);
  });

  it('nome para a tela: "ERP" diz de qual grupo é; squad antiga volta como veio', () => {
    expect(rotuloFabricaFoto('ERP_SUST')).toBe('ERP · Sustentação');
    expect(rotuloFabricaFoto('IR')).toBe('I & R');
    expect(rotuloFabricaFoto('K8')).toBe('K8');
  });

  it('o teto de colunas cobre as 8 fábricas de entrega', () => {
    expect(FABRICAS_DE_ENTREGA).toEqual(['GPS_GO', 'APP', 'PROMO_SUITE', 'ERP_SUST', 'ERP_EVOL', 'IR', 'LAB', 'STAGING']);
    expect(MAX_FABRICAS_FOTO).toBe(8);
  });
});

describe('janela com os dois formatos', () => {
  const fotos = [
    { sprint_code: 'S21-2026', category_breakdown: anterior },
    { sprint_code: 'S22-2026', category_breakdown: anterior },
    { sprint_code: 'S23-2026', category_breakdown: organograma },
  ];

  it('segue o formato da sprint mais recente e conta quem ficou de fora', () => {
    const r = recortePorFormato(fotos);
    expect(r.formato).toBe('organograma');
    expect(r.fotos.map((f) => f.sprint_code)).toEqual(['S23-2026']);
    expect(r.fora).toBe(2);
    expect(avisoForaDoFormato(r.fora, r.formato)).toBe('2 sprints anteriores ao organograma (foto por Épico) ficaram fora da conta.');
    expect(avisoForaDoFormato(1, 'organograma')).toBe('1 sprint anterior ao organograma (foto por Épico) ficou fora da conta.');
    expect(avisoForaDoFormato(0, 'organograma')).toBe('');
  });

  it('enquanto a última foto é por Épico, nada muda para quem já lia assim', () => {
    const r = recortePorFormato(fotos.slice(0, 2));
    expect(r.formato).toBe('anterior');
    expect(r.fora).toBe(0);
  });

  it('a Qualidade das Fábricas não soma K8 de uma sprint com IR da outra', () => {
    const snaps = Object.fromEntries(fotos.map((f) => [f.sprint_code, { ...f, snapshot_source: null, as_of_datetime: null } as SprintSnapshotRow]));
    const r = montaColunasQualidade(snaps, { groupBy: 'sprint', maxSprints: 6, anoVigente: 2026 });
    expect(r.columns.map((c) => c.label)).toEqual(['S23']);
    expect(Object.keys(r.columns[0].cells).sort()).toEqual(['ERP_SUST', 'IR']);
    expect(r.foraDoFormato).toContain('2 sprints');
  });
});

describe('grupos do organograma (F3)', () => {
  it('só os três grupos com fábrica de entrega, na ordem de leitura', () => {
    expect(GRUPOS_DE_ENTREGA.map((g) => g.id)).toEqual(['SUSTENTACAO', 'EVOLUCAO', 'HIBRIDA']);
  });

  it('o grupo é a soma das fábricas dele (contagens e ids)', () => {
    const a = { ...escopo(5, 3, 1, 1, 0), ids: { entregue: [1], done: [2, 3], bug: [4], retorno_qa: [] } };
    const b = { ...escopo(3, 1, 0, 0, 1), ids: { entregue: [], done: [5], bug: [], retorno_qa: [6] } };
    const s = somarEscopos([a, b])!;
    expect(s.total).toBe(8);
    expect(s.done.total).toBe(4);
    expect(s.cats.bug).toBe(1);
    expect(s.cats.retorno_qa).toBe(1);
    expect(s.ids!.done).toEqual([2, 3, 5]);
    // Parte sem ids (foto antiga) = soma sem ids, nunca ids pela metade.
    expect(somarEscopos([a, escopo(1)])!.ids).toBeUndefined();
    expect(somarEscopos([])).toBeNull();
  });

  it('agrupa a foto: ERP Sustentação na Sustentação, ERP Evolução e I & R na Evolução', () => {
    const g = escoposPorGrupo(fabricasDaFoto(organograma));
    expect(g.SUSTENTACAO?.total).toBe(3);
    expect(g.EVOLUCAO?.total).toBe(5);
    expect(g.HIBRIDA).toBeUndefined();
  });

  it('id de grupo tem nome e cor do grupo', () => {
    expect(rotuloFabricaFoto('EVOLUCAO')).toBe('Evolução');
    expect(corFabricaFoto('SUSTENTACAO')).toBe('hsl(160,55%,38%)');
  });

  it('Qualidade no telão: uma barra por grupo no organograma; por squad no formato anterior', () => {
    const snaps = { 'S23-2026': { sprint_code: 'S23-2026', snapshot_source: null, as_of_datetime: null, category_breakdown: organograma } as SprintSnapshotRow };
    const r = montaColunasQualidade(snaps, { groupBy: 'sprint', maxSprints: 3, anoVigente: 2026, porGrupo: true });
    expect(r.porGrupo).toBe(true);
    expect(Object.keys(r.columns[0].cells).sort()).toEqual(['EVOLUCAO', 'SUSTENTACAO']);
    const antigo = { 'S22-2026': { sprint_code: 'S22-2026', snapshot_source: null, as_of_datetime: null, category_breakdown: anterior } as SprintSnapshotRow };
    const r2 = montaColunasQualidade(antigo, { groupBy: 'sprint', maxSprints: 3, anoVigente: 2026, porGrupo: true });
    expect(r2.porGrupo).toBe(false);
    expect(Object.keys(r2.columns[0].cells).sort()).toEqual(['APP', 'K8']);
  });
});

describe('espelho SQL do organograma', () => {
  /**
   * A régua do item roda no banco (`fn_fabrica_organograma`) e precisa saber o
   * mesmo que `fabricaOrganograma.ts`. Vale a definição da migration MAIS
   * RECENTE que cria a função: mudou o organograma, mudou a migration.
   */
  it('fn_fabrica_organograma tem exatamente as fábricas, flags, ordem e casas no DevOps do TS', () => {
    const dir = resolve(__dirname, '../../supabase/migrations');
    const arquivo = readdirSync(dir)
      .filter((n) => n.endsWith('.sql'))
      .sort()
      .reverse()
      .find((n) => readFileSync(resolve(dir, n), 'utf8').includes('FUNCTION public.fn_fabrica_organograma'));
    expect(arquivo).toBeTruthy();
    const sql = readFileSync(resolve(dir, arquivo!), 'utf8');
    const corpo = sql.slice(sql.indexOf('FUNCTION public.fn_fabrica_organograma'));
    const re = /\('([A-Z0-9_]+)',\s*(true|false),\s*(true|false),\s*(\d+),\s*(NULL(?:::text)?|'[^']*'),\s*ARRAY\[([^\]]*)\]/g;
    const noBanco = [...corpo.slice(0, corpo.indexOf('$function$;')).matchAll(re)].map((m) => ({
      codigo: m[1],
      entrega: m[2] === 'true',
      anterior: m[3] === 'true',
      ordem: Number(m[4]),
      area: m[5].startsWith('NULL') ? null : m[5].slice(1, -1),
      epicos: [...m[6].matchAll(/'([^']+)'/g)].map((x) => x[1]),
    }));
    const noTs = FABRICAS.map((f, i) => ({
      codigo: f.codigo,
      entrega: f.entrega,
      anterior: f.grupo === 'ANTERIOR',
      ordem: i,
      area: f.devops?.area ?? null,
      epicos: f.devops?.epicos ?? [],
    }));
    expect(noBanco).toEqual(noTs);
  });
});
