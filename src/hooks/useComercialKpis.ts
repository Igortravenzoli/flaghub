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

export type ClientStatusFilter = 'todos' | 'ativo' | 'inativo' | 'bloqueado';

export function useComercialKpis(statusFilter: ClientStatusFilter = 'todos') {
  const clientsQuery = useQuery({
    queryKey: ['comercial', 'clientes', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('vw_comercial_clientes_ativos')
        .select('*');

      if (statusFilter !== 'todos') {
        // Case-insensitive match via ilike
        query = query.ilike('status', statusFilter);
      }

      const { data, error } = await query;
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

  // Stats query (always all clients for KPI counts)
  const statsQuery = useQuery({
    queryKey: ['comercial', 'stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_comercial_clientes_ativos')
        .select('status');
      if (error) throw error;
      const all = data || [];
      const ativos = all.filter(c => c.status?.toLowerCase() === 'ativo').length;
      const inativos = all.filter(c => c.status?.toLowerCase() === 'inativo').length;
      const bloqueados = all.filter(c => c.status?.toLowerCase() === 'bloqueado').length;
      return { total: all.length, ativos, inativos, bloqueados };
    },
    staleTime: 5 * 60 * 1000,
  });

  const clients = clientsQuery.data || [];
  const totalClientes = clients.length;
  const bandeiras = [...new Set(clients.map(c => c.bandeira).filter(Boolean))];
  const stats = statsQuery.data || { total: 0, ativos: 0, inativos: 0, bloqueados: 0 };

  return {
    clients,
    totalClientes,
    bandeiras,
    stats,
    lastSync: lastSyncQuery.data,
    isLoading: clientsQuery.isLoading,
    isError: clientsQuery.isError,
    error: clientsQuery.error,
    refetch: clientsQuery.refetch,
  };
}
