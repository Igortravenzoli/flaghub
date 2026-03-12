import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ComercialClient {
  id: number;
  nome: string;
  apelido: string | null;
  status: string | null;
  bandeira: string | null;
  sistemas_label: string | null;
  sistemas: any;
  synced_at: string | null;
}

export function useComercialKpis() {
  const clientsQuery = useQuery({
    queryKey: ['comercial', 'clientes-ativos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_comercial_clientes_ativos')
        .select('*');
      if (error) throw error;
      return (data || []) as ComercialClient[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const lastSyncQuery = useQuery({
    queryKey: ['comercial', 'last-sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('vdesk_clients')
        .select('synced_at')
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.synced_at || null;
    },
    staleTime: 60 * 1000,
  });

  const clients = clientsQuery.data || [];
  const totalClientes = clients.length;
  const bandeiras = [...new Set(clients.map(c => c.bandeira).filter(Boolean))];

  return {
    clients,
    totalClientes,
    bandeiras,
    lastSync: lastSyncQuery.data,
    isLoading: clientsQuery.isLoading,
    isError: clientsQuery.isError,
    error: clientsQuery.error,
    refetch: clientsQuery.refetch,
  };
}
