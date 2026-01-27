import { useState } from 'react';
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
import { Upload, FileJson, FileSpreadsheet, CheckCircle, XCircle, Clock } from 'lucide-react';
import { mockImportacoes } from '@/data/mockData';
import { ImportacaoArquivo } from '@/types';
import { cn } from '@/lib/utils';

export default function Importacoes() {
  const [importacoes, setImportacoes] = useState<ImportacaoArquivo[]>(mockImportacoes);
  const [isDragging, setIsDragging] = useState(false);
  
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
    
    // Simula processamento
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      const isJson = file.name.endsWith('.json');
      const isCsv = file.name.endsWith('.csv');
      
      if (isJson || isCsv) {
        const novaImportacao: ImportacaoArquivo = {
          id: Date.now().toString(),
          dataHora: new Date().toLocaleString('pt-BR'),
          usuario: 'Usuário Atual',
          tipo: isJson ? 'JSON' : 'CSV',
          fonte: 'nestle',
          quantidadeRegistros: Math.floor(Math.random() * 50) + 10,
          status: 'processando'
        };
        
        setImportacoes(prev => [novaImportacao, ...prev]);
        
        // Simula finalização após 2s
        setTimeout(() => {
          setImportacoes(prev => 
            prev.map(imp => 
              imp.id === novaImportacao.id 
                ? { ...imp, status: 'sucesso' as const }
                : imp
            )
          );
        }, 2000);
      }
    });
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
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
              isDragging 
                ? "border-primary bg-primary/5" 
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            )}
          >
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
          </div>
          
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
        <CardHeader>
          <CardTitle className="text-lg">Histórico de Importações</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
        </CardContent>
      </Card>
    </div>
  );
}
