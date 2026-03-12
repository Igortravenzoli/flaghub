import { useState, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, FileJson, FileText, Clock, CheckCircle2, XCircle } from 'lucide-react';

interface ImportRecord {
  id: number;
  fileName: string;
  fileType: 'csv' | 'json' | 'xlsx';
  importedAt: string;
  status: 'success' | 'error' | 'processing';
  records: number;
}

const mockHistory: ImportRecord[] = [
  { id: 1, fileName: 'dados_setor_fev2026.xlsx', fileType: 'xlsx', importedAt: '19/02/2026 09:30', status: 'success', records: 142 },
  { id: 2, fileName: 'backup_jan2026.csv', fileType: 'csv', importedAt: '15/01/2026 14:00', status: 'success', records: 89 },
  { id: 3, fileName: 'config_errada.json', fileType: 'json', importedAt: '10/01/2026 11:20', status: 'error', records: 0 },
];

const fileTypeIcons = {
  csv: FileText,
  json: FileJson,
  xlsx: FileSpreadsheet,
};

interface SectorImportAreaProps {
  sectorName: string;
}

export function SectorImportArea({ sectorName }: SectorImportAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [history] = useState<ImportRecord[]>(mockHistory);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) {
      console.log(`[SectorImport] ${files.length} arquivo(s) via drag-drop:`, files.map(f => f.name));
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      console.log(`[SectorImport] ${files.length} arquivo(s) selecionado(s):`, files.map(f => f.name));
    }
    e.target.value = '';
  }, []);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Upload Area */}
      <Card
        className={`p-8 border-2 border-dashed transition-all duration-300 text-center ${
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border hover:border-primary/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">
          Arraste arquivos aqui ou clique para selecionar
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Formatos aceitos: CSV, JSON, XLSX
        </p>
        <Button variant="outline" size="sm" className="mt-4">
          Selecionar Arquivo
        </Button>
      </Card>

      {/* History */}
      <Card className="p-4">
        <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Histórico de Importações — {sectorName}
        </h4>
        <div className="space-y-2">
          {history.map((item) => {
            const Icon = fileTypeIcons[item.fileType];
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.fileName}</p>
                  <p className="text-xs text-muted-foreground">{item.importedAt} • {item.records} registros</p>
                </div>
                {item.status === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />
                ) : item.status === 'error' ? (
                  <XCircle className="h-4 w-4 text-[hsl(var(--critical))] shrink-0" />
                ) : (
                  <Badge variant="secondary" className="text-xs">Processando...</Badge>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
