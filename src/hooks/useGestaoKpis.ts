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
