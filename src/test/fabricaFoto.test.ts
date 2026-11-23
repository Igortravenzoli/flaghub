import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { FABRICAS } from '@/lib/fabricaOrganograma';
import {
  avisoForaDoOrganograma, corFabricaFoto, escoposPorGrupo, FABRICAS_DE_ENTREGA, fabricasDaFoto,
  GRUPOS_DE_ENTREGA, MAX_FABRICAS_FOTO, recorteOrganograma, rotuloFabricaFoto, somarEscopos, temOrganograma,
} from '@/lib/fabricaFoto';
import { montaColunasQualidade } from '@/components/fabrica/QualidadePorFabricaCharts';
import type { SnapshotScopeBreakdown, SprintSnapshotRow } from '@/hooks/useSprintSnapshots';

/**
 * F2 (23/11/2026): a foto de sprint ganhou `fabricas_org` (fábrica do item pela
 * pessoa) ao lado de `fabricas` (por Épico). F4 (23/11/2026): os cards leem SÓ
 * `fabricas_org`; a chave por Épico segue gravada, mas não entra em conta.
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

/** Foto de antes do organograma (até a S13): só a chave por Épico. */
const anterior: {
  geral: SnapshotScopeBreakdown;
  fabricas: Record<string, SnapshotScopeBreakdown>;
  fabricas_org?: Record<string, SnapshotScopeBreakdown>;
} = {
  geral: escopo(10),
  fabricas: { '[K8] - Squad': escopo(4, 2), '[APP] - Squad': escopo(3, 1), 'Sem fábrica': escopo(2), 'Dash Dinâmico': escopo(1) },
};
const organograma = {
  ...anterior,
  fabricas_org: { IR: escopo(5, 3), ERP_SUST: escopo(3, 1), QUALIDADE: escopo(1), K8: escopo(1), 'Sem fábrica': escopo(1) },
};

describe('fábricas da foto', () => {
  it('só a foto com fabricas_org tem a fábrica do organograma', () => {
    expect(temOrganograma(organograma)).toBe(true);
    expect(temOrganograma(anterior)).toBe(false);
    expect(temOrganograma(null)).toBe(false);
  });

  it('só fábrica de entrega atual (sem "Sem fábrica", área de apoio nem K8)', () => {
    expect(Object.keys(fabricasDaFoto(organograma)).sort()).toEqual(['ERP_SUST', 'IR']);
  });

  it('a chave por Épico não entra mais em conta: foto sem fabricas_org não tem fábrica', () => {
    expect(fabricasDaFoto(anterior)).toEqual({});
  });

  it('nome para a tela: "ERP" diz de qual grupo é; código desconhecido volta como veio', () => {
    expect(rotuloFabricaFoto('ERP_SUST')).toBe('ERP · Sustentação');
    expect(rotuloFabricaFoto('IR')).toBe('I & R');
    expect(rotuloFabricaFoto('K8')).toBe('K8');
  });

  it('o teto de colunas cobre as 8 fábricas de entrega', () => {
    expect(FABRICAS_DE_ENTREGA).toEqual(['GPS_GO', 'APP', 'PROMO_SUITE', 'ERP_SUST', 'ERP_EVOL', 'IR', 'LAB', 'STAGING']);
    expect(MAX_FABRICAS_FOTO).toBe(8);
  });
});

describe('janela com fotos de antes do organograma', () => {
  const fotos = [
    { sprint_code: 'S12-2026', category_breakdown: anterior },
    { sprint_code: 'S13-2026', category_breakdown: anterior },
    { sprint_code: 'S14-2026', category_breakdown: organograma },
  ];

  it('fica só com as fotos do organograma e conta quem ficou de fora', () => {
    const r = recorteOrganograma(fotos);
    expect(r.fotos.map((f) => f.sprint_code)).toEqual(['S14-2026']);
    expect(r.fora).toBe(2);
    expect(avisoForaDoOrganograma(r.fora)).toBe('2 sprints anteriores ao organograma ficaram fora da conta.');
    expect(avisoForaDoOrganograma(1)).toBe('1 sprint anterior ao organograma ficou fora da conta.');
    expect(avisoForaDoOrganograma(0)).toBe('');
  });

  it('a Qualidade das Fábricas não soma K8 de uma sprint com IR da outra', () => {
    const snaps = Object.fromEntries(fotos.map((f) => [f.sprint_code, { ...f, snapshot_source: null, as_of_datetime: null } as SprintSnapshotRow]));
    const r = montaColunasQualidade(snaps, { groupBy: 'sprint', maxSprints: 6, anoVigente: 2026 });
    expect(r.columns.map((c) => c.label)).toEqual(['S14']);
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

  it('Qualidade no telão: uma barra por grupo', () => {
    const snaps = { 'S23-2026': { sprint_code: 'S23-2026', snapshot_source: null, as_of_datetime: null, category_breakdown: organograma } as SprintSnapshotRow };
    const r = montaColunasQualidade(snaps, { groupBy: 'sprint', maxSprints: 3, anoVigente: 2026, porGrupo: true });
    expect(r.porGrupo).toBe(true);
    expect(Object.keys(r.columns[0].cells).sort()).toEqual(['EVOLUCAO', 'SUSTENTACAO']);
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
      // K8/FLEXX saíram na F4: a coluna fica (assinatura estável) e é falsa em todas.
      anterior: false,
      ordem: i,
      area: f.devops?.area ?? null,
      epicos: f.devops?.epicos ?? [],
    }));
    expect(noBanco).toEqual(noTs);
  });
});
