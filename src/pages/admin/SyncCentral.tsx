import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RefreshCw, Play, Loader2, CheckCircle, XCircle, Clock, Database, Power, PowerOff, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

const JOB_FUNCTION_MAP: Record<string, string> = {
  devops_sync_all_default: 'devops-sync-all',
  gateway_helpdesk_clients_default: 'vdesk-sync-base-clientes',
  gateway_helpdesk_dashboard_default: 'vdesk-sync-helpdesk',
  'devops-sync-timelog': 'devops-sync-timelog',
  'devops-sync-qualidade': 'devops-sync-qualidade',
};

const INTERVAL_OPTIONS = [
  { value: '5', label: '5 min' },
  { value: '10', label: '10 min' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '60', label: '1 hora' },
  { value: '120', label: '2 horas' },
  { value: '360', label: '6 horas' },
  { value: '720', label: '12 horas' },
  { value: '1440', label: 'Diário' },
];

export default function SyncCentral() {
  const queryClient = useQueryClient();
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [togglingJobs, setTogglingJobs] = useState<Set<string>>(new Set());
  const [updatingInterval, setUpdatingInterval] = useState<Set<string>>(new Set());
  const [isDisablingAll, setIsDisablingAll] = useState(false);

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

  const { data: devopsQueries = [], isLoading: queriesLoading } = useQuery({
    queryKey: ['devops_queries_sync'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('devops_queries')
        .select('*')
        .eq('is_active', true)
        .order('name');
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
    refetchInterval: 60000, // 60s — reduz carga no banco
  });

  const refreshSyncData = () => {
    queryClient.invalidateQueries({ queryKey: ['hub_sync_jobs'] });
    queryClient.invalidateQueries({ queryKey: ['hub_sync_runs'] });
    queryClient.invalidateQueries({ queryKey: ['devops_queries_sync'] });
  };

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
      refreshSyncData();
    }
  };

  const handleSyncQuery = async (query: any) => {
    setRunningJobs(prev => new Set(prev).add(`q-${query.id}`));
    toast.info(`Sincronizando query: ${query.name}...`);

    try {
      const { data, error } = await supabase.functions.invoke('devops-sync-query', {
        body: { query_id: query.id },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Query sincronizada: ${query.name}`, {
          description: `${data.items_upserted} itens atualizados de ${data.items_found} encontrados`,
        });
      } else {
        toast.error(`Falha: ${data?.error || 'Erro desconhecido'}`);
      }
    } catch (err: any) {
      toast.error(`Erro ao sincronizar query`, { description: err.message });
    } finally {
      setRunningJobs(prev => {
        const next = new Set(prev);
        next.delete(`q-${query.id}`);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['hub_sync_runs'] });
      queryClient.invalidateQueries({ queryKey: ['devops_queries_sync'] });
    }
  };

  const handleSyncAllQueries = async () => {
    for (const q of devopsQueries) {
      await handleSyncQuery(q);
    }
  };

  const handleToggleJob = async (job: any, enabled: boolean) => {
    setTogglingJobs(prev => new Set(prev).add(job.id));

    try {
      const { data, error } = await supabase.functions.invoke('manage-sync-schedules', {
        body: { action: 'toggle_job', job_key: job.job_key, enabled },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao atualizar agendamento');

      toast.success(`Agendamento ${enabled ? 'ativado' : 'inativado'}`, {
        description: job.job_key,
      });
      refreshSyncData();
    } catch (err: any) {
      toast.error('Erro ao atualizar agendamento', { description: err.message });
    } finally {
      setTogglingJobs(prev => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  const handleUpdateInterval = async (job: any, minutes: number) => {
    setUpdatingInterval(prev => new Set(prev).add(job.id));

    try {
      const { data, error } = await supabase.functions.invoke('manage-sync-schedules', {
        body: { action: 'update_interval', job_key: job.job_key, interval_minutes: minutes },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao atualizar intervalo');

      toast.success(`Intervalo atualizado para ${formatInterval(minutes)}`, {
        description: `${job.job_key} — cron: ${data.cron_expression}`,
      });
      refreshSyncData();
    } catch (err: any) {
      toast.error('Erro ao atualizar intervalo', { description: err.message });
    } finally {
      setUpdatingInterval(prev => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  const handleDisableAllSchedules = async () => {
    setIsDisablingAll(true);

    try {
      const { data, error } = await supabase.functions.invoke('manage-sync-schedules', {
        body: { action: 'disable_all' },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao inativar agendamentos');

      toast.success('Todos os agendamentos foram inativados');
      refreshSyncData();
    } catch (err: any) {
      toast.error('Erro ao inativar todos os agendamentos', { description: err.message });
    } finally {
      setIsDisablingAll(false);
    }
  };

  const formatInterval = (minutes: number | null) => {
    if (!minutes) return '—';
    const option = INTERVAL_OPTIONS.find(o => o.value === String(minutes));
    if (option) return option.label;
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${minutes / 60}h`;
    return 'Diário';
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
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={isDisablingAll}
            onClick={handleDisableAllSchedules}
          >
            {isDisablingAll ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PowerOff className="h-4 w-4 mr-1" />}
            Inativar todos
          </Button>
          <Button variant="outline" size="sm" onClick={refreshSyncData}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
        </div>
      </div>

      {/* DevOps Queries Section */}
      <Card>
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">DevOps Queries</h2>
          </div>
          <Button size="sm" variant="outline" className="gap-1" onClick={handleSyncAllQueries}>
            <Play className="h-3 w-3" /> Sync Todas
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Query</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead>Última Sync</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queriesLoading && (
              <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            )}
            {!queriesLoading && devopsQueries.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma query configurada</TableCell></TableRow>
            )}
            {devopsQueries.map((q: any) => {
              const isRunning = runningJobs.has(`q-${q.id}`);
              return (
                <TableRow key={q.id}>
                  <TableCell className="font-mono text-sm">{q.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{q.sector || 'geral'}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {q.last_synced_at ? new Date(q.last_synced_at).toLocaleString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="gap-1" disabled={isRunning} onClick={() => handleSyncQuery(q)}>
                      {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      {isRunning ? 'Rodando...' : 'Sync'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">Jobs Configurados</h2></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Integração</TableHead>
              <TableHead>Status</TableHead>
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
              const isToggling = togglingJobs.has(job.id);
              const isUpdating = updatingInterval.has(job.id);
              const integration = job.hub_integrations;
              const isManagedJob = job.job_key in JOB_FUNCTION_MAP;
              const currentMinutes = job.schedule_minutes || null;

              return (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-sm">{job.job_key}</TableCell>
                  <TableCell className="text-sm">{integration?.name || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={job.enabled ? 'default' : 'secondary'}>
                      {job.enabled ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {isManagedJob ? (
                      <div className="flex items-center gap-1">
                        <Select
                          value={currentMinutes ? String(currentMinutes) : ''}
                          onValueChange={(val) => handleUpdateInterval(job, Number(val))}
                          disabled={isUpdating || isToggling}
                        >
                          <SelectTrigger className="w-[120px] h-8 text-xs">
                            <SelectValue placeholder={job.schedule_cron || '—'} />
                          </SelectTrigger>
                          <SelectContent>
                            {INTERVAL_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isUpdating && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {currentMinutes ? formatInterval(currentMinutes) : job.schedule_cron || '—'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {job.last_run_at ? new Date(job.last_run_at).toLocaleString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {isManagedJob && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={isToggling}
                          onClick={() => handleToggleJob(job, !job.enabled)}
                        >
                          {isToggling ? <Loader2 className="h-3 w-3 animate-spin" /> : job.enabled ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
                          {job.enabled ? 'Off' : 'On'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={isRunning || isToggling || !JOB_FUNCTION_MAP[job.job_key]}
                        onClick={() => handleRunNow(job)}
                      >
                        {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        {isRunning ? 'Rodando...' : 'Rodar'}
                      </Button>
                    </div>
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
                <TableCell className="font-mono text-xs">{run.hub_sync_jobs?.job_key || String(run.job_id).slice(0, 8)}</TableCell>
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
