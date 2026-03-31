// Hook para correlação de tickets com OS
// Versão simplificada - usa API REST local (VDESKProxy) para consultas ao VDESK

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { correlacionarBatchViaProxy, correlacionarTicketViaProxy } from '@/services/vdeskProxyService';

interface CorrelationMetrics {
  totalTickets: number;
  ticketsWithOS: number;
  ticketsWithoutOS: number;
  osFoundInVDESK: number;
  osNotFoundInVDESK: number;
  correlationRate: number;
  criticalIssues: number;
  warningIssues: number;
}

interface InconsistencyReport {
  ticketId: string;
  inconsistencyCode: string | null;
  osNumber: string | null;
  severity: string;
  internalStatus: string | null;
}

export function useTicketOSCorrelation() {
  const { networkId, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [isCorrelating, setIsCorrelating] = useState(false);
  const [isCorrelatingTicket, setIsCorrelatingTicket] = useState(false);

  const buildVisibleTicketsQuery = useCallback(() => {
    let query = supabase
      .from('tickets')
      .select('id, ticket_external_id, network_id, has_os, os_found_in_vdesk, severity, inconsistency_code, internal_status, os_number')
      .eq('is_active', true);

    if (networkId !== null && networkId !== undefined) {
      query = query.eq('network_id', networkId);
    }

    return query;
  }, [networkId]);

  const updateTicketByScope = useCallback(async (ticketExternalId: string, payload: Record<string, unknown>) => {
    let query = supabase
      .from('tickets')
      .update(payload)
      .eq('ticket_external_id', ticketExternalId);

    if (networkId !== null && networkId !== undefined) {
      query = query.eq('network_id', networkId);
    }

    const { error } = await query;
    if (error) throw error;
  }, [networkId]);

  // Buscar métricas de correlação
  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ['correlation-metrics', networkId],
    queryFn: async (): Promise<CorrelationMetrics> => {
      if (!isAuthenticated) {
        return {
          totalTickets: 0,
          ticketsWithOS: 0,
          ticketsWithoutOS: 0,
          osFoundInVDESK: 0,
          osNotFoundInVDESK: 0,
          correlationRate: 0,
          criticalIssues: 0,
          warningIssues: 0,
        };
      }

      const { data, error } = await buildVisibleTicketsQuery();

      if (error) throw error;

      const tickets = data || [];
      const totalTickets = tickets.length;
      const ticketsWithOS = tickets.filter(t => t.has_os).length;
      const ticketsWithoutOS = totalTickets - ticketsWithOS;
      const osFoundInVDESK = tickets.filter(t => t.os_found_in_vdesk === true).length;
      const osNotFoundInVDESK = tickets.filter(t => t.os_found_in_vdesk === false).length;
      const correlationRate = totalTickets > 0 ? (osFoundInVDESK / totalTickets) * 100 : 0;
      const criticalIssues = tickets.filter(t => t.severity === 'critico').length;
      const warningIssues = tickets.filter(t => t.severity === 'atencao').length;

      return {
        totalTickets,
        ticketsWithOS,
        ticketsWithoutOS,
        osFoundInVDESK,
        osNotFoundInVDESK,
        correlationRate,
        criticalIssues,
        warningIssues,
      };
    },
    enabled: isAuthenticated,
  });

  // Buscar tickets que precisam de validação (tem OS mas ainda não foi validada)
  const { data: ticketsNeedingCorrelation, isLoading: ticketsNeedingCorrelationLoading, refetch: refetchPending } = useQuery({
    queryKey: ['tickets-needing-correlation', networkId],
    queryFn: async (): Promise<string[]> => {
      let query = supabase
        .from('tickets')
        .select('ticket_external_id')
        .eq('has_os', true)
        .is('os_found_in_vdesk', null)
        .eq('is_active', true);

      if (networkId !== null && networkId !== undefined) {
        query = query.eq('network_id', networkId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(t => t.ticket_external_id);
    },
    enabled: isAuthenticated,
  });

  // Buscar relatório de inconsistências
  const { data: inconsistencyReport, isLoading: inconsistencyReportLoading, refetch: refetchInconsistencies } = useQuery({
    queryKey: ['inconsistency-report', networkId],
    queryFn: async (): Promise<InconsistencyReport[]> => {
      let query = supabase
        .from('tickets')
        .select('ticket_external_id, inconsistency_code, os_number, severity, internal_status')
        .not('inconsistency_code', 'is', null)
        .eq('is_active', true)
        .order('severity', { ascending: true });

      if (networkId !== null && networkId !== undefined) {
        query = query.eq('network_id', networkId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(t => ({
        ticketId: t.ticket_external_id,
        inconsistencyCode: t.inconsistency_code,
        osNumber: t.os_number,
        severity: t.severity,
        internalStatus: t.internal_status,
      }));
    },
    enabled: isAuthenticated,
  });

  // Função para correlacionar um ticket específico
  const correlateTicket = useCallback(async (ticketExternalId: string) => {
    setIsCorrelatingTicket(true);
    try {
      const correlation = await correlacionarTicketViaProxy(ticketExternalId);
      const now = new Date().toISOString();
      const found = correlation.success && correlation.osEncontradas.length > 0;

      const lastProgramador = found ? (correlation.data?.[correlation.data.length - 1]?.programador || null) : undefined;

      await updateTicketByScope(ticketExternalId, {
        os_found_in_vdesk: found,
        os_number: found ? (correlation.osEncontradas[0] ?? null) : undefined,
        assigned_to: lastProgramador,
        vdesk_payload: correlation.data,
        last_os_event_at: now,
        last_os_event_desc: correlation.message ?? (found ? 'OS validada no VDESK' : 'OS não encontrada no VDESK'),
        inconsistency_code: found ? null : 'OS_NOT_FOUND',
        severity: found ? 'info' : 'critico',
        updated_at: now,
      });

      queryClient.invalidateQueries({ queryKey: ['correlation-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['tickets-needing-correlation'] });
      queryClient.invalidateQueries({ queryKey: ['inconsistency-report'] });
    } finally {
      setIsCorrelatingTicket(false);
    }
  }, [queryClient, updateTicketByScope]);

  // Função para marcar OS como não encontrada
  const markOSNotFound = useCallback(async (ticketExternalId: string) => {
    await updateTicketByScope(ticketExternalId, {
      os_found_in_vdesk: false,
      inconsistency_code: 'OS_NOT_FOUND',
      severity: 'critico',
      last_os_event_at: new Date().toISOString(),
      last_os_event_desc: 'OS marcada manualmente como não encontrada',
      updated_at: new Date().toISOString(),
    });

    queryClient.invalidateQueries({ queryKey: ['correlation-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['tickets-needing-correlation'] });
    queryClient.invalidateQueries({ queryKey: ['inconsistency-report'] });
  }, [queryClient, updateTicketByScope]);

  // Função para correlacionar todos os pendentes
  const correlateAllPending = useCallback(async () => {
    if (!ticketsNeedingCorrelation?.length) return;
    
    setIsCorrelating(true);
    try {
      const response = await correlacionarBatchViaProxy(ticketsNeedingCorrelation);
      const now = new Date().toISOString();

      await Promise.all(
        response.results.map((result) => updateTicketByScope(result.ticket, {
          os_found_in_vdesk: result.found,
          os_number: result.found ? (result.osEncontradas[0] ?? null) : undefined,
          vdesk_payload: result.data,
          last_os_event_at: now,
          last_os_event_desc: result.message ?? (result.found ? 'OS validada no VDESK' : 'OS não encontrada no VDESK'),
          inconsistency_code: result.found ? null : 'OS_NOT_FOUND',
          severity: result.found ? 'info' : 'critico',
          updated_at: now,
        }))
      );

      queryClient.invalidateQueries({ queryKey: ['correlation-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['tickets-needing-correlation'] });
      queryClient.invalidateQueries({ queryKey: ['inconsistency-report'] });
    } finally {
      setIsCorrelating(false);
    }
  }, [ticketsNeedingCorrelation, queryClient, updateTicketByScope]);

  // Função para atualizar todos os dados
  const refreshAll = useCallback(() => {
    refetchMetrics();
    refetchPending();
    refetchInconsistencies();
  }, [refetchMetrics, refetchPending, refetchInconsistencies]);

  return {
    metrics,
    metricsLoading,
    ticketsNeedingCorrelation,
    ticketsNeedingCorrelationLoading,
    inconsistencyReport,
    inconsistencyReportLoading,
    isCorrelating,
    isCorrelatingTicket,
    correlateTicket,
    markOSNotFound,
    correlateAllPending,
    refreshAll,
  };
}
