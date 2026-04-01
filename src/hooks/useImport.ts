import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCreateBatch, useUpdateBatch, useDeleteTicketsByNetwork } from './useImportBatch';
import { correlacionarBatchViaProxy } from '@/services/vdeskProxyService';
import Papa from 'papaparse';

interface ImportResult {
  success: boolean;
  batchId?: number;
  importId?: number;
  totalRecords?: number;
  errorsCount?: number;
  warningsCount?: number;
  message?: string;
}

interface ImportOptions {
  clearBeforeImport?: boolean;
  batchName?: string;
  notes?: string;
}

// Status detalhado da importação
export interface ImportStatus {
  phase: 'idle' | 'validating' | 'importing' | 'correlating' | 'completed' | 'error';
  fileName?: string;
  totalRecords?: number;
  processedRecords?: number;
  correlatedTickets?: number;
  totalToCorrelate?: number;
  message?: string;
}

// Calcular hash SHA256 de um arquivo
async function calculateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Detectar tipo de arquivo
function getFileType(file: File): 'json' | 'csv' | null {
  if (file.name.endsWith('.json') || file.type === 'application/json') return 'json';
  if (file.name.endsWith('.csv') || file.type === 'text/csv') return 'csv';
  return null;
}

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Required CSV headers for validation
const REQUIRED_CSV_HEADERS = ['number', 'state'];

// Robust CSV parser using papaparse - handles quoted fields, multi-line, escaped quotes
function parseCSV(content: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });
  
  if (result.errors.length > 0) {
    const criticalErrors = result.errors.filter(e => e.type === 'Quotes' || e.type === 'FieldMismatch');
    if (criticalErrors.length > 0) {
      const errorMessages = criticalErrors.slice(0, 3).map(e => 
        `Linha ${(e.row ?? 0) + 2}: ${e.message}`
      ).join('; ');
      throw new Error(`Erros no CSV: ${errorMessages}`);
    }
  }
  
  return result.data;
}

// Validate CSV has required headers
function validateCSVHeaders(records: Record<string, string>[]): void {
  if (records.length === 0) {
    throw new Error('Arquivo CSV vazio ou sem dados válidos.');
  }
  
  const firstRecord = records[0];
  const availableHeaders = Object.keys(firstRecord).map(h => h.toLowerCase());
  const missingHeaders = REQUIRED_CSV_HEADERS.filter(
    required => !availableHeaders.some(h => h === required.toLowerCase())
  );
  
  if (missingHeaders.length > 0) {
    throw new Error(`Colunas obrigatórias ausentes no CSV: ${missingHeaders.join(', ')}`);
  }
}

export function useImport() {
  const { networkId, user, canImport } = useAuth();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<ImportStatus>({ phase: 'idle' });

  const importMutation = useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      if (!networkId || !user) {
        throw new Error('Usuário não autenticado ou sem network associada');
      }
      
      if (!canImport) {
        throw new Error('Usuário não tem permissão para importar');
      }

      const fileType = getFileType(file);
      if (!fileType) {
        throw new Error('Tipo de arquivo não suportado. Use JSON ou CSV.');
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        throw new Error('Arquivo muito grande. O tamanho máximo é 10MB.');
      }

      setIsProcessing(true);
      setProgress(10);
      setStatus({ 
        phase: 'validating', 
        fileName: file.name, 
        message: `Validando arquivo ${file.name}...` 
      });

      let createdImportId: number | null = null;

      try {
        // Calcular hash do arquivo
        const fileHash = await calculateFileHash(file);
        setProgress(20);

        // Verificar duplicidade APENAS para imports concluídos com sucesso
        // (se a tentativa anterior falhou ou ficou travada, permitir retry)
        const { data: existingImport, error: existingImportError } = await supabase
          .from('imports')
          .select('id')
          .eq('network_id', networkId)
          .eq('file_hash', fileHash)
          .eq('status', 'success')
          .maybeSingle();

        if (existingImportError) throw existingImportError;

        if (existingImport) {
          throw new Error('Este arquivo já foi importado anteriormente.');
        }

        setProgress(30);

        // Criar registro de importação (usar maybeSingle para evitar PGRST116 quando não há retorno)
        const { data: importRecord, error: importError } = await supabase
          .from('imports')
          .insert({
            network_id: networkId,
            imported_by: user.id,
            file_name: file.name,
            file_type: fileType,
            file_hash: fileHash,
            status: 'processing',
          })
          .select('id')
          .maybeSingle();

        if (importError) throw importError;
        if (!importRecord?.id) {
          throw new Error('Falha ao criar registro de importação (sem retorno do banco).');
        }

        createdImportId = importRecord.id;

        setProgress(40);

        // Ler conteúdo do arquivo
        const content = await file.text();
        let records: Record<string, unknown>[];

        if (fileType === 'json') {
          const parsed = JSON.parse(content);
          // Suporta formato { records: [...] } ou array direto ou objeto único
          if (parsed.records && Array.isArray(parsed.records)) {
            records = parsed.records;
          } else if (Array.isArray(parsed)) {
            records = parsed;
          } else {
            records = [parsed];
          }
        } else {
          // Use robust CSV parser with validation
          const csvRecords = parseCSV(content);
          validateCSVHeaders(csvRecords);
          records = csvRecords;
        }

        setProgress(50);
        setStatus({
          phase: 'importing',
          fileName: file.name,
          totalRecords: records.length,
          processedRecords: 0,
          message: `Importando ${file.name}: ${records.length} registros`,
        });

        // Buscar mapeamentos de status
        const { data: statusMappings } = await supabase
          .from('status_mapping')
          .select('*')
          .eq('network_id', networkId)
          .eq('is_active', true);

        const statusMap = new Map(
          statusMappings?.map(sm => [sm.external_status.toLowerCase(), sm.internal_status]) || []
        );

        // Buscar settings
        const { data: settings } = await supabase
          .from('settings')
          .select('no_os_grace_hours')
          .eq('network_id', networkId)
          .maybeSingle();

        const noOsGraceHours = settings?.no_os_grace_hours ?? 24;

        setProgress(60);

        // Processar cada registro
        let errorsCount = 0;
        let warningsCount = 0;
        type TicketInsert = {
          network_id: number;
          ticket_external_id: string;
          ticket_type: string | null;
          opened_at: string | null;
          external_status: string | null;
          internal_status: 'novo' | 'em_atendimento' | 'em_analise' | 'finalizado' | 'cancelado' | null;
          assigned_to: string | null;
          os_number: string | null;
          inconsistency_code: string | null;
          severity: 'critico' | 'atencao' | 'info';
          raw_payload: Record<string, unknown>;
          last_import_id: number;
          is_active: boolean;
          updated_at: string;
        };
        const ticketsToUpsert: TicketInsert[] = [];

        for (const record of records) {
          const ticketExternalId = (record.number as string) || (record.ticket_external_id as string);
          if (!ticketExternalId) {
            errorsCount++;
            // Use direct insert for import_events
            const eventData = {
              import_id: createdImportId,
              level: 'error' as const,
              message: 'Registro sem ID de ticket',
              meta: record as Record<string, unknown>,
            };
            await supabase.from('import_events').insert([eventData] as never);
            continue;
          }

          // Normalizar dados
          const externalStatus = (record.state as string) || (record.external_status as string) || '';
          const internalStatus = statusMap.get(externalStatus.toLowerCase()) || null;
          
          // Detectar tipo de ticket
          let ticketType = 'incident';
          if (ticketExternalId.startsWith('RITM')) {
            ticketType = 'request';
          } else if (ticketExternalId.startsWith('PRB')) {
            ticketType = 'problem';
          } else if (record.type) {
            ticketType = record.type as string;
          }

          // Extrair OS se existir
          const osNumber = (record.os_number as string) || (record.os as string) || null;
          
          // Parse da data de abertura
          let openedAt: string | null = null;
          const openedAtRaw = (record.opened_at as string) || '';
          if (openedAtRaw) {
            // Tentar parsear formato "DD-MM-YYYY HH:mm"
            const match = openedAtRaw.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/);
            if (match) {
              const [, day, month, year, hour, min] = match;
              openedAt = `${year}-${month}-${day}T${hour}:${min}:00Z`;
            } else {
              // Tentar ISO
              const date = new Date(openedAtRaw);
              if (!isNaN(date.getTime())) {
                openedAt = date.toISOString();
              }
            }
          }

          // Calcular inconsistências e severidade
          let inconsistencyCode: string | null = null;
          let severity: 'critico' | 'atencao' | 'info' = 'info';

          if (!openedAt) {
            inconsistencyCode = 'NO_OPENED_AT';
            severity = 'critico';
            errorsCount++;
          } else if (!internalStatus) {
            inconsistencyCode = 'UNKNOWN_STATUS';
            severity = 'critico';
            warningsCount++;
          } else if (!osNumber) {
            const horasSemOS = openedAt 
              ? Math.floor((Date.now() - new Date(openedAt).getTime()) / (1000 * 60 * 60))
              : 0;
            
            if (horasSemOS > noOsGraceHours) {
              inconsistencyCode = 'NO_OS_OVERDUE';
              severity = 'critico';
            } else {
              inconsistencyCode = 'NO_OS_WITHIN_GRACE';
              severity = 'atencao';
            }
          }

          ticketsToUpsert.push({
            network_id: networkId,
            ticket_external_id: ticketExternalId,
            ticket_type: ticketType,
            opened_at: openedAt,
            external_status: externalStatus,
            internal_status: internalStatus as 'novo' | 'em_atendimento' | 'em_analise' | 'finalizado' | 'cancelado' | null,
            assigned_to: (record.assigned_to as string) || null,
            os_number: osNumber,
            inconsistency_code: inconsistencyCode,
            severity,
            raw_payload: record as Record<string, unknown>,
            last_import_id: createdImportId,
            is_active: true,
            updated_at: new Date().toISOString(),
          });
        }

        setProgress(80);

        // Upsert em lotes
        const batchSize = 100;
        for (let i = 0; i < ticketsToUpsert.length; i += batchSize) {
          const batch = ticketsToUpsert.slice(i, i + batchSize);
          const { error: upsertError } = await supabase
            .from('tickets')
            .upsert(batch as never, {
              onConflict: 'network_id,ticket_external_id',
            });

          if (upsertError) {
            console.error('Upsert error:', upsertError);
            errorsCount += batch.length;
          }

          setProgress(80 + Math.floor((i / ticketsToUpsert.length) * 10));
        }

        // Atualizar status da importação
        await supabase
          .from('imports')
          .update({
            status: errorsCount > 0 && errorsCount === records.length ? 'error' : 'success',
            total_records: records.length,
            errors_count: errorsCount,
            warnings_count: warningsCount,
          })
          .eq('id', createdImportId);

        setProgress(92);
        setStatus({
          phase: 'importing',
          fileName: file.name,
          totalRecords: records.length,
          processedRecords: records.length,
          message: `${file.name}: ${records.length} registros importados`,
        });

        // ========================================
        // CORRELAÇÃO AUTOMÁTICA COM VDESK (via Edge Function Proxy)
        // ========================================
        console.log('[Import] Iniciando correlação automática com VDESK via proxy...');
        
        try {
          const ticketsToCorrelate = ticketsToUpsert
            .filter(t => t.ticket_external_id)
            .map(t => t.ticket_external_id);

          let correlatedCount = 0;

          setStatus({
            phase: 'correlating',
            fileName: file.name,
            totalRecords: records.length,
            totalToCorrelate: ticketsToCorrelate.length,
            correlatedTickets: 0,
            message: `Correlacionando tickets com VDESK: 0/${ticketsToCorrelate.length}`,
          });

          // Process in chunks of 50 to avoid edge function timeouts
          const proxyBatchSize = 50;
          for (let i = 0; i < ticketsToCorrelate.length; i += proxyBatchSize) {
            const chunk = ticketsToCorrelate.slice(i, i + proxyBatchSize);
            
            try {
              const batchResponse = await correlacionarBatchViaProxy(chunk);
              
              if (batchResponse.success && batchResponse.results) {
                for (const result of batchResponse.results) {
                  if (result.found && result.osEncontradas.length > 0) {
                    const allOsNumbers = result.osEncontradas.join(', ');
                    const { error: updateError } = await supabase
                      .from('tickets')
                      .update({
                        os_found_in_vdesk: true,
                        os_number: allOsNumbers,
                        inconsistency_code: null,
                        severity: 'info',
                        updated_at: new Date().toISOString(),
                      })
                      .eq('ticket_external_id', result.ticket)
                      .eq('network_id', networkId);
                    
                    if (!updateError) correlatedCount++;
                    else console.error(`[Import] Erro ao atualizar ticket ${result.ticket}:`, updateError);
                  } else {
                    await supabase
                      .from('tickets')
                      .update({
                        os_found_in_vdesk: false,
                        inconsistency_code: 'OS_NOT_FOUND',
                        severity: 'critico',
                        updated_at: new Date().toISOString(),
                      })
                      .eq('ticket_external_id', result.ticket)
                      .eq('network_id', networkId);
                  }
                }
              }
            } catch (chunkErr) {
              console.warn(`[Import] Falha na correlação batch (chunk ${i}):`, chunkErr);
            }

            const processed = Math.min(i + proxyBatchSize, ticketsToCorrelate.length);
            setStatus({
              phase: 'correlating',
              fileName: file.name,
              totalRecords: records.length,
              totalToCorrelate: ticketsToCorrelate.length,
              correlatedTickets: processed,
              message: `Correlacionando tickets com VDESK: ${processed}/${ticketsToCorrelate.length}`,
            });
            setProgress(92 + Math.floor((processed / ticketsToCorrelate.length) * 6));
          }

          console.log(`[Import] Correlação concluída: ${correlatedCount}/${ticketsToCorrelate.length} tickets com OS encontrada`);
        } catch (correlationError) {
          console.error('[Import] Erro na correlação automática:', correlationError);
          // Não falhar a importação por causa da correlação
        }

        // Log de conclusão
        const completionEvent = {
          import_id: createdImportId,
          level: 'info' as const,
          message: `Importação concluída: ${records.length} registros, ${errorsCount} erros, ${warningsCount} avisos`,
        };
        await supabase.from('import_events').insert([completionEvent] as never);

        setProgress(100);
        setStatus({
          phase: 'completed',
          fileName: file.name,
          totalRecords: records.length,
          message: `Concluído: ${records.length} registros importados`,
        });

        return {
          success: true,
          importId: createdImportId,
          totalRecords: records.length,
          errorsCount,
          warningsCount,
        };

      } catch (error) {
        // Marcar importação como erro (se já existir registro criado)
        if (createdImportId) {
          await supabase
            .from('imports')
            .update({ status: 'error' })
            .eq('id', createdImportId);

          const errorEvent = {
            import_id: createdImportId,
            level: 'error' as const,
            message: `Erro durante processamento: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
          };
          await supabase.from('import_events').insert([errorEvent] as never);
        }

        setStatus({
          phase: 'error',
          message: error instanceof Error ? error.message : 'Erro desconhecido',
        });
        throw error;
      } finally {
        setIsProcessing(false);
        setProgress(0);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['imports-history'] });
    },
  });

  const importFile = useCallback((file: File) => {
    return importMutation.mutateAsync(file);
  }, [importMutation]);

  return {
    importFile,
    isProcessing,
    progress,
    status,
    error: importMutation.error,
    isError: importMutation.isError,
  };
}
