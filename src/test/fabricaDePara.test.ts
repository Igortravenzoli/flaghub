import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FABRICAS } from '@/lib/fabricaOrganograma';
import { DE_PARA_FORMATO_ANTERIOR } from '@/lib/fabricaRoster';

/**
 * DE → PARA do formato anterior (24/11/2026): a Feature debaixo de [K8]/[FLEXX]
 * decide a fábrica do item, na frente da hora. A tabela mora no banco
 * (`fn_fabrica_de_para`); este teste lê a migration MAIS RECENTE que a define e
 * guarda o que já deu errado em listas paralelas: PARA apontando para código
 * que não existe, ou para área de apoio (que nunca recebe item).
 */
function dePara(): Array<{ id: number; de: string; para: string[] }> {
  const dir = resolve(__dirname, '../../supabase/migrations');
  const arquivo = readdirSync(dir).filter((n) => n.endsWith('.sql')).sort().reverse()
    .find((n) => readFileSync(resolve(dir, n), 'utf8').includes('FUNCTION public.fn_fabrica_de_para'));
  expect(arquivo).toBeTruthy();
  const sql = readFileSync(resolve(dir, arquivo!), 'utf8');
  const corpo = sql.slice(sql.indexOf('FUNCTION public.fn_fabrica_de_para'));
  const valores = corpo.slice(0, corpo.indexOf('$function$;'));
  return [...valores.matchAll(/\(\s*(\d+),\s*'([^']+)',\s*ARRAY\[([^\]]*)\]\)/g)].map((m) => ({
    id: Number(m[1]),
    de: m[2],
    para: [...m[3].matchAll(/'([^']+)'/g)].map((x) => x[1]),
  }));
}

describe('DE → PARA do formato anterior', () => {
  const tabela = dePara();
  const entrega = new Set(FABRICAS.filter((f) => f.entrega).map((f) => f.codigo));

  it('tem as 14 Features de [K8] e [FLEXX], cada uma uma vez', () => {
    expect(tabela).toHaveLength(14);
    expect(new Set(tabela.map((t) => t.id)).size).toBe(14);
  });

  it('todo PARA é fábrica de entrega do organograma (nunca área de apoio, nunca K8/FLEXX)', () => {
    for (const t of tabela) {
      expect(t.para.length).toBeGreaterThan(0);
      for (const c of t.para) expect(entrega.has(c), `${t.de} → ${c}`).toBe(true);
    }
  });

  it('decisões do Igor (24/11/2026): SWFX na PROMO / SUITE; WMAN, NFEE, WDCS e WDES nas duas ERP pela hora', () => {
    const por = Object.fromEntries(tabela.map((t) => [t.id, t.para]));
    expect(por[10004]).toEqual(['PROMO_SUITE']);
    for (const wmanNfeeWdcsWdes of [10012, 10015, 10011, 15635]) expect(por[wmanNfeeWdcsWdes]).toEqual(['ERP_SUST', 'ERP_EVOL']);
    expect(por[13509]).toEqual(['IR']);
  });

  it('a tabela do front (selo do Uso cruzado) é a mesma do banco', () => {
    const doBanco = Object.fromEntries(tabela.map((t) => [t.id, t.para]));
    const doFront = Object.fromEntries(Object.entries(DE_PARA_FORMATO_ANTERIOR).map(([id, v]) => [Number(id), [...v.para]]));
    expect(doFront).toEqual(doBanco);
    for (const t of tabela) expect(t.de.endsWith(`- ${DE_PARA_FORMATO_ANTERIOR[t.id].de}`), t.de).toBe(true);
  });
});
