import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// ── Types ────────────────────────────────────────────────────────
export interface SurveyImportSummary {
  import_id: string;
  status: string;
  summary: {
    rows_received: number;
    rows_valid: number;
    rows_invalid: number;
    responses_created: number;
  };
  aggregate_id: string | null;
}

export interface SurveyResponse {
  id: string;
  import_id: string;
  client_code: string | null;
  client_name: string | null;
  bandeira: string | null;
  survey_date: string | null;
  payload: any;
  derived: any;
  created_at: string;
}

export interface SurveyAggregate {
  id: string;
  import_id: string;
  payload: any;
  created_at: string;
}

export interface SurveyImportRecord {
  id: string;
  import_name: string;
  file_name: string;
  status: string;
  rows_received: number;
  rows_valid: number;
  rows_invalid: number;
  created_at: string;
  completed_at: string | null;
}

export type SurveyImportMode = 'incremental' | 'purge';

// ── XLSX parser (wide format) ────────────────────────────────────
function detectHeaderRow(matrix: any[][]): number {
  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const row = matrix[i] ?? [];
    const nonEmpty = row.filter((c: any) => {
      const v = String(c ?? '').trim();
      return v.length > 0 && isNaN(Number(v));
    });
    if (nonEmpty.length >= 5) return i;
  }
  return -1;
}

export function parseWideFormatXlsx(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: false, raw: false });
        if (wb.SheetNames.length === 0) throw new Error('Planilha vazia');

        const sheet = wb.Sheets[wb.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });
        const hdrIdx = detectHeaderRow(matrix);
        if (hdrIdx === -1) throw new Error('Cabeçalho não encontrado');

        const headers = (matrix[hdrIdx] as any[]).map((c: any) => String(c ?? '').trim());
        const rows = matrix.slice(hdrIdx + 1)
          .filter((r: any[]) => r.some((c: any) => String(c ?? '').trim() !== ''))
          .map((r: any[]) => {
            const obj: Record<string, string> = {};
            headers.forEach((h, i) => {
              if (h) obj[h] = String(r[i] ?? '').trim();
            });
            return obj;
          });

        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsArrayBuffer(file);
  });
}

// ── Upload hook ──────────────────────────────────────────────────
export function useSurveyUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [lastResult, setLastResult] = useState<SurveyImportSummary | null>(null);
  const queryClient = useQueryClient();

  const uploadSurvey = useCallback(async (file: File, importName?: string, mode: SurveyImportMode = 'incremental') => {
    setIsUploading(true);
    setLastResult(null);

    try {
      const rows = await parseWideFormatXlsx(file);
      if (rows.length === 0) throw new Error('Planilha vazia ou sem dados');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

      // Chunk rows to stay under 2MB edge function limit
      const MAX_ROWS_PER_CHUNK = 200;
      const chunks: Record<string, string>[][] = [];
      for (let i = 0; i < rows.length; i += MAX_ROWS_PER_CHUNK) {
        chunks.push(rows.slice(i, i + MAX_ROWS_PER_CHUNK));
      }

      let importId: string | null = null;
      let finalResult: SurveyImportSummary | null = null;

      for (let ci = 0; ci < chunks.length; ci++) {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/survey-import`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            import_name: importName || file.name.replace(/\.[^.]+$/, ''),
            file_name: file.name,
            rows: chunks[ci],
            survey_context: { source: importName || file.name },
            import_id: importId,
            chunk_index: ci,
            total_chunks: chunks.length,
            import_mode: ci === 0 ? mode : 'incremental', // purge only on first chunk
          }),
        });

        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || `Erro ${res.status}`);

        // Capture import_id from first chunk for continuation
        if (ci === 0) {
          importId = payload.import_id;
        }
        finalResult = payload as SurveyImportSummary;
      }

      setLastResult(finalResult);
      queryClient.invalidateQueries({ queryKey: ['survey_responses'] });
      queryClient.invalidateQueries({ queryKey: ['survey_aggregates'] });
      queryClient.invalidateQueries({ queryKey: ['survey_imports'] });
      toast.success(`Pesquisa importada: ${finalResult?.summary.rows_valid ?? 0} respostas válidas`);
      return finalResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao importar pesquisa';
      toast.error(msg);
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, [queryClient]);

  return { uploadSurvey, isUploading, lastResult };
}

// ── Data hooks ───────────────────────────────────────────────────
export function useSurveyResponses(importId?: string) {
  return useQuery({
    queryKey: ['survey_responses', importId],
    queryFn: async () => {
      let q = supabase
        .from('survey_responses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (importId) q = q.eq('import_id', importId);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SurveyResponse[];
    },
  });
}

export function useSurveyAggregates() {
  return useQuery({
    queryKey: ['survey_aggregates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('survey_aggregates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as SurveyAggregate[];
    },
  });
}

export function useSurveyImports() {
  return useQuery({
    queryKey: ['survey_imports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('survey_imports')
        .select('id, import_name, file_name, status, rows_received, rows_valid, rows_invalid, created_at, completed_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as SurveyImportRecord[];
    },
  });
}
