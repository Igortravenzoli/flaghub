import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function usePurgeData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (networkId: number) => {
      // 1. Primeiro, remove a referência de last_import_id dos tickets
      const { error: ticketsError } = await supabase
        .from('tickets')
        .update({ last_import_id: null })
        .eq('network_id', networkId);

      if (ticketsError) throw new Error(`Erro ao atualizar tickets: ${ticketsError.message}`);

      // 2. Buscar todos os imports para deletar eventos
      const { data: imports, error: importsQueryError } = await supabase
        .from('imports')
        .select('id')
        .eq('network_id', networkId);

      if (importsQueryError) throw new Error(`Erro ao buscar imports: ${importsQueryError.message}`);

      // 3. Deletar eventos de importação (se houver imports)
      if (imports && imports.length > 0) {
        const importIds = imports.map(i => i.id);
        
        for (const importId of importIds) {
          const { error: eventsError } = await supabase
            .from('import_events')
            .delete()
            .eq('import_id', importId);

          if (eventsError) {
            console.warn(`Aviso: Erro ao deletar eventos do import ${importId}:`, eventsError);
          }
        }
      }

      // 4. Deletar os tickets (para zerar o dashboard)
      const { error: deleteTicketsError } = await supabase
        .from('tickets')
        .delete()
        .eq('network_id', networkId);

      if (deleteTicketsError) throw new Error(`Erro ao deletar tickets: ${deleteTicketsError.message}`);

      // 5. Deletar os imports
      const { error: deleteImportsError } = await supabase
        .from('imports')
        .delete()
        .eq('network_id', networkId);

      if (deleteImportsError) throw new Error(`Erro ao deletar imports: ${deleteImportsError.message}`);

      // 6. Deletar os batches
      const { error: deleteBatchesError } = await supabase
        .from('import_batches')
        .delete()
        .eq('network_id', networkId);

      if (deleteBatchesError) throw new Error(`Erro ao deletar batches: ${deleteBatchesError.message}`);

      return { success: true };
    },
    onSuccess: () => {
      // Invalidar todas as queries relevantes
      queryClient.invalidateQueries({ queryKey: ['imports-history'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}
