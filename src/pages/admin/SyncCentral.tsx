import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Play } from 'lucide-react';
import { toast } from 'sonner';

export default function SyncCentral() {
  const { data: jobs = [] } = useQuery({
    queryKey: ['hub_sync_jobs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hub_sync_jobs').select('*').order('job_key');
      if (error) throw error;
      return data;
    },
  });

  const { data: runs = [] } = useQuery({
    queryKey: ['hub_sync_runs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hub_sync_runs').select('*').order('started_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <RefreshCw className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Central de Sync</h1>
          <p className="text-sm text-muted-foreground">Jobs de sincronização e logs de execução</p>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">Jobs</h2></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Habilitado</TableHead>
              <TableHead>Último Run</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum job configurado (Phase 2)</TableCell></TableRow>
            )}
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-mono text-sm">{job.job_key}</TableCell>
                <TableCell><Badge variant={job.enabled ? 'default' : 'secondary'}>{job.enabled ? 'Sim' : 'Não'}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{job.last_run_at ? new Date(job.last_run_at).toLocaleString('pt-BR') : '—'}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => toast.info('Sync manual disponível na Phase 2')}>
                    <Play className="h-3 w-3" /> Rodar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">Últimas Execuções</h2></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Erro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma execução registrada</TableCell></TableRow>
            )}
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="font-mono text-xs">{String(run.job_id).slice(0, 8)}</TableCell>
                <TableCell>
                  <Badge variant={run.status === 'ok' ? 'default' : run.status === 'error' ? 'destructive' : 'secondary'}>
                    {run.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{run.items_upserted ?? 0}/{run.items_found ?? 0}</TableCell>
                <TableCell className="text-sm">{run.duration_ms ? `${run.duration_ms}ms` : '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(run.started_at).toLocaleString('pt-BR')}</TableCell>
                <TableCell className="text-xs text-destructive max-w-[200px] truncate">{run.error || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
