import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PurgeResult {
  success: boolean;
  tickets_deleted: number;
  imports_deleted: number;
  batches_deleted: number;
  events_deleted: number;
}

export function usePurgeData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (networkId: number): Promise<PurgeResult> => {
      // Usar a função RPC com SECURITY DEFINER que tem permissões para deletar
      const { data, error } = await supabase.rpc('purge_network_data', {
        p_network_id: networkId,
      });

      if (error) throw new Error(error.message);
      
      return data as unknown as PurgeResult;
    },
    onSuccess: () => {
      // Invalidar todas as queries relevantes
      queryClient.invalidateQueries({ queryKey: ['imports-history'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}
