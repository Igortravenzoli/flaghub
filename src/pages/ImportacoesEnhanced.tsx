import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { 
  Upload, 
  FileJson, 
  FileSpreadsheet, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  Trash2,
  AlertTriangle,
  Info,
  Ban
} from 'lucide-react';
import { useImportBatch } from '@/hooks/useImportEnhanced';
import { useRecentBatches, usePurgeOldTickets } from '@/hooks/useImportBatch';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function ImportacoesEnhanced() {
  const { isAuthenticated, canImport, networkId } = useAuth();
  const { importBatch, isProcessing, progress, currentFile } = useImportBatch();
  const { data: batches, isLoading: batchesLoading } = useRecentBatches(networkId ?? undefined);
  const purgeOld = usePurgeOldTickets();
  
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [pendingDropFiles, setPendingDropFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = () => {
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(f => 
      f.name.endsWith('.json') || f.name.endsWith('.csv')
    );
    
    if (files.length > 0) {
      setPendingDropFiles(files);
      setShowModeDialog(true);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setPendingDropFiles(files);
      setShowModeDialog(true);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleModeSelect = async (mode: 'incremental' | 'complete') => {
    setShowModeDialog(false);
    const filesToImport = [...pendingDropFiles];
    setPendingDropFiles([]);

    const clearBeforeImport = mode === 'complete';

    try {
      const result = await importBatch({
        files: filesToImport,
        options: {
          clearBeforeImport,
        },
      });

      if (result.success) {
        toast.success('Importação concluída!', {
          description: `${result.totalFiles} arquivo(s), ${result.totalRecords} registros processados.`,
        });
        setSelectedFiles([]);
      }
    } catch (err) {
      toast.error('Erro na importação', {
        description: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  };

  const handleCancel = () => {
    setShowModeDialog(false);
    setPendingDropFiles([]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  if (!isAuthenticated) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Faça login para importar arquivos</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!canImport) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center space-y-2">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-muted-foreground font-medium">⚠️ Você não tem permissão para importar arquivos.</p>
            <p className="text-sm text-muted-foreground">
              Contate um administrador para obter acesso. Sua role atual pode não ter sido carregada corretamente.
              Tente fazer <strong>logout e login novamente</strong>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Área de Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Arquivos
          </CardTitle>
          <CardDescription>
            Selecione um ou mais arquivos JSON/CSV para importar. Ao adicionar arquivos, você escolherá o modo de importação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
              isProcessing && "opacity-50 pointer-events-none"
            )}
          >
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm font-medium mb-1">
              Arraste arquivos aqui ou clique para selecionar
            </p>
            <p className="text-xs text-muted-foreground">
              Suporta JSON e CSV
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={isProcessing}
            />
          </div>

          {/* Progresso */}
          {isProcessing && (
            <div className="space-y-2 pt-4 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processando...
                </span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
              {currentFile && (
                <p className="text-xs text-muted-foreground">
                  Arquivo atual: {currentFile}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico de Lotes */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Importações</CardTitle>
          <CardDescription>
            Últimas 20 importações em lote
          </CardDescription>
        </CardHeader>
        <CardContent>
          {batchesLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : batches && batches.length > 0 ? (
            <Table>
              <TableHeader>
              <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Importado por</TableHead>
                  <TableHead>Nome do Lote</TableHead>
                  <TableHead className="text-center">Arquivos</TableHead>
                  <TableHead className="text-center">Registros</TableHead>
                  <TableHead className="text-center">Erros</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Limpeza</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="text-sm">
                      {new Date(batch.created_at).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(batch as any).imported_by_name || (batch as any).imported_by_email || '-'}
                    </TableCell>
                    <TableCell>
                      {batch.batch_name || `Lote #${batch.id}`}
                    </TableCell>
                    <TableCell className="text-center">
                      {batch.total_files}
                    </TableCell>
                    <TableCell className="text-center">
                      {batch.total_records}
                    </TableCell>
                    <TableCell className="text-center">
                      {batch.errors_count}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          batch.status === 'success' ? 'default' :
                          batch.status === 'partial_success' ? 'secondary' :
                          batch.status === 'error' ? 'destructive' :
                          'outline'
                        }
                      >
                        {batch.status === 'processing' && <Clock className="mr-1 h-3 w-3" />}
                        {batch.status === 'success' && <CheckCircle className="mr-1 h-3 w-3" />}
                        {batch.status === 'error' && <XCircle className="mr-1 h-3 w-3" />}
                        {batch.status === 'partial_success' && <Info className="mr-1 h-3 w-3" />}
                        {batch.status === 'processing' ? 'Processando' :
                         batch.status === 'success' ? 'Sucesso' :
                         batch.status === 'partial_success' ? 'Parcial' :
                         'Erro'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {batch.clear_before_import ? (
                        <Badge variant="outline" className="text-xs">
                          <Trash2 className="mr-1 h-3 w-3" />
                          Limpo
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma importação encontrada
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Modo de Importação - botões clicáveis que executam a ação */}
      <Dialog open={showModeDialog} onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Como deseja importar?
            </DialogTitle>
            <DialogDescription>
              {pendingDropFiles.length} arquivo(s) selecionado(s). Escolha o modo de importação:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {/* Incremental */}
            <button
              onClick={() => handleModeSelect('incremental')}
              className="w-full text-left p-4 border-2 rounded-lg transition-all hover:border-primary hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">📥 Importação Incremental</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Os arquivos são somados aos dados existentes. Ideal para adicionar novos tickets
                    sem perder o que já foi importado. Arquivos duplicados serão ignorados.
                  </p>
                </div>
              </div>
            </button>

            {/* Completa (Expurgo) */}
            <button
              onClick={() => handleModeSelect('complete')}
              className="w-full text-left p-4 border-2 rounded-lg transition-all hover:border-destructive hover:bg-destructive/5 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">🔄 Importação Completa (Expurgo)</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Todos os dados anteriores serão descontinuados antes da importação.
                    Apenas os tickets dos arquivos selecionados ficarão ativos.
                  </p>
                </div>
              </div>
            </button>

            {/* Cancelar */}
            <button
              onClick={handleCancel}
              className="w-full text-left p-4 border-2 rounded-lg transition-all hover:border-muted-foreground/50 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div className="flex items-start gap-3">
                <Ban className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Cancelar</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Nenhuma importação será realizada. Os arquivos selecionados serão descartados.
                  </p>
                </div>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
