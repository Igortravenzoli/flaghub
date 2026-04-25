import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ImportBatch } from '@/types/database';

/**
 * Hook para buscar lotes recentes de importação
 */
export function useRecentBatches(networkId?: number, limit = 20) {
  return useQuery({
    queryKey: ['import-batches', networkId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_recent_batches' as any, {
          p_network_id: networkId ?? null,
          p_limit: limit,
        });

      if (error) throw error;
      return (data ?? []) as (ImportBatch & { imported_by_email?: string; imported_by_name?: string })[];
    },
    enabled: !!networkId,
  });
}

/**
 * Hook para buscar estatísticas detalhadas de um lote
 */
export function useBatchStatistics(batchId: number | null) {
  return useQuery({
    queryKey: ['batch-statistics', batchId],
    queryFn: async () => {
      if (!batchId) return null;

      const { data, error } = await supabase
        .rpc('get_batch_statistics' as any, { p_batch_id: batchId });

      if (error) throw error;
      return data;
    },
    enabled: !!batchId,
  });
}

/**
 * Hook para criar um novo lote de importação
 */
export function useCreateBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      networkId,
      userId,
      batchName,
      clearBeforeImport,
      notes,
    }: {
      networkId: number;
      userId: string;
      batchName?: string;
      clearBeforeImport?: boolean;
      notes?: string;
    }) => {
      console.log('[ImportBatch] Criando batch:', { networkId, userId, batchName, clearBeforeImport });
      const { data, error } = await supabase
        .from('import_batches' as any)
        .insert({
          network_id: networkId,
          imported_by: userId,
          batch_name: batchName || `Importação ${new Date().toLocaleString('pt-BR')}`,
          status: 'processing',
          clear_before_import: clearBeforeImport || false,
          notes: notes || null,
        } as any)
        .select()
        .maybeSingle();

      if (error) {
        console.error('[ImportBatch] Erro ao criar batch:', JSON.stringify(error));
        throw error;
      }
      if (!data) {
        console.error('[ImportBatch] Batch criado mas sem retorno de dados (possível RLS)');
        throw new Error('Não foi possível criar o lote de importação. Verifique suas permissões.');
      }
      console.log('[ImportBatch] Batch criado com sucesso:', data);
      return data as unknown as ImportBatch;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-batches'] });
    },
  });
}

/**
 * Hook para atualizar status de um lote
 */
export function useUpdateBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      batchId,
      status,
      totalFiles,
      totalRecords,
      errorsCount,
      warningsCount,
    }: {
      batchId: number;
      status?: 'processing' | 'success' | 'partial_success' | 'error';
      totalFiles?: number;
      totalRecords?: number;
      errorsCount?: number;
      warningsCount?: number;
    }) => {
      const updateData: any = {};

      if (status) {
        updateData.status = status;
        if (status !== 'processing') {
          updateData.completed_at = new Date().toISOString();
        }
      }
      if (totalFiles !== undefined) updateData.total_files = totalFiles;
      if (totalRecords !== undefined) updateData.total_records = totalRecords;
      if (errorsCount !== undefined) updateData.errors_count = errorsCount;
      if (warningsCount !== undefined) updateData.warnings_count = warningsCount;

      const { data, error } = await supabase
        .from('import_batches' as any)
        .update(updateData)
        .eq('id', batchId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['import-batches'] });
      queryClient.invalidateQueries({ queryKey: ['batch-statistics', variables.batchId] });
    },
  });
}

/**
 * Hook para DELETAR todos tickets da network (expurgo real)
 */
export function useDeleteTicketsByNetwork() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (networkId: number) => {
      const { data, error } = await supabase
        .rpc('delete_tickets_by_network' as any, { p_network_id: networkId });

      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}

/**
 * Hook para expurgar tickets antigos e inativos
 */
export function usePurgeOldTickets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      networkId,
      daysThreshold = 7,
    }: {
      networkId: number;
      daysThreshold?: number;
    }) => {
      const { data, error } = await supabase
        .rpc('purge_old_inactive_tickets' as any, {
          p_network_id: networkId,
          p_days_threshold: daysThreshold,
        });

      if (error) throw error;
      return data as number; // Retorna quantidade de tickets removidos
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
  });
}
