import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Upload, FileJson, FileSpreadsheet, CheckCircle, XCircle, Clock, Loader2, Trash2 } from 'lucide-react';
import { useImport } from '@/hooks/useImport';
import { useImportsHistory } from '@/hooks/useSupabaseData';
import { useClearImports } from '@/hooks/useClearImports';
import { useAuth } from '@/hooks/useAuth';
import { ImportacaoArquivo } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Dados iniciais vazios - será integrado com Supabase
const initialImportacoes: ImportacaoArquivo[] = [];

export default function Importacoes() {
  const { isAuthenticated, canImport, networkId } = useAuth();
  const { importFile, isProcessing, progress, error } = useImport();
  const { data: dbImports, isLoading: importsLoading } = useImportsHistory(networkId ?? undefined);
  const clearImportsMutation = useClearImports();
  
  // Fallback para dados vazios se não autenticado
  const [localImportacoes, setLocalImportacoes] = useState<ImportacaoArquivo[]>(initialImportacoes);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Usar dados do DB se autenticado, senão mock
  const importacoes = isAuthenticated && dbImports ? dbImports.map(imp => ({
    id: String(imp.id),
    dataHora: new Date(imp.created_at).toLocaleString('pt-BR'),
    usuario: 'Usuário',
    tipo: imp.file_type.toUpperCase() as 'CSV' | 'JSON',
    fonte: 'nestle' as const,
    quantidadeRegistros: imp.total_records,
    status: imp.status === 'processing' ? 'processando' : imp.status === 'success' ? 'sucesso' : 'erro' as 'sucesso' | 'erro' | 'processando',
    mensagemErro: imp.errors_count > 0 ? `${imp.errors_count} erros` : undefined,
  })) : localImportacoes;

  const handleClearImports = async () => {
    if (!networkId) {
      toast.error('Erro', { description: 'Network não identificada' });
      return;
    }
    try {
      const count = await clearImportsMutation.mutateAsync(networkId);
      toast.success('Histórico limpo', { 
        description: `${count} importação(ões) removida(s) da visualização.` 
      });
    } catch (err) {
      toast.error('Erro ao limpar histórico', {
        description: err instanceof Error ? err.message : 'Erro desconhecido'
      });
    }
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = () => {
    setIsDragging(false);
  };
  
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    await processFiles(files);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await processFiles(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processFiles = async (files: File[]) => {
    for (const file of files) {
      const isJson = file.name.endsWith('.json');
      const isCsv = file.name.endsWith('.csv');
      
      if (!isJson && !isCsv) {
        toast.error('Tipo de arquivo não suportado', { 
          description: 'Use arquivos JSON ou CSV.' 
        });
        continue;
      }

      console.log('[Importacoes] Auth debug:', { isAuthenticated, canImport, networkId });
      
      if (isAuthenticated && canImport && networkId) {
        try {
          const result = await importFile(file);
          if (result.success) {
            toast.success('Importação concluída!', {
              description: `${result.totalRecords} registros processados.`
            });
          }
        } catch (err) {
          console.error('[Importacoes] Import error:', err);
          toast.error('Erro na importação', {
            description: err instanceof Error ? err.message : 'Erro desconhecido'
          });
        }
      } else {
        // Modo mock para não autenticados ou sem permissão
        console.log('[Importacoes] Usando modo mock - usuário não autenticado ou sem permissão');
        // Modo mock para não autenticados
        const novaImportacao: ImportacaoArquivo = {
          id: Date.now().toString(),
          dataHora: new Date().toLocaleString('pt-BR'),
          usuario: 'Usuário Atual',
          tipo: isJson ? 'JSON' : 'CSV',
          fonte: 'nestle',
          quantidadeRegistros: Math.floor(Math.random() * 50) + 10,
          status: 'processando'
        };
        
        setLocalImportacoes(prev => [novaImportacao, ...prev]);
        
        setTimeout(() => {
          setLocalImportacoes(prev => 
            prev.map(imp => 
              imp.id === novaImportacao.id 
                ? { ...imp, status: 'sucesso' as const }
                : imp
            )
          );
          toast.success('Importação concluída (simulada)!');
        }, 2000);
      }
    }
  };
  
  const statusConfig = {
    sucesso: { icon: CheckCircle, className: 'text-[hsl(var(--success))]', label: 'Sucesso' },
    erro: { icon: XCircle, className: 'text-[hsl(var(--critical))]', label: 'Erro' },
    processando: { icon: Clock, className: 'text-[hsl(var(--warning))] animate-pulse', label: 'Processando' }
  };
  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Importações</h1>
        <p className="text-muted-foreground">
          Gerenciamento de arquivos importados (Tickets Nestlé e OS VDESK)
        </p>
      </div>
      
      {/* Área de Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Importar Arquivo</CardTitle>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer",
              isDragging 
                ? "border-primary bg-primary/5" 
                : "border-muted-foreground/25 hover:border-muted-foreground/50",
              isProcessing && "pointer-events-none opacity-50"
            )}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-12 w-12 mx-auto mb-4 text-primary animate-spin" />
                <p className="text-lg font-medium mb-2">Processando...</p>
                <Progress value={progress} className="w-64 mx-auto" />
              </>
            ) : (
              <>
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">
                  Arraste e solte arquivos aqui
                </p>
                <p className="text-muted-foreground mb-4">
                  ou clique para selecionar
                </p>
                <div className="flex items-center justify-center gap-4">
                  <Badge variant="outline" className="gap-1">
                    <FileJson className="h-3 w-3" /> JSON
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <FileSpreadsheet className="h-3 w-3" /> CSV
                  </Badge>
                </div>
              </>
            )}
          </div>
          
          {!canImport && isAuthenticated && (
            <p className="text-sm text-muted-foreground mt-4 text-center">
              ⚠️ Você não tem permissão para importar arquivos. Contate um administrador.
            </p>
          )}
          
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2">Formato Tickets Nestlé</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Arquivo JSON ou CSV exportado do ServiceNow
              </p>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                number, opened_at, short_description, state...
              </code>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2">Formato OS VDESK</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Resultado da consulta SQL do banco VDESK
              </p>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                NUMOS_, NumChamadoB1_At, Data_At, Sistema...
              </code>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Histórico de Importações */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Histórico de Importações</CardTitle>
          {canImport && importacoes.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-destructive hover:text-destructive"
                  disabled={clearImportsMutation.isPending}
                >
                  {clearImportsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1" />
                  )}
                  Limpar Histórico
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar histórico de importações?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação irá ocultar todas as importações do histórico. 
                    Os dados dos tickets não serão afetados e a ação pode ser desfeita pelo administrador do banco.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearImports}>
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {importsLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Registros</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importacoes.map((imp) => {
                  const StatusIcon = statusConfig[imp.status].icon;
                  
                  return (
                    <TableRow key={imp.id}>
                      <TableCell className="text-sm">{imp.dataHora}</TableCell>
                      <TableCell>{imp.usuario}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {imp.tipo === 'JSON' ? (
                            <FileJson className="h-3 w-3" />
                          ) : (
                            <FileSpreadsheet className="h-3 w-3" />
                          )}
                          {imp.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {imp.fonte === 'nestle' ? 'Nestlé' : 'VDESK'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">{imp.quantidadeRegistros}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <StatusIcon className={cn("h-4 w-4", statusConfig[imp.status].className)} />
                          <span className={statusConfig[imp.status].className}>
                            {statusConfig[imp.status].label}
                          </span>
                        </div>
                        {imp.mensagemErro && (
                          <p className="text-xs text-[hsl(var(--critical))] mt-1">
                            {imp.mensagemErro}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
