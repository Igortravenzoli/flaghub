import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Upload, FileSpreadsheet, FileJson, FileText, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useManualUpload, UploadFileStatus } from '@/hooks/useManualUpload';
import { ImportModeDialog, ImportMode } from '@/components/setores/ImportModeDialog';

const fileTypeIcons: Record<string, typeof FileText> = {
  csv: FileText,
  json: FileJson,
  xlsx: FileSpreadsheet,
  xls: FileSpreadsheet,
};

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return fileTypeIcons[ext] || FileText;
}

interface SectorImportAreaProps {
  sectorName: string;
  templateKey?: string;
}

interface ManualBatchHistoryItem {
  id: string;
  status: string;
  total_rows: number | null;
  valid_rows: number | null;
  invalid_rows: number | null;
  imported_at: string | null;
  published_at: string | null;
  manual_import_templates?: { key: string } | null;
}

function getBatchStatusLabel(status: string) {
  const labels: Record<string, string> = {
    uploaded: 'Enviado',
    parsed: 'Parseado',
    validated: 'Validado',
    published: 'Publicado',
    rejected: 'Rejeitado',
    error: 'Erro',
  };
  return labels[status] ?? status;
}

export function SectorImportArea({ sectorName, templateKey = 'cs_implantacoes_v1' }: SectorImportAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [showModeDialog, setShowModeDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadFiles, isUploading, fileStatuses, clearStatuses } = useManualUpload({
    templateKey,
    onComplete: () => {
      setTimeout(clearStatuses, 8000);
    },
  });

  const { data: history = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ['manual_import_batches', templateKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manual_import_batches')
        .select('id, status, total_rows, valid_rows, invalid_rows, imported_at, published_at, manual_import_templates!manual_import_batches_template_id_fkey(key)')
        .order('imported_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const rows = (data ?? []) as ManualBatchHistoryItem[];
      const filtered = templateKey
        ? rows.filter((row) => row.manual_import_templates?.key === templateKey)
        : rows;

      return filtered.slice(0, 10);
    },
  });

  const hasExistingData = history.some(b => b.status === 'published');

  const initiateUpload = useCallback((files: File[]) => {
    if (files.length === 0) return;
    if (hasExistingData) {
      setPendingFiles(files);
      setShowModeDialog(true);
    } else {
      uploadFiles(files, 'overwrite');
    }
  }, [hasExistingData, uploadFiles]);

  const handleModeConfirm = useCallback((mode: ImportMode) => {
    setShowModeDialog(false);
    if (pendingFiles) {
      uploadFiles(pendingFiles, mode);
      setPendingFiles(null);
    }
  }, [pendingFiles, uploadFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) initiateUpload(files);
  }, [initiateUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) initiateUpload(files);
    e.target.value = '';
  }, [initiateUpload]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Upload Area */}
      <Card
        className={`p-8 border-2 border-dashed transition-all duration-300 text-center cursor-pointer ${
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border hover:border-primary/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="h-10 w-10 text-primary mx-auto mb-3 animate-spin" />
        ) : (
          <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        )}
        <p className="text-sm font-medium text-foreground">
          {isUploading ? 'Processando arquivos...' : 'Arraste arquivos aqui ou clique para selecionar'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Formatos aceitos: CSV, JSON, XLSX • Seleção múltipla permitida
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,.json,.xlsx,.xls"
          className="hidden"
          onChange={handleFileSelect}
          disabled={isUploading}
        />
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          disabled={isUploading}
        >
          {isUploading ? 'Processando...' : 'Selecionar Arquivo(s)'}
        </Button>
      </Card>

      {/* Upload Status */}
      {fileStatuses.length > 0 && (
        <Card className="p-4">
          <h4 className="font-semibold text-foreground mb-3 text-sm">Resultado da Importação</h4>
          <div className="space-y-2">
            {fileStatuses.map((fs, idx) => (
              <FileStatusRow key={idx} fileStatus={fs} />
            ))}
          </div>
        </Card>
      )}

      {/* Histórico */}
      <Card className="p-4">
        <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Histórico de Importações — {sectorName}
        </h4>

        {isHistoryLoading ? (
          <div className="py-4 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma importação encontrada para este setor.</p>
        ) : (
          <div className="space-y-2">
            {history.map((batch) => (
              <div key={batch.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={batch.status === 'published' ? 'default' : batch.status === 'rejected' || batch.status === 'error' ? 'destructive' : 'secondary'}>
                    {getBatchStatusLabel(batch.status)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {batch.imported_at ? new Date(batch.imported_at).toLocaleString('pt-BR') : '—'}
                  </span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  <span>Total: {batch.total_rows ?? 0}</span>
                  <span>Válidas: {batch.valid_rows ?? 0}</span>
                  <span>Inválidas: {batch.invalid_rows ?? 0}</span>
                  {batch.published_at && <span>Publicado: {new Date(batch.published_at).toLocaleString('pt-BR')}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function FileStatusRow({ fileStatus }: { fileStatus: UploadFileStatus }) {
  const Icon = getFileIcon(fileStatus.fileName);

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
      <Icon className="h-4 w-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{fileStatus.fileName}</p>
        {fileStatus.status === 'success' && fileStatus.result && (
          <p className="text-xs text-muted-foreground">
            {fileStatus.result.valid_rows} válidas • {fileStatus.result.invalid_rows} inválidas de {fileStatus.result.total_rows} linhas
          </p>
        )}
        {fileStatus.status === 'error' && (
          <p className="text-xs text-destructive">{fileStatus.error}</p>
        )}
        {fileStatus.status === 'uploading' && (
          <Progress value={50} className="h-1 mt-1" />
        )}
      </div>
      {fileStatus.status === 'success' && (
        <CheckCircle2 className="h-4 w-4 text-[hsl(var(--chart-2))] shrink-0" />
      )}
      {fileStatus.status === 'error' && (
        <XCircle className="h-4 w-4 text-destructive shrink-0" />
      )}
      {fileStatus.status === 'uploading' && (
        <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
      )}
      {fileStatus.status === 'pending' && (
        <Badge variant="secondary" className="text-xs">Na fila</Badge>
      )}
    </div>
  );
}
