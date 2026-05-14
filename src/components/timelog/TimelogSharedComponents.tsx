/**
 * Shared Timelog admin components — used by SyncCentral and FabricaDashboard.
 */
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Play, Loader2, AlertTriangle, Users, RefreshCw,
  CheckCircle2, XCircle, SendHorizonal, ThumbsDown, Wifi, WifiOff, ListChecks,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useVdeskSyncTrigger,
  useTimelogSyncRuns,
  useCollaboratorMap,
  useVdeskDistinctUsers,
} from '@/hooks/useTimelogUnificado';
import {
  useTimelogQueue,
  useTimelogQueuePost,
  useTimelogQueueApprove,
  useTimelogQueueReject,
  useTimelogQueueReset,
  useTimelogQueueProcess,
  type TimelogQueueRow,
} from '@/hooks/useTimelogQueue';
import { useQueryClient } from '@tanstack/react-query';

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
export function isoNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const QUEUE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Pendente',   color: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
  approved:   { label: 'Aprovado',   color: 'bg-blue-500/10 text-blue-700 border-blue-500/30' },
  posting:    { label: 'Enviando…',  color: 'bg-purple-500/10 text-purple-700 border-purple-500/30' },
  posted:     { label: 'Enviado',    color: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
  duplicated: { label: 'Duplicado',  color: 'bg-slate-500/10 text-slate-700 border-slate-500/30' },
  error:      { label: 'Erro',       color: 'bg-red-500/10 text-red-700 border-red-500/30' },
  skipped:    { label: 'Ignorado',   color: 'bg-slate-400/10 text-slate-600 border-slate-400/30' },
  rejected:   { label: 'Rejeitado',  color: 'bg-red-400/10 text-red-600 border-red-400/30' },
};

// ─── VdeskSyncPanel ───────────────────────────────────────────────────────────

export function VdeskSyncPanel({ onSynced }: { onSynced?: () => void }) {
  const [from, setFrom] = useState('2026-01-01');
  const [to, setTo]   = useState(isoToday());
  const trigger = useVdeskSyncTrigger();
  const queryClient = useQueryClient();

  const presets = [
    { label: 'Hoje',       from: isoToday(),        to: isoToday() },
    { label: '7 dias',     from: isoNDaysAgo(7),    to: isoToday() },
    { label: '30 dias',    from: isoNDaysAgo(30),   to: isoToday() },
    { label: '2026 (YTD)', from: '2026-01-01',      to: isoToday() },
  ];

  const handleSync = async () => {
    if (!from || !to) { toast.error('Preencha as datas.'); return; }
    if (from > to) { toast.error('Data inicial maior que data final.'); return; }
    toast.info('A iniciar sync VDESK…');
    trigger.mutate({ from, to }, {
      onSuccess: (data) => {
        toast.success('Sync iniciado em background', {
          description: `Run ID: ${data?.runId?.slice(0, 8)}… · ${from} → ${to}`,
        });
        queryClient.invalidateQueries({ queryKey: ['timelog-sync-runs'] });
        onSynced?.();
      },
      onError: (err: any) => toast.error('Erro ao iniciar sync', { description: err?.message }),
    });
  };

  return (
    <Card className="border-flag-gold/20 bg-flag-gold/5">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Play className="h-4 w-4 text-flag-gold" />
          Sincronizar VDESK → Supabase
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {presets.map(p => (
            <Button key={p.label} variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => { setFrom(p.from); setTo(p.to); }}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">De</label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 text-sm w-36" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Até</label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 text-sm w-36" />
          </div>
          <Button size="sm" onClick={handleSync} disabled={trigger.isPending}
            className="bg-flag-gold text-flag-navy hover:bg-flag-gold/80 gap-1.5">
            {trigger.isPending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />A sincronizar…</>
              : <><Play className="h-3.5 w-3.5" />Iniciar Sync</>}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          O sync corre em background. Aguarde ~30s antes de verificar novos dados.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── VdeskSyncHistory ─────────────────────────────────────────────────────────

export function VdeskSyncHistory() {
  const { data: runs = [], isLoading } = useTimelogSyncRuns();

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (runs.length === 0) return (
    <p className="text-xs text-muted-foreground text-center py-4">Nenhum sync VDESK executado ainda.</p>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow className="text-xs">
          <TableHead>Início</TableHead>
          <TableHead className="text-right">Inseridos</TableHead>
          <TableHead className="text-right">Atualizados</TableHead>
          <TableHead>Origem</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Erro</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map(r => (
          <TableRow key={r.id} className="text-xs">
            <TableCell className="whitespace-nowrap">{fmtDateTime(r.started_at)}</TableCell>
            <TableCell className="text-right">{r.rows_inserted}</TableCell>
            <TableCell className="text-right">{r.rows_updated}</TableCell>
            <TableCell>{r.triggered_by}</TableCell>
            <TableCell>
              <Badge variant="outline" className={
                r.status === 'ok'      ? 'text-emerald-700 border-emerald-500/30 bg-emerald-500/10' :
                r.status === 'running' ? 'text-blue-700 border-blue-500/30 bg-blue-500/10' :
                r.status === 'partial' ? 'text-amber-700 border-amber-500/30 bg-amber-500/10' :
                                         'text-red-700 border-red-500/30 bg-red-500/10'
              }>{r.status}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground max-w-[160px] truncate text-[11px]">
              {r.error_message ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── CollaboradoresTab ────────────────────────────────────────────────────────

export function CollaboradoresTab() {
  const { data: mapRows = [], isLoading: mapLoading, refetch: refetchMap } = useCollaboratorMap();
  const { data: vdeskUsers = [], isLoading: usersLoading } = useVdeskDistinctUsers();

  const mappedVdeskNames = useMemo(
    () => new Set(mapRows.map(r => r.vdesk_user_name?.toLowerCase()).filter(Boolean)),
    [mapRows]
  );
  const unmapped = useMemo(
    () => vdeskUsers.filter(u => !mappedVdeskNames.has(u.toLowerCase())),
    [vdeskUsers, mappedVdeskNames]
  );

  if (mapLoading || usersLoading) {
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  return (
    <div className="space-y-5">
      {vdeskUsers.length === 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm"><strong>Sem dados VDESK ainda.</strong> Execute um sync histórico para descobrir os utilizadores activos.</span>
          </CardContent>
        </Card>
      )}
      {unmapped.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Utilizadores VDESK sem mapeamento ({unmapped.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Execute o SQL abaixo no Supabase Studio para mapear os utilizadores em falta:
            </p>
            <pre className="bg-muted rounded p-3 text-[11px] overflow-x-auto select-all">
{`INSERT INTO public.devops_collaborator_map
  (canonical_name, timelog_name, vdesk_user_name, devops_email, is_active)
VALUES
${unmapped.map(u => `  ('${u}', '${u}', '${u}', 'email@flag.com.br', true)`).join(',\n')}
ON CONFLICT (timelog_name) DO UPDATE SET
  vdesk_user_name = EXCLUDED.vdesk_user_name,
  devops_email    = EXCLUDED.devops_email,
  is_active       = EXCLUDED.is_active;`}
            </pre>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />Mapeamentos actuais ({mapRows.length})
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetchMap()} className="h-7 text-xs gap-1">
            <RefreshCw className="h-3 w-3" />Recarregar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>Canonical</TableHead>
                <TableHead>VDESK User</TableHead>
                <TableHead>Email DevOps</TableHead>
                <TableHead>TimeLog Name</TableHead>
                <TableHead className="w-20">Ativo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mapRows.length === 0
                ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">Nenhum mapeamento encontrado.</TableCell></TableRow>
                : mapRows.map(r => (
                    <TableRow key={r.timelog_name} className="text-xs">
                      <TableCell className="font-medium">{r.canonical_name ?? <span className="italic text-muted-foreground">—</span>}</TableCell>
                      <TableCell className={r.vdesk_user_name ? '' : 'text-muted-foreground italic'}>{r.vdesk_user_name ?? '—'}</TableCell>
                      <TableCell className={r.devops_email ? '' : 'text-muted-foreground italic'}>{r.devops_email ?? '—'}</TableCell>
                      <TableCell>{r.timelog_name}</TableCell>
                      <TableCell>
                        {r.is_active
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : <XCircle className="h-4 w-4 text-muted-foreground" />}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── PostarParaDevOps ─────────────────────────────────────────────────────────

interface VdeskLogEntry {
  id: string;
  task_devops: number;
  usuario_vdesk: string;
  log_date: string;
  tempo_segundos: number;
}

/** Map vdesk_user_name → devops_email from collaborator map */
function useEmailMap() {
  const { data: mapRows = [] } = useCollaboratorMap();
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const r of mapRows) {
      if (r.vdesk_user_name && r.devops_email) {
        m.set(r.vdesk_user_name.toLowerCase(), r.devops_email);
      }
    }
    return m;
  }, [mapRows]);
}

export function PostarParaDevOps({ vdeskLogs }: { vdeskLogs: VdeskLogEntry[] }) {
  const { data: queueRows = [], isLoading: queueLoading } = useTimelogQueue();
  const queuePost    = useTimelogQueuePost();
  const approve      = useTimelogQueueApprove();
  const reject       = useTimelogQueueReject();
  const reset        = useTimelogQueueReset();
  const processor    = useTimelogQueueProcess();
  const emailMap     = useEmailMap();

  const [probeResult, setProbeResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [processResult, setProcessResult] = useState<{
    processed: number; posted: number; dry_run_skipped: number; errors: number;
  } | null>(null);
  const [inspectResult, setInspectResult] = useState<string | null>(null);

  // Map vdesk_log_id → queue row for fast lookup
  const queueByLogId = useMemo(() => {
    const m = new Map<string, TimelogQueueRow>();
    for (const q of queueRows) m.set(q.vdesk_log_id, q);
    return m;
  }, [queueRows]);

  const handleQueue = (log: VdeskLogEntry) => {
    const email = emailMap.get(log.usuario_vdesk.toLowerCase()) ?? undefined;
    queuePost.mutate({ vdeskLogId: log.id, targetUserEmail: email, dryRun: false }, {
      onSuccess: () => toast.success(`Entrada enfileirada para ${log.usuario_vdesk}`),
      onError: (err: any) => toast.error('Erro ao enfileirar', { description: err?.message }),
    });
  };

  if (vdeskLogs.length === 0) return (
    <p className="text-xs text-muted-foreground text-center py-4">Sem entradas VDESK para o período.</p>
  );

  const approvedCount = queueRows.filter(q => q.status === 'approved').length;
  const pendingCount  = queueRows.filter(q => q.status === 'pending').length;
  const postedCount   = queueRows.filter(q => q.status === 'posted').length;
  const errorCount    = queueRows.filter(q => q.status === 'error').length;

  const handleProbe = () => {
    setProbeResult(null);
    processor.mutate({ mode: 'probe' }, {
      onSuccess: (res) => {
        setProbeResult({ ok: res.ok, message: res.message ?? '' });
        if (res.ok) toast.success('Ligação DevOps OK', { description: res.message });
        else toast.error('Falha na ligação DevOps', { description: res.message });
      },
      onError: (err: any) => {
        setProbeResult({ ok: false, message: err?.message });
        toast.error('Erro ao testar ligação', { description: err?.message });
      },
    });
  };

  const handleProcess = () => {
    setProcessResult(null);
    processor.mutate({ mode: 'process', limit: 20 }, {
      onSuccess: (res) => {
        setProcessResult({
          processed: res.processed ?? 0,
          posted: res.posted ?? 0,
          dry_run_skipped: res.dry_run_skipped ?? 0,
          errors: res.errors ?? 0,
        });
        if ((res.errors ?? 0) > 0) {
          toast.warning(`Processado com erros`, {
            description: `${res.posted ?? 0} enviados, ${res.errors} erros, ${res.dry_run_skipped ?? 0} dry-run`,
          });
        } else {
          toast.success(`Fila processada`, {
            description: `${res.posted ?? 0} enviados ao DevOps, ${res.dry_run_skipped ?? 0} dry-run`,
          });
        }
      },
      onError: (err: any) => toast.error('Erro ao processar fila', { description: err?.message }),
    });
  };

  return (
    <div className="space-y-3">
      {/* ── Control panel ─────────────────────────────────────────────────── */}
      <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
        {/* Queue stats */}
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-xs font-medium text-muted-foreground">Fila:</span>
          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30">
            {pendingCount} pendentes
          </Badge>
          <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 border-blue-500/30">
            {approvedCount} aprovadas
          </Badge>
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
            {postedCount} enviadas
          </Badge>
          {errorCount > 0 && (
            <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-700 border-red-500/30">
              {errorCount} erros
            </Badge>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 items-center">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
            disabled={processor.isPending}
            onClick={handleProbe}>
            {processor.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : probeResult
                ? (probeResult.ok ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-red-500" />)
                : <Wifi className="h-3.5 w-3.5" />}
            Testar Ligação
          </Button>

          <Button size="sm"
            className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={processor.isPending || approvedCount === 0}
            onClick={handleProcess}>
            {processor.isPending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />A processar…</>
              : <><ListChecks className="h-3.5 w-3.5" />Processar Aprovadas ({approvedCount})</>}
          </Button>

          {errorCount > 0 && (
            <Button size="sm" variant="outline"
              className="h-7 text-xs gap-1.5 text-red-600 border-red-300 hover:bg-red-50"
              disabled={reset.isPending}
              onClick={() => {
                const errorIds = queueRows.filter(q => q.status === 'error').map(q => q.id);
                Promise.all(errorIds.map(id => reset.mutateAsync(id)))
                  .then(() => toast.success(`${errorIds.length} entradas reposta para aprovação`))
                  .catch((e: any) => toast.error('Erro no reset', { description: e?.message }));
              }}>
              {reset.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              Retry Erros ({errorCount})
            </Button>
          )}

          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-muted-foreground ml-auto"
            disabled={processor.isPending}
            onClick={() => {
              setInspectResult(null);
              processor.mutate({ mode: 'probe-docs' } as any, {
                onSuccess: (res) => setInspectResult(JSON.stringify(res, null, 2)),
                onError: (err: any) => setInspectResult(`Erro: ${err?.message}`),
              });
            }}>
            🔍 Inspecionar Docs
          </Button>
        </div>

        {/* Probe result */}
        {probeResult && (
          <div className={`flex items-start gap-2 rounded p-2 text-xs ${probeResult.ok ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>
            {probeResult.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> : <XCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
            <span>{probeResult.message}</span>
          </div>
        )}

        {/* Process result */}
        {processResult && (
          <div className={`flex flex-wrap gap-3 items-center rounded p-2 text-xs ${processResult.errors > 0 ? 'bg-amber-500/10 text-amber-700' : 'bg-emerald-500/10 text-emerald-700'}`}>
            <span className="font-medium">Resultado:</span>
            <span>{processResult.processed} processadas</span>
            <span>·</span>
            <span>{processResult.posted} enviadas</span>
            {processResult.dry_run_skipped > 0 && <><span>·</span><span>{processResult.dry_run_skipped} dry-run</span></>}
            {processResult.errors > 0 && <><span>·</span><span className="text-red-600 font-medium">{processResult.errors} erros</span></>}
          </div>
        )}

        {inspectResult && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Estrutura dos documentos DevOps:</span>
              <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1" onClick={() => setInspectResult(null)}>✕</Button>
            </div>
            <pre className="bg-muted rounded p-2 text-[10px] overflow-auto max-h-64 select-all whitespace-pre-wrap">{inspectResult}</pre>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Use <strong>Testar Ligação</strong> primeiro para validar o PAT. Só entradas <em>aprovadas</em> são enviadas. Entradas com <code>dry_run=true</code> são marcadas como enviadas sem fazer chamada à API.
        </p>
      </div>

      {/* ── Existing info banner ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground rounded border bg-muted/20 px-3 py-2">
        <SendHorizonal className="h-3.5 w-3.5" />
        <span>Selecione entradas VDESK para enfileirar. Após aprovação, clique "Processar Aprovadas" para enviar ao DevOps.</span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Data</TableHead>
              <TableHead>Utilizador</TableHead>
              <TableHead>Task</TableHead>
              <TableHead className="text-right">Tempo</TableHead>
              <TableHead>Email DevOps</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vdeskLogs.slice(0, 100).map(log => {
              const q = queueByLogId.get(log.id);
              const email = emailMap.get(log.usuario_vdesk.toLowerCase());
              const mins  = Math.round(log.tempo_segundos / 60);
              const h = Math.floor(mins / 60), m = mins % 60;
              const timeStr = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
              const statusCfg = q ? (QUEUE_STATUS_CONFIG[q.status] || QUEUE_STATUS_CONFIG.pending) : null;

              return (
                <TableRow key={log.id} className="text-xs">
                  <TableCell className="whitespace-nowrap">
                    {new Date(log.log_date).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}
                  </TableCell>
                  <TableCell>{log.usuario_vdesk}</TableCell>
                  <TableCell className="font-mono">#{log.task_devops}</TableCell>
                  <TableCell className="text-right font-mono">{timeStr}</TableCell>
                  <TableCell className={email ? '' : 'text-amber-600 italic'}>
                    {email ?? 'sem email'}
                  </TableCell>
                  <TableCell>
                    {statusCfg
                      ? <Badge variant="outline"
                          className={`text-[10px] ${statusCfg.color} cursor-default`}
                          title={q?.status === 'error' ? (q.error_message ?? '') : undefined}>
                          {statusCfg.label}
                        </Badge>
                      : <span className="text-muted-foreground text-[10px]">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {!q && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1"
                          disabled={!email || queuePost.isPending}
                          onClick={() => handleQueue(log)}>
                          <SendHorizonal className="h-3 w-3" />Enfileirar
                        </Button>
                      )}
                      {q?.status === 'pending' && (
                        <>
                          <Button size="sm" variant="default" className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700"
                            disabled={approve.isPending}
                            onClick={() => approve.mutate(q.id, {
                              onSuccess: () => toast.success('Aprovado'),
                              onError: (err: any) => toast.error('Erro', { description: err?.message }),
                            })}>
                            <CheckCircle2 className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-red-600 border-red-300"
                            disabled={reject.isPending}
                            onClick={() => reject.mutate(q.id, {
                              onSuccess: () => toast.info('Rejeitado'),
                              onError: (err: any) => toast.error('Erro', { description: err?.message }),
                            })}>
                            <ThumbsDown className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      {q?.status === 'error' && (
                        <Button size="sm" variant="outline"
                          className="h-6 text-[10px] px-2 gap-1 text-red-600 border-red-300 hover:bg-red-50"
                          disabled={reset.isPending}
                          title={q.error_message ?? ''}
                          onClick={() => reset.mutate(q.id, {
                            onSuccess: () => toast.success('Reposta para aprovação'),
                            onError: (err: any) => toast.error('Erro', { description: err?.message }),
                          })}>
                          <RefreshCw className="h-3 w-3" />Retry
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {vdeskLogs.length > 100 && (
        <p className="text-xs text-muted-foreground text-center">
          Mostrando 100 de {vdeskLogs.length} entradas. Refine o período de datas para ver mais.
        </p>
      )}
    </div>
  );
}
