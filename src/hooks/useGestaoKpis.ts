import { CADENCIA_MINIMA_MS } from '@/lib/cadencia';
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
  /** Itens DEVOLVIDOS. NÃO é o universo quando `truncado = true`. */
  total: number;
  /** ADITIVO (TOP 500 atingido): a lista é parcial e não fecha com o card. */
  truncado: boolean;
  /** ADITIVO: teto de linhas da consulta. */
  limite: number;
  items: GestaoSlaDetalheItem[];
}

export function useGestaoSlaFlag() {
  return useQuery<GestaoSlaResponse>({
    queryKey: ['gestao', 'sla-flag'],
    queryFn: () => gatewayGet('/api/gestao/sla-flag'),
    staleTime: CADENCIA_MINIMA_MS,
    retry: 1,
  });
}

export function useGestaoSlaNestle() {
  return useQuery<GestaoSlaResponse>({
    queryKey: ['gestao', 'sla-nestle'],
    queryFn: () => gatewayGet('/api/gestao/sla-nestle'),
    staleTime: CADENCIA_MINIMA_MS,
    retry: 1,
  });
}

export function useGestaoSlaHeineken() {
  return useQuery<GestaoSlaResponse>({
    queryKey: ['gestao', 'sla-heineken'],
    queryFn: () => gatewayGet('/api/gestao/sla-heineken'),
    staleTime: CADENCIA_MINIMA_MS,
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
    staleTime: CADENCIA_MINIMA_MS,
    retry: 1,
  });
}

export function useGestaoSlaNestleDetalhe(filtro: string, enabled = false) {
  return useQuery<GestaoSlaDetalheResponse>({
    queryKey: ['gestao', 'sla-nestle-detalhe', filtro],
    queryFn: () => gatewayGet(`/api/gestao/sla-nestle-detalhe?filtro=${filtro}`),
    enabled,
    staleTime: CADENCIA_MINIMA_MS,
    retry: 1,
  });
}

export function useGestaoSlaHeinekenDetalhe(filtro: string, enabled = false) {
  return useQuery<GestaoSlaDetalheResponse>({
    queryKey: ['gestao', 'sla-heineken-detalhe', filtro],
    queryFn: () => gatewayGet(`/api/gestao/sla-heineken-detalhe?filtro=${filtro}`),
    enabled,
    staleTime: CADENCIA_MINIMA_MS,
    retry: 1,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SLA mensal por segmento (SLA-1) — GET /api/gestao/sla-mensal?segmento=...
 * Espelha Models/GestaoSlaMensalResponse.cs (camelCase, Program.cs).
 * ATENÇÃO: `null` é "sem base" e existe de propósito — renderizar '—', nunca 0.
 * ══════════════════════════════════════════════════════════════════════════ */

export type SlaMensalSegmento = 'nestle' | 'heineken' | 'outros';

/** OK | ALERT | CRITICAL | NEUTRO (sem meta) | SEM_DADO (sem base). */
export type SlaMensalStatusAnual = 'OK' | 'ALERT' | 'CRITICAL' | 'NEUTRO' | 'SEM_DADO';

/** Janela realmente calculada pelo gateway — insumo do selo do SLA-8. */
export interface SlaMensalReferencia {
  /** 'YYYY-MM' */
  mesAtual: string;
  /** 'YYYY-MM' — em janeiro, dezembro do ano anterior. */
  mesAnterior: string;
  ano: number;
  /** 'YYYY-MM-DD' inclusivo. */
  inicioMesAtual: string;
  /** 'YYYY-MM-DD' EXCLUSIVO (1º do mês seguinte). */
  fimJanelaExclusivo: string;
  inicioAno: string;
  /** Data-âncora do cálculo: relógio do GATEWAY, não do browser. */
  hoje: string;
}

export interface SlaMensalMetas {
  /** null quando `metaDefinida = false` (Heineken, D7). */
  metaTTRDias: number | null;
  metaTTR24hPct: number | null;
  metaDefinida: boolean;
}

/** TTR em dias — menor é melhor. Variação em PERCENTUAL. */
export interface SlaMensalTtr {
  mesAtual: number | null;
  mesAnterior: number | null;
  /** (atual−anterior)/anterior×100. null se falta operando OU se anterior = 0. */
  variacaoPct: number | null;
  /** atual−anterior em dias. Definida mesmo quando `variacaoPct` é null (anterior = 0). */
  variacaoDias: number | null;
  /** Média GLOBAL do ano (não é média das médias mensais). */
  anual: number | null;
  atingiuMetaAnual: boolean | null;
  statusAnual: SlaMensalStatusAnual;
  /** Sempre true — read-only no DTO, mas chega no JSON. */
  menorMelhor: boolean;
  unidadeVariacao: '%';
}

/** % encerradas em ≤24h — maior é melhor. Variação em PONTOS PERCENTUAIS. */
export interface SlaMensalTtr24h {
  mesAtual: number | null;
  mesAnterior: number | null;
  /** atual−anterior em p.p. (subtração, nunca divisão). */
  variacaoPp: number | null;
  anual: number | null;
  atingiuMetaAnual: boolean | null;
  statusAnual: SlaMensalStatusAnual;
  /** Sempre false. */
  menorMelhor: boolean;
  unidadeVariacao: 'p.p.';
}

export interface SlaMensalAbertos {
  totalAbertos: number;
  maior5Dias: number;
  maior30Dias: number;
  /** SÓ Nestlé e SÓ `LIKE 'INC%'` (exclui RITM). null nos outros segmentos — é o
   *  sinal que o card usa para trocar o rodapé, em vez de testar o nome do segmento. */
  incMaior5Dias: number | null;
  incMaior30Dias: number | null;
}

export interface SlaMensalVolumes {
  fechadosMesAtual: number;
  fechadosMesAnterior: number;
  fechadosAno: number;
}

export interface SlaMensalQualidade {
  ttrNegativoMesAtual: number;
  ttrNegativoMesAnterior: number;
  ttrNegativoAno: number;
  /** COUNT(*) − COUNT(DISTINCT) da JANELA INTEIRA do cálculo (~19 meses), não do mês. */
  osDuplicadasJanela: number;
}

export interface GestaoSlaMensalResponse {
  success: boolean;
  message: string;
  timestamp: string;
  segmento: SlaMensalSegmento;
  /** 'planilha-cs-v1' (DATEDIFF DAY) | 'gateway-horas-v1' (HOUR/24). */
  formulaVersao: string;
  referencia: SlaMensalReferencia;
  metas: SlaMensalMetas;
  ttr: SlaMensalTtr;
  ttr24h: SlaMensalTtr24h;
  abertos: SlaMensalAbertos;
  volumes: SlaMensalVolumes;
  qualidade: SlaMensalQualidade;
}

/** Cobertura de clientes do MÊS CORRENTE (PAN-2) — sem parâmetro de data. */
export interface GestaoCoberturaClientesResponse {
  success: boolean;
  message: string;
  timestamp: string;
  /** 'YYYY-MM' */
  mesReferencia: string;
  totalClientesAtivos: number;
  atendidosMes: number;
  naoAtendidos: number;
  /** null (não 0) quando não há base ativa — ausência de base não é 0% de cobertura. */
  pctCobertura: number | null;
  /** Diagnóstico de grafia divergente entre ATENDIMENTO.Apeli_At e CLIENTES.Apeli_Clie. */
  atendidosSemClienteAtivo: number;
  clientesInternosExcluidos: string[];
}

/**
 * Escopo fixo de calendário: NÃO recebe filtro de data (por isso a queryKey só
 * tem o segmento — é o que garante imunidade ao filtro de período da tela).
 */
export function useGestaoSlaMensal(segmento: SlaMensalSegmento) {
  return useQuery<GestaoSlaMensalResponse>({
    queryKey: ['gestao', 'sla-mensal', segmento],
    queryFn: () => gatewayGet(`/api/gestao/sla-mensal?segmento=${segmento}`),
    staleTime: CADENCIA_MINIMA_MS,
    retry: 1,
  });
}

/** Escopo fixo = mês corrente. Sem parâmetro de data — NÃO reage ao filtro. */
export function useGestaoCoberturaClientes() {
  return useQuery<GestaoCoberturaClientesResponse>({
    queryKey: ['gestao', 'cobertura-clientes'],
    queryFn: () => gatewayGet('/api/gestao/cobertura-clientes'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
