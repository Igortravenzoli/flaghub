import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables');
}

async function invokeEdgeFunctionWithAuth<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Function failed: ${response.status}`);
  }

  return payload as T;
}

export interface UploadResult {
  batch_id: string;
  template: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  status: string;
}

export interface UploadFileStatus {
  fileName: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  result?: UploadResult;
  error?: string;
}

export type ImportMode = 'overwrite' | 'purge';

interface UseManualUploadOptions {
  templateKey: string;
  onComplete?: () => void;
}

/**
 * Map template keys to their curated tables for purge operations.
 */
const TEMPLATE_TABLES: Record<string, string> = {
  cs_implantacoes_v1: 'cs_implantacoes_records',
  cs_fila_cs_v1: 'cs_fila_manual_records',
};

/**
 * Parse an XLSX/XLS file into an array of row objects (first sheet),
 * auto-detecting the real header row (ignores title/blank rows).
 */
async function parseXlsx(file: File): Promise<Record<string, string>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Planilha vazia');

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  // Find the first row with at least 3 non-empty text cells as the header row
  let headerRowIndex = -1;

  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const row = matrix[i] ?? [];
    const nonEmptyCells = row.filter((cell) => {
      const val = String(cell ?? '').trim();
      // Must be a non-empty string that looks like a header (not purely numeric)
      return val.length > 0 && isNaN(Number(val));
    });
    if (nonEmptyCells.length >= 3) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('Não foi possível identificar o cabeçalho da planilha');
  }

  const headers = (matrix[headerRowIndex] ?? []).map((cell) => String(cell ?? '').trim());
  const dataRows = matrix
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));

  return dataRows.map((row) => {
    const out: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (!header) return;
      out[header] = String(row[idx] ?? '').trim();
    });
    return out;
  });
}

/**
 * Convert parsed rows back to CSV text for the edge function.
 */
function rowsToCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => {
        const val = String(r[h] ?? '');
        // Escape values containing commas, quotes, or newlines
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',')
    ),
  ];
  return lines.join('\n');
}

/**
 * Sanitize text content to remove invalid Unicode escape sequences
 * that would cause issues when stored as JSONB.
 */
function sanitizeText(text: string): string {
  return text.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function extractJsonRecords(parsed: any): Record<string, any>[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.records)) {
    return parsed.records;
  }
  return [parsed];
}

function chunkJsonRecords(records: Record<string, any>[], maxBytes = 900_000): string[] {
  if (records.length === 0) return [];

  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let currentChunk: Record<string, any>[] = [];

  for (const record of records) {
    const singlePayload = JSON.stringify({ records: [record] });
    if (encoder.encode(singlePayload).length > maxBytes) {
      throw new Error('Um registro do JSON excede o limite de importação.');
    }

    const nextChunk = [...currentChunk, record];
    const nextPayload = JSON.stringify({ records: nextChunk });

    if (currentChunk.length > 0 && encoder.encode(nextPayload).length > maxBytes) {
      chunks.push(JSON.stringify({ records: currentChunk }));
      currentChunk = [record];
      continue;
    }

    currentChunk = nextChunk;
  }

  if (currentChunk.length > 0) {
    chunks.push(JSON.stringify({ records: currentChunk }));
  }

  return chunks;
}

export function useManualUpload({ templateKey, onComplete }: UseManualUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [fileStatuses, setFileStatuses] = useState<UploadFileStatus[]>([]);
  const queryClient = useQueryClient();

  const uploadFiles = useCallback(async (files: File[], mode: ImportMode = 'overwrite') => {
    if (files.length === 0) return;

    setIsUploading(true);
    const statuses: UploadFileStatus[] = files.map(f => ({
      fileName: f.name,
      status: 'pending',
    }));
    setFileStatuses([...statuses]);

    if (mode === 'purge') {
      const targetTable = TEMPLATE_TABLES[templateKey];
      if (targetTable) {
        try {
          const { error: delErr } = await supabase
            .from(targetTable as any)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
          if (delErr) {
            console.warn('[Purge] Falha ao limpar tabela:', delErr.message);
            toast.error('Falha ao limpar dados anteriores. Importação cancelada.');
            setIsUploading(false);
            return;
          }
          toast.info('Dados anteriores removidos com sucesso.');
        } catch (err) {
          console.error('[Purge] Error:', err);
          toast.error('Erro ao limpar dados anteriores.');
          setIsUploading(false);
          return;
        }
      }
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      statuses[i].status = 'uploading';
      setFileStatuses([...statuses]);

      try {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!ext || !['csv', 'json', 'xlsx', 'xls'].includes(ext)) {
          throw new Error(`Formato não suportado: .${ext}`);
        }

        const allowedMimeTypes = new Set([
          'text/csv',
          'text/plain',
          'application/json',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/octet-stream',
        ]);
        if (file.type && !allowedMimeTypes.has(file.type)) {
          throw new Error(`Tipo de arquivo não permitido: ${file.type}. Envie CSV, JSON ou XLSX.`);
        }

        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo: 10MB.`);
        }

        let fileType: 'csv' | 'json';
        let chunks: string[] = [];

        if (ext === 'xlsx' || ext === 'xls') {
          const rows = await parseXlsx(file);
          if (rows.length === 0) throw new Error('Planilha vazia ou sem dados');
          chunks = [rowsToCsv(rows)];
          fileType = 'csv';
        } else if (ext === 'json') {
          const rawText = sanitizeText(await file.text());
          const parsed = JSON.parse(rawText);
          const records = extractJsonRecords(parsed);
          if (records.length === 0) throw new Error('JSON vazio ou sem registros');
          chunks = chunkJsonRecords(records);
          fileType = 'json';
        } else {
          chunks = [sanitizeText(await file.text())];
          fileType = 'csv';
        }

        let parseResult: UploadResult | null = null;

        for (let ci = 0; ci < chunks.length; ci++) {
          const chunkData = await invokeEdgeFunctionWithAuth<UploadResult & { error?: string }>('manual-upload-parse', {
            template_key: templateKey,
            file_content: chunks[ci],
            file_type: fileType,
          });

          if (chunkData?.error) {
            throw new Error(chunkData.error);
          }

          const currentResult = chunkData as UploadResult;

          if (currentResult.valid_rows > 0 && currentResult.status !== 'rejected') {
            const pubData = await invokeEdgeFunctionWithAuth<{ error?: string }>('manual-upload-publish', {
              batch_id: currentResult.batch_id,
            });
            if (pubData?.error) {
              console.warn('[AutoPublish] Falha:', pubData.error);
            } else {
              currentResult.status = 'published';
            }
          }

          parseResult = !parseResult
            ? currentResult
            : {
                ...currentResult,
                total_rows: parseResult.total_rows + currentResult.total_rows,
                valid_rows: parseResult.valid_rows + currentResult.valid_rows,
                invalid_rows: parseResult.invalid_rows + currentResult.invalid_rows,
              };
        }

        if (!parseResult) {
          throw new Error('Nenhum dado foi processado');
        }

        statuses[i].status = 'success';
        statuses[i].result = parseResult;
        successCount++;
      } catch (err) {
        statuses[i].status = 'error';
        statuses[i].error = err instanceof Error ? err.message : 'Erro desconhecido';
        errorCount++;
      }

      setFileStatuses([...statuses]);
    }

    setIsUploading(false);

    queryClient.invalidateQueries({ queryKey: ['customer-service'] });
    queryClient.invalidateQueries({ queryKey: ['manual_import_batches'] });

    if (successCount > 0 && errorCount === 0) {
      toast.success(`${successCount} arquivo(s) importado(s) com sucesso`);
    } else if (successCount > 0 && errorCount > 0) {
      toast.warning(`${successCount} importado(s), ${errorCount} com erro`);
    } else {
      toast.error(`Falha ao importar ${errorCount} arquivo(s)`);
    }

    onComplete?.();
  }, [templateKey, queryClient, onComplete]);

  const clearStatuses = useCallback(() => setFileStatuses([]), []);

  return { uploadFiles, isUploading, fileStatuses, clearStatuses };
}
