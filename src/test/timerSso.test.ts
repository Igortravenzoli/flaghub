import { describe, expect, it } from 'vitest';
import {
  escolherIdentidadeDevops,
  extrairTenantAzure,
  lerClaimsJwt,
  lerDominios,
  sessaoVeioDeOAuth,
  validarSsoFlag,
  type UsuarioSupabase,
} from '../../supabase/functions/timer-devops/sso';

const TENANT = '11111111-2222-3333-4444-555555555555';
const OUTRO = '99999999-8888-7777-6666-555555555555';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.assinatura`;
}

const claimsOAuth = { amr: [{ method: 'oauth', timestamp: 1 }] };

function usuario(over: Partial<UsuarioSupabase> = {}, tenant = TENANT): UsuarioSupabase {
  return {
    id: 'u1',
    email: 'Dev@Flag.com.br',
    email_confirmed_at: '2026-11-16T10:00:00Z',
    identities: [{ provider: 'azure', identity_data: { iss: `https://login.microsoftonline.com/${tenant}/v2.0` } }],
    ...over,
  };
}

const config = { tenantId: TENANT, dominios: ['flag.com.br'] };

describe('validarSsoFlag', () => {
  it('libera conta Microsoft do tenant Flag com sessão OAuth', () => {
    expect(validarSsoFlag(usuario(), claimsOAuth, config)).toEqual({ ok: true, email: 'dev@flag.com.br', tenantId: TENANT });
  });

  it('falha fechada sem tenant configurado', () => {
    expect(validarSsoFlag(usuario(), claimsOAuth, { tenantId: null, dominios: ['flag.com.br'] }))
      .toEqual({ ok: false, motivo: 'configuracao_pendente' });
    expect(validarSsoFlag(usuario(), claimsOAuth, { tenantId: 'nao-e-guid', dominios: ['flag.com.br'] }))
      .toEqual({ ok: false, motivo: 'configuracao_pendente' });
  });

  it('recusa conta só de e-mail e senha', () => {
    const u = usuario({ identities: [{ provider: 'email', identity_data: {} }] });
    expect(validarSsoFlag(u, claimsOAuth, config)).toEqual({ ok: false, motivo: 'sem_identidade_microsoft' });
  });

  it('recusa quando a sessão atual veio de senha, mesmo com identidade Microsoft vinculada', () => {
    expect(validarSsoFlag(usuario(), { amr: [{ method: 'password' }] }, config))
      .toEqual({ ok: false, motivo: 'sessao_nao_veio_do_sso' });
  });

  it('recusa conta Microsoft de outra organização, mesmo com e-mail @flag (nOAuth)', () => {
    expect(validarSsoFlag(usuario({}, OUTRO), claimsOAuth, config)).toEqual({ ok: false, motivo: 'tenant_diferente' });
  });

  it('recusa e-mail fora do domínio e e-mail não confirmado', () => {
    expect(validarSsoFlag(usuario({ email: 'x@gmail.com' }), claimsOAuth, config))
      .toEqual({ ok: false, motivo: 'email_fora_do_dominio' });
    expect(validarSsoFlag(usuario({ email_confirmed_at: null }), claimsOAuth, config))
      .toEqual({ ok: false, motivo: 'email_nao_confirmado' });
  });
});

describe('extrairTenantAzure', () => {
  it('lê tid de custom_claims, de tid direto e do iss', () => {
    expect(extrairTenantAzure({ custom_claims: { tid: TENANT.toUpperCase() } })).toBe(TENANT);
    expect(extrairTenantAzure({ tid: TENANT })).toBe(TENANT);
    expect(extrairTenantAzure({ iss: `https://sts.windows.net/${TENANT}/` })).toBe(TENANT);
  });

  it('não aceita iss de outro host', () => {
    expect(extrairTenantAzure({ iss: `https://evil.example.com/${TENANT}/v2.0` })).toBeNull();
    expect(extrairTenantAzure(null)).toBeNull();
  });
});

describe('claims do JWT', () => {
  it('decodifica base64url e reconhece amr oauth', () => {
    const c = lerClaimsJwt(jwt({ sub: 'u1', ...claimsOAuth }));
    expect(c?.sub).toBe('u1');
    expect(sessaoVeioDeOAuth(c)).toBe(true);
    expect(sessaoVeioDeOAuth({ amr: ['oauth'] })).toBe(true);
    expect(sessaoVeioDeOAuth({})).toBe(false);
    expect(lerClaimsJwt('lixo')).toBeNull();
  });
});

describe('lerDominios', () => {
  it('usa flag.com.br por padrão e limpa a lista', () => {
    expect(lerDominios(undefined)).toEqual(['flag.com.br']);
    expect(lerDominios(' @Flag.com.br , outra.com ,, x')).toEqual(['flag.com.br', 'outra.com']);
    expect(lerDominios('')).toEqual(['flag.com.br']);
  });
});

describe('escolherIdentidadeDevops', () => {
  const guid = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';

  it('só aceita a identidade ativa cujo e-mail é exatamente o do SSO', () => {
    const resposta = {
      value: [
        { id: '00000000-0000-0000-0000-000000000001', isActive: true, providerDisplayName: 'Outro', properties: { Mail: { $value: 'dev.outro@flag.com.br' } } },
        { id: guid, isActive: true, providerDisplayName: 'Dev Flag', properties: { Mail: { $value: 'DEV@flag.com.br' } } },
      ],
    };
    expect(escolherIdentidadeDevops(resposta, 'dev@flag.com.br')).toEqual({
      guid: guid.toLowerCase(),
      display: 'Dev Flag',
      email: 'dev@flag.com.br',
    });
  });

  it('ignora identidade inativa, id inválido e resposta vazia', () => {
    expect(escolherIdentidadeDevops({ value: [{ id: guid, isActive: false, properties: { Mail: { $value: 'dev@flag.com.br' } } }] }, 'dev@flag.com.br')).toBeNull();
    expect(escolherIdentidadeDevops({ value: [{ id: 'x', properties: { Mail: { $value: 'dev@flag.com.br' } } }] }, 'dev@flag.com.br')).toBeNull();
    expect(escolherIdentidadeDevops({ value: [] }, 'dev@flag.com.br')).toBeNull();
    expect(escolherIdentidadeDevops(null, 'dev@flag.com.br')).toBeNull();
  });
});
