import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  autorizacaoPat,
  cifrar,
  conferirDono,
  corpoDaRenovacao,
  decifrar,
  delegadoLigado,
  ehFalhaDeAutorizacao,
  escolherAutorizacao,
  ESCOPO_PADRAO,
  FORMATO_CIFRADO,
  lerConfigEntra,
  lerRespostaDoToken,
  MARGEM_MS,
  obterTokenDaPessoa,
  prepararVinculo,
  RECURSO_DEVOPS,
  refreshTokenPlausivel,
  REGRAVAR_APOS_MS,
  subDaIdentidadeAzure,
  tokenValido,
  urlDoToken,
  type ConfigEntra,
  type Portas,
  type VinculoGuardado,
} from '../../supabase/functions/timer-devops/identidade';
import {
  chaveDoVinculo,
  consumirTokenDoLogin,
  deveEnviarVinculo,
  escoposDoSso,
  ESCOPOS_SSO,
  lembrarTokenDoLogin,
  marcaDoToken,
} from '@/lib/timerVinculoDevops';

// A edge roda no Deno, que tem WebCrypto. O jsdom dos testes pode não ter o
// `subtle`: usa o do Node, que é a mesma API.
beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

const TENANT = '11111111-2222-3333-4444-555555555555';
const CLIENTE = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CHAVE = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 1)));
const OUTRA_CHAVE = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => 200 - i)));
const USER = '0f0f0f0f-1111-2222-3333-444444444444';
const OUTRO_USER = '9e9e9e9e-1111-2222-3333-444444444444';
const AGORA = Date.parse('2026-11-25T15:00:00Z');

const cfg: ConfigEntra = { tenantId: TENANT, clientId: CLIENTE, clientSecret: 'segredo', escopo: ESCOPO_PADRAO, chave: CHAVE };

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.assinatura`;
}

/** Resposta de sucesso do endpoint de token do Entra. */
function respostaOk(over: Record<string, unknown> = {}) {
  return {
    status: 200,
    json: {
      token_type: 'Bearer',
      expires_in: 3600,
      access_token: 'access-novo',
      refresh_token: 'refresh-novo-0123456789',
      id_token: jwt({ tid: TENANT, sub: 'sub-da-pessoa' }),
      ...over,
    },
  };
}

describe('chave e configuração', () => {
  it('só liga com valor explícito; ausente é desligado', () => {
    for (const v of ['1', 'true', 'TRUE', ' on ', 'sim']) expect(delegadoLigado(v)).toBe(true);
    for (const v of [undefined, null, '', '0', 'false', 'off', 'talvez']) expect(delegadoLigado(v)).toBe(false);
  });

  it('lê a configuração completa e usa o .default do Azure DevOps', () => {
    const env: Record<string, string> = {
      TIMER_SSO_TENANT_ID: TENANT.toUpperCase(),
      TIMER_ENTRA_CLIENT_ID: CLIENTE,
      TIMER_ENTRA_CLIENT_SECRET: ' segredo ',
      TIMER_TOKEN_CHAVE: CHAVE,
    };
    expect(lerConfigEntra((n) => env[n])).toEqual(cfg);
    expect(ESCOPO_PADRAO).toBe(`${RECURSO_DEVOPS}/.default`);
  });

  it('falta de qualquer peça devolve null (a edge segue no PAT)', () => {
    const cheio: Record<string, string> = {
      TIMER_SSO_TENANT_ID: TENANT,
      TIMER_ENTRA_CLIENT_ID: CLIENTE,
      TIMER_ENTRA_CLIENT_SECRET: 'segredo',
      TIMER_TOKEN_CHAVE: CHAVE,
    };
    for (const falta of Object.keys(cheio)) {
      expect(lerConfigEntra((n) => (n === falta ? undefined : cheio[n]))).toBeNull();
    }
    // chave de tamanho errado (16 bytes) e chave que não é base64
    expect(lerConfigEntra((n) => (n === 'TIMER_TOKEN_CHAVE' ? btoa('1234567890abcdef') : cheio[n]))).toBeNull();
    expect(lerConfigEntra((n) => (n === 'TIMER_TOKEN_CHAVE' ? '***' : cheio[n]))).toBeNull();
  });

  it('só aceita escopo do recurso do Azure DevOps', () => {
    const base: Record<string, string> = {
      TIMER_SSO_TENANT_ID: TENANT,
      TIMER_ENTRA_CLIENT_ID: CLIENTE,
      TIMER_ENTRA_CLIENT_SECRET: 'segredo',
      TIMER_TOKEN_CHAVE: CHAVE,
    };
    const com = (escopo: string) => lerConfigEntra((n) => (n === 'TIMER_DEVOPS_ESCOPO' ? escopo : base[n]));
    expect(com(`${RECURSO_DEVOPS}/vso.work_write`)?.escopo).toBe(`${RECURSO_DEVOPS}/vso.work_write`);
    expect(com('https://graph.microsoft.com/.default')).toBeNull();
    expect(com(`${RECURSO_DEVOPS}/.default https://graph.microsoft.com/Mail.Read`)).toBeNull();
  });
});

describe('cabeçalho de autorização', () => {
  it('PAT: Basic com usuário vazio, igual ao _shared/devops.ts', () => {
    expect(autorizacaoPat('abc')).toBe(`Basic ${btoa(':abc')}`);
  });

  it('com a chave ligada e token da pessoa, grava como a pessoa', () => {
    expect(escolherAutorizacao({ ligado: true, tokenPessoa: 'tok', pat: 'abc' })).toEqual({
      identidade: 'pessoa',
      authorization: 'Bearer tok',
    });
  });

  it('sem token, ou com a chave desligada, grava com o PAT como hoje', () => {
    const servico = { identidade: 'servico', authorization: `Basic ${btoa(':abc')}` };
    expect(escolherAutorizacao({ ligado: true, tokenPessoa: null, pat: 'abc' })).toEqual(servico);
    expect(escolherAutorizacao({ ligado: true, tokenPessoa: '', pat: 'abc' })).toEqual(servico);
    // desligada: o token da pessoa é ignorado mesmo que exista
    expect(escolherAutorizacao({ ligado: false, tokenPessoa: 'tok', pat: 'abc' })).toEqual(servico);
  });

  it('só recusa de credencial volta ao PAT; 400 e 5xx não repetem', () => {
    for (const s of [401, 403, 203]) expect(ehFalhaDeAutorizacao(s)).toBe(true);
    for (const s of [200, 201, 400, 404, 409, 429, 500, 502, 503]) expect(ehFalhaDeAutorizacao(s)).toBe(false);
  });
});

describe('validade do token', () => {
  it('vale só com folga maior que a margem', () => {
    expect(tokenValido({ expiraEm: AGORA + MARGEM_MS + 1 }, AGORA)).toBe(true);
    expect(tokenValido({ expiraEm: AGORA + MARGEM_MS }, AGORA)).toBe(false);
    expect(tokenValido({ expiraEm: AGORA - 1 }, AGORA)).toBe(false);
    expect(tokenValido(null, AGORA)).toBe(false);
  });
});

describe('renovação no Entra', () => {
  it('monta o grant refresh_token no endpoint do tenant, com openid e sem profile', () => {
    expect(urlDoToken(TENANT)).toBe(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`);
    const p = new URLSearchParams(corpoDaRenovacao(cfg, 'rt+com/sinais='));
    expect(p.get('grant_type')).toBe('refresh_token');
    expect(p.get('client_id')).toBe(CLIENTE);
    expect(p.get('client_secret')).toBe('segredo');
    expect(p.get('refresh_token')).toBe('rt+com/sinais=');
    expect(p.get('scope')).toBe(`openid offline_access ${RECURSO_DEVOPS}/.default`);
  });

  it('lê o sucesso: token, validade, refresh novo e claims do id_token', () => {
    const { status, json } = respostaOk();
    const r = lerRespostaDoToken(status, json, AGORA);
    expect(r).toEqual({
      ok: true,
      token: {
        accessToken: 'access-novo',
        refreshToken: 'refresh-novo-0123456789',
        expiraEm: AGORA + 3_600_000,
        claims: { tid: TENANT, sub: 'sub-da-pessoa' },
      },
    });
  });

  it('sem refresh novo, sem id_token e sem expires_in não explode', () => {
    const r = lerRespostaDoToken(200, { access_token: 'a' }, AGORA);
    expect(r).toEqual({ ok: true, token: { accessToken: 'a', refreshToken: null, expiraEm: AGORA, claims: null } });
    // validade desconhecida = não serve para cache
    expect(r.ok && tokenValido(r.token, AGORA)).toBe(false);
  });

  it('separa o erro definitivo (pede novo login) do passageiro', () => {
    for (const erro of ['invalid_grant', 'interaction_required', 'consent_required']) {
      expect(lerRespostaDoToken(400, { error: erro, error_description: 'AADSTS…' }, AGORA)).toEqual({ ok: false, erro, definitivo: true });
    }
    expect(lerRespostaDoToken(503, { error: 'temporarily_unavailable' }, AGORA)).toEqual({
      ok: false,
      erro: 'temporarily_unavailable',
      definitivo: false,
    });
    expect(lerRespostaDoToken(500, null, AGORA)).toEqual({ ok: false, erro: 'http_500', definitivo: false });
    // 200 sem access_token não é sucesso
    expect(lerRespostaDoToken(200, {}, AGORA)).toEqual({ ok: false, erro: 'http_200', definitivo: false });
    // texto livre do Entra não vira código de erro nosso
    expect(lerRespostaDoToken(400, { error: 'Algo <b>estranho</b>' }, AGORA)).toEqual({ ok: false, erro: 'http_400', definitivo: false });
  });
});

describe('conferirDono', () => {
  const esperado = { tenantId: TENANT, sub: 'sub-da-pessoa' };

  it('aceita o mesmo tenant e o mesmo sujeito', () => {
    expect(conferirDono({ tid: TENANT.toUpperCase(), sub: 'sub-da-pessoa' }, esperado)).toEqual({ ok: true, sub: 'sub-da-pessoa' });
  });

  it('recusa sem id_token, de outro tenant, sem sub e de outra pessoa', () => {
    expect(conferirDono(null, esperado)).toEqual({ ok: false, motivo: 'sem_id_token' });
    expect(conferirDono({ tid: '99999999-8888-7777-6666-555555555555', sub: 'sub-da-pessoa' }, esperado)).toEqual({ ok: false, motivo: 'tenant_diferente' });
    expect(conferirDono({ sub: 'sub-da-pessoa' }, esperado)).toEqual({ ok: false, motivo: 'tenant_diferente' });
    expect(conferirDono({ tid: TENANT }, esperado)).toEqual({ ok: false, motivo: 'sem_sub' });
    expect(conferirDono({ tid: TENANT, sub: 'sub-da-pessoa' }, { tenantId: TENANT, sub: null })).toEqual({ ok: false, motivo: 'sem_sub' });
    expect(conferirDono({ tid: TENANT, sub: 'sub-de-outro' }, esperado)).toEqual({ ok: false, motivo: 'outra_pessoa' });
  });

  it('acha o sub na identidade azure que a Supabase guarda', () => {
    expect(subDaIdentidadeAzure([{ provider: 'email' }, { provider: 'azure', identity_data: { sub: 'abc' } }])).toBe('abc');
    expect(subDaIdentidadeAzure([{ provider: 'email', identity_data: { sub: 'x' } }])).toBeNull();
    expect(subDaIdentidadeAzure([{ provider: 'azure', identity_data: {} }])).toBeNull();
    expect(subDaIdentidadeAzure(null)).toBeNull();
  });
});

describe('refresh token vindo do navegador', () => {
  it('aceita o formato do Entra e recusa lixo', () => {
    expect(refreshTokenPlausivel('0.AXoA-abc_DEF.ghi~123+/=xyz')).toBe(true);
    expect(refreshTokenPlausivel('curto')).toBe(false);
    expect(refreshTokenPlausivel('com espaço dentro do token aqui')).toBe(false);
    expect(refreshTokenPlausivel('a'.repeat(8193))).toBe(false);
    expect(refreshTokenPlausivel(undefined)).toBe(false);
    expect(refreshTokenPlausivel({ token: 'x' })).toBe(false);
  });
});

describe('cifra do refresh token', () => {
  it('vai e volta, e o que fica gravado não contém o token', async () => {
    const cifrado = await cifrar(CHAVE, USER, 'refresh-secreto-0123456789');
    expect(cifrado).toMatch(FORMATO_CIFRADO);
    expect(cifrado).not.toContain('refresh-secreto');
    expect(await decifrar(CHAVE, USER, cifrado)).toBe('refresh-secreto-0123456789');
  });

  it('cada cifra usa um iv novo', async () => {
    expect(await cifrar(CHAVE, USER, 'igual')).not.toBe(await cifrar(CHAVE, USER, 'igual'));
  });

  it('não abre com outra chave, na linha de outra pessoa, nem adulterado', async () => {
    const cifrado = await cifrar(CHAVE, USER, 'refresh-secreto-0123456789');
    expect(await decifrar(OUTRA_CHAVE, USER, cifrado)).toBeNull();
    expect(await decifrar(CHAVE, OUTRO_USER, cifrado)).toBeNull();
    const [v, iv, corpo] = cifrado.split('.');
    const trocado = `${v}.${iv}.${corpo.slice(0, -2)}${corpo.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(await decifrar(CHAVE, USER, trocado)).toBeNull();
    expect(await decifrar(CHAVE, USER, 'refresh-em-claro')).toBeNull();
  });

  it('o formato da edge passa no CHECK da tabela (mesma expressão da migration)', async () => {
    const check = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/;
    expect(await cifrar(CHAVE, USER, 'x')).toMatch(check);
    expect('0.AXoA-token-em-claro.de-mentira-para-o-teste').not.toMatch(check);
  });

  it('chave inválida não cifra', async () => {
    await expect(cifrar('curta', USER, 'x')).rejects.toThrow('chave_invalida');
  });
});

// ─── obterTokenDaPessoa: do cache ao Entra ───────────────────────────────────

async function vinculo(over: Partial<VinculoGuardado> = {}, refresh = 'refresh-guardado-0123456789'): Promise<VinculoGuardado> {
  return {
    refresh_cifrado: await cifrar(CHAVE, USER, refresh),
    entra_sub: 'sub-da-pessoa',
    renovado_em: new Date(AGORA - 3_600_000).toISOString(),
    ...over,
  };
}

function portas(over: Partial<Portas> = {}, guardado: VinculoGuardado | null = null) {
  const memoria = new Map<string, { accessToken: string; expiraEm: number }>();
  const p = {
    cache: {
      ler: vi.fn((u: string) => memoria.get(u) ?? null),
      gravar: vi.fn((u: string, t: { accessToken: string; expiraEm: number }) => void memoria.set(u, t)),
      apagar: vi.fn((u: string) => void memoria.delete(u)),
    },
    lerVinculo: vi.fn(async () => guardado),
    regravarVinculo: vi.fn(async () => undefined),
    apagarVinculo: vi.fn(async () => undefined),
    renovar: vi.fn(async () => respostaOk()),
    ...over,
  };
  return { p: p as unknown as Portas, espioes: p, memoria };
}

describe('obterTokenDaPessoa', () => {
  it('token do cache ainda válido: não lê o banco nem vai ao Entra', async () => {
    const { p, espioes, memoria } = portas();
    memoria.set(USER, { accessToken: 'do-cache', expiraEm: AGORA + 30 * 60_000 });
    expect(await obterTokenDaPessoa(USER, cfg, p, AGORA)).toEqual({ ok: true, accessToken: 'do-cache', doCache: true });
    expect(espioes.lerVinculo).not.toHaveBeenCalled();
    expect(espioes.renovar).not.toHaveBeenCalled();
  });

  it('token do cache perto de vencer: renova com o refresh guardado e guarda o novo no cache', async () => {
    const { p, espioes, memoria } = portas({}, await vinculo());
    memoria.set(USER, { accessToken: 'velho', expiraEm: AGORA + 60_000 });
    expect(await obterTokenDaPessoa(USER, cfg, p, AGORA)).toEqual({ ok: true, accessToken: 'access-novo', doCache: false });
    expect(espioes.renovar).toHaveBeenCalledWith(cfg, 'refresh-guardado-0123456789');
    expect(memoria.get(USER)).toEqual({ accessToken: 'access-novo', expiraEm: AGORA + 3_600_000 });
  });

  it('sem vínculo: diz que não há, sem ir ao Entra', async () => {
    const { p, espioes } = portas();
    expect(await obterTokenDaPessoa(USER, cfg, p, AGORA)).toEqual({ ok: false, motivo: 'sem_vinculo' });
    expect(espioes.renovar).not.toHaveBeenCalled();
  });

  it('vínculo recente: não regrava o refresh a cada renovação', async () => {
    const { p, espioes } = portas({}, await vinculo());
    await obterTokenDaPessoa(USER, cfg, p, AGORA);
    expect(espioes.regravarVinculo).not.toHaveBeenCalled();
  });

  it('vínculo com mais de uma semana: regrava o refresh novo, cifrado', async () => {
    const antigo = await vinculo({ renovado_em: new Date(AGORA - REGRAVAR_APOS_MS - 1000).toISOString() });
    const { p, espioes } = portas({}, antigo);
    await obterTokenDaPessoa(USER, cfg, p, AGORA);
    expect(espioes.regravarVinculo).toHaveBeenCalledTimes(1);
    const [quem, cifrado] = (espioes.regravarVinculo as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(quem).toBe(USER);
    expect(cifrado).not.toContain('refresh-novo');
    expect(await decifrar(CHAVE, USER, cifrado)).toBe('refresh-novo-0123456789');
  });

  it('falha ao regravar não derruba a escrita de agora', async () => {
    const antigo = await vinculo({ renovado_em: 'data-invalida' });
    const { p } = portas({ regravarVinculo: vi.fn(async () => { throw new Error('banco'); }) }, antigo);
    expect(await obterTokenDaPessoa(USER, cfg, p, AGORA)).toMatchObject({ ok: true, accessToken: 'access-novo' });
  });

  it('Entra recusou em definitivo: apaga o vínculo (a pessoa vincula no próximo login)', async () => {
    const { p, espioes } = portas({ renovar: vi.fn(async () => ({ status: 400, json: { error: 'invalid_grant' } })) }, await vinculo());
    expect(await obterTokenDaPessoa(USER, cfg, p, AGORA)).toEqual({ ok: false, motivo: 'renovacao_recusada', erro: 'invalid_grant' });
    expect(espioes.apagarVinculo).toHaveBeenCalledWith(USER);
    expect(espioes.cache.gravar).not.toHaveBeenCalled();
  });

  it('falha passageira (5xx ou rede): mantém o vínculo', async () => {
    const fora = portas({ renovar: vi.fn(async () => ({ status: 503, json: { error: 'temporarily_unavailable' } })) }, await vinculo());
    expect(await obterTokenDaPessoa(USER, cfg, fora.p, AGORA)).toEqual({ ok: false, motivo: 'renovacao_falhou', erro: 'temporarily_unavailable' });
    expect(fora.espioes.apagarVinculo).not.toHaveBeenCalled();

    const rede = portas({ renovar: vi.fn(async () => { throw new Error('timeout'); }) }, await vinculo());
    expect(await obterTokenDaPessoa(USER, cfg, rede.p, AGORA)).toEqual({ ok: false, motivo: 'renovacao_falhou', erro: 'rede' });
    expect(rede.espioes.apagarVinculo).not.toHaveBeenCalled();
  });

  it('cifra que não abre (chave trocada): apaga o vínculo sem ir ao Entra', async () => {
    const { p, espioes } = portas({}, await vinculo());
    expect(await obterTokenDaPessoa(USER, { ...cfg, chave: OUTRA_CHAVE }, p, AGORA)).toEqual({ ok: false, motivo: 'cifra_nao_abre' });
    expect(espioes.apagarVinculo).toHaveBeenCalledWith(USER);
    expect(espioes.renovar).not.toHaveBeenCalled();
  });

  it('token que voltou é de outra pessoa ou de outro tenant: não usa e apaga', async () => {
    for (const claims of [{ tid: TENANT, sub: 'sub-de-outro' }, { tid: '99999999-8888-7777-6666-555555555555', sub: 'sub-da-pessoa' }]) {
      const { p, espioes } = portas({ renovar: vi.fn(async () => respostaOk({ id_token: jwt(claims) })) }, await vinculo());
      expect(await obterTokenDaPessoa(USER, cfg, p, AGORA)).toMatchObject({ ok: false, motivo: 'dono_nao_confere' });
      expect(espioes.apagarVinculo).toHaveBeenCalledWith(USER);
      expect(espioes.cache.gravar).not.toHaveBeenCalled();
    }
  });
});

describe('prepararVinculo (primeiro vínculo, vindo do login)', () => {
  it('troca no Entra, confere o dono e devolve o refresh NOVO cifrado', async () => {
    const renovar = vi.fn(async () => respostaOk());
    const r = await prepararVinculo(USER, 'sub-da-pessoa', 'refresh-do-login-0123456789', cfg, renovar, AGORA);
    expect(renovar).toHaveBeenCalledWith(cfg, 'refresh-do-login-0123456789');
    expect(r).toMatchObject({ ok: true, sub: 'sub-da-pessoa', accessToken: 'access-novo', expiraEm: AGORA + 3_600_000 });
    expect(r.ok && (await decifrar(CHAVE, USER, r.refreshCifrado))).toBe('refresh-novo-0123456789');
  });

  it('sem refresh novo na resposta, guarda o que veio do login', async () => {
    const r = await prepararVinculo(USER, 'sub-da-pessoa', 'refresh-do-login-0123456789', cfg, async () => respostaOk({ refresh_token: undefined }), AGORA);
    expect(r.ok && (await decifrar(CHAVE, USER, r.refreshCifrado))).toBe('refresh-do-login-0123456789');
  });

  it('token de outra pessoa não vira vínculo', async () => {
    const r = await prepararVinculo(USER, 'sub-de-quem-esta-logado', 'refresh-alheio-0123456789', cfg, async () => respostaOk(), AGORA);
    expect(r).toEqual({ ok: false, motivo: 'dono_nao_confere', erro: 'outra_pessoa' });
  });

  it('sessão sem sub na identidade azure: recusa (falha fechada)', async () => {
    const r = await prepararVinculo(USER, null, 'refresh-do-login-0123456789', cfg, async () => respostaOk(), AGORA);
    expect(r).toEqual({ ok: false, motivo: 'dono_nao_confere', erro: 'sem_sub' });
  });

  it('separa recusa do Entra (sem consentimento) de Entra fora do ar', async () => {
    const recusa = await prepararVinculo(USER, 'sub-da-pessoa', 'rt-0123456789-0123456789', cfg, async () => ({ status: 400, json: { error: 'consent_required' } }), AGORA);
    expect(recusa).toEqual({ ok: false, motivo: 'entra_recusou', erro: 'consent_required' });
    const fora = await prepararVinculo(USER, 'sub-da-pessoa', 'rt-0123456789-0123456789', cfg, async () => { throw new Error('rede'); }, AGORA);
    expect(fora).toEqual({ ok: false, motivo: 'entra_indisponivel', erro: 'rede' });
  });
});

// ─── lado do app ─────────────────────────────────────────────────────────────

describe('escopos do login SSO', () => {
  it('sem a variável, pede exatamente os escopos de sempre', () => {
    expect(ESCOPOS_SSO).toBe('email profile openid');
    for (const v of [undefined, null, '', '   ']) expect(escoposDoSso(v)).toBe('email profile openid');
  });

  it('acrescenta os extras, por espaço e sem repetir', () => {
    expect(escoposDoSso('offline_access')).toBe('email profile openid offline_access');
    expect(escoposDoSso(' offline_access  openid offline_access ')).toBe('email profile openid offline_access');
    expect(escoposDoSso(`offline_access ${RECURSO_DEVOPS}/vso.work_write`)).toBe(
      `email profile openid offline_access ${RECURSO_DEVOPS}/vso.work_write`,
    );
  });

  it('descarta extra com vírgula ou caractere estranho (o Auth quebra a lista por vírgula)', () => {
    expect(escoposDoSso('offline_access,User.Read')).toBe('email profile openid');
    expect(escoposDoSso('offline_access <script>')).toBe('email profile openid offline_access');
  });
});

describe('envio do vínculo, uma vez por login', () => {
  const token = '0.AXoA-refresh-do-login-0123456789';

  it('manda quando há token novo; não repete o mesmo; manda o de outro login', () => {
    expect(deveEnviarVinculo(token, null)).toBe(true);
    expect(deveEnviarVinculo(token, marcaDoToken(token))).toBe(false);
    expect(deveEnviarVinculo(`${token}x`, marcaDoToken(token))).toBe(true);
  });

  it('sem token (recurso desligado) nunca manda', () => {
    for (const t of [null, undefined, '', 'curto']) expect(deveEnviarVinculo(t, null)).toBe(false);
  });

  it('a marca não contém o token e a chave é por pessoa', () => {
    expect(marcaDoToken(token)).not.toContain('refresh');
    expect(marcaDoToken(token).length).toBeLessThan(16);
    expect(chaveDoVinculo(USER)).toBe(`timer-flag:devops-vinculo:${USER}`);
  });

  it('o token do login fica em memória para a própria pessoa e é esquecido ao ser lido', () => {
    lembrarTokenDoLogin({ user: { id: USER }, provider_refresh_token: token });
    expect(consumirTokenDoLogin(OUTRO_USER)).toBeNull();
    expect(consumirTokenDoLogin(USER)).toBe(token);
    expect(consumirTokenDoLogin(USER)).toBeNull();
  });

  it('evento sem refresh token (renovação da sessão) não apaga o que o login trouxe', () => {
    lembrarTokenDoLogin({ user: { id: USER }, provider_refresh_token: token });
    lembrarTokenDoLogin({ user: { id: USER }, provider_refresh_token: null });
    lembrarTokenDoLogin(null);
    expect(consumirTokenDoLogin(USER)).toBe(token);
  });
});
