import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  Info
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
  const [clearBeforeImport, setClearBeforeImport] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [notes, setNotes] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
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
    
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(prev => [...prev, ...files]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleImportClick = () => {
    if (selectedFiles.length === 0) {
      toast.error('Nenhum arquivo selecionado');
      return;
    }
    setShowConfirmDialog(true);
  };

  const handleImport = async () => {
    setShowConfirmDialog(false);

    try {
      const result = await importBatch({
        files: selectedFiles,
        options: {
          clearBeforeImport,
          batchName: batchName || undefined,
          notes: notes || undefined,
        },
      });

      if (result.success) {
        toast.success('Importação concluída!', {
          description: `${result.totalFiles} arquivo(s), ${result.totalRecords} registros processados.`,
        });
        
        // Limpar formulário
        setSelectedFiles([]);
        setBatchName('');
        setNotes('');
        setClearBeforeImport(false);
      }
    } catch (err) {
      toast.error('Erro na importação', {
        description: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  };

  const handlePurgeOld = async () => {
    if (!networkId) return;

    try {
      const count = await purgeOld.mutateAsync({ networkId, daysThreshold: 7 });
      toast.success(`${count} tickets inativos removidos`);
    } catch (err) {
      toast.error('Erro ao expurgar tickets antigos');
    }
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
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Você não tem permissão para importar arquivos</p>
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
            Selecione um ou mais arquivos JSON/CSV para importar. Os arquivos serão processados em lote.
            Arquivos duplicados (mesmo conteúdo) serão automaticamente identificados e ignorados.
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

          {/* Arquivos Selecionados */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <Label>Arquivos selecionados ({selectedFiles.length})</Label>
              <div className="space-y-2">
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 border rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      {file.name.endsWith('.json') ? (
                        <FileJson className="h-4 w-4 text-blue-500" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 text-green-500" />
                      )}
                      <span className="text-sm">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      disabled={isProcessing}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Opções de Importação */}
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor="batch-name">Nome do Lote (opcional)</Label>
              <Input
                id="batch-name"
                placeholder="Ex: Importação diária - 29/01/2026"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Adicione notas sobre esta importação..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isProcessing}
                rows={3}
              />
            </div>

            <div className="flex items-start space-x-2 p-3 border rounded-lg bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="clear-before"
                    checked={clearBeforeImport}
                    onCheckedChange={(checked) => setClearBeforeImport(checked as boolean)}
                    disabled={isProcessing}
                  />
                  <Label
                    htmlFor="clear-before"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Descontinuar todos os dados anteriores
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  <strong>ATENÇÃO:</strong> Ao marcar esta opção, todos os tickets existentes serão marcados como inativos 
                  antes de processar os novos arquivos. Apenas os tickets nos arquivos importados ficarão ativos. 
                  Esta ação é recomendada quando você deseja substituir completamente a base de dados.
                </p>
              </div>
            </div>
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

          {/* Botões */}
          <div className="flex gap-2">
            <Button
              onClick={handleImportClick}
              disabled={selectedFiles.length === 0 || isProcessing}
              className="flex-1"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar {selectedFiles.length > 0 && `(${selectedFiles.length})`}
                </>
              )}
            </Button>
            
            <Button
              variant="outline"
              onClick={handlePurgeOld}
              disabled={isProcessing || purgeOld.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Expurgar Antigos
            </Button>
          </div>
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

      {/* Dialog de Confirmação */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {clearBeforeImport ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Confirmar Substituição de Dados
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  Confirmar Importação
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {clearBeforeImport ? (
                <>
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    ⚠️ ATENÇÃO: Esta ação irá descontinuar todos os dados anteriores!
                  </p>
                  <p>
                    Você está prestes a importar <strong>{selectedFiles.length} arquivo(s)</strong>.
                    Todos os tickets existentes serão marcados como inativos antes do processamento.
                  </p>
                  <p>
                    Apenas os tickets contidos nos arquivos selecionados ficarão ativos após a importação.
                  </p>
                  <p className="text-sm">
                    Arquivos a importar:
                  </p>
                  <ul className="text-sm list-disc list-inside space-y-1 max-h-32 overflow-y-auto">
                    {selectedFiles.map((file, i) => (
                      <li key={i}>{file.name}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p>
                    Você está prestes a importar <strong>{selectedFiles.length} arquivo(s)</strong>.
                    Os dados serão adicionados ou atualizados sem descartar os registros existentes.
                  </p>
                  <p className="text-sm">
                    Arquivos a importar:
                  </p>
                  <ul className="text-sm list-disc list-inside space-y-1 max-h-32 overflow-y-auto">
                    {selectedFiles.map((file, i) => (
                      <li key={i}>{file.name}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Nota: Arquivos duplicados (mesmo conteúdo) serão automaticamente ignorados.
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleImport}
              disabled={isProcessing}
              className={cn(clearBeforeImport && "bg-amber-600 hover:bg-amber-700")}
            >
              {clearBeforeImport ? 'Substituir Dados' : 'Importar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
