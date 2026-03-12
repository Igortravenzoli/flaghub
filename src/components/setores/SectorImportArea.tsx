import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Upload, FileSpreadsheet, FileJson, FileText, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useManualUpload, UploadFileStatus } from '@/hooks/useManualUpload';

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

export function SectorImportArea({ sectorName, templateKey = 'cs_implantacoes_v1' }: SectorImportAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadFiles, isUploading, fileStatuses, clearStatuses } = useManualUpload({
    templateKey,
    onComplete: () => {
      // auto-clear statuses after 8s
      setTimeout(clearStatuses, 8000);
    },
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) uploadFiles(files);
  }, [uploadFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) uploadFiles(files);
    e.target.value = '';
  }, [uploadFiles]);

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

      {/* History placeholder */}
      <Card className="p-4">
        <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Importações — {sectorName}
        </h4>
        <p className="text-xs text-muted-foreground">
          Os dados importados aparecerão no dashboard após processamento.
        </p>
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
