import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

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

interface UseManualUploadOptions {
  templateKey: string;
  onComplete?: () => void;
}

export function useManualUpload({ templateKey, onComplete }: UseManualUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const [fileStatuses, setFileStatuses] = useState<UploadFileStatus[]>([]);
  const queryClient = useQueryClient();

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    const statuses: UploadFileStatus[] = files.map(f => ({
      fileName: f.name,
      status: 'pending',
    }));
    setFileStatuses([...statuses]);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      statuses[i].status = 'uploading';
      setFileStatuses([...statuses]);

      try {
        // Validate file type
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!ext || !['csv', 'json', 'xlsx', 'xls'].includes(ext)) {
          throw new Error(`Formato não suportado: .${ext}`);
        }

        // Read file content as text
        const fileContent = await file.text();
        const fileType = ext === 'json' ? 'json' : 'csv';

        // Call the manual-upload-parse edge function
        const { data, error } = await supabase.functions.invoke('manual-upload-parse', {
          body: {
            template_key: templateKey,
            file_content: fileContent,
            file_type: fileType,
          },
        });

        if (error) throw new Error(error.message || 'Erro ao processar arquivo');
        if (data?.error) throw new Error(data.error);

        statuses[i].status = 'success';
        statuses[i].result = data as UploadResult;
        successCount++;
      } catch (err) {
        statuses[i].status = 'error';
        statuses[i].error = err instanceof Error ? err.message : 'Erro desconhecido';
        errorCount++;
      }

      setFileStatuses([...statuses]);
    }

    setIsUploading(false);

    // Invalidate relevant queries
    queryClient.invalidateQueries({ queryKey: ['customer-service-kpis'] });
    queryClient.invalidateQueries({ queryKey: ['manual-import-batches'] });

    // Show summary toast
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
