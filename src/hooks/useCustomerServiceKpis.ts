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
  web_url: string | null;
}

function isInRange(dateStr: string | null, from: Date, to: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

export function useCustomerServiceKpis(dateFrom?: Date, dateTo?: Date) {
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

  const allItems = query.data || [];
  const filaManual = filaQuery.data || [];

  // Apply date filter client-side using created_date/changed_date.
  // Manual uploads without date fields should remain visible.
  const items = (dateFrom && dateTo)
    ? allItems.filter((i) => {
        const inMainRange = isInRange(i.created_date, dateFrom, dateTo) || isInRange(i.changed_date, dateFrom, dateTo);
        if (i.source !== 'manual_implantacao') return inMainRange;

        const inReferenceRange = isInRange(i.data_referencia, dateFrom, dateTo);
        const hasAnyDate = Boolean(i.created_date || i.changed_date || i.data_referencia);

        return inMainRange || inReferenceRange || !hasAnyDate;
      })
    : allItems;

  // Separate DevOps items and implantacoes
  const devopsItems = items.filter(i => i.source === 'devops_queue');
  const implantacoes = items.filter(i => i.source === 'manual_implantacao');

  // Unfiltered counts for KPIs that should show totals
  const allDevops = allItems.filter(i => i.source === 'devops_queue');
  const allImplantacoes = allItems.filter(i => i.source === 'manual_implantacao');

  // KPI computations on filtered data
  const totalFilaCS = devopsItems.length;
  const porResponsavel = devopsItems.reduce((acc, item) => {
    const resp = item.assigned_to_display || 'Não atribuído';
    acc[resp] = (acc[resp] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const encerradoStatuses = ['finalizado', 'concluído', 'concluido', '8 - encerrado', 'encerrado', '11 - cancelado', 'cancelado'];
  const implAndamento = implantacoes.filter(i => i.status_implantacao && !encerradoStatuses.includes(i.status_implantacao.toLowerCase()));
  const implFinalizadas = implantacoes.filter(i => i.status_implantacao && encerradoStatuses.includes(i.status_implantacao.toLowerCase()));

  return {
    items,
    allItems,
    devopsItems,
    implantacoes,
    filaManual,
    totalFilaCS,
    porResponsavel,
    implAndamento: implAndamento.length,
    implFinalizadas: implFinalizadas.length,
    implTotal: implantacoes.length,
    // Unfiltered totals for reference
    allDevopsCount: allDevops.length,
    allImplCount: allImplantacoes.length,
    lastSync: lastSyncQuery.data,
    isLoading: query.isLoading || filaQuery.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => { query.refetch(); filaQuery.refetch(); },
  };
}
