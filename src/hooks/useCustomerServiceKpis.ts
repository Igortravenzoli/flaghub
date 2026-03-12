import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CSKpiItem {
  source: string | null;
  query_name: string | null;
  work_item_id: number | null;
  title: string | null;
  work_item_type: string | null;
  state: string | null;
  assigned_to_display: string | null;
  priority: number | null;
  created_date: string | null;
  changed_date: string | null;
  data_referencia: string | null;
  consultor_impl: string | null;
  solucao: string | null;
  status_implantacao: string | null;
}

export function useCustomerServiceKpis() {
  const query = useQuery({
    queryKey: ['customer-service', 'kpis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_customer_service_kpis')
        .select('*');
      if (error) throw error;
      return (data || []) as CSKpiItem[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Manual queue (fila CS) from cs_fila_manual_records
  const filaQuery = useQuery({
    queryKey: ['customer-service', 'fila-manual'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cs_fila_manual_records')
        .select('*')
        .order('data_entrada', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const lastSyncQuery = useQuery({
    queryKey: ['customer-service', 'last-sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('devops_queries')
        .select('last_synced_at')
        .eq('sector', 'customer_service')
        .order('last_synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.last_synced_at || null;
    },
    staleTime: 60 * 1000,
  });

  const items = query.data || [];
  const filaManual = filaQuery.data || [];

  // Separate DevOps items and implantacoes
  const devopsItems = items.filter(i => i.source === 'devops_queue');
  const implantacoes = items.filter(i => i.source === 'manual_implantacao');

  // KPI computations
  const totalFilaCS = devopsItems.length;
  const porResponsavel = devopsItems.reduce((acc, item) => {
    const resp = item.assigned_to_display || 'Não atribuído';
    acc[resp] = (acc[resp] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const implAndamento = implantacoes.filter(i => i.status_implantacao && !['finalizado', 'concluído', 'concluido'].includes(i.status_implantacao.toLowerCase()));
  const implFinalizadas = implantacoes.filter(i => i.status_implantacao && ['finalizado', 'concluído', 'concluido'].includes(i.status_implantacao.toLowerCase()));

  return {
    items,
    devopsItems,
    implantacoes,
    filaManual,
    totalFilaCS,
    porResponsavel,
    implAndamento: implAndamento.length,
    implFinalizadas: implFinalizadas.length,
    implTotal: implantacoes.length,
    lastSync: lastSyncQuery.data,
    isLoading: query.isLoading || filaQuery.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => { query.refetch(); filaQuery.refetch(); },
  };
}
