import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

export interface QualidadeItem {
  id: number | null;
  title: string | null;
  work_item_type: string | null;
  state: string | null;
  assigned_to_display: string | null;
  priority: number | null;
  created_date: string | null;
  changed_date: string | null;
  web_url: string | null;
  qa_retorno_count?: number;
}

function isInRange(dateStr: string | null, from: Date, to: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

export function useQualidadeKpis(dateFrom?: Date, dateTo?: Date) {
  const query = useQuery({
    queryKey: ['qualidade', 'kpis'],
    queryFn: async () => {
      return fetchAllRows<QualidadeItem>((from, to) =>
        supabase.from('vw_qualidade_kpis').select('*').range(from, to)
      );
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch retorno QA counts from devops_work_items custom_fields
  const retornoQuery = useQuery({
    queryKey: ['qualidade', 'retornos'],
    queryFn: async () => {
      const qaIds = (query.data || []).map(i => i.id).filter(Boolean) as number[];
      if (qaIds.length === 0) return new Map<number, number>();
      
      const retornoMap = new Map<number, number>();
      for (let i = 0; i < qaIds.length; i += 1000) {
        const chunk = qaIds.slice(i, i + 1000);
        const { data } = await supabase
          .from('devops_work_items')
          .select('id, custom_fields')
          .in('id', chunk);
        
        for (const item of (data || [])) {
          const cf = item.custom_fields as Record<string, any> | null;
          if (cf?.qa_retorno_count != null) {
            retornoMap.set(item.id, cf.qa_retorno_count);
          }
        }
      }
      return retornoMap;
    },
    enabled: !!query.data && query.data.length > 0,
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

  const allItems = query.data || [];
  const retornoMap = retornoQuery.data || new Map<number, number>();

  // Enrich items with retorno count
  const enrichedItems: QualidadeItem[] = allItems.map(item => ({
    ...item,
    qa_retorno_count: item.id ? (retornoMap.get(item.id) ?? 0) : 0,
  }));

  const items = (dateFrom && dateTo)
    ? enrichedItems.filter(i => isInRange(i.created_date, dateFrom, dateTo) || isInRange(i.changed_date, dateFrom, dateTo))
    : enrichedItems;

  const total = items.length;
  const filaQA = items.filter(i => i.state === 'New' || i.state === 'To Do' || i.state === 'Active').length;
  const emTeste = items.filter(i => i.state === 'In Progress' || i.state === 'Testing').length;
  const finalizados = items.filter(i => i.state === 'Done' || i.state === 'Closed' || i.state === 'Resolved').length;
  const taxaVazao = total > 0 ? Math.round((finalizados / total) * 100) : 0;

  // Retorno QA KPIs
  const itensComRetorno = items.filter(i => (i.qa_retorno_count ?? 0) > 0);
  const totalRetornos = items.reduce((sum, i) => sum + (i.qa_retorno_count ?? 0), 0);
  const taxaRetorno = total > 0 ? Math.round((itensComRetorno.length / total) * 100) : 0;

  return {
    items,
    total,
    filaQA,
    emTeste,
    finalizados,
    taxaVazao,
    totalRetornos,
    itensComRetorno: itensComRetorno.length,
    taxaRetorno,
    lastSync: lastSyncQuery.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
