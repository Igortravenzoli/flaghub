/**
 * Hook para correlação automática de tickets com VDESK
 * 
 * Usa Edge Function como proxy para evitar CORS
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { correlacionarTicketViaProxy } from '@/services/vdeskProxyService';
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
   * Correlaciona um único ticket com a API VDESK via proxy
   */
  const correlateOneTicket = useCallback(async (
    ticketExternalId: string
  ): Promise<CorrelationResult> => {
    try {
      console.log(`[AutoCorrelation] Correlacionando ticket: ${ticketExternalId}`);
      const response = await correlacionarTicketViaProxy(ticketExternalId);
      
      if (response.success && response.count > 0) {
        console.log(`[AutoCorrelation] OS encontrada para ${ticketExternalId}: ${response.osEncontradas.join(', ')}`);
        
        // Atualizar ticket no Supabase com OS encontrada
        // Nota: has_os é coluna gerada, atualiza automaticamente quando os_number é definido
        const { error: updateError } = await supabase
          .from('tickets')
          .update({
            os_found_in_vdesk: true,
            os_number: response.osEncontradas[0], // Primeira OS
            inconsistency_code: null,
            severity: 'info',
            updated_at: new Date().toISOString(),
          })
          .eq('ticket_external_id', ticketExternalId)
          .eq('network_id', networkId);
        
        if (updateError) {
          console.error(`[AutoCorrelation] Erro ao atualizar ${ticketExternalId}:`, updateError);
        }

        return {
          ticketId: ticketExternalId,
          success: true,
          osCount: response.count,
          osNumbers: response.osEncontradas,
        };
      } else {
        console.log(`[AutoCorrelation] Nenhuma OS encontrada para ${ticketExternalId}`);
        
        // Ticket não encontrado no VDESK
        const { error: updateError } = await supabase
          .from('tickets')
          .update({
            os_found_in_vdesk: false,
            inconsistency_code: 'OS_NOT_FOUND',
            severity: 'critico',
            updated_at: new Date().toISOString(),
          })
          .eq('ticket_external_id', ticketExternalId)
          .eq('network_id', networkId);
        
        if (updateError) {
          console.error(`[AutoCorrelation] Erro ao atualizar ${ticketExternalId}:`, updateError);
        }

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
      
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      
      return {
        ticketId: ticketExternalId,
        success: false,
        osCount: 0,
        osNumbers: [],
        error: errorMsg,
      };
    }
  }, [networkId]);

  /**
   * Processa um lote de tickets
   */
  const processBatch = useCallback(async (
    ticketIds: string[],
    onProgress: (processed: number) => void
  ): Promise<CorrelationResult[]> => {
    const results: CorrelationResult[] = [];
    const batchSize = 5;

    for (let i = 0; i < ticketIds.length; i += batchSize) {
      const batch = ticketIds.slice(i, i + batchSize);
      
      // Processar lote em paralelo
      const batchResults = await Promise.all(
        batch.map(ticketId => correlateOneTicket(ticketId))
      );

      results.push(...batchResults);
      onProgress(i + batch.length);
      
      // Pequena pausa entre lotes para não sobrecarregar a API
      if (i + batchSize < ticketIds.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return results;
  }, [correlateOneTicket]);

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

      // Processar tickets
      const results = await processBatch(ticketIds, (processed) => {
        setProgress(Math.round((processed / ticketIds.length) * 100));
      });

      // Calcular estatísticas
      let correlated = 0;
      let notFound = 0;
      let errors = 0;

      for (const result of results) {
        if (result.success) {
          correlated++;
        } else if (result.error?.includes('não encontrado')) {
          notFound++;
        } else {
          errors++;
        }
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
  }, [networkId, processBatch, queryClient]);

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
      // Processar tickets
      const results = await processBatch(ticketIds, (processed) => {
        setProgress(Math.round((processed / ticketIds.length) * 100));
      });

      // Calcular estatísticas
      let correlated = 0;
      let notFound = 0;
      let errors = 0;

      for (const result of results) {
        if (result.success) {
          correlated++;
        } else if (result.error?.includes('não encontrado')) {
          notFound++;
        } else {
          errors++;
        }
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
  }, [networkId, processBatch, queryClient]);

  return {
    correlateAllPending,
    correlateTickets,
    isCorrelating,
    progress,
    summary,
  };
}
