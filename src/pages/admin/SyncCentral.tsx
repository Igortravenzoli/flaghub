import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Play, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

const JOB_FUNCTION_MAP: Record<string, string> = {
  devops_sync_all_default: 'devops-sync-all',
  gateway_helpdesk_clients_default: 'gateway-sync-clients',
  gateway_helpdesk_dashboard_default: 'gateway-sync-dashboard',
};

export default function SyncCentral() {
  const queryClient = useQueryClient();
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['hub_sync_jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hub_sync_jobs')
        .select('*, hub_integrations!hub_sync_jobs_integration_id_fkey(name, key)')
        .order('job_key');
      if (error) throw error;
      return data;
    },
  });

  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ['hub_sync_runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hub_sync_runs')
        .select('*, hub_sync_jobs!hub_sync_runs_job_id_fkey(job_key)')
        .order('started_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  const handleRunNow = async (job: any) => {
    const functionName = JOB_FUNCTION_MAP[job.job_key];
    if (!functionName) {
      toast.error(`Nenhuma Edge Function mapeada para ${job.job_key}`);
      return;
    }

    setRunningJobs(prev => new Set(prev).add(job.id));
    toast.info(`Iniciando sync: ${job.job_key}...`);

    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: functionName === 'devops-sync-all' ? {} : undefined,
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Sync concluído: ${job.job_key}`, {
          description: data.items_upserted !== undefined
            ? `${data.items_upserted} itens atualizados`
            : data.total !== undefined
            ? `${data.total} itens processados`
            : 'Concluído com sucesso',
        });
      } else {
        toast.error(`Sync falhou: ${data?.error || 'Erro desconhecido'}`);
      }
    } catch (err: any) {
      toast.error(`Erro ao executar sync`, { description: err.message });
    } finally {
      setRunningJobs(prev => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['hub_sync_runs'] });
      queryClient.invalidateQueries({ queryKey: ['hub_sync_jobs'] });
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'ok': return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
      case 'error': return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      case 'running': return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Central de Sync</h1>
            <p className="text-sm text-muted-foreground">Jobs de sincronização e logs de execução</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['hub_sync_jobs'] });
            queryClient.invalidateQueries({ queryKey: ['hub_sync_runs'] });
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">Jobs Configurados</h2></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Integração</TableHead>
              <TableHead>Habilitado</TableHead>
              <TableHead>Intervalo</TableHead>
              <TableHead>Último Run</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobsLoading && (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            )}
            {!jobsLoading && jobs.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum job configurado</TableCell></TableRow>
            )}
            {jobs.map((job: any) => {
              const isRunning = runningJobs.has(job.id);
              const integration = job.hub_integrations;
              return (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-sm">{job.job_key}</TableCell>
                  <TableCell className="text-sm">{integration?.name || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={job.enabled ? 'default' : 'secondary'}>
                      {job.enabled ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {job.schedule_minutes ? `${job.schedule_minutes} min` : job.schedule_cron || '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {job.last_run_at ? new Date(job.last_run_at).toLocaleString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={isRunning || !JOB_FUNCTION_MAP[job.job_key]}
                      onClick={() => handleRunNow(job)}
                    >
                      {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      {isRunning ? 'Rodando...' : 'Rodar'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">Últimas Execuções</h2></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Erro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runsLoading && (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            )}
            {!runsLoading && runs.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma execução registrada</TableCell></TableRow>
            )}
            {runs.map((run: any) => (
              <TableRow key={run.id}>
                <TableCell className="font-mono text-xs">{(run as any).hub_sync_jobs?.job_key || String(run.job_id).slice(0, 8)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {statusIcon(run.status)}
                    <Badge variant={run.status === 'ok' ? 'default' : run.status === 'error' ? 'destructive' : 'secondary'}>
                      {run.status}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{run.items_upserted ?? 0}/{run.items_found ?? 0}</TableCell>
                <TableCell className="text-sm">
                  {run.duration_ms ? (run.duration_ms > 1000 ? `${(run.duration_ms / 1000).toFixed(1)}s` : `${run.duration_ms}ms`) : '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(run.started_at).toLocaleString('pt-BR')}</TableCell>
                <TableCell className="text-xs text-destructive max-w-[250px] truncate" title={run.error || ''}>
                  {run.error || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
