/**
 * Hook para correlação automática de tickets com VDESK
 * 
 * Chama a API externa para validar OS após importação ou ao atualizar
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { correlacionarTicket, obterTokenSupabase } from '@/services/ticketsOSApi';
import { useAuth } from './useAuth';

interface CorrelationResult {
  ticketId: string;
  success: boolean;
  osCount: number;
  osNumbers: string[];
  error?: string;
}

interface CorrelationSummary {
  total: number;
  correlated: number;
  notFound: number;
  errors: number;
  results: CorrelationResult[];
}

export function useAutoCorrelation() {
  const { networkId } = useAuth();
  const queryClient = useQueryClient();
  const [isCorrelating, setIsCorrelating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<CorrelationSummary | null>(null);

  /**
   * Correlaciona um único ticket com a API VDESK
   */
  const correlateOneTicket = useCallback(async (
    ticketExternalId: string,
    token: string
  ): Promise<CorrelationResult> => {
    try {
      const response = await correlacionarTicket(ticketExternalId, token);
      
      if (response.success && response.count > 0) {
        // Atualizar ticket no Supabase com OS encontrada
        await supabase
          .from('tickets')
          .update({
            os_found_in_vdesk: true,
            has_os: true,
            os_number: response.osEncontradas[0], // Primeira OS
            inconsistency_code: null,
            severity: 'info',
            updated_at: new Date().toISOString(),
          })
          .eq('ticket_external_id', ticketExternalId)
          .eq('network_id', networkId);

        return {
          ticketId: ticketExternalId,
          success: true,
          osCount: response.count,
          osNumbers: response.osEncontradas,
        };
      } else {
        // Ticket não encontrado no VDESK
        await supabase
          .from('tickets')
          .update({
            os_found_in_vdesk: false,
            inconsistency_code: 'OS_NOT_FOUND',
            severity: 'critico',
            updated_at: new Date().toISOString(),
          })
          .eq('ticket_external_id', ticketExternalId)
          .eq('network_id', networkId);

        return {
          ticketId: ticketExternalId,
          success: false,
          osCount: 0,
          osNumbers: [],
          error: response.message || 'Ticket não encontrado no VDESK',
        };
      }
    } catch (error) {
      console.error(`[AutoCorrelation] Erro ao correlacionar ${ticketExternalId}:`, error);
      return {
        ticketId: ticketExternalId,
        success: false,
        osCount: 0,
        osNumbers: [],
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }, [networkId]);

  /**
   * Correlaciona todos os tickets pendentes (que têm has_os = true mas os_found_in_vdesk = null)
   */
  const correlateAllPending = useCallback(async (): Promise<CorrelationSummary> => {
    if (!networkId) {
      throw new Error('Network não identificada');
    }

    setIsCorrelating(true);
    setProgress(0);
    setSummary(null);

    try {
      // Obter token JWT
      const token = await obterTokenSupabase();
      if (!token) {
        throw new Error('Token de autenticação não encontrado');
      }

      // Buscar tickets que precisam de correlação
      const { data: tickets, error } = await supabase
        .from('tickets')
        .select('ticket_external_id')
        .eq('network_id', networkId)
        .eq('is_active', true)
        .is('os_found_in_vdesk', null);

      if (error) throw error;

      const ticketIds = tickets?.map(t => t.ticket_external_id) || [];
      
      if (ticketIds.length === 0) {
        const emptySummary: CorrelationSummary = {
          total: 0,
          correlated: 0,
          notFound: 0,
          errors: 0,
          results: [],
        };
        setSummary(emptySummary);
        return emptySummary;
      }

      const results: CorrelationResult[] = [];
      let correlated = 0;
      let notFound = 0;
      let errors = 0;

      // Processar tickets em paralelo (lotes de 5)
      const batchSize = 5;
      for (let i = 0; i < ticketIds.length; i += batchSize) {
        const batch = ticketIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(ticketId => correlateOneTicket(ticketId, token))
        );

        for (const result of batchResults) {
          results.push(result);
          if (result.success) {
            correlated++;
          } else if (result.error?.includes('não encontrado')) {
            notFound++;
          } else {
            errors++;
          }
        }

        setProgress(Math.round(((i + batch.length) / ticketIds.length) * 100));
      }

      const finalSummary: CorrelationSummary = {
        total: ticketIds.length,
        correlated,
        notFound,
        errors,
        results,
      };

      setSummary(finalSummary);

      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['correlation-metrics'] });

      return finalSummary;
    } finally {
      setIsCorrelating(false);
      setProgress(100);
    }
  }, [networkId, correlateOneTicket, queryClient]);

  /**
   * Correlaciona uma lista específica de tickets
   */
  const correlateTickets = useCallback(async (
    ticketIds: string[]
  ): Promise<CorrelationSummary> => {
    if (!networkId) {
      throw new Error('Network não identificada');
    }

    if (ticketIds.length === 0) {
      return {
        total: 0,
        correlated: 0,
        notFound: 0,
        errors: 0,
        results: [],
      };
    }

    setIsCorrelating(true);
    setProgress(0);
    setSummary(null);

    try {
      const token = await obterTokenSupabase();
      if (!token) {
        throw new Error('Token de autenticação não encontrado');
      }

      const results: CorrelationResult[] = [];
      let correlated = 0;
      let notFound = 0;
      let errors = 0;

      const batchSize = 5;
      for (let i = 0; i < ticketIds.length; i += batchSize) {
        const batch = ticketIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(ticketId => correlateOneTicket(ticketId, token))
        );

        for (const result of batchResults) {
          results.push(result);
          if (result.success) {
            correlated++;
          } else if (result.error?.includes('não encontrado')) {
            notFound++;
          } else {
            errors++;
          }
        }

        setProgress(Math.round(((i + batch.length) / ticketIds.length) * 100));
      }

      const finalSummary: CorrelationSummary = {
        total: ticketIds.length,
        correlated,
        notFound,
        errors,
        results,
      };

      setSummary(finalSummary);

      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['correlation-metrics'] });

      return finalSummary;
    } finally {
      setIsCorrelating(false);
      setProgress(100);
    }
  }, [networkId, correlateOneTicket, queryClient]);

  return {
    correlateAllPending,
    correlateTickets,
    isCorrelating,
    progress,
    summary,
  };
}
