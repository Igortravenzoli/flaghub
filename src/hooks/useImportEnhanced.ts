import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCreateBatch, useUpdateBatch, useDeleteTicketsByNetwork } from './useImportBatch';
// Correlação automática removida - usar API REST em ticketsOSApi.ts ao invés

interface ImportResult {
  success: boolean;
  batchId?: number;
  totalFiles?: number;
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

// Parser CSV robusto que trata campos com vírgulas e aspas
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  
  // Função para parsear uma linha CSV respeitando aspas
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Aspas escapadas ("") dentro de campo
          current += '"';
          i++;
        } else {
          // Toggle estado de aspas
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Fim do campo
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Adicionar último campo
    result.push(current.trim());
    return result;
  };
  
  const headers = parseCSVLine(lines[0]);
  const records: Record<string, string>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Ignorar linhas vazias
    
    const values = parseCSVLine(line);
    const record: Record<string, string> = {};
    
    headers.forEach((header, index) => {
      record[header] = values[index] || '';
    });
    
    // Só adicionar se tiver pelo menos um valor
    if (Object.values(record).some(v => v !== '')) {
      records.push(record);
    }
  }
  
  return records;
}

/**
 * Hook para importação de múltiplos arquivos em lote
 * Suporta expurgo automático e merge inteligente
 */
export function useImportBatch() {
  const { networkId, user, canImport } = useAuth();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');

  const createBatch = useCreateBatch();
  const updateBatch = useUpdateBatch();
  const deleteTickets = useDeleteTicketsByNetwork();

  const importBatchMutation = useMutation({
    mutationFn: async ({ 
      files, 
      options 
    }: { 
      files: File[]; 
      options?: ImportOptions 
    }): Promise<ImportResult> => {
      if (!networkId || !user) {
        throw new Error('Usuário não autenticado ou sem network associada');
      }
      
      if (!canImport) {
        throw new Error('Usuário não tem permissão para importar');
      }

      if (files.length === 0) {
        throw new Error('Nenhum arquivo selecionado');
      }

      setIsProcessing(true);
      setProgress(5);

      console.log('[Import] Iniciando importação...', { networkId, userId: user.id, clearBeforeImport: options?.clearBeforeImport, fileCount: files.length });

      // Criar lote de importação
      let batch;
      try {
        batch = await createBatch.mutateAsync({
          networkId,
          userId: user.id,
          batchName: options?.batchName,
          clearBeforeImport: options?.clearBeforeImport || false,
          notes: options?.notes,
        });
        console.log('[Import] Batch criado:', batch);
      } catch (batchError) {
        console.error('[Import] Erro ao criar batch:', batchError);
        throw new Error(`Falha ao criar lote de importação: ${batchError instanceof Error ? batchError.message : JSON.stringify(batchError)}`);
      }

      if (!batch?.id) {
        console.error('[Import] Batch criado sem ID:', batch);
        throw new Error('Lote de importação criado sem ID válido. Verifique as permissões.');
      }

      const batchId = batch.id;
      let totalRecordsAll = 0;
      let totalErrorsAll = 0;
      let totalWarningsAll = 0;

      try {
        // Se clearBeforeImport, marcar todos tickets como inativos
        if (options?.clearBeforeImport) {
          setProgress(10);
          console.log('[Import] EXPURGO: Deletando todos os tickets da network...');
          const deleted = await deleteTickets.mutateAsync(networkId);
          console.log(`[Import] ${deleted} tickets deletados (expurgo)`);
        }

        setProgress(15);

        // Processar cada arquivo
        for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
          const file = files[fileIndex];
          setCurrentFile(file.name);

          const fileType = getFileType(file);
          if (!fileType) {
            console.warn(`Arquivo ${file.name} ignorado: tipo não suportado`);
            continue;
          }

          // Progresso por arquivo
          const fileProgressStart = 15 + (fileIndex / files.length) * 70;
          const fileProgressRange = 70 / files.length;

          setProgress(fileProgressStart);

          // Calcular hash
          const fileHash = await calculateFileHash(file);

          // Verificar duplicação (apenas no modo incremental)
          if (!options?.clearBeforeImport) {
            const { data: existingImports } = await supabase
              .from('imports')
              .select('id, file_name, created_at, status')
              .eq('network_id', networkId)
              .eq('file_hash', fileHash)
              .limit(1);

            if (existingImports && existingImports.length > 0) {
              const existingImport = existingImports[0];
              const importDate = new Date(existingImport.created_at).toLocaleString('pt-BR');
              console.warn(`Arquivo ${file.name} já foi importado anteriormente em ${importDate}`);
              
              await supabase.from('import_events').insert([{
                import_id: existingImport.id,
                level: 'warning',
                message: `Tentativa de reimportação do arquivo ${file.name} detectada (hash duplicado)`,
                meta: { 
                  batch_id: batchId,
                  attempted_at: new Date().toISOString() 
                },
              }] as never);
              
              totalWarningsAll++;
              continue;
            }
          }

          // Criar registro de importação para este arquivo
          console.log('[Import] Criando registro para:', file.name);
          const { data: importRecord, error: importError } = await supabase
            .from('imports')
            .insert({
              network_id: networkId,
              imported_by: user.id,
              batch_id: batchId,
              file_name: file.name,
              file_type: fileType,
              file_hash: fileHash,
              status: 'processing',
            })
            .select()
            .maybeSingle();

          if (importError) {
            console.error('[Import] Erro ao criar import record:', JSON.stringify(importError));
            totalErrorsAll++;
            continue;
          }

          if (!importRecord) {
            console.error('[Import] Import record sem retorno (possível problema RLS)');
            totalErrorsAll++;
            continue;
          }

          console.log('[Import] Import record criado:', importRecord.id);

          try {
            // Ler e parsear arquivo
            const content = await file.text();
            let records: Record<string, unknown>[];

            if (fileType === 'json') {
              const parsed = JSON.parse(content);
              if (Array.isArray(parsed)) {
                records = parsed;
              } else if (parsed && typeof parsed === 'object') {
                // Suportar objetos wrapper como {records: [...]}, {result: [...]}, {data: [...]}
                const arrayProp = Object.values(parsed).find(v => Array.isArray(v)) as Record<string, unknown>[] | undefined;
                records = arrayProp || [parsed];
              } else {
                records = [parsed];
              }
            } else {
              records = parseCSV(content);
            }

            setProgress(fileProgressStart + fileProgressRange * 0.3);

            // Buscar configurações
            const { data: statusMappings } = await supabase
              .from('status_mapping')
              .select('*')
              .eq('network_id', networkId)
              .eq('is_active', true);

            const statusMap = new Map(
              statusMappings?.map(sm => [sm.external_status.toLowerCase(), sm.internal_status]) || []
            );

            const { data: settings } = await supabase
              .from('settings')
              .select('no_os_grace_hours')
              .eq('network_id', networkId)
              .maybeSingle();

            const noOsGraceHours = settings?.no_os_grace_hours ?? 24;

            setProgress(fileProgressStart + fileProgressRange * 0.4);

            // Processar registros com merge inteligente
            let errorsCount = 0;
            let warningsCount = 0;
            const ticketsToUpsert: any[] = [];

            for (const record of records) {
              const ticketExternalId = (record.number as string) || (record.ticket_external_id as string);
              if (!ticketExternalId) {
                errorsCount++;
                await supabase.from('import_events').insert([{
                  import_id: importRecord.id,
                  level: 'error',
                  message: 'Registro sem ID de ticket',
                  meta: record,
                }] as never);
                continue;
              }

              // Normalizar dados com merge inteligente (só campos não-nulos)
              const ticketData: any = {
                network_id: networkId,
                ticket_external_id: ticketExternalId,
                last_import_id: importRecord.id,
                updated_at: new Date().toISOString(),
                is_active: true,
                last_seen_at: new Date().toISOString(),
                // Forçar re-correlação com VDESK após importação
                os_found_in_vdesk: null,
                vdesk_payload: null,
              };

              // Adicionar campos opcionais apenas se não-nulos/não-vazios
              const externalStatus = (record.state as string) || (record.external_status as string) || '';
              if (externalStatus) {
                ticketData.external_status = externalStatus;
                const internalStatus = statusMap.get(externalStatus.toLowerCase());
                if (internalStatus) {
                  ticketData.internal_status = internalStatus;
                }
              }

              // Tipo de ticket
              let ticketType = 'incident';
              if (ticketExternalId.startsWith('RITM')) {
                ticketType = 'request';
              } else if (ticketExternalId.startsWith('PRB')) {
                ticketType = 'problem';
              } else if (record.type) {
                ticketType = record.type as string;
              }
              ticketData.ticket_type = ticketType;

              // OS Number
              const osNumber = (record.os_number as string) || (record.os as string) || null;
              if (osNumber) {
                ticketData.os_number = osNumber;
                ticketData.has_os = true;
              }

              // Assigned to
              const assignedTo = (record.assigned_to as string) || null;
              if (assignedTo) {
                ticketData.assigned_to = assignedTo;
              }

              // Data de abertura
              const openedAtRaw = (record.opened_at as string) || '';
              if (openedAtRaw) {
                const match = openedAtRaw.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/);
                if (match) {
                  const [, day, month, year, hour, min] = match;
                  ticketData.opened_at = `${year}-${month}-${day}T${hour}:${min}:00Z`;
                } else {
                  const date = new Date(openedAtRaw);
                  if (!isNaN(date.getTime())) {
                    ticketData.opened_at = date.toISOString();
                  }
                }
              }

              // Calcular severidade e inconsistências
              let inconsistencyCode: string | null = null;
              let severity: 'critico' | 'atencao' | 'info' = 'info';

              if (!ticketData.opened_at) {
                inconsistencyCode = 'NO_OPENED_AT';
                severity = 'critico';
                errorsCount++;
              } else if (!ticketData.internal_status) {
                inconsistencyCode = 'UNKNOWN_STATUS';
                severity = 'atencao';
                warningsCount++;
              } else if (!osNumber) {
                const horasSemOS = ticketData.opened_at
                  ? Math.floor((Date.now() - new Date(ticketData.opened_at).getTime()) / (1000 * 60 * 60))
                  : 0;

                if (horasSemOS > noOsGraceHours) {
                  inconsistencyCode = 'NO_OS_OVERDUE';
                  severity = 'critico';
                } else {
                  inconsistencyCode = 'NO_OS_WITHIN_GRACE';
                  severity = 'atencao';
                }
              }

              ticketData.inconsistency_code = inconsistencyCode;
              ticketData.severity = severity;
              ticketData.raw_payload = record;

              ticketsToUpsert.push(ticketData);
            }

            setProgress(fileProgressStart + fileProgressRange * 0.7);

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
            }

            setProgress(fileProgressStart + fileProgressRange * 0.9);

            // Atualizar status do arquivo
            await supabase
              .from('imports')
              .update({
                status: errorsCount > 0 && errorsCount === records.length ? 'error' : 'success',
                total_records: records.length,
                errors_count: errorsCount,
                warnings_count: warningsCount,
              } as never)
              .eq('id', importRecord.id);

            totalRecordsAll += records.length;
            totalErrorsAll += errorsCount;
            totalWarningsAll += warningsCount;

            setProgress(fileProgressStart + fileProgressRange);

          } catch (fileError) {
            console.error(`Erro ao processar arquivo ${file.name}:`, fileError);
            await supabase
              .from('imports')
              .update({ status: 'error' })
              .eq('id', importRecord.id);
          }
        }

        setProgress(90);

        // Atualizar lote com status final
        const finalStatus = 
          totalErrorsAll === 0 ? 'success' :
          totalRecordsAll > totalErrorsAll ? 'partial_success' :
          'error';

        await updateBatch.mutateAsync({
          batchId,
          status: finalStatus,
          totalFiles: files.length,
          totalRecords: totalRecordsAll,
          errorsCount: totalErrorsAll,
          warningsCount: totalWarningsAll,
        });

        setProgress(95);

        // NOTA: Correlação automática com VDESK foi removida
        // Use useCorrelacionarTicket() hook para correlacionar tickets conforme necessário
        // A API REST em localhost:5000 (VDESKProxy) agora fornece essa funcionalidade

        setProgress(100);

        // Invalidar queries
        queryClient.invalidateQueries({ queryKey: ['tickets'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
        queryClient.invalidateQueries({ queryKey: ['import-batches'] });

        return {
          success: true,
          batchId,
          totalFiles: files.length,
          totalRecords: totalRecordsAll,
          errorsCount: totalErrorsAll,
          warningsCount: totalWarningsAll,
          message: `Importação concluída: ${files.length} arquivo(s), ${totalRecordsAll} registros`,
        };

      } catch (error) {
        // Atualizar lote com erro
        await updateBatch.mutateAsync({
          batchId,
          status: 'error',
          totalFiles: files.length,
        });
        throw error;
      } finally {
        setIsProcessing(false);
        setCurrentFile('');
        setProgress(0);
      }
    },
  });

  return {
    importBatch: importBatchMutation.mutateAsync,
    isProcessing,
    progress,
    currentFile,
    error: importBatchMutation.error,
  };
}

// Manter compatibilidade com código antigo
export function useImport() {
  const batchImport = useImportBatch();

  return {
    importFile: async (file: File) => {
      return await batchImport.importBatch({ files: [file] });
    },
    isProcessing: batchImport.isProcessing,
    progress: batchImport.progress,
    error: batchImport.error,
  };
}
