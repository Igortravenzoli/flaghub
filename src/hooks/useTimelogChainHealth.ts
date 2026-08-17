import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Saúde da cadeia VDESK → Azure DevOps.
 *
 * Existe porque o enfileiramento ficou quebrado por semanas sem ninguém ver: o
 * cron de postagem reportava sucesso processando fila vazia, e todo indicador
 * disponível media ATIVIDADE. Este mede BACKLOG — o que deveria ter andado e
 * não andou —, que é o único sinal que não dá falso verde.
 *
 * Fica no sino do TimeLog Executivo, e não numa tela nova de monitoramento,
 * porque é lá que o gestor já entra. Alerta que mora onde ninguém abre não
 * alerta nada.
 */

export interface SaudeCadeia {
  saudavel: boolean;
  veredito: string;
  orfaos: number;
  orfao_mais_antigo_horas: number | null;
  horas_orfas: number;
  fora_da_janela: number;
  sem_email_mapeado: number;
  fila_approved: number;
  approved_mais_antigo_h: number | null;
  presos_em_posting: number;
  em_erro: number;
  ultimo_post: string | null;
}

export function useTimelogChainHealth() {
  return useQuery({
    queryKey: ['timelog-chain-health'],
    // A cadeia tem ciclo de uma hora (enfileira aos :10, posta aos :20).
    // Reconsultar a cada 5 min é suficiente e não pesa: a função é um punhado
    // de agregados sobre índices.
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async (): Promise<SaudeCadeia | null> => {
      // A RPC é nova e ainda não está no types.ts gerado.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('rpc_timelog_chain_health', { p_days: 21 });
      if (error) throw error;
      const linha = Array.isArray(data) ? data[0] : data;
      return (linha as SaudeCadeia) ?? null;
    },
  });
}
