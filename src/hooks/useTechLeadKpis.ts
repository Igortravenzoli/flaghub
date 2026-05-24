import { useQuery } from '@tanstack/react-query';
import { gatewayGet } from '@/services/gatewayService';

function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Types ──────────────────────────────────────────────────────────────

export interface TechLeadAcumulado {
  success: boolean;
  dataInicio: string;
  dataFim: string;
  totalRegistros: number;
  totalTempoSegundos: number;
  mediaDiariaRegistros: number;
  tmaSegundos: number;
  diasUteis: number;
}

export interface ConsultorItem {
  consultor: string;
  totalRegistros: number;
  totalTempoSegundos: number;
  produtividade: number;
}

export interface TechLeadConsultorResponse {
  success: boolean;
  dataInicio: string;
  dataFim: string;
  consultores: ConsultorItem[];
  totalRegistros: number;
  totalTempoSegundos: number;
}

export interface PorDiaItem {
  consultor: string;
  dataRegistro: string;
  diaSemana: string;
  totalRegistros: number;
  totalTempoSegundos: number;
  produtividadeDia: number;
}

export interface TechLeadPorDiaResponse {
  success: boolean;
  dataInicio: string;
  dataFim: string;
  registros: PorDiaItem[];
}

export interface PorClienteItem {
  apelido: string;
  bandeira: string;
  totalRegistros: number;
}

export interface TechLeadPorClienteResponse {
  success: boolean;
  dataInicio: string;
  dataFim: string;
  clientes: PorClienteItem[];
}

export interface PorSistemaItem {
  sistema: string;
  totalRegistros: number;
  totalMinutos: number;
  tempoMedioMinutos: number;
}

export interface TechLeadPorSistemaResponse {
  success: boolean;
  dataInicio: string;
  dataFim: string;
  sistemas: PorSistemaItem[];
}

// ── Hooks ──────────────────────────────────────────────────────────────

export function useTechLeadAcumulado(dataInicio: Date, dataFim: Date) {
  const ini = fmtDate(dataInicio);
  const fim = fmtDate(dataFim);
  return useQuery<TechLeadAcumulado>({
    queryKey: ['techlead', 'acumulado', ini, fim],
    queryFn: () => gatewayGet(`/api/techlead/acumulado?dataInicio=${ini}&dataFim=${fim}`),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

export function useTechLeadConsultorSistemas(dataInicio: Date, dataFim: Date) {
  const ini = fmtDate(dataInicio);
  const fim = fmtDate(dataFim);
  return useQuery<TechLeadConsultorResponse>({
    queryKey: ['techlead', 'resumo-consultor', ini, fim],
    queryFn: () => gatewayGet(`/api/techlead/resumo-consultor?dataInicio=${ini}&dataFim=${fim}`),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

export function useTechLeadConsultorInfra(dataInicio: Date, dataFim: Date) {
  const ini = fmtDate(dataInicio);
  const fim = fmtDate(dataFim);
  return useQuery<TechLeadConsultorResponse>({
    queryKey: ['techlead', 'resumo-consultor-infra', ini, fim],
    queryFn: () => gatewayGet(`/api/techlead/resumo-consultor-infra?dataInicio=${ini}&dataFim=${fim}`),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

export function useTechLeadPorDia(dataInicio: Date, dataFim: Date) {
  const ini = fmtDate(dataInicio);
  const fim = fmtDate(dataFim);
  return useQuery<TechLeadPorDiaResponse>({
    queryKey: ['techlead', 'por-dia', ini, fim],
    queryFn: () => gatewayGet(`/api/techlead/por-dia?dataInicio=${ini}&dataFim=${fim}`),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

export function useTechLeadPorCliente(dataInicio: Date, dataFim: Date) {
  const ini = fmtDate(dataInicio);
  const fim = fmtDate(dataFim);
  return useQuery<TechLeadPorClienteResponse>({
    queryKey: ['techlead', 'por-cliente', ini, fim],
    queryFn: () => gatewayGet(`/api/techlead/por-cliente?dataInicio=${ini}&dataFim=${fim}`),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

export function useTechLeadPorSistema(dataInicio: Date, dataFim: Date) {
  const ini = fmtDate(dataInicio);
  const fim = fmtDate(dataFim);
  return useQuery<TechLeadPorSistemaResponse>({
    queryKey: ['techlead', 'por-sistema', ini, fim],
    queryFn: () => gatewayGet(`/api/techlead/por-sistema?dataInicio=${ini}&dataFim=${fim}`),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}
