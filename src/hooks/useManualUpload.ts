import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

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

  const normalize = (value: unknown) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const expectedHeaders = new Set([
    'cliente',
    'responsavel',
    'solucao',
    'status',
    'inicio',
    'fim',
    'obs',
    'contato',
    'licenca',
    'atuacao',
    'puxada',
  ]);

  let headerRowIndex = -1;
  let bestScore = 0;

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const score = row.reduce<number>((acc, cell) => {
      const key = normalize(cell);
      return acc + (key && expectedHeaders.has(key) ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      headerRowIndex = i;
    }
  }

  if (headerRowIndex === -1 || bestScore < 3) {
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
  // Remove null bytes and other problematic Unicode
  return text.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
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

    // If purge mode, delete all existing records from the curated table first
    if (mode === 'purge') {
      const targetTable = TEMPLATE_TABLES[templateKey];
      if (targetTable) {
        try {
          const { error: delErr } = await supabase
            .from(targetTable as any)
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all rows
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

        let fileContent: string;
        let fileType: 'csv' | 'json';

        if (ext === 'xlsx' || ext === 'xls') {
          // Parse XLSX/XLS client-side, convert to CSV for the edge function
          const rows = await parseXlsx(file);
          if (rows.length === 0) throw new Error('Planilha vazia ou sem dados');
          fileContent = rowsToCsv(rows);
          fileType = 'csv';
        } else if (ext === 'json') {
          fileContent = sanitizeText(await file.text());
          fileType = 'json';
        } else {
          fileContent = sanitizeText(await file.text());
          fileType = 'csv';
        }

        const { data, error } = await supabase.functions.invoke('manual-upload-parse', {
          body: {
            template_key: templateKey,
            file_content: fileContent,
            file_type: fileType,
          },
        });

        if (error) throw new Error(error.message || 'Erro ao processar arquivo');
        if (data?.error) throw new Error(data.error);

        const parseResult = data as UploadResult;

        // Auto-publish if there are valid rows
        if (parseResult.valid_rows > 0 && parseResult.status !== 'rejected') {
          const { data: pubData, error: pubError } = await supabase.functions.invoke('manual-upload-publish', {
            body: { batch_id: parseResult.batch_id },
          });
          if (pubError || pubData?.error) {
            console.warn('[AutoPublish] Falha:', pubError?.message || pubData?.error);
          } else {
            parseResult.status = 'published';
          }
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
