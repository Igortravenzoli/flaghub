// Hook para correlação de tickets com OS
// Versão simplificada - usa API REST local (VDESKProxy) para consultas ao VDESK

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

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

  // Buscar métricas de correlação
  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ['correlation-metrics', networkId],
    queryFn: async (): Promise<CorrelationMetrics> => {
      if (!networkId) {
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

      const { data, error } = await supabase
        .from('tickets')
        .select('id, has_os, os_found_in_vdesk, severity, inconsistency_code')
        .eq('network_id', networkId)
        .eq('is_active', true);

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
    enabled: !!networkId && isAuthenticated,
  });

  // Buscar tickets que precisam de validação (tem OS mas ainda não foi validada)
  const { data: ticketsNeedingCorrelation, isLoading: ticketsNeedingCorrelationLoading, refetch: refetchPending } = useQuery({
    queryKey: ['tickets-needing-correlation', networkId],
    queryFn: async (): Promise<string[]> => {
      if (!networkId) return [];

      const { data, error } = await supabase
        .from('tickets')
        .select('ticket_external_id')
        .eq('network_id', networkId)
        .eq('has_os', true)
        .is('os_found_in_vdesk', null)
        .eq('is_active', true);

      if (error) throw error;

      return (data || []).map(t => t.ticket_external_id);
    },
    enabled: !!networkId && isAuthenticated,
  });

  // Buscar relatório de inconsistências
  const { data: inconsistencyReport, isLoading: inconsistencyReportLoading, refetch: refetchInconsistencies } = useQuery({
    queryKey: ['inconsistency-report', networkId],
    queryFn: async (): Promise<InconsistencyReport[]> => {
      if (!networkId) return [];

      const { data, error } = await supabase
        .from('tickets')
        .select('ticket_external_id, inconsistency_code, os_number, severity, internal_status')
        .eq('network_id', networkId)
        .not('inconsistency_code', 'is', null)
        .eq('is_active', true)
        .order('severity', { ascending: true });

      if (error) throw error;

      return (data || []).map(t => ({
        ticketId: t.ticket_external_id,
        inconsistencyCode: t.inconsistency_code,
        osNumber: t.os_number,
        severity: t.severity,
        internalStatus: t.internal_status,
      }));
    },
    enabled: !!networkId && isAuthenticated,
  });

  // Função para correlacionar um ticket específico
  const correlateTicket = useCallback(async (ticketExternalId: string) => {
    setIsCorrelatingTicket(true);
    try {
      // TODO: Chamar API REST do VDESKProxy para validar OS
      // Por enquanto, apenas marca como validado (mock)
      console.log(`Correlacionando ticket: ${ticketExternalId}`);
      
      // Simular delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Atualizar ticket como validado (mock - em produção, usar resposta da API)
      await supabase
        .from('tickets')
        .update({ 
          os_found_in_vdesk: true,
          updated_at: new Date().toISOString()
        })
        .eq('ticket_external_id', ticketExternalId)
        .eq('network_id', networkId);

      queryClient.invalidateQueries({ queryKey: ['correlation-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['tickets-needing-correlation'] });
    } finally {
      setIsCorrelatingTicket(false);
    }
  }, [networkId, queryClient]);

  // Função para marcar OS como não encontrada
  const markOSNotFound = useCallback(async (ticketExternalId: string) => {
    await supabase
      .from('tickets')
      .update({ 
        os_found_in_vdesk: false,
        inconsistency_code: 'OS_NOT_FOUND',
        severity: 'critico',
        updated_at: new Date().toISOString()
      })
      .eq('ticket_external_id', ticketExternalId)
      .eq('network_id', networkId);

    queryClient.invalidateQueries({ queryKey: ['correlation-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['tickets-needing-correlation'] });
    queryClient.invalidateQueries({ queryKey: ['inconsistency-report'] });
  }, [networkId, queryClient]);

  // Função para correlacionar todos os pendentes
  const correlateAllPending = useCallback(async () => {
    if (!ticketsNeedingCorrelation?.length) return;
    
    setIsCorrelating(true);
    try {
      for (const ticketId of ticketsNeedingCorrelation) {
        await correlateTicket(ticketId);
      }
    } finally {
      setIsCorrelating(false);
    }
  }, [ticketsNeedingCorrelation, correlateTicket]);

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
