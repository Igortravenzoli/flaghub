import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface HelpdeskSnapshot {
  id: number | null;
  periodo_tipo: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  consultor: string | null;
  total_registros: number | null;
  total_minutos: number | null;
  raw: any;
  collected_at: string | null;
}

export function useHelpdeskKpis() {
  const query = useQuery({
    queryKey: ['helpdesk', 'kpis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vw_helpdesk_kpis')
        .select('*')
        .order('collected_at', { ascending: false });
      if (error) throw error;
      return (data || []) as HelpdeskSnapshot[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const snapshots = query.data || [];

  // Latest snapshot per consultor
  const porConsultor = snapshots.reduce((acc, s) => {
    if (s.consultor && s.total_registros != null) {
      acc[s.consultor] = (acc[s.consultor] || 0) + s.total_registros;
    }
    return acc;
  }, {} as Record<string, number>);

  const totalRegistros = snapshots.reduce((sum, s) => sum + (s.total_registros || 0), 0);
  const totalMinutos = snapshots.reduce((sum, s) => sum + (s.total_minutos || 0), 0);
  const totalHoras = Math.round(totalMinutos / 60 * 10) / 10;

  const lastCollected = snapshots[0]?.collected_at || null;

  return {
    snapshots,
    porConsultor,
    totalRegistros,
    totalMinutos,
    totalHoras,
    lastSync: lastCollected,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
