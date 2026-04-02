import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GerencialFabricaRow {
  sprint_code: string;
  total_itens: number;
  done_count: number;
  in_progress_count: number;
  transbordo_count: number;
  despriorizado_count: number;
  retorno_backlog_count: number;
  avg_lead_time_days: number | null;
  max_lead_time_days: number | null;
  gargalo_principal: string | null;
  gargalo_avg_days: number | null;
  qa_return_total: number;
  itens_criticos: number;
  itens_atencao: number;
  itens_saudaveis: number;
}

export function useGerencialFabrica(sprintCode?: string, dateStart?: string, dateEnd?: string) {
  return useQuery({
    queryKey: ['gerencial-fabrica', sprintCode, dateStart, dateEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_gerencial_fabrica_summary', {
        p_sprint_code: sprintCode || null,
        p_date_start: dateStart || null,
        p_date_end: dateEnd || null,
        p_sector: null,
      });
      if (error) throw error;
      return (data || []) as unknown as GerencialFabricaRow[];
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
