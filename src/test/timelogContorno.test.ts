import {
  comNovaTentativa,
  decidirSemDiff,
  ESPERA_NOVA_TENTATIVA_MS,
  falhaEstrutural,
  MODO_PULADO,
  puladasSeguidas,
  PULADAS_ANTES_DE_REGRAVAR,
  type RespostaRpc,
} from '../../supabase/functions/_shared/timelogContorno';

// Contorno do devops-sync-timelog quando o diff por balde falha (v3.6). O arquivo
// roda no Deno, mas não tem import por URL, então a regra é testada aqui.

const timeout = { code: '57014', message: 'canceling statement due to statement timeout' };
const ausente = { code: 'PGRST202', message: 'Could not find the function public.rpc_timelog_baldes_divergentes' };

/** RPC de mentira que devolve as respostas na ordem e conta as chamadas. */
function rpcQueResponde<T>(respostas: Array<RespostaRpc<T>>) {
  let chamadas = 0;
  const chamar = () => Promise.resolve(respostas[Math.min(chamadas++, respostas.length - 1)]);
  return { chamar, chamadas: () => chamadas };
}

describe('falhaEstrutural', () => {
  it('função ausente é estrutural, pelo PostgREST ou pelo Postgres', () => {
    expect(falhaEstrutural(ausente)).toBe(true);
    expect(falhaEstrutural({ code: '42883', message: 'function does not exist' })).toBe(true);
  });

  it('timeout e erro sem código são passageiros', () => {
    expect(falhaEstrutural(timeout)).toBe(false);
    expect(falhaEstrutural({ message: 'fetch failed' })).toBe(false);
  });
});

describe('comNovaTentativa', () => {
  it('sucesso de primeira: uma chamada, sem espera', async () => {
    const rpc = rpcQueResponde([{ data: { ok: 1 }, error: null }]);
    const dormir = vi.fn(() => Promise.resolve());
    const r = await comNovaTentativa(rpc.chamar, { dormir });
    expect(r).toEqual({ data: { ok: 1 }, error: null, tentativas: 1 });
    expect(rpc.chamadas()).toBe(1);
    expect(dormir).not.toHaveBeenCalled();
  });

  it('timeout e depois sucesso: espera o tempo padrão e devolve a segunda resposta', async () => {
    const rpc = rpcQueResponde([{ data: null, error: timeout }, { data: { ok: 2 }, error: null }]);
    const dormir = vi.fn(() => Promise.resolve());
    const r = await comNovaTentativa(rpc.chamar, { dormir });
    expect(r).toEqual({ data: { ok: 2 }, error: null, tentativas: 2 });
    expect(dormir).toHaveBeenCalledTimes(1);
    expect(dormir).toHaveBeenCalledWith(ESPERA_NOVA_TENTATIVA_MS);
  });

  it('timeout duas vezes: devolve o erro da segunda e não chama a terceira', async () => {
    const rpc = rpcQueResponde([{ data: null, error: timeout }, { data: null, error: { ...timeout, message: 'de novo' } }]);
    const r = await comNovaTentativa(rpc.chamar, { dormir: () => Promise.resolve(), esperaMs: 1 });
    expect(r.error?.message).toBe('de novo');
    expect(r.tentativas).toBe(2);
    expect(rpc.chamadas()).toBe(2);
  });

  it('função ausente não ganha nova tentativa', async () => {
    const rpc = rpcQueResponde([{ data: null, error: ausente }]);
    const dormir = vi.fn(() => Promise.resolve());
    const r = await comNovaTentativa(rpc.chamar, { dormir });
    expect(r.error).toBe(ausente);
    expect(r.tentativas).toBe(1);
    expect(rpc.chamadas()).toBe(1);
    expect(dormir).not.toHaveBeenCalled();
  });
});

describe('puladasSeguidas', () => {
  it('conta só a sequência do começo (rodada mais nova primeiro)', () => {
    expect(puladasSeguidas([])).toBe(0);
    expect(puladasSeguidas(['baldes', MODO_PULADO, MODO_PULADO])).toBe(0);
    expect(puladasSeguidas([MODO_PULADO, 'baldes', MODO_PULADO])).toBe(1);
    expect(puladasSeguidas([MODO_PULADO, MODO_PULADO, MODO_PULADO])).toBe(3);
  });

  it('rodada antiga sem meta.diff interrompe a sequência', () => {
    expect(puladasSeguidas([MODO_PULADO, null, MODO_PULADO])).toBe(1);
    expect(puladasSeguidas([undefined, MODO_PULADO])).toBe(0);
  });
});

describe('decidirSemDiff', () => {
  const cron = { modoCompleto: false, puladasAntes: 0 };

  it('timeout no cron: pula a rodada em vez de regravar tudo', () => {
    expect(decidirSemDiff(timeout, cron)).toBe('pular');
    expect(decidirSemDiff(timeout, { ...cron, puladasAntes: PULADAS_ANTES_DE_REGRAVAR - 1 })).toBe('pular');
  });

  it('depois do limite de puladas seguidas, regrava para o dado não ficar parado', () => {
    expect(decidirSemDiff(timeout, { ...cron, puladasAntes: PULADAS_ANTES_DE_REGRAVAR })).toBe('regravar');
    expect(decidirSemDiff(timeout, { ...cron, puladasAntes: PULADAS_ANTES_DE_REGRAVAR + 4 })).toBe('regravar');
  });

  it('função ausente regrava já na primeira: é a edge publicada antes da migration', () => {
    expect(decidirSemDiff(ausente, cron)).toBe('regravar');
  });

  it('modo completo pedido à mão regrava mesmo com falha passageira', () => {
    expect(decidirSemDiff(timeout, { modoCompleto: true, puladasAntes: 0 })).toBe('regravar');
  });
});
