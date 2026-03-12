import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface QualidadeItem {
  id: number | null;
  title: string | null;
  work_item_type: string | null;
  state: string | null;
  assigned_to_display: string | null;
  priority: number | null;
  created_date: string | null;
  changed_date: string | null;
}

export function useQualidadeKpis() {
  const query = useQuery({
    queryKey: ['qualidade', 'kpis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_qualidade_kpis')
        .select('*');
      if (error) throw error;
      return (data || []) as QualidadeItem[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const lastSyncQuery = useQuery({
    queryKey: ['qualidade', 'last-sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('devops_queries')
        .select('last_synced_at')
        .eq('sector', 'qualidade')
        .order('last_synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.last_synced_at || null;
    },
    staleTime: 60 * 1000,
  });

  const items = query.data || [];

  const total = items.length;
  const filaQA = items.filter(i => i.state === 'New' || i.state === 'To Do' || i.state === 'Active').length;
  const emTeste = items.filter(i => i.state === 'In Progress' || i.state === 'Testing').length;
  const finalizados = items.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved').length;

  const taxaVazao = total > 0 ? Math.round((finalizados / total) * 100) : 0;

  return {
    items,
    total,
    filaQA,
    emTeste,
    finalizados,
    taxaVazao,
    lastSync: lastSyncQuery.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
