import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FabricaItem {
  id: number | null;
  title: string | null;
  work_item_type: string | null;
  state: string | null;
  assigned_to_display: string | null;
  priority: number | null;
  effort: number | null;
  iteration_path: string | null;
  created_date: string | null;
  changed_date: string | null;
  parent_id: number | null;
  parent_title: string | null;
  parent_type: string | null;
}

export function useFabricaKpis() {
  const query = useQuery({
    queryKey: ['fabrica', 'kpis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_fabrica_kpis')
        .select('*');
      if (error) throw error;
      return (data || []) as FabricaItem[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const lastSyncQuery = useQuery({
    queryKey: ['fabrica', 'last-sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('devops_queries')
        .select('last_synced_at')
        .order('last_synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.last_synced_at || null;
    },
    staleTime: 60 * 1000,
  });

  const items = query.data || [];

  const total = items.length;
  const inProgress = items.filter(i => i.state === 'In Progress' || i.state === 'Active').length;
  const toDo = items.filter(i => i.state === 'To Do' || i.state === 'New').length;
  const done = items.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved').length;

  // Tags analysis
  const tagCount = (tag: string) => items.filter(i => {
    const tags = (i as any).tags || '';
    // vw_fabrica_kpis doesn't have tags column - use parent data or item data from devops_work_items
    return false;
  }).length;

  // Per collaborator
  const porColaborador = items.reduce((acc, item) => {
    const name = item.assigned_to_display || 'Não atribuído';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    items,
    total,
    inProgress,
    toDo,
    done,
    porColaborador,
    lastSync: lastSyncQuery.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
