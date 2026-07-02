import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type FunilKey = 'sdr' | 'comercial';

export interface FunilEtapa {
  id: string;
  funil: FunilKey;
  etapa: string;
  icone: string | null;
  ordem: number;
  quantidade: number;
  updated_at: string;
}

const QUERY_KEY = ['comercial', 'funil'];

export function useComercialFunil() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comercial_funil')
        .select('*')
        .order('funil')
        .order('ordem');
      if (error) throw error;
      return (data || []) as FunilEtapa[];
    },
    staleTime: 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const createEtapa = useMutation({
    mutationFn: async (input: { funil: FunilKey; etapa: string; icone?: string | null; ordem: number; quantidade: number }) => {
      const { error } = await supabase.from('comercial_funil').insert({
        funil: input.funil,
        etapa: input.etapa,
        icone: input.icone ?? null,
        ordem: input.ordem,
        quantidade: input.quantidade,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateEtapa = useMutation({
    mutationFn: async (input: { id: string; etapa?: string; icone?: string | null; ordem?: number; quantidade?: number }) => {
      const { id, ...fields } = input;
      const { error } = await supabase
        .from('comercial_funil')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteEtapa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('comercial_funil').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const etapas = query.data || [];
  const sdr = etapas.filter(e => e.funil === 'sdr');
  const comercial = etapas.filter(e => e.funil === 'comercial');

  return {
    etapas,
    sdr,
    comercial,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    createEtapa,
    updateEtapa,
    deleteEtapa,
  };
}
