import { useQuery } from '@tanstack/react-query';
import { gatewayGet } from '@/services/gatewayService';

export interface SlaMetasInfo {
  metaTTRDias: number;
  metaTTR24hPct: number;
}

export interface SlaKpisInfo {
  totalAbertos: number;
  ttrMedioAbertoDias: number;
  abertos5Dias: number;
  abertos30Dias: number;
  abertos180Dias: number;
  totalFechados60Dias: number;
  ttrMedioFechadoDias: number;
  pctEncerrados24h: number;
}

export interface SlaStatusInfo {
  ttr: 'OK' | 'ALERT' | 'CRITICAL';
  pct24h: 'OK' | 'ALERT' | 'CRITICAL';
}

export interface GestaoSlaResponse {
  success: boolean;
  message: string;
  dataReferencia: string;
  tipo: string;
  metas: SlaMetasInfo;
  kpis: SlaKpisInfo;
  status: SlaStatusInfo;
}

export interface GestaoSlaHistoricoItem {
  mes: string;
  totalFechados: number;
  ttrMedioDias: number;
  pctEncerrados24h: number;
}

export interface GestaoSlaHistoricoResponse {
  success: boolean;
  message: string;
  metas: SlaMetasInfo;
  series: GestaoSlaHistoricoItem[];
}

export interface GestaoSlaDetalheItem {
  os: number;
  apelido: string;
  codigoPuxada: string | null;
  erroPadrao: string | null;
  dtOs: string;
  dtBaixaOs: string | null;
  diasAberto: number;
  ticket: string | null;
  sistema: string | null;
  criticidade: string | null;
  desvioLancamento: boolean;
}

export interface GestaoSlaDetalheResponse {
  success: boolean;
  message: string;
  filtro: string;
  total: number;
  items: GestaoSlaDetalheItem[];
}

export function useGestaoSlaFlag() {
  return useQuery<GestaoSlaResponse>({
    queryKey: ['gestao', 'sla-flag'],
    queryFn: () => gatewayGet('/api/gestao/sla-flag'),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

export function useGestaoSlaNestle() {
  return useQuery<GestaoSlaResponse>({
    queryKey: ['gestao', 'sla-nestle'],
    queryFn: () => gatewayGet('/api/gestao/sla-nestle'),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

export function useGestaoSlaNestleHistorico() {
  return useQuery<GestaoSlaHistoricoResponse>({
    queryKey: ['gestao', 'sla-nestle-historico'],
    queryFn: () => gatewayGet('/api/gestao/sla-nestle-historico'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useGestaoSlaFlagDetalhe(filtro: string, enabled = false) {
  return useQuery<GestaoSlaDetalheResponse>({
    queryKey: ['gestao', 'sla-flag-detalhe', filtro],
    queryFn: () => gatewayGet(`/api/gestao/sla-flag-detalhe?filtro=${filtro}`),
    enabled,
    staleTime: 30 * 1000,
    retry: 1,
  });
}

export function useGestaoSlaNestleDetalhe(filtro: string, enabled = false) {
  return useQuery<GestaoSlaDetalheResponse>({
    queryKey: ['gestao', 'sla-nestle-detalhe', filtro],
    queryFn: () => gatewayGet(`/api/gestao/sla-nestle-detalhe?filtro=${filtro}`),
    enabled,
    staleTime: 30 * 1000,
    retry: 1,
  });
}
