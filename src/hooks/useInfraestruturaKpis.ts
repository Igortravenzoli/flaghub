import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InfraItem {
  id: number | null;
  title: string | null;
  work_item_type: string | null;
  state: string | null;
  assigned_to_display: string | null;
  priority: number | null;
  effort: number | null;
  tags: string | null;
  created_date: string | null;
  changed_date: string | null;
}

export function useInfraestruturaKpis() {
  const query = useQuery({
    queryKey: ['infraestrutura', 'kpis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_infraestrutura_kpis')
        .select('*');
      if (error) throw error;
      return (data || []) as InfraItem[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const lastSyncQuery = useQuery({
    queryKey: ['infraestrutura', 'last-sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('devops_queries')
        .select('last_synced_at')
        .eq('sector', 'infraestrutura')
        .order('last_synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.last_synced_at || null;
    },
    staleTime: 60 * 1000,
  });

  const items = query.data || [];

  const total = items.length;
  const pendentes = items.filter(i => i.state === 'New' || i.state === 'To Do').length;
  const emAndamento = items.filter(i => i.state === 'In Progress' || i.state === 'Active').length;
  const concluidos = items.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved').length;

  // Tag-based counters
  const countByTag = (tag: string) => items.filter(i => i.tags?.toUpperCase().includes(tag.toUpperCase())).length;

  const melhorias = countByTag('MELHORIA');
  const iso27001 = countByTag('ISO27001') + countByTag('ISO');
  const transbordo = countByTag('TRANSBORDO');

  // Per state for backlog/dev breakdown
  const backlog = items.filter(i => i.state === 'New' || i.state === 'To Do').length;
  const dev = items.filter(i => i.state === 'In Progress' || i.state === 'Active').length;

  return {
    items,
    total,
    pendentes,
    emAndamento,
    concluidos,
    melhorias,
    iso27001,
    transbordo,
    backlog,
    dev,
    lastSync: lastSyncQuery.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
