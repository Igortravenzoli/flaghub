import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { chaveDoVinculo, consumirTokenDoLogin, deveEnviarVinculo, marcaDoToken } from '@/lib/timerVinculoDevops';

/**
 * Entrega à edge `timer-devops` o refresh token Microsoft do login, uma vez
 * por login, para as escritas no Azure DevOps saírem com a identidade da
 * pessoa (docs/timer-identidade-por-dev.md).
 *
 * Inerte enquanto o recurso está desligado: sem `offline_access` no login não
 * existe refresh token, e nada é enviado. Com a edge desligada, ela responde
 * `ligado: false` e não guarda nada. Falha aqui nunca aparece na tela: o
 * Timer segue gravando com o token de serviço.
 */
export function useVincularDevops(ativo: boolean) {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!ativo || !userId) return;
    let cancelado = false;
    void (async () => {
      try {
        // O do evento de login vem primeiro; a sessão guardada ainda o traz
        // até a primeira renovação da sessão da Supabase.
        let token = consumirTokenDoLogin(userId);
        if (!token) {
          const { data } = await supabase.auth.getSession();
          token = data.session?.user?.id === userId ? (data.session.provider_refresh_token ?? null) : null;
        }
        if (cancelado) return;
        const chave = chaveDoVinculo(userId);
        if (!deveEnviarVinculo(token, localStorage.getItem(chave))) return;
        // Marca ANTES de mandar: outra janela (o mini) não manda junto, e um
        // erro não vira laço. Uma tentativa por login.
        localStorage.setItem(chave, marcaDoToken(token));
        await supabase.functions.invoke('timer-devops', { body: { op: 'vincular', refresh_token: token } });
      } catch {
        // melhor-esforço: sem vínculo, a edge grava com o token de serviço
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [ativo, userId]);
}
