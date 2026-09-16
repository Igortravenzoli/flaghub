import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { vi, describe, it, expect, beforeEach } from 'vitest';

/**
 * Cache do React Query × fim de sessão (14/09/2026).
 *
 * Várias queryKeys não levam o id do usuário, e hooks com staleTime de 30–60 min
 * nem rebuscam ao montar. Antes, nada limpava o cache no logout: o próximo
 * usuário da mesma aba via as linhas da sessão anterior enquanto o gcTime
 * durasse (5 min; 2 h para consultas vistas no telão).
 *
 * O que este arquivo protege:
 *   • signOut e troca de usuário limpam o cache;
 *   • o telão NÃO perde o cache em TOKEN_REFRESHED, SIGNED_IN repetido,
 *     re-hidratação ou sessão que cai e volta com o mesmo monitor — cada limpeza
 *     ali é o download inteiro de todos os setores de novo;
 *   • a tela montada na troca de usuário rebusca em vez de ficar presa à query
 *     destruída, com as linhas do anterior.
 */

type Ouvinte = (event: string, session: Session | null) => Promise<void>;

let ouvinte: Ouvinte | null = null;
/** Enquanto pendente, as RPCs de claims seguram a hidratação do AuthProvider. */
let bloqueioHidratacao: Promise<void> | null = null;

function consulta() {
  const perfil = { user_id: 'x', full_name: 'X', network_id: 1, created_at: '', mfa_exempt: true };
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: perfil, error: null }),
    // `await from('hub_area_members').select(...).eq(...).eq(...)`
    then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null, count: 1 }),
  };
  return q;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => consulta(),
    rpc: async (nome: string) => {
      if (bloqueioHidratacao) await bloqueioHidratacao;
      return { data: nome === 'auth_user_role_masked' ? 's2' : 1, error: null };
    },
    auth: {
      onAuthStateChange: (cb: Ouvinte) => {
        ouvinte = cb;
        return { data: { subscription: { unsubscribe: () => { ouvinte = null; } } } };
      },
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => {
        await ouvinte?.('SIGNED_OUT', null);
        return { error: null };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } }),
      },
    },
  },
}));

import { AuthProvider, type AuthContextValue } from '@/contexts/AuthContext';
import { useAuth } from '@/hooks/useAuth';

const MONITOR = 'monitor@flag.com.br';
const CHAVE = ['fabrica', 'roster'];

function sessao(id: string, email = `${id}@flag.com.br`, token = `${id}-token-1`): Session {
  return {
    access_token: token,
    refresh_token: `${id}-refresh`,
    expires_in: 3600,
    token_type: 'bearer',
    user: { id, email, app_metadata: { provider: 'email' }, user_metadata: {}, aud: 'authenticated', created_at: '' },
  } as unknown as Session;
}

let auth: AuthContextValue | null = null;
function Sonda() {
  auth = useAuth();
  return <span data-testid="usuario">{auth.user?.id ?? 'ninguem'}</span>;
}

function novoClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function montar(qc: QueryClient, extra?: ReactNode) {
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Sonda />
        {extra}
      </AuthProvider>
    </QueryClientProvider>,
  );
}

async function emitir(event: string, session: Session | null) {
  await act(async () => {
    await ouvinte!(event, session);
  });
}

async function entrar(qc: QueryClient, s: Session, extra?: ReactNode) {
  montar(qc, extra);
  await emitir('INITIAL_SESSION', s);
  await waitFor(() => expect(auth?.isLoading).toBe(false));
}

const semearLinhas = (qc: QueryClient, dono: string) => qc.setQueryData(CHAVE, [`linha de ${dono}`]);

describe('Cache do React Query × sessão', () => {
  beforeEach(() => {
    ouvinte = null;
    bloqueioHidratacao = null;
    auth = null;
    localStorage.clear();
  });

  it('signOut limpa o cache antes de o próximo usuário usar a aba', async () => {
    const qc = novoClient();
    await entrar(qc, sessao('user-a'));
    semearLinhas(qc, 'user-a');

    await act(async () => {
      await auth!.signOut();
    });

    expect(screen.getByTestId('usuario')).toHaveTextContent('ninguem');
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });

  it('primeiro login da aba (ninguém → usuário) não descarta o que já estava em cache', async () => {
    const qc = novoClient();
    semearLinhas(qc, 'pre-carregado');
    montar(qc);
    await emitir('INITIAL_SESSION', null);
    expect(screen.getByTestId('usuario')).toHaveTextContent('ninguem');

    await emitir('SIGNED_IN', sessao('user-a'));

    expect(screen.getByTestId('usuario')).toHaveTextContent('user-a');
    expect(qc.getQueryData(CHAVE)).toEqual(['linha de pre-carregado']);
  });

  it('telão: TOKEN_REFRESHED, SIGNED_IN repetido e re-hidratação mantêm o cache intacto', async () => {
    const qc = novoClient();
    await entrar(qc, sessao('monitor-id', MONITOR));
    semearLinhas(qc, 'monitor');
    const query = qc.getQueryCache().find({ queryKey: CHAVE });

    // Sessão nova (outro token, outro objeto user) para o MESMO id.
    await emitir('TOKEN_REFRESHED', sessao('monitor-id', MONITOR, 'monitor-token-2'));
    await emitir('SIGNED_IN', sessao('monitor-id', MONITOR, 'monitor-token-2'));
    // Fallback do getSession (100 ms) e hidratação terminando depois.
    await act(() => new Promise((r) => setTimeout(r, 150)));

    expect(auth?.isMonitor).toBe(true);
    // Mesma instância: nada foi removido e recriado por baixo.
    expect(qc.getQueryCache().find({ queryKey: CHAVE })).toBe(query);
    expect(qc.getQueryData(CHAVE)).toEqual(['linha de monitor']);
  });

  it('telão: sessão que cai por evento e volta com o mesmo monitor mantém o cache', async () => {
    const qc = novoClient();
    await entrar(qc, sessao('monitor-id', MONITOR));
    semearLinhas(qc, 'monitor');

    await emitir('TOKEN_REFRESH_FAILED', null);
    expect(screen.getByTestId('usuario')).toHaveTextContent('ninguem');
    expect(qc.getQueryData(CHAVE)).toEqual(['linha de monitor']);

    await emitir('SIGNED_IN', sessao('monitor-id', MONITOR, 'monitor-token-2'));
    expect(qc.getQueryData(CHAVE)).toEqual(['linha de monitor']);
  });

  it('outro usuário direto na mesma aba (A → B) limpa o cache', async () => {
    const qc = novoClient();
    await entrar(qc, sessao('user-a'));
    semearLinhas(qc, 'user-a');

    await emitir('SIGNED_IN', sessao('user-b'));

    expect(screen.getByTestId('usuario')).toHaveTextContent('user-b');
    expect(qc.getQueryData(CHAVE)).toBeUndefined();
  });

  it('sessão encerrada por evento e login de outro usuário (A → ninguém → B) limpa o cache', async () => {
    const qc = novoClient();
    await entrar(qc, sessao('user-a'));
    semearLinhas(qc, 'user-a');

    // Logout vindo de outra aba: não passa pelo signOut desta.
    await emitir('SIGNED_OUT', null);
    await emitir('SIGNED_IN', sessao('user-b'));

    expect(qc.getQueryData(CHAVE)).toBeUndefined();
  });

  it('tela montada na troca de usuário rebusca na hora, sem esperar a hidratação', async () => {
    // O "servidor" responde conforme o usuário da sessão (RLS).
    let usuarioNoServidor = 'user-a';
    function Painel() {
      useAuth();
      const { data } = useQuery({
        queryKey: CHAVE,
        queryFn: async () => [`linha de ${usuarioNoServidor}`],
        staleTime: 60 * 60 * 1000,
      });
      return <span data-testid="painel">{data?.[0] ?? 'carregando'}</span>;
    }

    const qc = novoClient();
    await entrar(qc, sessao('user-a'), <Painel />);
    await waitFor(() => expect(screen.getByTestId('painel')).toHaveTextContent('linha de user-a'));

    let liberar!: () => void;
    bloqueioHidratacao = new Promise<void>((r) => { liberar = r; });
    usuarioNoServidor = 'user-b';
    let troca!: Promise<void>;
    act(() => {
      troca = ouvinte!('SIGNED_IN', sessao('user-b'));
    });

    // Com a hidratação de B ainda pendente, nenhum render de auth vai "salvar" o
    // Painel: ele só sai de user-a se a limpeza aconteceu antes de se religar ao cache.
    await waitFor(() => expect(screen.getByTestId('painel')).toHaveTextContent('linha de user-b'));

    liberar();
    await act(() => troca);
  });
});
