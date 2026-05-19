import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { RefreshCw, Play, Loader2, CheckCircle, XCircle, Clock, Database, PowerOff, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useMemo, useState } from 'react';

const JOB_FUNCTION_MAP: Record<string, string> = {
  devops_sync_all_default: 'devops-sync-all',
  gateway_helpdesk_clients_default: 'vdesk-sync-base-clientes',
  gateway_helpdesk_dashboard_default: 'vdesk-sync-helpdesk',
  'devops-sync-timelog': 'devops-sync-timelog',
  'vdesk-sync-timelog': 'vdesk-sync-timelog',
  'devops-sync-qualidade': 'devops-sync-qualidade',
};

const JOB_LABEL_MAP: Record<string, string> = {
  devops_sync_all_default: 'DevOps Sync All',
  gateway_helpdesk_clients_default: 'VDesk Clientes',
  gateway_helpdesk_dashboard_default: 'VDesk Helpdesk',
  'devops-sync-timelog': 'DevOps TimeLog',
  'vdesk-sync-timelog': 'VDESK Sync Manual',
  'devops-sync-qualidade': 'DevOps Qualidade',
};

const JOB_SECTOR_MAP: Record<string, string> = {
  devops_sync_all_default: 'Geral',
  gateway_helpdesk_clients_default: 'Comercial',
  gateway_helpdesk_dashboard_default: 'Helpdesk',
  'devops-sync-timelog': 'Fabrica',
  'vdesk-sync-timelog': 'Fabrica',
  'devops-sync-qualidade': 'Qualidade',
};

const VDESK_MANUAL_KEY = 'manual-vdesk-sync';

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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://nxmgppfyltwsqryfxkbm.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  '';

const isTransportInvokeError = (message?: string) =>
  !!message && /Failed to send a request to the Edge Function/i.test(message);

const buildInvokeErrorMessage = (functionName: string, err: any) => {
  const message = err?.message || 'Erro desconhecido';
  if (isTransportInvokeError(message)) {
    return `Falha de rede ao chamar ${functionName}. Verifique conexao/VPN/firewall e tente novamente.`;
  }
  return message;
};

export default function SyncCentral() {
  const queryClient = useQueryClient();
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [togglingJobs, setTogglingJobs] = useState<Set<string>>(new Set());
  const [updatingInterval, setUpdatingInterval] = useState<Set<string>>(new Set());
  const [isDisablingAll, setIsDisablingAll] = useState(false);
  const [vdeskFrom, setVdeskFrom] = useState('');
  const [vdeskTo, setVdeskTo] = useState('');
  const [vdeskRangeTouched, setVdeskRangeTouched] = useState(false);

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['hub_sync_jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hub_sync_jobs')
        .select('*, hub_integrations!hub_sync_jobs_integration_id_fkey(name, key), hub_areas:hub_areas!hub_sync_jobs_area_id_fkey(name, key)')
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

  const { data: timelogRuns = [] } = useQuery({
    queryKey: ['timelog_sync_runs_central'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('timelog_sync_runs')
        .select('id, started_at, finished_at, status, rows_fetched, rows_inserted, rows_updated, triggered_by, error_message, from_date, to_date')
        .order('started_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const recommendedVdeskRange = useMemo(() => {
    const lastSuccessfulRun = timelogRuns.find((run: any) => run.status === 'ok' || run.status === 'partial');

    if (lastSuccessfulRun?.to_date) {
      const fromDate = new Date(`${lastSuccessfulRun.to_date}T00:00:00`);
      fromDate.setDate(fromDate.getDate() - 1);

      return {
        from: fromDate.toISOString().slice(0, 10),
        to: todayIso,
        label: 'Incremental com 1 dia de seguranca',
      };
    }

    const fromDate = new Date(`${todayIso}T00:00:00`);
    fromDate.setDate(fromDate.getDate() - 7);

    return {
      from: fromDate.toISOString().slice(0, 10),
      to: todayIso,
      label: 'Janela inicial de 7 dias',
    };
  }, [timelogRuns, todayIso]);

  useEffect(() => {
    if (vdeskRangeTouched) return;
    setVdeskFrom(recommendedVdeskRange.from);
    setVdeskTo(recommendedVdeskRange.to);
  }, [recommendedVdeskRange, vdeskRangeTouched]);

  const refreshSyncData = () => {
    queryClient.invalidateQueries({ queryKey: ['hub_sync_jobs'] });
    queryClient.invalidateQueries({ queryKey: ['hub_sync_runs'] });
    queryClient.invalidateQueries({ queryKey: ['devops_queries_sync'] });
    queryClient.invalidateQueries({ queryKey: ['timelog_sync_runs_central'] });
  };

  const invokeFunction = async (functionName: string, body?: unknown) => {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
    });

    if (!error) return { data, error: null as Error | null };
    if (!isTransportInvokeError(error.message)) return { data, error };

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      const raw = await response.text();
      const parsed = raw ? JSON.parse(raw) : null;

      if (!response.ok) {
        const detail = parsed?.error || parsed?.message || raw || `HTTP ${response.status}`;
        return {
          data: parsed,
          error: new Error(`HTTP ${response.status}: ${detail}`),
        };
      }

      return { data: parsed, error: null as Error | null };
    } catch (fallbackErr: any) {
      return {
        data,
        error: new Error(`${error.message} | fallback=${fallbackErr?.message || 'network error'}`),
      };
    }
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
      const requestBody = functionName === 'devops-sync-all' ? {} : undefined;
      const { data, error } = await invokeFunction(functionName, requestBody);

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
      toast.error(`Erro ao executar sync`, { description: buildInvokeErrorMessage(functionName, err) });
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
      const { data, error } = await invokeFunction('devops-sync-query', { query_id: query.id });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Query sincronizada: ${query.name}`, {
          description: `${data.items_upserted} itens atualizados de ${data.items_found} encontrados`,
        });
      } else {
        toast.error(`Falha: ${data?.error || 'Erro desconhecido'}`);
      }
    } catch (err: any) {
      toast.error(`Erro ao sincronizar query`, { description: buildInvokeErrorMessage('devops-sync-query', err) });
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

  const handleVdeskManualSync = async () => {
    if (!vdeskFrom || !vdeskTo) {
      toast.error('Preencha a faixa de datas do VDESK.');
      return;
    }

    if (vdeskFrom > vdeskTo) {
      toast.error('Data inicial maior que data final.');
      return;
    }

    setRunningJobs(prev => new Set(prev).add(VDESK_MANUAL_KEY));
    toast.info('Iniciando sync manual do VDESK...');

    try {
      const { data, error } = await invokeFunction('vdesk-sync-timelog', { from: vdeskFrom, to: vdeskTo });

      if (error) throw error;

      toast.success('Sync VDESK iniciado em background', {
        description: `${vdeskFrom} -> ${vdeskTo}${data?.runId ? ` | run ${String(data.runId).slice(0, 8)}` : ''}`,
      });
      refreshSyncData();
    } catch (err: any) {
      toast.error('Erro ao iniciar sync VDESK', { description: buildInvokeErrorMessage('vdesk-sync-timelog', err) });
    } finally {
      setRunningJobs(prev => {
        const next = new Set(prev);
        next.delete(VDESK_MANUAL_KEY);
        return next;
      });
    }
  };

  const handleToggleJob = async (job: any, enabled: boolean) => {
    setTogglingJobs(prev => new Set(prev).add(job.id));

    try {
      const { data, error } = await invokeFunction('manage-sync-schedules', {
        action: 'toggle_job',
        job_key: job.job_key,
        enabled,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao atualizar agendamento');

      toast.success(`Agendamento ${enabled ? 'ativado' : 'inativado'}`, {
        description: job.job_key,
      });
      refreshSyncData();
    } catch (err: any) {
      toast.error('Erro ao atualizar agendamento', { description: buildInvokeErrorMessage('manage-sync-schedules', err) });
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
      const { data, error } = await invokeFunction('manage-sync-schedules', {
        action: 'update_interval',
        job_key: job.job_key,
        interval_minutes: minutes,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao atualizar intervalo');

      toast.success(`Intervalo atualizado para ${formatInterval(minutes)}`, {
        description: `${job.job_key} — cron: ${data.cron_expression}`,
      });
      refreshSyncData();
    } catch (err: any) {
      toast.error('Erro ao atualizar intervalo', { description: buildInvokeErrorMessage('manage-sync-schedules', err) });
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
      const { data, error } = await invokeFunction('manage-sync-schedules', { action: 'disable_all' });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao inativar agendamentos');

      toast.success('Todos os agendamentos foram inativados');
      refreshSyncData();
    } catch (err: any) {
      toast.error('Erro ao inativar todos os agendamentos', { description: buildInvokeErrorMessage('manage-sync-schedules', err) });
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
      case 'partial': return <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getJobSector = (job: any) => {
    return job.hub_areas?.name || JOB_SECTOR_MAP[job.job_key] || 'Geral';
  };

  const lastVdeskRun = timelogRuns[0] ?? null;

  const unifiedRuns = useMemo(() => {
    const centralRuns = runs.map((run: any) => ({
      id: `hub-${run.id}`,
      executionLabel: JOB_LABEL_MAP[run.hub_sync_jobs?.job_key] || run.hub_sync_jobs?.job_key || String(run.job_id).slice(0, 8),
      sector: JOB_SECTOR_MAP[run.hub_sync_jobs?.job_key] || 'Geral',
      status: run.status,
      itemsLabel: `${run.items_upserted ?? 0}/${run.items_found ?? 0}`,
      durationLabel: run.duration_ms ? (run.duration_ms > 1000 ? `${(run.duration_ms / 1000).toFixed(1)}s` : `${run.duration_ms}ms`) : '—',
      startedAt: run.started_at,
      detail: run.error || '—',
    }));

    const vdeskExecutionRuns = timelogRuns.map((run: any) => {
      const durationMs = run.finished_at
        ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
        : null;

      return {
        id: `vdesk-${run.id}`,
        executionLabel: 'VDESK Sync Manual',
        sector: JOB_SECTOR_MAP['vdesk-sync-timelog'],
        status: run.status,
        itemsLabel: `${run.rows_inserted ?? 0}/${run.rows_fetched ?? 0}`,
        durationLabel: durationMs ? `${(durationMs / 1000).toFixed(1)}s` : '—',
        startedAt: run.started_at,
        detail: `${run.from_date} -> ${run.to_date}${run.error_message ? ` | ${run.error_message}` : ''}`,
      };
    });

    return [...centralRuns, ...vdeskExecutionRuns]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 30);
  }, [runs, timelogRuns]);

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

      {/* Manual Executions Section */}
      <Card>
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Execucoes Manuais</h2>
          </div>
          <Button size="sm" variant="outline" className="gap-1" onClick={handleSyncAllQueries}>
            <Play className="h-3 w-3" /> Sync Todas DevOps
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Execucao</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead>Última Sync</TableHead>
              <TableHead>Faixa</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queriesLoading && (
              <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            )}
            {!queriesLoading && devopsQueries.length === 0 && !lastVdeskRun && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma execucao manual configurada</TableCell></TableRow>
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
                  <TableCell className="text-xs text-muted-foreground">Sob demanda</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="gap-1" disabled={isRunning} onClick={() => handleSyncQuery(q)}>
                      {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      {isRunning ? 'Rodando...' : 'Sync'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow>
              <TableCell className="font-mono text-sm">VDESK Sync Manual</TableCell>
              <TableCell>
                <Badge variant="secondary">{JOB_SECTOR_MAP['vdesk-sync-timelog']}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {lastVdeskRun?.finished_at ? new Date(lastVdeskRun.finished_at).toLocaleString('pt-BR') : lastVdeskRun?.started_at ? new Date(lastVdeskRun.started_at).toLocaleString('pt-BR') : '—'}
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-2 min-w-[280px]">
                  <span className="text-xs text-muted-foreground">{recommendedVdeskRange.label}</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={vdeskFrom}
                      onChange={(e) => { setVdeskRangeTouched(true); setVdeskFrom(e.target.value); }}
                      className="h-8 text-xs w-[136px]"
                    />
                    <Input
                      type="date"
                      value={vdeskTo}
                      onChange={(e) => { setVdeskRangeTouched(true); setVdeskTo(e.target.value); }}
                      className="h-8 text-xs w-[136px]"
                    />
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={runningJobs.has(VDESK_MANUAL_KEY)}
                  onClick={handleVdeskManualSync}
                >
                  {runningJobs.has(VDESK_MANUAL_KEY) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  {runningJobs.has(VDESK_MANUAL_KEY) ? 'Rodando...' : 'Sync'}
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">Jobs Configurados</h2></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead>Integração</TableHead>
              <TableHead>Saúde</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead>Intervalo</TableHead>
              <TableHead>Último Run</TableHead>
              <TableHead>Próximo Run</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobsLoading && (
              <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            )}
            {!jobsLoading && jobs.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum job configurado</TableCell></TableRow>
            )}
            {jobs.map((job: any) => {
              const isRunning = runningJobs.has(job.id);
              const isToggling = togglingJobs.has(job.id);
              const isUpdating = updatingInterval.has(job.id);
              const integration = job.hub_integrations;
              const isManagedJob = job.job_key in JOB_FUNCTION_MAP;
              const currentMinutes = job.schedule_minutes || null;

              // Health badge based on recent runs
              const jobRuns = runs.filter((r: any) => r.job_id === job.id);
              const lastRun = jobRuns[0];
              const recentErrors = jobRuns.slice(0, 3).filter((r: any) => r.status === 'error').length;
              const healthStatus = !lastRun
                ? 'unknown'
                : lastRun.status === 'error'
                ? recentErrors >= 2 ? 'degradado' : 'falhando'
                : 'ativo';

              // Derive last execution time: prefer job.last_run_at, fallback to most recent run
              const lastExecAt = job.last_run_at || lastRun?.finished_at || lastRun?.started_at || null;

              const healthBadge = () => {
                switch (healthStatus) {
                  case 'ativo': return <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" />Ativo</Badge>;
                  case 'falhando': return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Falhando</Badge>;
                  case 'degradado': return <Badge variant="destructive" className="gap-1 bg-orange-500/90 hover:bg-orange-500"><AlertTriangle className="h-3 w-3" />Degradado</Badge>;
                  default: return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Sem dados</Badge>;
                }
              };

              return (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-sm">{job.job_key}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{getJobSector(job)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{integration?.name || '—'}</TableCell>
                  <TableCell>{healthBadge()}</TableCell>
                  <TableCell>
                    {isManagedJob ? (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={job.enabled}
                          onCheckedChange={(checked) => handleToggleJob(job, checked)}
                          disabled={isToggling}
                        />
                        {isToggling && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      </div>
                    ) : (
                      <Badge variant={job.enabled ? 'default' : 'secondary'}>
                        {job.enabled ? 'Ativo' : 'Inativo'}
                      </Badge>
                    )}
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
                    {lastExecAt ? new Date(lastExecAt).toLocaleString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {job.next_run_at ? new Date(job.next_run_at).toLocaleString('pt-BR') : '—'}
                  </TableCell>
                  <TableCell>
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
              <TableHead>Execução</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runsLoading && (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            )}
            {!runsLoading && unifiedRuns.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma execução registrada</TableCell></TableRow>
            )}
            {unifiedRuns.map((run: any) => (
              <TableRow key={run.id}>
                <TableCell className="font-mono text-xs">{run.executionLabel}</TableCell>
                <TableCell><Badge variant="outline">{run.sector}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {statusIcon(run.status)}
                    <Badge variant={run.status === 'ok' ? 'default' : run.status === 'error' ? 'destructive' : run.status === 'partial' ? 'secondary' : 'secondary'}>
                      {run.status}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{run.itemsLabel}</TableCell>
                <TableCell className="text-sm">{run.durationLabel}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(run.startedAt).toLocaleString('pt-BR')}</TableCell>
                <TableCell className="text-xs max-w-[320px] truncate" title={run.detail}>
                  {run.detail}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
