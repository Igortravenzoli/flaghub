import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { gatewayGet } from '@/services/gatewayService';

// ── Supabase snapshot type (mantido para fallback) ──────────────────────
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

// ── Gateway API response shape ──────────────────────────────────────────
interface GatewayDashboardResponse {
  success: boolean;
  errorCode?: string;
  message?: string;
  timestamp: string;
  periodo?: {
    dataInicio: string;
    dataFim: string;
    tipo: string;
    dias: number;
  };
  registrosPorConsultor: Array<{ consultor: string; totalRegistros: number; totalMinutos: number }>;
  tipoChamadoTempoMedio: Array<{ tipoChamado: string; totalRegistros: number; tempoMedioMinutos: number }>;
  registrosPorSistema: Array<{ nomeSistema: string; totalRegistros: number }>;
  registrosPorBandeira: Array<{ bandeira: string; totalRegistros: number }>;
  registrosPorCliente: Array<{ cliente: string; totalRegistros: number }>;
  horasTotaisPorDia: Array<{ dataRegistro: string; totalMinutos: number; totalRegistros: number }>;
  acumulado?: { totalRegistros: number; totalMinutos: number };
  ocorrenciasPorTipo: Array<{ tipo: string; total: number }>;
}

// ── Frontend KPI types ──────────────────────────────────────────────────
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

// ── Helpers ─────────────────────────────────────────────────────────────
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toDateStr(raw: string): string {
  return typeof raw === 'string' ? raw.slice(0, 10) : new Date(raw).toISOString().slice(0, 10);
}

type QueryResult =
  | { source: 'api'; data: GatewayDashboardResponse }
  | { source: 'supabase'; data: HelpdeskSnapshot[] };

// ── Main hook ────────────────────────────────────────────────────────────
export function useHelpdeskKpis(dateFrom?: Date, dateTo?: Date) {
  const ini = dateFrom ? fmtDate(dateFrom) : null;
  const fim = dateTo ? fmtDate(dateTo) : null;

  const query = useQuery<QueryResult>({
    queryKey: ['helpdesk', 'kpis', ini, fim],
    queryFn: async (): Promise<QueryResult> => {
      // ── Primary: Gateway API ─────────────────────────────────────────
      if (ini && fim) {
        try {
          const apiData = await gatewayGet<GatewayDashboardResponse>(
            `/api/helpdesk/dashboard?periodo=custom&dataInicio=${ini}&dataFim=${fim}`,
          );
          if (apiData?.success) {
            return { source: 'api', data: apiData };
          }
          console.warn('[useHelpdeskKpis] API retornou success=false:', apiData?.message);
        } catch (apiError) {
          console.warn('[useHelpdeskKpis] API indisponível — fallback Supabase:', apiError);
        }
      }

      // ── Fallback: Supabase snapshots ─────────────────────────────────
      const { data, error } = await supabase
        .from('vw_helpdesk_kpis')
        .select('*')
        .order('collected_at', { ascending: false });
      if (error) throw error;
      return { source: 'supabase', data: (data || []) as HelpdeskSnapshot[] };
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const result = query.data;

  // ══════════════════════════════════════════════════════════════════════
  // API mode — mapeia resposta do Gateway para os tipos do frontend
  // ══════════════════════════════════════════════════════════════════════
  if (result?.source === 'api') {
    const d = result.data;

    const registrosPorConsultor: ConsultorKpi[] = d.registrosPorConsultor.map(c => ({
      nome: c.consultor,
      totalRegistros: c.totalRegistros,
      totalMinutos: c.totalMinutos,
    }));

    const tipoChamadoTempoMedio: TipoChamadoKpi[] = d.tipoChamadoTempoMedio.map(t => ({
      tipo: t.tipoChamado,
      quantidade: t.totalRegistros,
      tempoMedio: t.tempoMedioMinutos,
    }));

    const registrosPorSistema: RegistroPorGrupo[] = d.registrosPorSistema.map(s => ({
      nome: s.nomeSistema,
      quantidade: s.totalRegistros,
    }));

    const registrosPorBandeira: RegistroPorGrupo[] = d.registrosPorBandeira.map(b => ({
      nome: b.bandeira,
      quantidade: b.totalRegistros,
    }));

    const registrosPorCliente: RegistroPorGrupo[] = d.registrosPorCliente.map(c => ({
      nome: c.cliente,
      quantidade: c.totalRegistros,
    }));

    const horasTotaisPorDia: HorasDia[] = d.horasTotaisPorDia
      .map(h => ({
        data: toDateStr(h.dataRegistro),
        totalMinutos: h.totalMinutos,
        totalHoras: Math.round(h.totalMinutos / 60 * 10) / 10,
      }))
      .sort((a, b) => a.data.localeCompare(b.data));

    // historico: evolução diária de registros — derivada de horasTotaisPorDia
    const historico: HistoricoEntry[] = d.horasTotaisPorDia
      .map(h => ({
        date: toDateStr(h.dataRegistro),
        totalRegistros: h.totalRegistros,
        totalMinutos: h.totalMinutos,
        totalHoras: Math.round(h.totalMinutos / 60 * 10) / 10,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const ocorrenciasPorTipo: RegistroPorGrupo[] = d.ocorrenciasPorTipo.map(o => ({
      nome: o.tipo,
      quantidade: o.total,
    }));

    const totalRegistros =
      d.acumulado?.totalRegistros ??
      registrosPorConsultor.reduce((s, c) => s + c.totalRegistros, 0);
    const totalMinutos =
      d.acumulado?.totalMinutos ??
      registrosPorConsultor.reduce((s, c) => s + c.totalMinutos, 0);
    const totalHoras = Math.round(totalMinutos / 60 * 10) / 10;

    const hoje = fmtDate(new Date());
    const horasHojeEntry = horasTotaisPorDia.find(h => h.data === hoje);
    const horasDiaTotal =
      horasHojeEntry?.totalHoras ??
      (horasTotaisPorDia.length > 0
        ? horasTotaisPorDia[horasTotaisPorDia.length - 1].totalHoras
        : 0);

    return {
      // Compatibilidade com Supabase — vazios em modo API
      snapshots: [] as HelpdeskSnapshot[],
      allSnapshots: [] as HelpdeskSnapshot[],
      raw: {},
      totalSnapshotsNoPeriodo: 0,
      diasComDados: horasTotaisPorDia.length,
      // KPIs
      historico,
      registrosPorConsultor,
      tipoChamadoTempoMedio,
      registrosPorSistema,
      registrosPorBandeira,
      registrosPorCliente,
      horasTotaisPorDia,
      ocorrenciasPorTipo,
      // Totais
      totalRegistros,
      totalMinutos,
      totalHoras,
      horasDiaTotal,
      // Contagens
      totalConsultores: registrosPorConsultor.length,
      totalSistemas: registrosPorSistema.length,
      totalClientes: registrosPorCliente.length,
      // Meta
      lastSync: d.timestamp ?? null,
      periodo: d.periodo ?? null,
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error,
      refetch: query.refetch,
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // Supabase fallback — lógica original preservada
  // ══════════════════════════════════════════════════════════════════════
  const snapshots =
    result?.source === 'supabase' ? result.data : ([] as HelpdeskSnapshot[]);

  const fromBoundary = dateFrom
    ? new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate(), 0, 0, 0, 0)
    : null;
  const toBoundary = dateTo
    ? new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999)
    : null;
  const scopedSnapshots =
    dateFrom && dateTo
      ? snapshots.filter(s => {
          if (!s.collected_at) return false;
          const d = new Date(s.collected_at);
          return !!fromBoundary && !!toBoundary && d >= fromBoundary && d <= toBoundary;
        })
      : snapshots;

  // Grupo por dia — latest snapshot por data
  const snapshotsByDay = new Map<string, HelpdeskSnapshot>();
  for (const s of scopedSnapshots) {
    if (!s.collected_at) continue;
    const day = s.collected_at.slice(0, 10);
    const existing = snapshotsByDay.get(day);
    if (!existing || s.collected_at > (existing.collected_at || '')) {
      snapshotsByDay.set(day, s);
    }
  }

  const historico: HistoricoEntry[] = Array.from(snapshotsByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, s]) => ({
      date,
      totalRegistros: s.total_registros ?? 0,
      totalMinutos: s.total_minutos ?? 0,
      totalHoras: Math.round((s.total_minutos ?? 0) / 60 * 10) / 10,
    }));

  const dailySnapshots = Array.from(snapshotsByDay.values());

  function aggregateRawArray(
    key: string,
    nameField: string,
  ): { nome: string; quantidade: number; totalRegistros: number; totalMinutos: number }[] {
    const map = new Map<
      string,
      { quantidade: number; totalRegistros: number; totalMinutos: number }
    >();
    for (const s of dailySnapshots) {
      const r = s.raw && typeof s.raw === 'object' ? (s.raw as any) : {};
      const arr = r[key] || [];
      for (const entry of arr) {
        const nome =
          entry[nameField] || entry.nome || entry.consultor || entry.tipo || 'N/A';
        const prev = map.get(nome) || { quantidade: 0, totalRegistros: 0, totalMinutos: 0 };
        prev.quantidade += entry.quantidade || entry.total || entry.totalRegistros || 0;
        prev.totalRegistros += entry.totalRegistros || entry.quantidade || 0;
        prev.totalMinutos += entry.totalMinutos || 0;
        map.set(nome, prev);
      }
    }
    return Array.from(map.entries()).map(([nome, v]) => ({ nome, ...v }));
  }

  const useSingleRaw = dailySnapshots.length <= 1;
  const latestWithRaw = useSingleRaw
    ? scopedSnapshots.find(s => {
        if (!s.raw || typeof s.raw !== 'object') return false;
        const r = s.raw as any;
        return (
          r.registrosPorConsultor?.length > 0 ||
          r.porConsultor?.length > 0 ||
          r.ocorrenciasPorTipo?.length > 0 ||
          r.acumulado?.totalRegistros > 0
        );
      })
    : null;
  const raw = latestWithRaw?.raw || {};

  const resolveConsultorArray = (r: any) => r.registrosPorConsultor || r.porConsultor || [];

  const registrosPorConsultor: ConsultorKpi[] = useSingleRaw
    ? resolveConsultorArray(raw as any).map((c: any) => ({
        nome: c.consultor || c.nome || 'N/A',
        totalRegistros: c.totalRegistros || c.quantidade || c.total || 0,
        totalMinutos: c.totalMinutos || c.minutos || 0,
      }))
    : aggregateRawArray('registrosPorConsultor', 'consultor').map(a => ({
        nome: a.nome,
        totalRegistros: a.totalRegistros || a.quantidade,
        totalMinutos: a.totalMinutos,
      }));

  const tipoChamadoTempoMedio: TipoChamadoKpi[] = useSingleRaw
    ? ((raw as any).tipoChamadoTempoMedio || []).map((t: any) => ({
        tipo: t.tipo || t.tipoChamado || 'N/A',
        quantidade: t.quantidade || t.totalRegistros || 0,
        tempoMedio: t.tempoMedio || t.tempoMedioMinutos || 0,
      }))
    : aggregateRawArray('tipoChamadoTempoMedio', 'tipo').map(a => ({
        tipo: a.nome,
        quantidade: a.quantidade,
        tempoMedio:
          a.totalMinutos > 0 && a.quantidade > 0
            ? Math.round((a.totalMinutos / a.quantidade) * 10) / 10
            : 0,
      }));

  const registrosPorSistema: RegistroPorGrupo[] = useSingleRaw
    ? ((raw as any).registrosPorSistema || []).map((s: any) => ({
        nome: s.nomeSistema || s.sistema || s.nome || 'N/A',
        quantidade: s.totalRegistros || s.quantidade || 0,
      }))
    : aggregateRawArray('registrosPorSistema', 'nomeSistema').map(a => ({
        nome: a.nome,
        quantidade: a.quantidade,
      }));

  const registrosPorBandeira: RegistroPorGrupo[] = useSingleRaw
    ? ((raw as any).registrosPorBandeira || []).map((b: any) => ({
        nome: b.bandeira || b.nome || 'N/A',
        quantidade: b.quantidade || b.totalRegistros || 0,
      }))
    : aggregateRawArray('registrosPorBandeira', 'bandeira').map(a => ({
        nome: a.nome,
        quantidade: a.quantidade,
      }));

  const registrosPorCliente: RegistroPorGrupo[] = useSingleRaw
    ? ((raw as any).registrosPorCliente || []).map((c: any) => ({
        nome: c.cliente || c.nome || 'N/A',
        quantidade: c.quantidade || c.totalRegistros || 0,
      }))
    : aggregateRawArray('registrosPorCliente', 'cliente').map(a => ({
        nome: a.nome,
        quantidade: a.quantidade,
      }));

  const horasTotaisPorDia: HorasDia[] = useSingleRaw
    ? ((raw as any).horasTotaisPorDia || []).map((h: any) => ({
        data: h.data || h.dia || '',
        totalMinutos: h.totalMinutos || 0,
        totalHoras: Math.round((h.totalMinutos || 0) / 60 * 10) / 10,
      }))
    : (() => {
        const map = new Map<string, number>();
        for (const s of dailySnapshots) {
          const r = s.raw && typeof s.raw === 'object' ? (s.raw as any) : {};
          for (const h of r.horasTotaisPorDia || []) {
            const data = h.data || h.dia || '';
            map.set(data, (map.get(data) || 0) + (h.totalMinutos || 0));
          }
        }
        return Array.from(map.entries()).map(([data, totalMinutos]) => ({
          data,
          totalMinutos,
          totalHoras: Math.round(totalMinutos / 60 * 10) / 10,
        }));
      })();

  const ocorrenciasPorTipo: RegistroPorGrupo[] = useSingleRaw
    ? ((raw as any).ocorrenciasPorTipo || []).map((o: any) => ({
        nome: o.tipo || o.nome || 'N/A',
        quantidade: o.total || o.quantidade || o.totalRegistros || 0,
      }))
    : aggregateRawArray('ocorrenciasPorTipo', 'tipo').map(a => ({
        nome: a.nome,
        quantidade: a.quantidade,
      }));

  const totalRegistros = useSingleRaw
    ? (raw as any).acumulado?.totalRegistros ||
      registrosPorConsultor.reduce((s, c) => s + c.totalRegistros, 0)
    : historico.reduce((s, h) => s + h.totalRegistros, 0) ||
      registrosPorConsultor.reduce((s, c) => s + c.totalRegistros, 0);
  const totalMinutos = useSingleRaw
    ? (raw as any).acumulado?.totalMinutos ||
      registrosPorConsultor.reduce((s, c) => s + c.totalMinutos, 0)
    : historico.reduce((s, h) => s + h.totalMinutos, 0) ||
      registrosPorConsultor.reduce((s, c) => s + c.totalMinutos, 0);
  const totalHoras = Math.round(totalMinutos / 60 * 10) / 10;

  const hoje = new Date().toISOString().split('T')[0];
  const horasHoje = horasTotaisPorDia.find(h => h.data === hoje);
  const horasDiaTotal = horasHoje
    ? horasHoje.totalHoras
    : horasTotaisPorDia.length > 0
      ? horasTotaisPorDia[horasTotaisPorDia.length - 1].totalHoras
      : 0;

  const lastCollected = scopedSnapshots[0]?.collected_at || null;
  const periodo = useSingleRaw ? (raw as any).periodo || null : null;

  return {
    snapshots: scopedSnapshots,
    allSnapshots: snapshots,
    raw,
    historico,
    totalSnapshotsNoPeriodo: scopedSnapshots.length,
    diasComDados: snapshotsByDay.size,
    registrosPorConsultor,
    tipoChamadoTempoMedio,
    registrosPorSistema,
    registrosPorBandeira,
    registrosPorCliente,
    horasTotaisPorDia,
    ocorrenciasPorTipo,
    totalRegistros,
    totalMinutos,
    totalHoras,
    horasDiaTotal,
    totalConsultores: registrosPorConsultor.length,
    totalSistemas: registrosPorSistema.length,
    totalClientes: registrosPorCliente.length,
    lastSync: lastCollected,
    periodo,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
