import { useQuery } from '@tanstack/react-query';
import { gatewayGet } from '@/services/gatewayService';

// ── Types ──────────────────────────────────────────────────────────────

export interface BICustomerPeriodo {
  totalTickets: number;
  totalOs: number;
  incTickets: number;
  prbTickets: number;
  ritmTickets: number;
}

export interface BICustomerAbertos {
  incTicketsAberto: number;
  prbTicketsAberto: number;
  ritmTicketsAberto: number;
  incOsAberto: number;
  prbOsAberto: number;
  ritmOsAberto: number;
  incTicket5Dias: number;
  prbTicket10Dias: number;
  ritmTicket30Dias: number;
}

export interface BICustomerMetricas {
  fechados60Dias: number;
  ttrMedioDias: number;
  pctEncerrados24h: number;
}

export interface BICustomerKpisResponse {
  success: boolean;
  message: string;
  mesAtual: BICustomerPeriodo;
  mesAnterior: BICustomerPeriodo;
  abertos: BICustomerAbertos;
  metricas: BICustomerMetricas;
}

export interface BICustomerDetalheItem {
  os: number;
  ticket: string;
  cliente: string;
  sistema: string;
  consultor: string;
  tipoChamado: string;
  dataRegistro: string;
  diasAberto: number;
  criticidade: string | null;
}

export interface BICustomerDetalheResponse {
  success: boolean;
  message: string;
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

export function useBICustomerDetalhe(tipo: string, diasMin: number, enabled = true) {
  return useQuery<BICustomerDetalheResponse>({
    queryKey: ['bi-customer', 'detalhe', tipo, diasMin],
    queryFn: () => gatewayGet(`/api/bi-customer/detalhe?tipo=${tipo}&diasMin=${diasMin}`),
    staleTime: 2 * 60 * 1000,
    retry: 1,
    enabled: enabled && !!tipo,
  });
}
