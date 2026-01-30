import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useClearImports() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (networkId: number) => {
      const { data, error } = await supabase.rpc('hide_imports', {
        p_network_id: networkId,
      });

      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports-history'] });
    },
  });
}
