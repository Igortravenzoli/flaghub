import * as fields from '@/lib/sgsiFields';
import * as biInfra from '@/hooks/useBIInfra';

// Guarda da extração (INC-1): os helpers puros migraram de `useBIInfra` para
// `@/lib/sgsiFields`. Se alguém "limpar" os re-exports de compatibilidade, estes
// testes quebram ANTES de sgsiBuild.test.ts / infraExecutivoTv.test.tsx.

const item = (fs: Record<string, unknown>): fields.SgsiRawItem => ({
  list_key: '017', item_id: 1, fields: fs,
  created_sp: '2026-07-01T10:00:00Z', modified_sp: '2026-07-01T10:00:00Z',
});

describe('re-exports de compatibilidade em @/hooks/useBIInfra', () => {
  it('countBy é A MESMA referência nos dois módulos (re-export de VALOR, não de tipo)', () => {
    expect(biInfra.countBy).toBe(fields.countBy);
  });

  it('simNaoOf é a mesma referência nos dois módulos', () => {
    expect(biInfra.simNaoOf).toBe(fields.simNaoOf);
  });

  it('o namespace de useBIInfra continua expondo os símbolos que os testes alheios usam', () => {
    // infraExecutivoTv.test.tsx faz `...(await orig())` — precisa dos VALORES
    expect(typeof biInfra.buildSgsiResponse).toBe('function');
    expect(typeof biInfra.countBy).toBe('function');
    expect(typeof biInfra.simNaoOf).toBe('function');
    expect(typeof biInfra.useBIInfraSgsi).toBe('function');
  });
});

describe('valuesOf — formas que o SharePoint devolve', () => {
  it('expande array, string-JSON-de-array, number e boolean; ignora vazio', () => {
    expect(fields.valuesOf(item({ A: ['x', 'y'] }), 'A')).toEqual(['x', 'y']);
    expect(fields.valuesOf(item({ A: '["Froneri"]' }), 'A')).toEqual(['Froneri']);
    expect(fields.valuesOf(item({ A: 7 }), 'A')).toEqual(['7']);
    expect(fields.valuesOf(item({ A: true }), 'A')).toEqual(['true']);
    expect(fields.valuesOf(item({ A: '' }), 'A')).toEqual([]);
    expect(fields.valuesOf(item({}), 'A')).toEqual([]);
  });

  it('texto normal que começa com colchete não é tratado como JSON', () => {
    expect(fields.valuesOf(item({ A: '[urgente] revisar' }), 'A')).toEqual(['[urgente] revisar']);
  });

  it('cai para o próximo nome quando o primeiro está vazio', () => {
    expect(fields.str(item({ 'Título': '', Produto: 'Flexx' }), 'Título', 'Produto')).toBe('Flexx');
  });
});

describe('num × numOrNull — "não preenchido" ≠ "zero"', () => {
  it('num devolve 0 para campo ausente (compatibilidade com useBIInfra)', () => {
    expect(fields.num(item({}), 'Tempo Downtime')).toBe(0);
  });

  it('numOrNull devolve null no MESMO caso — é a correção que o card usa', () => {
    expect(fields.numOrNull(item({}), 'Tempo Downtime')).toBeNull();
  });

  it('os dois convertem vírgula decimal do SharePoint', () => {
    expect(fields.num(item({ 'Tempo Downtime': '2,5' }), 'Tempo Downtime')).toBe(2.5);
    expect(fields.numOrNull(item({ 'Tempo Downtime': '2,5' }), 'Tempo Downtime')).toBe(2.5);
  });

  it('zero DECLARADO é 0 nos dois — distinguível de ausente só no numOrNull', () => {
    expect(fields.numOrNull(item({ 'Tempo Downtime': '0' }), 'Tempo Downtime')).toBe(0);
  });

  it('texto ilegível → null no numOrNull, 0 no num', () => {
    expect(fields.numOrNull(item({ 'Tempo Downtime': 'n/a' }), 'Tempo Downtime')).toBeNull();
    expect(fields.num(item({ 'Tempo Downtime': 'n/a' }), 'Tempo Downtime')).toBe(0);
  });
});

describe('semAcento', () => {
  it('remove acento e caixa', () => {
    expect(fields.semAcento('Não')).toBe('nao');
    expect(fields.semAcento('  Dentro do SLA ')).toBe('dentro do sla');
    expect(fields.semAcento('Priorização')).toBe('priorizacao');
  });
});
