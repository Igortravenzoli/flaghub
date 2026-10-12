import { webcrypto } from 'node:crypto';
import {
  type ClienteSgsi,
  type LinhaSgsi,
  impressaoItemSgsi,
  semCredencial,
  sincronizarLista,
} from '../../supabase/functions/sharepoint-sync-sgsi/gravacao';

// Diff do sharepoint-sync-sgsi (EG-7 / PR-10). O arquivo roda no Deno, mas não
// tem import por URL, então é testado aqui. Os hashes esperados são a saída de
// public.sgsi_impressao no Postgres 17 (bancada do DEV, 11/10/2026) para os
// mesmos valores: se um teste daqui quebrar, a edge e o banco pararam de
// concordar e toda execução regravaria tudo.

beforeAll(() => {
  // o jsdom do vitest não traz crypto.subtle; a edge (Deno) tem
  if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto);
});

describe('impressaoItemSgsi', () => {
  it('bate com public.sgsi_impressao (acento, aspas, travessão, array, lookupId, ms fracionário)', async () => {
    const h = await impressaoItemSgsi({
      item_id: 42,
      created_sp: '2026-10-11T12:34:56Z',
      modified_sp: '2026-10-11T13:00:00.5Z',
      fields: {
        Title: 'Acesso VPN — ação "urgente"',
        Status: 'Aprovado',
        'Solicitante (lookupId)': 17,
        Itens: [1, 2.5, 'ç'],
        _sharepoint_url: 'https://x/DispForm.aspx?ID=42',
      },
    });
    expect(h).toBe('59095353acfb9fbc4d6cc7d988890b9109f87ed7b1ddb2c0f00c9c959a5e6630');
  });

  it('bate com public.sgsi_impressao com datas nulas e fields vazio', async () => {
    const h = await impressaoItemSgsi({ item_id: 7, created_sp: null, modified_sp: null, fields: {} });
    expect(h).toBe('25d6edc76bfca9d76588880590306f9cb210541e195926f6814bbe064ffb000d');
  });

  it('não depende da ordem das chaves (o jsonb normaliza) nem do formato da data', async () => {
    const a = await impressaoItemSgsi({ item_id: 1, created_sp: '2026-06-01T10:00:00Z', modified_sp: null, fields: { b: 1, a: 2 } });
    const b = await impressaoItemSgsi({ item_id: 1, created_sp: '2026-06-01T10:00:00.000Z', modified_sp: null, fields: { a: 2, b: 1 } });
    expect(a).toBe(b);
  });

  it('muda com modified_sp, com o fields e com o item_id', async () => {
    const base = { item_id: 1, created_sp: '2026-06-01T10:00:00Z', modified_sp: '2026-06-02T10:00:00Z', fields: { a: 1 } };
    const h = await impressaoItemSgsi(base);
    expect(await impressaoItemSgsi({ ...base, modified_sp: '2026-06-02T10:00:01Z' })).not.toBe(h);
    expect(await impressaoItemSgsi({ ...base, fields: { a: 2 } })).not.toBe(h);
    expect(await impressaoItemSgsi({ ...base, item_id: 2 })).not.toBe(h);
  });
});

describe('semCredencial', () => {
  it('tira chave de senha (inclusive o lookupId) e mantém o resto', () => {
    expect(semCredencial({
      'Senha AD': 'https://privnote.com/x',
      'Senha Banco (lookupId)': 3,
      Password: 'x',
      Resenha: 'ok',
      Solicitante: 'Fulano',
      _sharepoint_url: 'https://x',
    })).toEqual({ Resenha: 'ok', Solicitante: 'Fulano', _sharepoint_url: 'https://x' });
  });
});

function linha(item_id: number, fields: Record<string, unknown>, list_key = '014'): LinhaSgsi {
  return {
    list_key,
    item_id,
    fields,
    created_sp: '2026-06-01T10:00:00Z',
    modified_sp: '2026-06-02T10:00:00Z',
    synced_at: '2026-10-11T18:00:00Z',
  };
}

function clienteFalso(rpc: { data: unknown; error: { code?: string; message: string } | null }, upsertErro: string | null = null) {
  const chamadas = {
    rpc: [] as { fn: string; args: Record<string, unknown> }[],
    upsert: [] as { linhas: LinhaSgsi[]; onConflict: string }[],
    insert: [] as LinhaSgsi[][],
    delete: [] as { coluna: string; valor: string }[],
  };
  const cliente: ClienteSgsi = {
    rpc: async (fn, args) => { chamadas.rpc.push({ fn, args }); return rpc; },
    from: () => ({
      upsert: async (linhas, opcoes) => {
        chamadas.upsert.push({ linhas, onConflict: opcoes.onConflict });
        return { error: upsertErro ? { message: upsertErro } : null };
      },
      insert: async (linhas) => { chamadas.insert.push(linhas); return { error: null }; },
      delete: () => ({ eq: async (coluna, valor) => { chamadas.delete.push({ coluna, valor }); return { error: null }; } }),
    }),
  };
  return { cliente, chamadas };
}

describe('sincronizarLista', () => {
  const linhas = [
    linha(1, { Title: 'igual' }),
    linha(2, { Title: 'mudou', 'Senha AD': 'https://privnote.com/segredo' }),
    linha(3, { Title: 'novo' }),
  ];

  it('manda id + 16 hex por item e só faz upsert do que a RPC devolveu, sem apagar a lista', async () => {
    const { cliente, chamadas } = clienteFalso({ data: { alterados: [2, 3], enviados: 3, base: 3, removidos: 1 }, error: null });
    const r = await sincronizarLista(cliente, '014', linhas);

    expect(chamadas.rpc).toHaveLength(1);
    expect(chamadas.rpc[0].fn).toBe('rpc_sgsi_sincronizar_lista');
    expect(chamadas.rpc[0].args.p_list_key).toBe('014');
    expect(chamadas.rpc[0].args.p_item_ids).toEqual([1, 2, 3]);
    const hs = chamadas.rpc[0].args.p_impressoes as string[];
    expect(hs).toHaveLength(3);
    hs.forEach((h) => expect(h).toMatch(/^[0-9a-f]{16}$/));

    expect(chamadas.delete).toHaveLength(0);
    expect(chamadas.insert).toHaveLength(0);
    expect(chamadas.upsert).toHaveLength(1);
    expect(chamadas.upsert[0].onConflict).toBe('list_key,item_id');
    expect(chamadas.upsert[0].linhas.map((l) => l.item_id)).toEqual([2, 3]);
    expect(r).toEqual({ modo: 'diff', itens: 3, gravados: 2, removidos: 1 });
  });

  it('a impressão enviada é a da linha SEM a coluna de senha (a que é gravada)', async () => {
    const { cliente, chamadas } = clienteFalso({ data: { alterados: [2], removidos: 0 }, error: null });
    await sincronizarLista(cliente, '014', linhas);
    const gravada = chamadas.upsert[0].linhas[0];
    expect(gravada.fields).toEqual({ Title: 'mudou' });
    const esperada = (await impressaoItemSgsi(gravada)).slice(0, 16);
    expect((chamadas.rpc[0].args.p_impressoes as string[])[1]).toBe(esperada);
  });

  it('nada mudou: nenhuma gravação', async () => {
    const { cliente, chamadas } = clienteFalso({ data: { alterados: [], removidos: 0 }, error: null });
    const r = await sincronizarLista(cliente, '014', linhas);
    expect(chamadas.upsert).toHaveLength(0);
    expect(r.gravados).toBe(0);
  });

  it('upsert em lotes de 200', async () => {
    const muitas = Array.from({ length: 450 }, (_, i) => linha(i + 1, { Title: `item ${i + 1}` }, '010'));
    const { cliente, chamadas } = clienteFalso({ data: { alterados: muitas.map((l) => l.item_id), removidos: 0 }, error: null });
    await sincronizarLista(cliente, '010', muitas);
    expect(chamadas.upsert.map((u) => u.linhas.length)).toEqual([200, 200, 50]);
  });

  it('erro no upsert derruba a execução, como antes', async () => {
    const { cliente } = clienteFalso({ data: { alterados: [1], removidos: 0 }, error: null }, 'boom');
    await expect(sincronizarLista(cliente, '014', linhas)).rejects.toThrow('Upsert sgsi_items 014: boom');
  });

  it('sem a migration (PGRST202): apaga e reinsere tudo, sem senha, com aviso claro', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { cliente, chamadas } = clienteFalso({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    const r = await sincronizarLista(cliente, '014', linhas);
    erro.mockRestore();

    expect(chamadas.upsert).toHaveLength(0);
    expect(chamadas.delete).toEqual([{ coluna: 'list_key', valor: '014' }]);
    expect(chamadas.insert).toHaveLength(1);
    expect(chamadas.insert[0].map((l) => l.item_id)).toEqual([1, 2, 3]);
    for (const l of chamadas.insert[0]) {
      expect(Object.keys(l.fields).some((k) => /senha/i.test(k))).toBe(false);
    }
    expect(r.modo).toBe('legado');
    expect(r.gravados).toBe(3);
    expect(r.aviso).toContain('20261011140000_eg7_sgsi_diff_por_item');
  });
});
