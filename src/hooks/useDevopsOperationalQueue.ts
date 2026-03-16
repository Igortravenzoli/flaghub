import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DevopsOperationalItem {
  query_name: string | null;
  work_item_id: number | null;
  title: string | null;
  work_item_type: string | null;
  state: string | null;
  assigned_to_display: string | null;
  priority: number | null;
  effort: number | null;
  iteration_path: string | null;
  web_url: string | null;
  changed_date: string | null;
  created_date: string | null;
  tags: string | null;
  sector: string | null;
}

export function useDevopsOperationalQueue(queryNames: string[]) {
  const normalizedNames = [...new Set(queryNames.filter(Boolean))];

  const query = useQuery({
    queryKey: ['devops-operational-queue', normalizedNames.join('|')],
    queryFn: async () => {
      if (normalizedNames.length === 0) return [] as DevopsOperationalItem[];

      const { data, error } = await supabase
        .from('vw_devops_queue_items')
        .select('query_name, work_item_id, title, work_item_type, state, assigned_to_display, priority, effort, iteration_path, web_url, changed_date, created_date, tags, sector')
        .in('query_name', normalizedNames)
        .order('changed_date', { ascending: false, nullsFirst: false });

      if (error) throw error;
      return (data || []) as DevopsOperationalItem[];
    },
    staleTime: 2 * 60 * 1000,
  });

  const items = query.data || [];

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
