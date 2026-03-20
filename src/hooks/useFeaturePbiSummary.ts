import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FeaturePbiSummaryRow } from '@/types/pbi';

export interface FeatureSummaryFilters {
  sector?: string;
  sprintCode?: string | null;
  dateStart?: Date | null;
  dateEnd?: Date | null;
}

export function useFeaturePbiSummary(filters: FeatureSummaryFilters = {}) {
  const query = useQuery({
    queryKey: ['pbi', 'feature-summary', filters.sector, filters.sprintCode, filters.dateStart?.toISOString(), filters.dateEnd?.toISOString()],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('rpc_feature_pbi_summary', {
        p_sector: filters.sector ?? null,
        p_sprint_code: filters.sprintCode ?? null,
        p_date_start: filters.dateStart ? filters.dateStart.toISOString().slice(0, 10) : null,
        p_date_end: filters.dateEnd ? filters.dateEnd.toISOString().slice(0, 10) : null,
      });

      if (error) throw error;
      return (data || []) as FeaturePbiSummaryRow[];
    },
    staleTime: 60 * 1000,
  });

  return {
    rows: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
