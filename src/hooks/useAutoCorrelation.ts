/**
 * Hook para correlação automática de tickets com VDESK
 * 
 * Usa correlação em lote (batch) via Edge Function para performance
 * Fallback para correlação individual caso o batch falhe
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { correlacionarBatchViaProxy, correlacionarTicketViaProxy } from '@/services/vdeskProxyService';
import { useAuth } from './useAuth';
import { useResolvedAreaNetwork } from './useSupabaseData';

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

interface BatchCorrelationResult {
  ticket: string;
  found: boolean;
  osEncontradas: string[];
  count: number;
  data: any[];
  message?: string;
}

export function useAutoCorrelation() {
  const { networkId, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: areaNetworkId, isLoading: areaNetworkLoading } = useResolvedAreaNetwork('tickets_os', {
    enabled: !authLoading && isAuthenticated,
  });
  const queryClient = useQueryClient();
  const [isCorrelating, setIsCorrelating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<CorrelationSummary | null>(null);
  const effectiveNetworkId = areaNetworkId ?? (!areaNetworkLoading ? networkId ?? undefined : undefined);
  const canCorrelate = effectiveNetworkId !== undefined;

  /**
   * Atualiza tickets no Supabase com os resultados do batch
   */
  const applyBatchResults = useCallback(async (
    results: BatchCorrelationResult[]
  ) => {
    if (!effectiveNetworkId) return;

    const updatePromises = results.map(async (r) => {
      if (r.found && r.osEncontradas.length > 0) {
        const allOsNumbers = r.osEncontradas.join(', ');
        const lastRecord = r.data?.[r.data.length - 1];
        const lastOsEventAt = lastRecord?.dataHistorico || lastRecord?.dataRegistro || null;
        const lastOsEventDesc = lastRecord?.descricaoOS || lastRecord?.descricao || null;

        // Buscar ticket atual para preservar inconsistency_code se for UNKNOWN_STATUS
        const { data: currentTicket } = await supabase
          .from('tickets')
          .select('inconsistency_code, internal_status')
          .eq('ticket_external_id', r.ticket)
          .eq('network_id', effectiveNetworkId)
          .maybeSingle();

        // Se o único problema é status não mapeado, manter como atencao (não critico)
        const hasUnmappedStatus = currentTicket?.inconsistency_code === 'UNKNOWN_STATUS';
        const finalInconsistencyCode = hasUnmappedStatus ? 'UNKNOWN_STATUS' : null;
        const finalSeverity = hasUnmappedStatus ? ('atencao' as const) : ('info' as const);

        // Último programador listado = responsável atual
        const lastProgramador = r.data?.[r.data.length - 1]?.programador || null;

        return supabase
          .from('tickets')
          .update({
            os_found_in_vdesk: true,
            os_number: allOsNumbers,
            assigned_to: lastProgramador,
            inconsistency_code: finalInconsistencyCode,
            severity: finalSeverity,
            vdesk_payload: r.data as any,
            last_os_event_at: lastOsEventAt,
            last_os_event_desc: lastOsEventDesc,
            updated_at: new Date().toISOString(),
          })
          .eq('ticket_external_id', r.ticket)
          .eq('network_id', effectiveNetworkId);
      } else {
        return supabase
          .from('tickets')
          .update({
            os_found_in_vdesk: false,
            inconsistency_code: 'OS_NOT_FOUND',
            severity: 'critico' as const,
            vdesk_payload: null,
            last_os_event_at: new Date().toISOString(),
            last_os_event_desc: r.message || 'OS não encontrada no VDESK',
            updated_at: new Date().toISOString(),
          })
          .eq('ticket_external_id', r.ticket)
          .eq('network_id', effectiveNetworkId);
      }
    });

    await Promise.all(updatePromises);
  }, [effectiveNetworkId]);

  const revalidateNotFoundResults = useCallback(async (
    results: BatchCorrelationResult[]
  ): Promise<BatchCorrelationResult[]> => {
    // Só revalidar tickets que falharam por erro de processamento no batch,
    // NÃO tickets confirmados como inexistentes no VDesk (TICKET_NOT_FOUND)
    const retryableResults = results.filter(
      (result) => !result.found && result.message && !result.message.includes('não encontrado')
    );

    if (retryableResults.length === 0) {
      return results;
    }

    console.log(`[AutoCorrelation] Revalidando ${retryableResults.length} tickets (erros de batch, não TICKET_NOT_FOUND)`);

    const revalidatedEntries = await Promise.all(
      retryableResults.map(async (result) => {
        try {
          const response = await correlacionarTicketViaProxy(result.ticket);

          if (response.success && response.count > 0) {
            return [
              result.ticket,
              {
                ticket: result.ticket,
                found: true,
                osEncontradas: response.osEncontradas,
                count: response.count,
                data: response.data,
                message: response.message,
              } satisfies BatchCorrelationResult,
            ] as const;
          }
        } catch (error) {
          console.warn(`[AutoCorrelation] Revalidação individual falhou para ${result.ticket}:`, error);
        }

        return [result.ticket, result] as const;
      })
    );

    const revalidatedMap = new Map(revalidatedEntries);

    return results.map((result) => revalidatedMap.get(result.ticket) ?? result);
  }, []);

  /**
   * Fallback: correlação individual (usado se batch falhar)
   */
  const correlateIndividually = useCallback(async (
    ticketIds: string[],
    onProgress: (processed: number) => void
  ): Promise<CorrelationResult[]> => {
    const results: CorrelationResult[] = [];
    const batchSize = 5;

    for (let i = 0; i < ticketIds.length; i += batchSize) {
      const batch = ticketIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (ticketExternalId): Promise<CorrelationResult> => {
          try {
            const response = await correlacionarTicketViaProxy(ticketExternalId);
            if (response.success && response.count > 0) {
              const allOsNumbers = response.osEncontradas.join(', ');
              const lastOsRecord = response.data?.[response.data.length - 1];
              const lastProgramador = response.data?.[response.data.length - 1]?.programador || null;
              await supabase
                .from('tickets')
                .update({
                  os_found_in_vdesk: true,
                  os_number: allOsNumbers,
                  assigned_to: lastProgramador,
                  inconsistency_code: null,
                  severity: 'info' as const,
                  vdesk_payload: response.data as any,
                  last_os_event_at: lastOsRecord?.dataHistorico || lastOsRecord?.dataRegistro || null,
                  last_os_event_desc: lastOsRecord?.descricaoOS || lastOsRecord?.descricao || null,
                  updated_at: new Date().toISOString(),
                })
                .eq('ticket_external_id', ticketExternalId)
                .eq('network_id', networkId);
              return { ticketId: ticketExternalId, success: true, osCount: response.count, osNumbers: response.osEncontradas };
            } else {
              await supabase
                .from('tickets')
                .update({
                  os_found_in_vdesk: false,
                  inconsistency_code: 'OS_NOT_FOUND',
                  severity: 'critico' as const,
                  updated_at: new Date().toISOString(),
                })
                .eq('ticket_external_id', ticketExternalId)
                .eq('network_id', networkId);
              return { ticketId: ticketExternalId, success: false, osCount: 0, osNumbers: [], error: response.message || 'Sem OS' };
            }
          } catch (error) {
            return { ticketId: ticketExternalId, success: false, osCount: 0, osNumbers: [], error: (error as Error).message };
          }
        })
      );
      results.push(...batchResults);
      onProgress(i + batch.length);
      if (i + batchSize < ticketIds.length) await new Promise(r => setTimeout(r, 500));
    }
    return results;
  }, [networkId]);

  /**
   * Correlaciona todos os tickets pendentes usando batch
   */
  const correlateAllPending = useCallback(async (): Promise<CorrelationSummary> => {
    if (!effectiveNetworkId) throw new Error('Network não identificada');

    setIsCorrelating(true);
    setProgress(0);
    setSummary(null);

    try {
      // Buscar TODOS os tickets ativos para correlação/recorrelação
      // Isso garante que assigned_to (programador) seja sempre atualizado
      const { data: tickets, error } = await supabase
        .from('tickets')
        .select('ticket_external_id')
        .eq('network_id', effectiveNetworkId)
        .eq('is_active', true);

      if (error) throw error;

      const ticketIds = tickets?.map(t => t.ticket_external_id) || [];

      if (ticketIds.length === 0) {
        const empty: CorrelationSummary = { total: 0, correlated: 0, notFound: 0, errors: 0, results: [] };
        setSummary(empty);
        return empty;
      }

      setProgress(10); // indicar que iniciou

      let results: CorrelationResult[];

      try {
        // === BATCH: 1 chamada HTTP para todos os tickets ===
        console.log(`[AutoCorrelation] Batch: ${ticketIds.length} tickets`);
        const batchResponse = await correlacionarBatchViaProxy(ticketIds);
        const normalizedResults = await revalidateNotFoundResults(batchResponse.results);

        setProgress(70); // batch concluído, agora salvando no Supabase

        // Aplicar resultados no Supabase
        await applyBatchResults(normalizedResults);

        setProgress(90);

        // Mapear resultados para formato interno
        results = normalizedResults.map(r => ({
          ticketId: r.ticket,
          success: r.found,
          osCount: r.count,
          osNumbers: r.osEncontradas,
          error: r.found ? undefined : (r.message || 'Sem OS'),
        }));

        console.log(`[AutoCorrelation] Batch concluído:`, batchResponse.summary);
      } catch (batchError) {
        // === FALLBACK: correlação individual ===
        console.warn(`[AutoCorrelation] Batch falhou, usando fallback individual:`, batchError);
        results = await correlateIndividually(ticketIds, (processed) => {
          setProgress(Math.round((processed / ticketIds.length) * 100));
        });
      }

      // Calcular estatísticas
      let correlated = 0, notFound = 0, errors = 0;
      for (const r of results) {
        if (r.success) correlated++;
        else if (r.error?.includes('não encontrad') || r.error?.includes('Sem OS')) notFound++;
        else errors++;
      }

      const finalSummary: CorrelationSummary = { total: ticketIds.length, correlated, notFound, errors, results };
      setSummary(finalSummary);

      // Invalidar queries
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['correlation-metrics'] });

      return finalSummary;
    } finally {
      setIsCorrelating(false);
      setProgress(100);
    }
  }, [effectiveNetworkId, applyBatchResults, correlateIndividually, queryClient, revalidateNotFoundResults]);

  /**
   * Correlaciona lista específica de tickets usando batch
   */
  const correlateTickets = useCallback(async (ticketIds: string[]): Promise<CorrelationSummary> => {
    if (!effectiveNetworkId) throw new Error('Network não identificada');
    if (ticketIds.length === 0) return { total: 0, correlated: 0, notFound: 0, errors: 0, results: [] };

    setIsCorrelating(true);
    setProgress(0);
    setSummary(null);

    try {
      let results: CorrelationResult[];

      try {
        const batchResponse = await correlacionarBatchViaProxy(ticketIds);
        const normalizedResults = await revalidateNotFoundResults(batchResponse.results);
        setProgress(70);
        await applyBatchResults(normalizedResults);
        setProgress(90);
        results = normalizedResults.map(r => ({
          ticketId: r.ticket,
          success: r.found,
          osCount: r.count,
          osNumbers: r.osEncontradas,
          error: r.found ? undefined : (r.message || 'Sem OS'),
        }));
      } catch {
        console.warn('[AutoCorrelation] Batch falhou, fallback individual');
        results = await correlateIndividually(ticketIds, (processed) => {
          setProgress(Math.round((processed / ticketIds.length) * 100));
        });
      }

      let correlated = 0, notFound = 0, errors = 0;
      for (const r of results) {
        if (r.success) correlated++;
        else if (r.error?.includes('não encontrad') || r.error?.includes('Sem OS')) notFound++;
        else errors++;
      }

      const finalSummary: CorrelationSummary = { total: ticketIds.length, correlated, notFound, errors, results };
      setSummary(finalSummary);

      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['correlation-metrics'] });

      return finalSummary;
    } finally {
      setIsCorrelating(false);
      setProgress(100);
    }
  }, [effectiveNetworkId, applyBatchResults, correlateIndividually, queryClient, revalidateNotFoundResults]);

  return {
    correlateAllPending,
    correlateTickets,
    canCorrelate,
    isCorrelating,
    progress,
    summary,
  };
}
