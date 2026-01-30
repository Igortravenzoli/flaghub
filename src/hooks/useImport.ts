import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCreateBatch, useUpdateBatch, useMarkTicketsInactive } from './useImportBatch';
import { correlacionarTicket } from '@/services/ticketsOSApi';
import { getValidToken } from '@/services/apiSessionToken';

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

// Parser CSV simples
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const records: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || '';
    });
    records.push(record);
  }
  
  return records;
}

export function useImport() {
  const { networkId, user, canImport } = useAuth();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

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

      setIsProcessing(true);
      setProgress(10);

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
          records = parseCSV(content);
        }

        setProgress(50);

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

        // ========================================
        // CORRELAÇÃO AUTOMÁTICA COM VDESK
        // ========================================
        console.log('[Import] Iniciando correlação automática com VDESK...');
        
        try {
          const token = await getValidToken();
          
          // Correlacionar tickets importados que têm número de ticket
          const ticketsToCorrelate = ticketsToUpsert
            .filter(t => t.ticket_external_id)
            .map(t => t.ticket_external_id);

          let correlatedCount = 0;
          const correlationBatchSize = 5;

          for (let i = 0; i < ticketsToCorrelate.length; i += correlationBatchSize) {
            const batch = ticketsToCorrelate.slice(i, i + correlationBatchSize);
            
            await Promise.all(batch.map(async (ticketId) => {
              try {
                const response = await correlacionarTicket(ticketId, token);
                
                if (response.success && response.count > 0) {
                  await supabase
                    .from('tickets')
                    .update({
                      os_found_in_vdesk: true,
                      has_os: true,
                      os_number: response.osEncontradas[0],
                      inconsistency_code: null,
                      severity: 'info',
                    })
                    .eq('ticket_external_id', ticketId)
                    .eq('network_id', networkId);
                  correlatedCount++;
                } else {
                  await supabase
                    .from('tickets')
                    .update({
                      os_found_in_vdesk: false,
                      inconsistency_code: 'OS_NOT_FOUND',
                      severity: 'critico',
                    })
                    .eq('ticket_external_id', ticketId)
                    .eq('network_id', networkId);
                }
              } catch (err) {
                console.warn(`[Import] Falha na correlação do ticket ${ticketId}:`, err);
              }
            }));

            setProgress(92 + Math.floor((i / ticketsToCorrelate.length) * 6));
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
    error: importMutation.error,
    isError: importMutation.isError,
  };
}
