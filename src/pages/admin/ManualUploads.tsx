import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileUp, CheckCircle, XCircle, Loader2, Send, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function ManualUploads() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['manual_import_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manual_import_templates')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ['manual_import_batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manual_import_batches')
        .select('*, manual_import_templates!manual_import_batches_template_id_fkey(key, name)')
        .order('imported_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTemplate) {
      toast.error('Selecione um template antes de enviar o arquivo');
      return;
    }

    setUploading(true);
    try {
      const text = await file.text();
      const ext = file.name.split('.').pop()?.toLowerCase() || 'csv';
      const fileType = ext === 'json' ? 'json' : 'csv';

      const { data, error } = await supabase.functions.invoke('manual-upload-parse', {
        body: {
          template_key: selectedTemplate,
          file_content: text,
          file_type: fileType,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Arquivo processado com sucesso', {
          description: `${data.valid_rows} linhas válidas, ${data.invalid_rows} inválidas`,
        });
        queryClient.invalidateQueries({ queryKey: ['manual_import_batches'] });
      } else {
        toast.error(data?.error || 'Erro ao processar arquivo');
      }
    } catch (err: any) {
      toast.error('Erro ao enviar arquivo', { description: err.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handlePublish = async (batchId: string) => {
    setPublishing(batchId);
    try {
      const { data, error } = await supabase.functions.invoke('manual-upload-publish', {
        body: { batch_id: batchId },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Dados publicados com sucesso', {
          description: `${data.published_rows} linhas publicadas em ${data.target_table}`,
        });
        queryClient.invalidateQueries({ queryKey: ['manual_import_batches'] });
      } else {
        toast.error(data?.error || 'Erro ao publicar');
      }
    } catch (err: any) {
      toast.error('Erro ao publicar batch', { description: err.message });
    } finally {
      setPublishing(null);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      uploaded: { variant: 'secondary', label: 'Enviado' },
      parsed: { variant: 'outline', label: 'Parseado' },
      validated: { variant: 'default', label: 'Validado' },
      rejected: { variant: 'destructive', label: 'Rejeitado' },
      published: { variant: 'default', label: '✓ Publicado' },
      error: { variant: 'destructive', label: 'Erro' },
    };
    const cfg = map[status] || { variant: 'secondary' as const, label: status };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Upload className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Uploads Manuais</h1>
            <p className="text-sm text-muted-foreground">Importação de dados via CSV, XLSX ou JSON</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['manual_import_batches'] })}>
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>

      {/* Upload Area */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">Novo Upload</h2>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium text-foreground mb-1.5 block">Template</label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t: any) => (
                  <SelectItem key={t.id} value={t.key}>{t.name} (v{t.version})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.json"
              onChange={handleFileUpload}
              className="hidden"
              disabled={!selectedTemplate || uploading}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={!selectedTemplate || uploading}
              className="gap-2"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {uploading ? 'Processando...' : 'Enviar Arquivo'}
            </Button>
          </div>
        </div>
        {!selectedTemplate && (
          <p className="text-xs text-muted-foreground mt-2">Selecione um template antes de enviar o arquivo.</p>
        )}
      </Card>

      {/* Batches */}
      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">Batches Recentes</h2></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Linhas</TableHead>
              <TableHead>Válidas</TableHead>
              <TableHead>Inválidas</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batchesLoading && (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            )}
            {!batchesLoading && batches.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum upload realizado</TableCell></TableRow>
            )}
            {batches.map((batch: any) => {
              const canPublish = ['validated', 'parsed'].includes(batch.status) && (batch.valid_rows ?? 0) > 0;
              const isPublishing = publishing === batch.id;
              return (
                <TableRow key={batch.id}>
                  <TableCell className="text-sm">{(batch as any).manual_import_templates?.name || '—'}</TableCell>
                  <TableCell>{statusBadge(batch.status)}</TableCell>
                  <TableCell className="text-sm">{batch.total_rows ?? 0}</TableCell>
                  <TableCell className="text-sm">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500" /> {batch.valid_rows ?? 0}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {(batch.invalid_rows ?? 0) > 0 ? (
                      <span className="flex items-center gap-1">
                        <XCircle className="h-3 w-3 text-destructive" /> {batch.invalid_rows}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {batch.imported_at ? new Date(batch.imported_at).toLocaleString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell>
                    {canPublish && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={isPublishing}
                        onClick={() => handlePublish(batch.id)}
                      >
                        {isPublishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        Publicar
                      </Button>
                    )}
                    {batch.status === 'published' && (
                      <span className="text-xs text-muted-foreground">Publicado</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
