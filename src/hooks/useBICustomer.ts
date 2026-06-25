import { useQuery } from '@tanstack/react-query';
import { gatewayGet } from '@/services/gatewayService';

// ── Types ──────────────────────────────────────────────────────────────
// Espelha o Power BI "SLA Flag x Outros": dois segmentos.
//   • nestle → contagem por ticket ServiceNow (INC/RITM + PRB via _PSN)
//   • outras → contagem por OS, tipo via ErroPadrao

export interface BICustomerPeriodo {
  total: number;
  inc: number;
  prb: number;
  ritm: number;
}

export interface BICustomerAbertos {
  incAberto: number;
  prbAberto: number;
  ritmAberto: number;
  inc5Dias: number;
  prb10Dias: number;
  ritm30Dias: number;
}

export interface BICustomerMetricas {
  fechadosMes: number;
  ttrMedioDias: number;
  pctEncerrados24h: number;
}

export interface BICustomerSegmento {
  unidade: 'ticket' | 'os';
  mesAtual: BICustomerPeriodo;
  mesAnterior: BICustomerPeriodo;
  abertos: BICustomerAbertos;
  metricas: BICustomerMetricas;
  // ── Extensões (opcionais — gateway pode ainda não retornar) ──────────────
  /** Totais do ano vigente acumulado. */
  ano?: BICustomerPeriodo;
  /** Totais do ano anterior acumulado. */
  anoAnterior?: BICustomerPeriodo;
  /** TTR/24h acumulados do ano vigente. */
  metricasAno?: BICustomerMetricas;
  /** TTR/24h do mês anterior. */
  metricasMesAnterior?: BICustomerMetricas;
  /** TTR/24h acumulados do ano anterior. */
  metricasAnoAnterior?: BICustomerMetricas;
}

export interface BICustomerKpisResponse {
  success: boolean;
  message: string;
  nestle: BICustomerSegmento;
  outras: BICustomerSegmento;
}

export type BICustomerSegmentoKey = 'nestle' | 'outras';

export interface BICustomerDetalheItem {
  os: number;
  ticket: string;
  cliente: string;
  sistema: string;
  consultor: string;
  tipoChamado: string;
  bandeira: string;
  dataRegistro: string;
  diasAberto: number;
  criticidade: string | null;
}

export interface BICustomerDetalheResponse {
  success: boolean;
  message: string;
  segmento: string;
  tipo: string;
  diasMin: number;
  total: number;
  items: BICustomerDetalheItem[];
}

// ── Hooks ──────────────────────────────────────────────────────────────

export function useBICustomerKpis() {
  return useQuery<BICustomerKpisResponse>({
    queryKey: ['bi-customer', 'kpis'],
    queryFn: () => gatewayGet('/api/bi-customer/kpis'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useBICustomerDetalhe(
  segmento: BICustomerSegmentoKey,
  tipo: string,
  diasMin: number,
  enabled = true,
) {
  return useQuery<BICustomerDetalheResponse>({
    queryKey: ['bi-customer', 'detalhe', segmento, tipo, diasMin],
    queryFn: () => gatewayGet(`/api/bi-customer/detalhe?segmento=${segmento}&tipo=${tipo}&diasMin=${diasMin}`),
    staleTime: 2 * 60 * 1000,
    retry: 1,
    enabled: enabled && !!tipo,
  });
}
