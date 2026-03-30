import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ComercialClient {
  id: number;
  nome: string;
  apelido: string | null;
  status: string | null;
  bandeira: string | null;
  bandeira_cod: string | null;
  sistemas_label: string | null;
  sistemas: any;
  synced_at: string | null;
}

export type ClientStatusFilter = 'todos' | 'ativo' | 'inativo' | 'bloqueado';

/** Fetch all rows from a view, bypassing the 1000-row default limit */
async function fetchAllClients(select: string, filter?: { column: string; value: string }) {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let q = supabase.from('vw_comercial_clientes_ativos').select(select).range(from, from + PAGE - 1);
    if (filter) q = q.ilike(filter.column, filter.value);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    all = all.concat(rows);
    hasMore = rows.length === PAGE;
    from += PAGE;
  }
  return all;
}

export function useComercialKpis(statusFilter: ClientStatusFilter = 'todos', dateFrom?: Date, dateTo?: Date) {
  const clientsQuery = useQuery({
    queryKey: ['comercial', 'clientes', statusFilter],
    queryFn: async () => {
      const filter = statusFilter !== 'todos'
        ? { column: 'status', value: statusFilter }
        : undefined;
      return fetchAllClients('*', filter) as Promise<ComercialClient[]>;
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

  const statsQuery = useQuery({
    queryKey: ['comercial', 'stats'],
    queryFn: async () => {
      const all = await fetchAllClients('status');
      const ativos = all.filter(c => c.status?.toLowerCase() === 'ativo').length;
      const inativos = all.filter(c => c.status?.toLowerCase() === 'inativo').length;
      const bloqueados = all.filter(c => c.status?.toLowerCase() === 'bloqueado').length;
      return { total: all.length, ativos, inativos, bloqueados };
    },
    staleTime: 5 * 60 * 1000,
  });

  const allClients = clientsQuery.data || [];

  // Apply date range filter on synced_at
  const clients = (dateFrom && dateTo)
    ? allClients.filter(c => {
        if (!c.synced_at) return false;
        const d = new Date(c.synced_at);
        return d >= dateFrom && d <= dateTo;
      })
    : allClients;

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
