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

export interface ConsultorKpi {
  nome: string;
  totalRegistros: number;
  totalMinutos: number;
}

export interface TipoChamadoKpi {
  tipo: string;
  quantidade: number;
  tempoMedio: number;
}

export interface RegistroPorGrupo {
  nome: string;
  quantidade: number;
}

export interface HorasDia {
  data: string;
  totalMinutos: number;
  totalHoras: number;
}

export interface HistoricoEntry {
  date: string;
  totalRegistros: number;
  totalMinutos: number;
  totalHoras: number;
}

export function useHelpdeskKpis(dateFrom?: Date, dateTo?: Date) {
  const fromKey = dateFrom ? dateFrom.toISOString().slice(0, 10) : 'all';
  const toKey = dateTo ? dateTo.toISOString().slice(0, 10) : 'all';

  const query = useQuery({
    queryKey: ['helpdesk', 'kpis', fromKey, toKey],
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
  const fromBoundary = dateFrom ? new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate(), 0, 0, 0, 0) : null;
  const toBoundary = dateTo ? new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999) : null;
  const scopedSnapshots = (dateFrom && dateTo)
    ? snapshots.filter(s => {
        if (!s.collected_at) return false;
        const d = new Date(s.collected_at);
        return !!fromBoundary && !!toBoundary && d >= fromBoundary && d <= toBoundary;
      })
    : snapshots;

  // ── Aggregate across ALL scoped snapshots for historical view ──
  // Group snapshots by date, take the latest per day for KPI aggregation
  const snapshotsByDay = new Map<string, HelpdeskSnapshot>();
  for (const s of scopedSnapshots) {
    if (!s.collected_at) continue;
    const day = s.collected_at.slice(0, 10);
    const existing = snapshotsByDay.get(day);
    if (!existing || (s.collected_at > (existing.collected_at || ''))) {
      snapshotsByDay.set(day, s);
    }
  }

  // Build historical trend from daily snapshots
  const historico: HistoricoEntry[] = Array.from(snapshotsByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, s]) => ({
      date,
      totalRegistros: s.total_registros ?? 0,
      totalMinutos: s.total_minutos ?? 0,
      totalHoras: Math.round((s.total_minutos ?? 0) / 60 * 10) / 10,
    }));

  // Get the latest snapshot with POPULATED raw data (not empty arrays)
  const latestWithRaw = scopedSnapshots.find(s => {
    if (!s.raw || typeof s.raw !== 'object') return false;
    const r = s.raw as any;
    return (r.registrosPorConsultor?.length > 0) ||
           (r.ocorrenciasPorTipo?.length > 0) ||
           (r.acumulado?.totalRegistros > 0);
  });
  const raw = latestWithRaw?.raw || {};

  // Parse KPIs from raw JSONB
  const registrosPorConsultor: ConsultorKpi[] = (raw.registrosPorConsultor || []).map((c: any) => ({
    nome: c.consultor || c.nome || 'N/A',
    totalRegistros: c.totalRegistros || c.quantidade || 0,
    totalMinutos: c.totalMinutos || 0,
  }));

  const tipoChamadoTempoMedio: TipoChamadoKpi[] = (raw.tipoChamadoTempoMedio || []).map((t: any) => ({
    tipo: t.tipo || t.tipoChamado || 'N/A',
    quantidade: t.quantidade || t.totalRegistros || 0,
    tempoMedio: t.tempoMedio || t.tempoMedioMinutos || 0,
  }));

  const registrosPorSistema: RegistroPorGrupo[] = (raw.registrosPorSistema || []).map((s: any) => ({
    nome: s.nomeSistema || s.sistema || s.nome || 'N/A',
    quantidade: s.totalRegistros || s.quantidade || 0,
  }));

  const registrosPorBandeira: RegistroPorGrupo[] = (raw.registrosPorBandeira || []).map((b: any) => ({
    nome: b.bandeira || b.nome || 'N/A',
    quantidade: b.quantidade || b.totalRegistros || 0,
  }));

  const registrosPorCliente: RegistroPorGrupo[] = (raw.registrosPorCliente || []).map((c: any) => ({
    nome: c.cliente || c.nome || 'N/A',
    quantidade: c.quantidade || c.totalRegistros || 0,
  }));

  const horasTotaisPorDia: HorasDia[] = (raw.horasTotaisPorDia || []).map((h: any) => ({
    data: h.data || h.dia || '',
    totalMinutos: h.totalMinutos || 0,
    totalHoras: Math.round((h.totalMinutos || 0) / 60 * 10) / 10,
  }));

  const ocorrenciasPorTipo: RegistroPorGrupo[] = (raw.ocorrenciasPorTipo || []).map((o: any) => ({
    nome: o.tipo || o.nome || 'N/A',
    quantidade: o.total || o.quantidade || o.totalRegistros || 0,
  }));

  // Acumulado
  const acumulado = raw.acumulado || {};
  const totalRegistros = acumulado.totalRegistros || 
    registrosPorConsultor.reduce((s, c) => s + c.totalRegistros, 0);
  const totalMinutos = acumulado.totalMinutos || 
    registrosPorConsultor.reduce((s, c) => s + c.totalMinutos, 0);
  const totalHoras = Math.round(totalMinutos / 60 * 10) / 10;

  // Daily hours for today
  const hoje = new Date().toISOString().split('T')[0];
  const horasHoje = horasTotaisPorDia.find(h => h.data === hoje);
  const horasDiaTotal = horasHoje ? horasHoje.totalHoras : 
    horasTotaisPorDia.length > 0 ? horasTotaisPorDia[horasTotaisPorDia.length - 1].totalHoras : 0;

  const lastCollected = scopedSnapshots[0]?.collected_at || null;
  const periodo = raw.periodo || null;

  // Total snapshots in period for transparency
  const totalSnapshotsNoPeriodo = scopedSnapshots.length;
  const diasComDados = snapshotsByDay.size;

  return {
    snapshots: scopedSnapshots,
    allSnapshots: snapshots,
    raw,
    // Historical trend
    historico,
    totalSnapshotsNoPeriodo,
    diasComDados,
    // Parsed KPIs
    registrosPorConsultor,
    tipoChamadoTempoMedio,
    registrosPorSistema,
    registrosPorBandeira,
    registrosPorCliente,
    horasTotaisPorDia,
    ocorrenciasPorTipo,
    // Totals
    totalRegistros,
    totalMinutos,
    totalHoras,
    horasDiaTotal,
    // Counts
    totalConsultores: registrosPorConsultor.length,
    totalSistemas: registrosPorSistema.length,
    totalClientes: registrosPorCliente.length,
    // Meta
    lastSync: lastCollected,
    periodo,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
