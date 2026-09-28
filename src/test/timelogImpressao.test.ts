import { webcrypto } from 'node:crypto';
import {
  baldeDoLancamento,
  impressaoLancamento,
  jsonbTexto,
  parcelaDaImpressao,
  resumirPorBalde,
} from '../../supabase/functions/_shared/timelogImpressao';

// Impressão do diff por balde do devops-sync-timelog (EG-4). O arquivo roda no
// Deno, mas não tem import por URL, então é testado aqui. Os textos e hashes
// esperados são a saída do Postgres 17 do PROD em 28/09/2026 para o mesmo JSON
// (`'<json>'::jsonb::text` e `encode(sha256(convert_to(id || '|' || texto, 'UTF8')), 'hex')`):
// se um teste daqui quebrar, a edge e o banco pararam de concordar.

beforeAll(() => {
  // o jsdom do vitest não traz crypto.subtle; a edge (Deno) tem
  if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto);
});

const lancamento = {
  id: '0a1b2c3d-0000-4000-8000-000000000001',
  date: '2026-09-28T00:00:00',
  time: 90,
  user: 'Fulano de Tal',
  notes: 'Revisão "PA" — ajuste\nlinha 2\tTab \\ barra / fim',
  userId: 'abc-123',
  __etag: 1,
  startTime: '09:30',
  workItemId: 18006,
  workItemName: 'Ação: certificado ç ã 🚀',
};
const textoLancamentoNoPostgres = String.raw`{"id": "0a1b2c3d-0000-4000-8000-000000000001", "date": "2026-09-28T00:00:00", "time": 90, "user": "Fulano de Tal", "notes": "Revisão \"PA\" — ajuste\nlinha 2\tTab \\ barra / fim", "__etag": 1, "userId": "abc-123", "startTime": "09:30", "workItemId": 18006, "workItemName": "Ação: certificado ç ã 🚀"}`;

const aninhado = {
  b: [1, 2.5, -3, 0, null, true, false, 'x', [], {}],
  a: { zz: 1, a: { k: 'v' } },
  ccc: '\u0001\u001f\u007f ',
  aa: 1.5,
  'é': 'acento na chave',
  ab: -0.25,
  big: 9007199254740991,
};
const textoAninhadoNoPostgres =
  String.raw`{"a": {"a": {"k": "v"}, "zz": 1}, "b": [1, 2.5, -3, 0, null, true, false, "x", [], {}], "aa": 1.5, "ab": -0.25, "é": "acento na chave", "big": 9007199254740991, "ccc": "\u0001\u001f` +
  '\u007f "}';

describe('jsonbTexto', () => {
  it('reproduz o raw::text do Postgres para um lançamento do TimeLog', () => {
    expect(jsonbTexto(lancamento)).toBe(textoLancamentoNoPostgres);
  });

  it('reproduz aninhamento, escapes, chave acentuada e números', () => {
    expect(jsonbTexto(aninhado)).toBe(textoAninhadoNoPostgres);
  });

  it('ordena chaves por tamanho e, no empate, byte a byte — como o jsonb guarda', () => {
    expect(jsonbTexto({ bb: 1, a: 2, ab: 3, c: 4 })).toBe('{"a": 2, "c": 4, "ab": 3, "bb": 1}');
  });

  it('segue o JSON.stringify para undefined: some do objeto, vira null no array', () => {
    expect(jsonbTexto({ a: undefined, b: [undefined, 1] })).toBe('{"b": [null, 1]}');
  });
});

describe('impressaoLancamento', () => {
  it('é o mesmo sha256 que o Postgres calcula', async () => {
    expect(await impressaoLancamento(lancamento.id, lancamento)).toBe(
      '83d797fd756ea2abc1c8e5e38e9f447695ec8770f37af8af7a3ab40724ffb29d',
    );
    expect(await impressaoLancamento('ff000000-0000-4000-8000-00000000000f', aninhado)).toBe(
      '934faa0c07874a602b2afc65cb581a83e025b09bfc89e1c15ef8a0e47fe70bbf',
    );
    expect(await impressaoLancamento('7f', {})).toBe(
      '3436844ba6cd22a1ca0320c6b061749f6cd82bf7aa21891030207cd0f0c31667',
    );
  });

  it('não muda com a ordem das chaves que a extensão devolver', async () => {
    const invertido = Object.fromEntries(Object.entries(lancamento).reverse());
    expect(await impressaoLancamento(lancamento.id, invertido)).toBe(
      await impressaoLancamento(lancamento.id, lancamento),
    );
  });

  it('muda com qualquer campo do raw, inclusive os que não viram coluna', async () => {
    const original = await impressaoLancamento(lancamento.id, lancamento);
    for (const alterado of [
      { ...lancamento, notes: `${lancamento.notes}.` },
      { ...lancamento, time: 91 },
      { ...lancamento, workItemName: 'Outro título' },
    ]) {
      expect(await impressaoLancamento(lancamento.id, alterado)).not.toBe(original);
    }
  });
});

describe('resumirPorBalde', () => {
  const max = 'f'.repeat(64); // parcela = 2^60 - 1

  it('agrupa pelos 2 primeiros caracteres do id, em ordem de balde', () => {
    const um = `${'0'.repeat(14)}1${'0'.repeat(49)}`; // parcela = 1
    expect(baldeDoLancamento('0a1b2c3d')).toBe('0a');
    expect(parcelaDaImpressao(um)).toBe(BigInt(1));
    expect(
      resumirPorBalde([
        { id: 'ab-1', impressao: max },
        { id: '01-x', impressao: um },
        { id: 'ab-2', impressao: max },
      ]),
    ).toEqual({ baldes: ['01', 'ab'], qtds: [1, 2], somas: ['1', '2305843009213693950'] });
  });

  it('soma acima de 2^63 sai exata, em decimal (o banco lê como numeric)', () => {
    const nove = Array.from({ length: 9 }, (_, i) => ({ id: `ff-${i}`, impressao: max }));
    expect(resumirPorBalde(nove).somas).toEqual(['10376293541461622775']);
  });

  it('não depende da ordem das linhas', () => {
    const itens = [
      { id: 'c1', impressao: `1${'0'.repeat(63)}` },
      { id: 'a1', impressao: `2${'0'.repeat(63)}` },
      { id: 'c2', impressao: `3${'0'.repeat(63)}` },
    ];
    expect(resumirPorBalde([...itens].reverse())).toEqual(resumirPorBalde(itens));
  });
});
