import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MovimentacaoCliente } from './useComercialMovimentacao';

export interface MovimentacaoManualInput {
  cliente_codigo: number;
  cliente_nome: string;
  tipo: 'ganho' | 'perda' | 'risco';
  bandeira?: string;
  sistema?: string;
  motivo?: string;
  status_encerramento?: string;
  valor_mensal?: number;
  ano_referencia?: number;
  data_evento?: string;
}

export function useComercialMovimentacaoManual() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: MovimentacaoManualInput) => {
      // ✅ Usar RPC segura (não expõe service role key)
      const { data, error } = await supabase.rpc(
        'insert_movimentacao_comercial',
        {
          p_cliente_codigo: input.cliente_codigo,
          p_cliente_nome: input.cliente_nome,
          p_tipo: input.tipo,
          p_bandeira: input.bandeira || null,
          p_sistema: input.sistema || null,
          p_motivo: input.motivo || null,
          p_status_encerramento: input.status_encerramento || null,
          p_valor_mensal: input.valor_mensal || null,
          p_ano_referencia: input.ano_referencia || null,
          p_data_evento: input.data_evento || null,
        }
      );

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comercial', 'movimentacao'] });
    },
  });
}

export function useComercialMovimentacaoUpdate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<MovimentacaoManualInput>) => {
      const { id, ...updateData } = input;
      
      const { data, error } = await supabase.rpc(
        'update_movimentacao_comercial',
        {
          p_id: id,
          p_tipo: updateData.tipo || null,
          p_bandeira: updateData.bandeira || null,
          p_sistema: updateData.sistema || null,
          p_motivo: updateData.motivo || null,
          p_status_encerramento: updateData.status_encerramento || null,
          p_valor_mensal: updateData.valor_mensal || null,
          p_ano_referencia: updateData.ano_referencia || null,
          p_data_evento: updateData.data_evento || null,
        }
      );

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comercial', 'movimentacao'] });
    },
  });
}

export function useComercialMovimentacaoDelete() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc(
        'delete_movimentacao_comercial',
        { p_id: id }
      );

      if (error) throw new Error(error.message);
      if (!data?.[0]?.success) throw new Error(data?.[0]?.message || 'Falha ao deletar');
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comercial', 'movimentacao'] });
    },
  });
}
