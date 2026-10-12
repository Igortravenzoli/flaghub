import {
  diffSnapshot,
  diffSnapshotNoBanco,
  filtrarPorRev,
  itensParaGravar,
  MIGRATION_EG2,
  MIGRATION_EG5,
  rpcAusente,
} from '../../supabase/functions/devops-sync-query/diff';

// EG-5: o devops-sync-query passa a fazer o diff de rev e do snapshot no banco.
// As regras antigas (JS) continuam no diff.ts como caminho de fallback e como
// referência. Os casos "espelho do SQL" abaixo usam a MESMA fixture rodada no
// projeto DEV em 11/10/2026, numa transação desfeita, contra a migration
// 20261011120000_eg5_sync_query_diff + rpc_devops_stale_ids (EG-2). O resultado
// do Postgres está anotado em cada caso: o JS tem de dar o mesmo.
//
// Fixture DEV: devops_work_items 1..10 com rev = id; snapshot da query A =
// {1,2,3,4,5}.

type Rpc = { data: unknown; error: { code?: string; message: string } | null };

function adminFake(resposta: Rpc) {
  const chamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    chamadas,
    rpc: (fn: string, args: Record<string, unknown>) => {
      chamadas.push({ fn, args });
      return Promise.resolve(resposta);
    },
  };
}

const PGRST202 = { code: 'PGRST202', message: 'Could not find the function public.rpc_x in the schema cache' };

describe('diffSnapshot (regra antiga do passo 7)', () => {
  const snapshotA = [1, 2, 3, 4, 5];

  it('espelho do SQL: entrada mista com repetição', () => {
    // Postgres: {"inserir": [7, 8, 7], "remover": [2, 4]}
    expect(diffSnapshot([3, 7, 1, 8, 7, 5], snapshotA)).toEqual({ inserir: [7, 8, 7], remover: [2, 4] });
  });

  it('espelho do SQL: query sem item novo nem saída', () => {
    // Postgres: {"inserir": [], "remover": []}
    expect(diffSnapshot([5, 4, 3, 2, 1], snapshotA)).toEqual({ inserir: [], remover: [] });
  });

  it('espelho do SQL: lista vazia remove o snapshot inteiro', () => {
    // Postgres (p_ids = '{}'): {"inserir": [], "remover": [1, 2, 3, 4, 5]}
    expect(diffSnapshot([], snapshotA)).toEqual({ inserir: [], remover: [1, 2, 3, 4, 5] });
  });

  it('espelho do SQL: query sem snapshot ainda insere tudo', () => {
    // Postgres (query inexistente): {"inserir": [1, 2], "remover": []}
    expect(diffSnapshot([1, 2], [])).toEqual({ inserir: [1, 2], remover: [] });
  });

  it('volume da Base Geral: só o que entrou e o que saiu', () => {
    // Postgres no DEV, 11,5 mil itens: {"inserir": [111502, 111501, 900000], "remover": [100001, 111500]}
    const snapshot = Array.from({ length: 11500 }, (_, i) => 100001 + i);
    const entrada = Array.from({ length: 11501 }, (_, i) => 111502 - i).filter(id => id !== 111500 && id !== 100001);
    entrada.push(900000);
    expect(diffSnapshot(entrada, snapshot)).toEqual({ inserir: [111502, 111501, 900000], remover: [100001, 111500] });
  });
});

describe('filtrarPorRev (regra antiga dos passos 5 e 8)', () => {
  it('espelho do SQL: novo grava, rev do banco menor grava, igual ou maior pula', () => {
    // rpc_devops_stale_ids([1,2,3,99,4,99], [1,3,2,1,NULL,5]) no Postgres: [2, 99, 99]
    const banco = new Map(Array.from({ length: 10 }, (_, i) => [i + 1, i + 1] as [number, number]));
    const itens = [
      { id: 1, rev: 1 },
      { id: 2, rev: 3 },
      { id: 3, rev: 2 },
      { id: 99, rev: 1 },
      { id: 4, rev: undefined as unknown as number },
      { id: 99, rev: 5 },
    ];
    expect(filtrarPorRev(itens, banco).map(i => i.id)).toEqual([2, 99, 99]);
  });
});

describe('itensParaGravar (rpc_devops_stale_ids)', () => {
  const itens = [
    { id: 10, rev: 3, title: 'a' },
    { id: 11, rev: 1, title: 'b' },
    { id: 12, rev: 7, title: 'c' },
  ];

  it('manda (id, rev) e filtra pelo que o banco devolve, na ordem da entrada', async () => {
    const admin = adminFake({ data: [12, 10], error: null });
    const fallback = vi.fn();
    const r = await itensParaGravar(admin, itens, fallback, () => { throw new Error('não'); });
    expect(admin.chamadas).toEqual([{ fn: 'rpc_devops_stale_ids', args: { p_ids: [10, 11, 12], p_revs: [3, 1, 7] } }]);
    expect(r.via).toBe('rpc');
    expect(r.itens.map(i => i.title)).toEqual(['a', 'c']);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('banco sem nada a gravar devolve lista vazia', async () => {
    const r = await itensParaGravar(adminFake({ data: [], error: null }), itens, vi.fn(), () => []);
    expect(r.itens).toEqual([]);
  });

  it('lista vazia não chama o banco', async () => {
    const admin = adminFake({ data: [], error: null });
    const r = await itensParaGravar(admin, [], vi.fn(), () => []);
    expect(admin.chamadas).toHaveLength(0);
    expect(r.itens).toEqual([]);
  });

  it('RPC ausente (PGRST202) volta à leitura antiga e à regra em JS', async () => {
    const fallback = vi.fn(async () => new Map([[10, 3], [11, 0]]));
    const aoFalhar = vi.fn(() => []);
    const r = await itensParaGravar(adminFake({ data: null, error: PGRST202 }), itens, fallback, aoFalhar);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(aoFalhar).not.toHaveBeenCalled();
    expect(r.via).toBe('fallback');
    expect(r.itens.map(i => i.id)).toEqual([11, 12]);
  });

  it('outro erro vai para aoFalhar (passo 5 lança, passo 8 grava tudo)', async () => {
    const fallback = vi.fn();
    const erro = { code: '57014', message: 'canceling statement due to statement timeout' };
    await expect(
      itensParaGravar(adminFake({ data: null, error: erro }), itens, fallback, (e) => { throw new Error(`Rev lookup failed: ${e.message}`); }),
    ).rejects.toThrow('Rev lookup failed: canceling statement');
    const r = await itensParaGravar(adminFake({ data: null, error: erro }), itens, fallback, () => itens);
    expect(r.via).toBe('erro');
    expect(r.itens).toHaveLength(3);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('resposta que não é array não passa por "nada a gravar"', async () => {
    const aoFalhar = vi.fn(() => itens);
    const r = await itensParaGravar(adminFake({ data: null, error: null }), itens, vi.fn(), aoFalhar);
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(r.itens).toHaveLength(3);
  });
});

describe('diffSnapshotNoBanco (rpc_devops_query_snapshot_diff)', () => {
  const QID = '00000000-0000-0000-0000-00000000000a';

  it('manda query e ids e devolve {inserir, remover} do banco', async () => {
    const admin = adminFake({ data: { inserir: [7, 8, 7], remover: [2, 4] }, error: null });
    const lerAntigo = vi.fn();
    const r = await diffSnapshotNoBanco(admin, QID, [3, 7, 1, 8, 7, 5], lerAntigo);
    expect(admin.chamadas).toEqual([
      { fn: 'rpc_devops_query_snapshot_diff', args: { p_query_id: QID, p_ids: [3, 7, 1, 8, 7, 5] } },
    ]);
    expect(r).toEqual({ inserir: [7, 8, 7], remover: [2, 4], via: 'rpc' });
    expect(lerAntigo).not.toHaveBeenCalled();
  });

  it('RPC ausente (PGRST202) lê o snapshot como antes e dá o mesmo resultado', async () => {
    const lerAntigo = vi.fn(async () => [1, 2, 3, 4, 5]);
    const r = await diffSnapshotNoBanco(adminFake({ data: null, error: PGRST202 }), QID, [3, 7, 1, 8, 7, 5], lerAntigo);
    expect(lerAntigo).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ inserir: [7, 8, 7], remover: [2, 4], via: 'fallback' });
  });

  it('outro erro lança com a mensagem da leitura antiga', async () => {
    await expect(
      diffSnapshotNoBanco(adminFake({ data: null, error: { code: 'XX000', message: 'boom' } }), QID, [1], vi.fn()),
    ).rejects.toThrow('Current snapshot lookup failed: boom');
  });

  it('formato inesperado lança em vez de apagar ou inserir errado', async () => {
    await expect(
      diffSnapshotNoBanco(adminFake({ data: { inserir: [1] }, error: null }), QID, [1], vi.fn()),
    ).rejects.toThrow('formato inesperado');
  });
});

describe('rpcAusente', () => {
  it('só PGRST202 (função fora do schema cache) aciona o fallback', () => {
    expect(rpcAusente(PGRST202)).toBe(true);
    expect(rpcAusente({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(rpcAusente(null)).toBe(false);
  });

  it('o nome da migration do log bate com o arquivo', () => {
    expect(MIGRATION_EG5).toBe('20261011120000_eg5_sync_query_diff');
    expect(MIGRATION_EG2).toBe('20260921120000_eg2_sync_all_rpcs');
  });
});
