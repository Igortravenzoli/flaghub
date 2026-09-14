import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Telão × "aguardando aprovação" — 14/09/2026.
 *
 * A TV roda sozinha como monitor@flag.com.br (s4, com áreas) e recarrega fora do
 * expediente quando sai build novo; cada recarga refaz a hidratação do
 * AuthContext. Nela, a contagem de hub_area_members decide se o papel
 * auto-provisionado aguarda aprovação. O supabase-js não lança em erro de
 * PostgREST (57014, 503, rede caída): devolve { count: null, error }. Isso virava
 * "zero memberships", o monitor era marcado pendente e o ProtectedRoute o mandava
 * para /pending-approval — página que não reavalia nem redireciona. A TV ficava
 * lá, sem operador, mesmo depois de a contagem voltar e o token renovar.
 *
 * Agora contagem sem resposta é "não sei" (nova tentativa, timeout por tentativa)
 * e não marca pendência. O que não muda: contagem 0 respondida continua levando o
 * usuário novo para a aprovação. AuthProvider, ProtectedRoute e PendingApproval
 * são os reais; só a Supabase é simulada.
 */

type RespostaContagem = { count: number | null; error: Record<string, unknown> | null } | 'sem-resposta';

const sb = vi.hoisted(() => {
  type Ouvinte = (evento: string, sessao: unknown) => unknown;

  const estado = {
    ouvinte: null as Ouvinte | null,
    papel: 's4' as string | null,
    perfil: null as Record<string, unknown> | null,
    /** Resposta da contagem de hub_area_members por chamada; a última se repete. */
    contagens: [] as RespostaContagem[],
    chamadasContagem: 0,
    /** Chamadas a supabase.auth.signOut. */
    saidas: 0,
  };

  function reiniciar() {
    estado.ouvinte = null;
    estado.papel = 's4';
    estado.perfil = { user_id: 'u', full_name: 'Pessoa', network_id: 1, created_at: '2026-01-01' };
    estado.contagens = [{ count: 1, error: null }];
    estado.chamadasContagem = 0;
    estado.saidas = 0;
  }

  const responder = <T,>(valor: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(valor), 0));

  function sessaoDe(email: string) {
    return {
      access_token: 'access',
      refresh_token: 'refresh',
      user: { id: `id:${email}`, email, app_metadata: { provider: 'email' } },
    };
  }

  function consulta(tabela: string) {
    let colunas = '';
    const construtor = {
      select(c: string) {
        colunas = c;
        return construtor;
      },
      eq() {
        return construtor;
      },
      order() {
        return construtor;
      },
      maybeSingle() {
        const data =
          tabela !== 'profiles' ? null : colunas.includes('mfa_exempt') ? { mfa_exempt: false } : estado.perfil;
        return responder({ data, error: null });
      },
      // `await supabase.from(...)...` sem modificador final: listas da PendingApproval
      // e a contagem (head) de hub_area_members.
      then(ok?: (v: unknown) => unknown, falha?: (e: unknown) => unknown) {
        if (tabela !== 'hub_area_members') {
          return responder({ data: [], error: null }).then(ok, falha);
        }
        const i = Math.min(estado.chamadasContagem, estado.contagens.length - 1);
        estado.chamadasContagem += 1;
        const resposta = estado.contagens[i];
        if (resposta === 'sem-resposta') return new Promise(() => {});
        return responder({ data: null, ...resposta }).then(ok, falha);
      },
    };
    return construtor;
  }

  const supabase = {
    auth: {
      onAuthStateChange(ouvinte: Ouvinte) {
        estado.ouvinte = ouvinte;
        return { data: { subscription: { unsubscribe: () => { estado.ouvinte = null; } } } };
      },
      getSession: async () => ({ data: { session: null }, error: null }),
      async signOut() {
        estado.saidas += 1;
        return { error: null };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }),
      },
    },
    rpc(nome: string) {
      const data = nome === 'auth_user_role_masked' ? estado.papel : nome === 'auth_network_id' ? 1 : null;
      return responder({ data, error: null });
    },
    from: (tabela: string) => consulta(tabela),
  };

  return {
    estado,
    reiniciar,
    sessaoDe,
    supabase,
    emitir: (evento: string, sessao: unknown) => estado.ouvinte?.(evento, sessao),
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: sb.supabase }));

import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import PendingApproval from '@/pages/PendingApproval';

const MONITOR = 'monitor@flag.com.br';
const USUARIO_NOVO = 'novo@flag.com.br';
/** Timeout de loading do ProtectedRoute (força logout ao estourar). */
const TIMEOUT_PROTECTED_ROUTE_MS = 12_000;
/** Texto da PendingApproval. */
const TELA_APROVACAO = 'Bem-vindo ao Operations Hub';

const ERRO_57014: RespostaContagem = {
  count: null,
  error: { code: '57014', message: 'canceling statement due to statement timeout', details: null, hint: null },
};

let caminho = '';
let pendente: boolean | null = null;

function Sondas() {
  const { pathname } = useLocation();
  const { pendingApproval } = useAuth();
  useEffect(() => {
    caminho = pathname;
    pendente = pendingApproval;
  }, [pathname, pendingApproval]);
  return null;
}

function Portal() {
  const [cliente] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={cliente}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/home']}>
          <Sondas />
          <Routes>
            <Route path="/pending-approval" element={<PendingApproval />} />
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <div>rota protegida</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const avancar = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const emitir = (evento: string, email: string) =>
  act(async () => {
    void sb.emitir(evento, sb.sessaoDe(email));
  });

async function bootar(email: string) {
  const tela = render(<Portal />);
  await emitir('INITIAL_SESSION', email);
  return tela;
}

beforeEach(() => {
  vi.useFakeTimers();
  sb.reiniciar();
  caminho = '';
  pendente = null;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('monitor com a contagem de hub_area_members sem resposta no boot', () => {
  it.each<[string, RespostaContagem]>([
    ['statement timeout (57014)', ERRO_57014],
    ['503 com corpo não JSON', { count: null, error: { message: 'Service Unavailable' } }],
    [
      'rede caída (fetch rejeitado)',
      { count: null, error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' } },
    ],
    ['resposta sem Content-Range', { count: null, error: null }],
  ])('%s: a TV vai para a rota protegida, não para a aprovação', async (_caso, resposta) => {
    sb.estado.contagens = [resposta];
    await bootar(MONITOR);
    await avancar(1_000);

    expect(caminho).toBe('/home');
    expect(screen.getByText('rota protegida')).toBeInTheDocument();
    expect(screen.queryByText(TELA_APROVACAO)).not.toBeInTheDocument();
    expect(pendente).toBe(false);
    // Tentou de novo antes de desistir.
    expect(sb.estado.chamadasContagem).toBe(2);
    expect(sb.estado.saidas).toBe(0);
  });

  it('segue fora da aprovação depois da contagem voltar e do token renovar', async () => {
    sb.estado.contagens = [ERRO_57014];
    await bootar(MONITOR);
    await avancar(1_000);

    sb.estado.contagens = [{ count: 1, error: null }];
    await avancar(60 * 60_000);
    await emitir('TOKEN_REFRESHED', MONITOR);
    await avancar(1_000);

    expect(caminho).toBe('/home');
    expect(screen.getByText('rota protegida')).toBeInTheDocument();
    expect(sb.estado.saidas).toBe(0);
  });

  it('contagem que não responde: o timeout libera o boot antes dos 12 s do ProtectedRoute, sem logout', async () => {
    sb.estado.contagens = ['sem-resposta'];
    await bootar(MONITOR);

    await avancar(7_000);
    expect(caminho).toBe('/home');
    expect(screen.getByText('rota protegida')).toBeInTheDocument();
    expect(sb.estado.chamadasContagem).toBe(2);

    await avancar(TIMEOUT_PROTECTED_ROUTE_MS);
    expect(screen.getByText('rota protegida')).toBeInTheDocument();
    expect(sb.estado.saidas).toBe(0);
  });
});

describe('aprovação preservada para quem realmente aguarda', () => {
  it('usuário novo (s4, contagem 0 respondida) vai para a aprovação', async () => {
    sb.estado.contagens = [{ count: 0, error: null }];
    await bootar(USUARIO_NOVO);
    await avancar(1_000);

    expect(caminho).toBe('/pending-approval');
    expect(screen.getByText(TELA_APROVACAO)).toBeInTheDocument();
    expect(sb.estado.chamadasContagem).toBe(1);
  });

  it('erro passageiro: a segunda tentativa responde 0 e o usuário novo ainda cai na aprovação', async () => {
    sb.estado.contagens = [ERRO_57014, { count: 0, error: null }];
    await bootar(USUARIO_NOVO);
    await avancar(1_000);

    expect(caminho).toBe('/pending-approval');
    expect(sb.estado.chamadasContagem).toBe(2);
  });

  it('contagem sem resposta numa re-hidratação não desfaz uma pendência já decidida', async () => {
    // Sem papel: a fase 3 do setSignedIn re-hidrata 2 s depois.
    sb.estado.papel = null;
    sb.estado.contagens = [{ count: 0, error: null }, ERRO_57014];
    await bootar(USUARIO_NOVO);
    await avancar(1_000);
    expect(pendente).toBe(true);

    await avancar(5_000);
    expect(sb.estado.chamadasContagem).toBe(3);
    expect(pendente).toBe(true);
    expect(caminho).toBe('/pending-approval');
  });

  it('trade-off: contagem que falha nas duas tentativas deixa o usuário novo entrar; a próxima recarga o leva à aprovação', async () => {
    // Pendência é UX: sem membership, o RLS (hub_user_has_area) não entrega dado de área.
    sb.estado.contagens = [ERRO_57014];
    const tela = await bootar(USUARIO_NOVO);
    await avancar(1_000);
    expect(caminho).toBe('/home');
    expect(pendente).toBe(false);

    tela.unmount();
    sb.estado.contagens = [{ count: 0, error: null }];
    await bootar(USUARIO_NOVO);
    await avancar(1_000);
    expect(caminho).toBe('/pending-approval');
  });
});

describe('papéis fora do auto-provisionamento', () => {
  it('admin (s1) nem consulta a contagem', async () => {
    sb.estado.papel = 's1';
    sb.estado.contagens = ['sem-resposta'];
    await bootar('admin@flag.com.br');
    await avancar(1_000);

    expect(caminho).toBe('/home');
    expect(screen.getByText('rota protegida')).toBeInTheDocument();
    expect(sb.estado.chamadasContagem).toBe(0);
  });
});
