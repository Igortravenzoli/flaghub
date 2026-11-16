import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { detectarCliente, detectarPlataforma, versaoDesktop } from '@/lib/timerAcesso';

export interface TimerAcessoLinha {
  status: 'ativo' | 'revogado';
  origem: 'sso_auto' | 'admin';
  devops_guid: string | null;
  devops_display: string | null;
  concedido_em: string;
  motivo_revogacao: string | null;
}

export interface RespostaAtivar {
  ok: boolean;
  novo?: boolean;
  motivo?: string;
  mensagem?: string;
  devops?: { encontrado: boolean; display: string | null; erro: string | null };
}

const chave = (userId: string | undefined) => ['timer-acesso', userId ?? 'anon'] as const;

/** timer_access e timer_eventos ainda não estão no types.ts gerado. */
const db = supabase as unknown as SupabaseClient;

/**
 * A linha do próprio usuário em timer_access (a RLS só devolve a dele).
 * Muda só quando a pessoa ativa ou o admin revoga, então herda o staleTime
 * global de 5 min e não refaz no foco.
 */
export function useTimerAcesso() {
  const { user, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: chave(user?.id),
    enabled: isAuthenticated && !!user?.id,
    queryFn: async (): Promise<TimerAcessoLinha | null> => {
      const { data, error } = await db
        .from('timer_access')
        .select('status, origem, devops_guid, devops_display, concedido_em, motivo_revogacao')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as TimerAcessoLinha | null) ?? null;
    },
  });
}

/** Pede à edge a concessão automática (valida o SSO do lado do servidor). */
export function useAtivarTimer() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<RespostaAtivar> => {
      const { data, error } = await supabase.functions.invoke('timer-devops', { body: { op: 'ativar' } });
      if (error) {
        // A edge responde 403/503 com { motivo, mensagem }: devolve isso à tela.
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            return (await ctx.json()) as RespostaAtivar;
          } catch {
            /* cai no erro genérico */
          }
        }
        return { ok: false, motivo: 'falha_de_rede', mensagem: 'Não foi possível falar com o servidor. Tente de novo.' };
      }
      return data as RespostaAtivar;
    },
    onSuccess: (r) => {
      if (r.ok) void qc.invalidateQueries({ queryKey: chave(user?.id) });
    },
  });
}

/** Trilha de uso relatada pelo app (lista fechada no servidor). Nunca quebra a tela. */
export async function registrarEventoTimer(
  evento: 'abriu' | 'baixou_instalador' | 'janela_oculta' | 'janela_visivel' | 'erro_cliente',
  detalhe: Record<string, unknown> = {},
): Promise<void> {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const path = typeof window !== 'undefined' ? window.location.pathname : '/timer';
    await db.rpc('timer_registrar_evento', {
      p_evento: evento,
      p_cliente: detectarCliente(ua, path),
      p_plataforma: detectarPlataforma(ua),
      p_versao_app: versaoDesktop(ua),
      p_detalhe: detalhe,
    });
  } catch {
    // trilha é melhor-esforço
  }
}
