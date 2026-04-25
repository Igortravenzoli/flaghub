import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PbiBottleneckRow } from '@/types/pbi';

export interface PbiBottleneckFilters {
  sector?: string;
  sprintCode?: string | null;
  dateStart?: Date | null;
  dateEnd?: Date | null;
}

interface PbiHealthOverview {
  total_count: number;
  verde_count: number;
  amarelo_count: number;
  vermelho_count: number;
  items_with_bottleneck: number;
}

export function usePbiBottlenecks(filters: PbiBottleneckFilters = {}) {
  const bottlenecksQuery = useQuery({
    queryKey: ['pbi', 'bottlenecks', filters.sector, filters.sprintCode, filters.dateStart?.toISOString(), filters.dateEnd?.toISOString()],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('rpc_pbi_bottleneck_summary', {
        p_sector: filters.sector ?? null,
        p_sprint_code: filters.sprintCode ?? null,
        p_date_start: filters.dateStart ? filters.dateStart.toISOString().slice(0, 10) : null,
        p_date_end: filters.dateEnd ? filters.dateEnd.toISOString().slice(0, 10) : null,
      });
      if (error) throw error;
      return (data || []) as PbiBottleneckRow[];
    },
    staleTime: 60 * 1000,
  });

  const overviewQuery = useQuery({
    queryKey: ['pbi', 'health-overview', filters.sector, filters.sprintCode, filters.dateStart?.toISOString(), filters.dateEnd?.toISOString()],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('rpc_pbi_health_overview', {
        p_sector: filters.sector ?? null,
        p_sprint_code: filters.sprintCode ?? null,
        p_date_start: filters.dateStart ? filters.dateStart.toISOString().slice(0, 10) : null,
        p_date_end: filters.dateEnd ? filters.dateEnd.toISOString().slice(0, 10) : null,
      });
      if (error) throw error;
      return ((data || [])[0] || null) as PbiHealthOverview | null;
    },
    staleTime: 60 * 1000,
  });

  return {
    bottlenecks: bottlenecksQuery.data || [],
    overview: overviewQuery.data,
    isLoading: bottlenecksQuery.isLoading || overviewQuery.isLoading,
    isError: bottlenecksQuery.isError || overviewQuery.isError,
    error: bottlenecksQuery.error || overviewQuery.error,
    refetch: async () => {
      await Promise.all([bottlenecksQuery.refetch(), overviewQuery.refetch()]);
    },
  };
}
