import { describe, expect, it } from 'vitest';
import { CS_ENRIQUECIMENTO_SELECT, descricaoDoEnriquecimento } from '@/hooks/useCustomerServiceKpis';

/**
 * EG-8 (11/10/2026) — o enriquecimento da fila de CS deixou de baixar `raw`
 * inteiro e passou a projetar só os dois campos de descrição. A regra antiga era
 * `raw.fields['System.Description'] ?? raw.fields.description`, só se texto.
 * `->` do PostgREST preserva o tipo JSON, então cada caso abaixo é o mesmo que
 * a regra antiga daria sobre o `raw` correspondente.
 */
const antiga = (raw: unknown): string | null => {
  const r = raw as Record<string, any> | null;
  const desc = r?.fields?.['System.Description'] ?? r?.fields?.description ?? null;
  return typeof desc === 'string' ? desc : null;
};

/** O que `raw->fields->"X"` devolve: o valor JSON, ou null se o caminho não existe. */
const projetar = (raw: unknown) => {
  const fields = (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? (raw as Record<string, any>).fields
    : undefined;
  const pega = (k: string) => (fields && typeof fields === 'object' && !Array.isArray(fields) ? fields[k] ?? null : null);
  return {
    id: 1, iteration_path: null, assigned_to_unique: null,
    desc_sistema: pega('System.Description'), desc_campo: pega('description'),
  };
};

describe('descrição do enriquecimento de CS', () => {
  const casos: unknown[] = [
    null,
    {},
    { fields: {} },
    { fields: { 'System.Description': '<div>Abertura VDESK: 01/10/2026</div>' } },
    { fields: { description: 'texto minúsculo' } },
    { fields: { 'System.Description': null, description: 'cai para description' } },
    { fields: { 'System.Description': 'vence', description: 'perde' } },
    { fields: { 'System.Description': 42 } },
    { fields: { 'System.Description': { html: 'x' } } },
    { fields: { 'System.Description': '' , description: 'não cai: string vazia não é null' } },
    { fields: 'quebrado' },
  ];

  it.each(casos.map((c, i) => [i, c]))('caso %i: igual à leitura de raw inteiro', (_, raw) => {
    expect(descricaoDoEnriquecimento(projetar(raw))).toBe(antiga(raw));
  });

  it('o select não pede mais o raw inteiro', () => {
    expect(CS_ENRIQUECIMENTO_SELECT).not.toMatch(/(^|,\s*)raw\s*(,|$)/);
    expect(CS_ENRIQUECIMENTO_SELECT).toContain('raw->fields->"System.Description"');
  });
});
