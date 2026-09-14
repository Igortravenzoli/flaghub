import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Boot do telão sem operador — 14/09/2026.
 *
 * Desde a recarga automática (src/lib/recargaTelao.ts) a TV passa pelo boot de
 * autenticação sozinha, de madrugada. Dois becos sem saída existiam nesse
 * caminho e estão reproduzidos aqui com o AuthProvider, o ProtectedRoute e o
 * Login reais — só a Supabase é simulada, com latência controlada:
 *
 *   (a) INITIAL_SESSION chega depois do timeout de 6 s do AuthContext: o boot
 *       desiste, o ProtectedRoute manda para /login, e quando a sessão aparece o
 *       Login não redirecionava. A TV ficava no formulário para sempre.
 *   (b) a hidratação passa dos 12 s do ProtectedRoute (contagem de
 *       hub_area_members sem timeout): o timeout chamava signOut(), que apaga o
 *       sb-*-auth-token. A TV era deslogada e não voltava.
 *
 * E o que não pode mudar para o usuário comum: MFA e aprovação continuam
 * decidindo o destino, e sem sessão o timeout segue forçando logout.
 */

const sb = vi.hoisted(() => {
  type Ouvinte = (evento: string, sessao: unknown) => unknown;

  const estado = {
    ouvinte: null as Ouvinte | null,
    /** Atraso por alvo: `rpc:<nome>` ou `from:<tabela>`. */
    latencia: {} as Record<string, number>,
    papel: 's4' as string | null,
    perfil: null as Record<string, unknown> | null,
    membros: 1,
    aal: { currentLevel: 'aal2', nextLevel: 'aal2' },
    getSession: (): Promise<unknown> => Promise.resolve({ data: { session: null }, error: null }),
    /** Chamadas a supabase.auth.signOut (o signOut do AuthContext sempre chega aqui). */
    saidas: 0,
  };

  function reiniciar() {
    estado.ouvinte = null;
    estado.latencia = {};
    estado.papel = 's4';
    estado.perfil = { user_id: 'u', full_name: 'Pessoa', network_id: 1, created_at: '2026-01-01' };
    estado.membros = 1;
    estado.aal = { currentLevel: 'aal2', nextLevel: 'aal2' };
    estado.getSession = () => Promise.resolve({ data: { session: null }, error: null });
    estado.saidas = 0;
  }

  function responder<T>(alvo: string, valor: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(valor), estado.latencia[alvo] ?? 0));
  }

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
      maybeSingle() {
        const data =
          tabela !== 'profiles' ? null : colunas.includes('mfa_exempt') ? { mfa_exempt: false } : estado.perfil;
        return responder(`from:${tabela}`, { data, error: null });
      },
      // `await supabase.from(...).select(..., { count, head }).eq(...)` — contagem.
      then(ok?: (v: unknown) => unknown, falha?: (e: unknown) => unknown) {
        const count = tabela === 'hub_area_members' ? estado.membros : null;
        return responder(`from:${tabela}`, { data: null, count, error: null }).then(ok, falha);
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
      getSession: () => estado.getSession(),
      async signOut() {
        estado.saidas += 1;
        return { error: null };
      },
      async signInWithPassword({ email }: { email: string }) {
        // Como a lib real: grava a sessão, avisa os ouvintes e só então resolve.
        const session = sessaoDe(email);
        void estado.ouvinte?.('SIGNED_IN', session);
        return { data: { session, user: session.user }, error: null };
      },
      async signInWithOAuth() {
        return { data: {}, error: null };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: estado.aal, error: null }),
      },
    },
    rpc(nome: string) {
      const data = nome === 'auth_user_role_masked' ? estado.papel : nome === 'auth_network_id' ? 1 : null;
      return responder(`rpc:${nome}`, { data, error: null });
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

import { AuthContext, AuthProvider, type AuthContextValue } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import Login from '@/pages/Login';

const MONITOR = 'monitor@flag.com.br';
const CHAVE_SESSAO = 'sb-nxmgppfyltwsqryfxkbm-auth-token';
/** Espelha o timeout de loading do ProtectedRoute. */
const TIMEOUT_PROTECTED_ROUTE_MS = 12_000;

const visitas: string[] = [];

function Tela({ nome }: { nome: string }) {
  useEffect(() => {
    visitas.push(nome);
  }, [nome]);
  return <div>{nome}</div>;
}

function Portal({ em = '/home' }: { em?: string }) {
  // Mesma ordem do App: o AuthProvider pode usar o QueryClient (limpeza de cache
  // por usuário), e o provider não atrapalha quando não usa.
  const [cliente] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={cliente}>
      <AuthProvider>
        <MemoryRouter initialEntries={[em]}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/mfa" element={<Tela nome="tela de MFA" />} />
            <Route path="/pending-approval" element={<Tela nome="aguardando aprovação" />} />
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <Tela nome="rota protegida" />
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

const noFormularioDeLogin = () => screen.queryByText('Entrar com Microsoft') !== null;

beforeEach(() => {
  vi.useFakeTimers();
  sb.reiniciar();
  visitas.length = 0;
  localStorage.clear();
  localStorage.setItem(CHAVE_SESSAO, '{"persistida":true}');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('(a) sessão restaurada depois do timeout de 6 s do AuthContext', () => {
  it('o Login devolve a TV para a rota de origem assim que a sessão aparece', async () => {
    // Fallback do getSession preso (ex.: refresh do token lento no boot).
    sb.estado.getSession = () => new Promise(() => {});
    render(<Portal />);

    await avancar(6_100);
    // O caminho do beco: o boot desistiu e o ProtectedRoute mandou para /login.
    expect(noFormularioDeLogin()).toBe(true);

    await emitir('INITIAL_SESSION', MONITOR);
    await avancar(100);

    expect(screen.getByText('rota protegida')).toBeInTheDocument();
    expect(noFormularioDeLogin()).toBe(false);
    expect(localStorage.getItem(CHAVE_SESSAO)).not.toBeNull();
  });

  it('login interativo de admin vai direto ao MFA: o redirect não passa na frente do handleLogin', async () => {
    sb.estado.papel = 's1';
    sb.estado.aal = { currentLevel: 'aal1', nextLevel: 'aal2' };
    // Janela em que o SIGNED_IN já chegou (sessão ativa, isLoading false) e o
    // handleLogin ainda consulta o papel para decidir o destino.
    sb.estado.latencia['rpc:auth_user_role_masked'] = 500;
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ allowed: true }) })));

    render(<Portal em="/login" />);
    await avancar(200);
    expect(noFormularioDeLogin()).toBe(true);

    fireEvent.click(screen.getByText('Acesso local'));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@flag.com.br' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await avancar(100);
    expect(screen.queryByText('rota protegida')).not.toBeInTheDocument();

    await avancar(1_000);
    expect(screen.getByText('tela de MFA')).toBeInTheDocument();
    expect(visitas).not.toContain('rota protegida');
  });
});

describe('(b) hidratação acima do timeout de 12 s do ProtectedRoute', () => {
  beforeEach(() => {
    // A contagem de hub_area_members não tem timeout: sob PostgREST lento é ela
    // que empurra a hidratação para além dos 12 s.
    sb.estado.latencia['from:hub_area_members'] = 15_000;
  });

  it('monitor: a sessão não é apagada e a TV passa a exibir sem esperar a hidratação', async () => {
    render(<Portal />);
    // A sessão chega DEPOIS de o timer ser armado — o timeout tem que enxergá-la.
    await emitir('INITIAL_SESSION', MONITOR);

    await avancar(TIMEOUT_PROTECTED_ROUTE_MS + 500);

    expect(sb.estado.saidas).toBe(0);
    expect(localStorage.getItem(CHAVE_SESSAO)).not.toBeNull();
    expect(noFormularioDeLogin()).toBe(false);
    expect(screen.getByText('rota protegida')).toBeInTheDocument();

    await avancar(3_000);
    expect(screen.getByText('rota protegida')).toBeInTheDocument();
    expect(sb.estado.saidas).toBe(0);
  });

  it('usuário comum: sessão mantida, rota segue barrada e o MFA ainda é cobrado ao fim', async () => {
    sb.estado.papel = 's2';
    sb.estado.aal = { currentLevel: 'aal1', nextLevel: 'aal2' };
    render(<Portal />);
    await emitir('INITIAL_SESSION', 'gestora@flag.com.br');

    await avancar(TIMEOUT_PROTECTED_ROUTE_MS + 500);

    expect(sb.estado.saidas).toBe(0);
    expect(localStorage.getItem(CHAVE_SESSAO)).not.toBeNull();
    expect(noFormularioDeLogin()).toBe(false);
    expect(screen.queryByText('rota protegida')).not.toBeInTheDocument();
    expect(screen.getByText(/demorando para carregar/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();

    await avancar(3_000);
    expect(screen.getByText('tela de MFA')).toBeInTheDocument();
  });

  it('usuário recém-provisionado: sessão mantida e ainda cai na aprovação', async () => {
    sb.estado.papel = 's4';
    sb.estado.membros = 0;
    render(<Portal />);
    await emitir('INITIAL_SESSION', 'novo@flag.com.br');

    await avancar(TIMEOUT_PROTECTED_ROUTE_MS + 500);

    expect(sb.estado.saidas).toBe(0);
    expect(localStorage.getItem(CHAVE_SESSAO)).not.toBeNull();
    expect(screen.queryByText('rota protegida')).not.toBeInTheDocument();

    await avancar(3_000);
    expect(screen.getByText('aguardando aprovação')).toBeInTheDocument();
  });

  it('sem sessão, o timeout segue forçando logout (comportamento preservado)', async () => {
    const valor = {
      isLoading: true,
      isAuthenticated: false,
      isMonitor: false,
      mfaRequired: false,
      pendingApproval: false,
      role: null,
      signOut: async () => {
        sb.estado.saidas += 1;
        return { error: null };
      },
    } as unknown as AuthContextValue;

    render(
      <AuthContext.Provider value={valor}>
        <MemoryRouter initialEntries={['/home']}>
          <Routes>
            <Route path="/login" element={<Tela nome="login" />} />
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <Tela nome="rota protegida" />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    await avancar(TIMEOUT_PROTECTED_ROUTE_MS);

    expect(sb.estado.saidas).toBe(1);
    expect(screen.getByText('login')).toBeInTheDocument();
  });
});
