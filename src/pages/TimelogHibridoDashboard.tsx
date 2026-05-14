import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Clock, Download, RefreshCw, AlertTriangle, CheckCircle2,
  GitMerge, ExternalLink, Minus, Activity, Play, Users, Loader2,
  XCircle,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  useTimelogUnificado,
  useTimelogSyncRuns,
  useVdeskSyncTrigger,
  useCollaboratorMap,
  useVdeskDistinctUsers,
  type TimelogFilters,
  type TimelogStatus,
  type TimelogUnificadoRow,
} from '@/hooks/useTimelogUnificado';
import { useAuth } from '@/hooks/useAuth';
import { useHubIsAdmin } from '@/hooks/useHubPermissions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMinutes(m: number): string {
  if (m === 0) return '0min';
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const min = abs % 60;
  const sign = m < 0 ? '-' : '';
  if (h === 0) return `${sign}${min}min`;
  if (min === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${min}m`;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function iso90DaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

function isoNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Status configuration ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TimelogStatus, { label: string; color: string; icon: React.ElementType }> = {
  match:       { label: 'Match',       color: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30', icon: CheckCircle2 },
  divergent:   { label: 'Divergente',  color: 'bg-amber-500/15 text-amber-700 border-amber-500/30',     icon: AlertTriangle },
  only_vdesk:  { label: 'Só VDESK',    color: 'bg-blue-500/15 text-blue-700 border-blue-500/30',         icon: Minus },
  only_devops: { label: 'Só DevOps',   color: 'bg-purple-500/15 text-purple-700 border-purple-500/30',   icon: GitMerge },
};

function StatusBadge({ status }: { status: TimelogStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`${cfg.color} gap-1 text-xs`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(rows: TimelogUnificadoRow[]) {
  const header = [
    'task_id', 'log_date', 'user_canonical', 'vdesk_user_name',
    'minutes_vdesk', 'minutes_devops', 'gap_minutes',
    'num_os_sample', 'work_item_title', 'work_item_state', 'status',
  ];
  const lines = rows.map(r =>
    [
      r.task_id, r.log_date, r.user_canonical, r.vdesk_user_name ?? '',
      r.minutes_vdesk, r.minutes_devops, r.gap_minutes,
      r.num_os_sample ?? '', (r.work_item_title ?? '').replace(/,/g, ';'),
      r.work_item_state ?? '', r.status,
    ].join(',')
  );
  const csv = [header.join(','), ...lines].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `timelog-hibrido-${isoToday()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, variant = 'default',
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; variant?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const colors = {
    default: 'border-border',
    success: 'border-emerald-500/30 bg-emerald-500/5',
    warning: 'border-amber-500/30 bg-amber-500/5',
    danger:  'border-red-500/30 bg-red-500/5',
  };
  return (
    <Card className={`${colors[variant]} transition-all`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Admin Sync Panel ─────────────────────────────────────────────────────────

function AdminSyncPanel({ onSynced }: { onSynced: () => void }) {
  const [from, setFrom] = useState('2026-01-01');
  const [to, setTo] = useState(isoToday());
  const trigger = useVdeskSyncTrigger();

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
        onSynced();
      },
      onError: (err: any) => {
        toast.error('Erro ao iniciar sync', { description: err?.message });
      },
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
            <Button
              key={p.label}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setFrom(p.from); setTo(p.to); }}
            >
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
          <Button
            size="sm"
            onClick={handleSync}
            disabled={trigger.isPending}
            className="bg-flag-gold text-flag-navy hover:bg-flag-gold/80 gap-1.5"
          >
            {trigger.isPending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />A sincronizar…</>
              : <><Play className="h-3.5 w-3.5" />Iniciar Sync</>
            }
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          O sync corre em background. Aguarde ~30s e clique em Atualizar para ver os novos dados.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Collaborators Tab ────────────────────────────────────────────────────────

function CollaboradoresTab() {
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
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {vdeskUsers.length === 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm">
                <strong>Sem dados VDESK ainda.</strong> Execute um sync histórico (separador Sync Manual) para descobrir os utilizadores activos.
              </span>
            </div>
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
              Estes utilizadores têm apontamentos VDESK mas não estão mapeados em{' '}
              <code className="bg-muted px-1 rounded text-[11px]">devops_collaborator_map</code>.
              O campo <strong>user_canonical</strong> ficará igual ao nome VDESK.
              Para calcular o gap corretamente, execute o SQL abaixo no Supabase Studio:
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
            <Users className="h-4 w-4" />
            Mapeamentos actuais ({mapRows.length})
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetchMap()} className="h-7 text-xs gap-1">
            <RefreshCw className="h-3 w-3" />
            Recarregar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>Canonical</TableHead>
                <TableHead>VDESK User</TableHead>
                <TableHead>DevOps Email</TableHead>
                <TableHead>TimeLog Name</TableHead>
                <TableHead className="w-20">Ativo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mapRows.length === 0
                ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                        Nenhum mapeamento encontrado.
                      </TableCell>
                    </TableRow>
                  )
                : mapRows.map(r => (
                    <TableRow key={r.id} className="text-xs">
                      <TableCell className="font-medium">{r.canonical_name ?? <span className="text-muted-foreground italic">—</span>}</TableCell>
                      <TableCell className={r.vdesk_user_name ? '' : 'text-muted-foreground italic'}>{r.vdesk_user_name ?? '—'}</TableCell>
                      <TableCell className={r.devops_email ? '' : 'text-muted-foreground italic'}>{r.devops_email ?? '—'}</TableCell>
                      <TableCell className={r.timelog_name ? '' : 'text-muted-foreground italic'}>{r.timelog_name ?? '—'}</TableCell>
                      <TableCell>
                        {r.is_active
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : <XCircle className="h-4 w-4 text-muted-foreground" />
                        }
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function TimelogHibridoDashboard() {
  const queryClient = useQueryClient();
  const { isAdmin: isAuthAdmin } = useAuth();
  const isHubAdmin = useHubIsAdmin();
  const isAdmin = isAuthAdmin || isHubAdmin;

  const [filters, setFilters] = useState<TimelogFilters>({
    dateFrom: iso90DaysAgo(),
    dateTo: isoToday(),
    status: '',
    userCanonical: '',
    taskId: '',
  });

  const { data: rows = [], isLoading, isFetching } = useTimelogUnificado(filters);
  const { data: syncRuns = [] } = useTimelogSyncRuns();
  const lastSync = syncRuns[0] ?? null;

  const users = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => r.user_canonical && set.add(r.user_canonical));
    return Array.from(set).sort();
  }, [rows]);

  const kpis = useMemo(() => {
    const totalVdesk  = rows.reduce((s, r) => s + r.minutes_vdesk, 0);
    const totalDevops = rows.reduce((s, r) => s + r.minutes_devops, 0);
    const totalGap    = rows.reduce((s, r) => s + r.gap_minutes, 0);
    const matchCount  = rows.filter(r => r.status === 'match').length;
    const matchPct    = rows.length > 0 ? Math.round((matchCount / rows.length) * 100) : 0;
    const gapTasks    = new Set(rows.filter(r => r.gap_minutes !== 0).map(r => r.task_id)).size;
    return { totalVdesk, totalDevops, totalGap, matchPct, matchCount, gapTasks, total: rows.length };
  }, [rows]);

  const counts = useMemo(() => ({
    match:       rows.filter(r => r.status === 'match').length,
    divergent:   rows.filter(r => r.status === 'divergent').length,
    only_vdesk:  rows.filter(r => r.status === 'only_vdesk').length,
    only_devops: rows.filter(r => r.status === 'only_devops').length,
  }), [rows]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['timelog-unificado'] });
    queryClient.invalidateQueries({ queryKey: ['timelog-sync-runs'] });
    queryClient.invalidateQueries({ queryKey: ['vdesk-distinct-users'] });
  };

  const setFilter = (key: keyof TimelogFilters, value: string) =>
    setFilters(prev => ({ ...prev, [key]: value }));

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-flag-gold/10 border border-flag-gold/20">
                <Clock className="h-5 w-5 text-flag-gold" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">TimeLog Híbrido</h1>
                <p className="text-xs text-muted-foreground">Consolidação VDESK ↔ Azure DevOps</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {lastSync && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={
                        lastSync.status === 'ok'
                          ? 'border-emerald-500/40 text-emerald-700 bg-emerald-500/5 cursor-default'
                          : 'border-amber-500/40 text-amber-700 bg-amber-500/5 cursor-default'
                      }
                    >
                      <Activity className="h-3 w-3 mr-1" />
                      Último sync {fmtDateTime(lastSync.started_at)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-xs">
                    <p>Status: <strong>{lastSync.status}</strong></p>
                    <p>Inseridos: {lastSync.rows_inserted} · Atualizados: {lastSync.rows_updated}</p>
                    <p>Origem: {lastSync.triggered_by}</p>
                    {lastSync.error_message && <p className="text-red-500">{lastSync.error_message}</p>}
                  </TooltipContent>
                </Tooltip>
              )}
              <Button
                variant="outline" size="sm"
                onClick={handleRefresh} disabled={isFetching}
                className="gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => exportCsv(rows)} disabled={rows.length === 0}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="VDESK Total"    value={fmtMinutes(kpis.totalVdesk)}  sub={`${kpis.total} registos`}            icon={Clock} />
          <KpiCard label="DevOps Total"   value={fmtMinutes(kpis.totalDevops)} sub="lançados no DevOps"                  icon={GitMerge}  variant="success" />
          <KpiCard label="Gap Acumulado"  value={fmtMinutes(kpis.totalGap)}    sub={`${kpis.gapTasks} tasks com desvio`} icon={AlertTriangle} variant={kpis.totalGap > 0 ? 'warning' : 'success'} />
          <KpiCard label="Match Rate"     value={`${kpis.matchPct}%`}          sub={`${kpis.matchCount} registos sync`}  icon={CheckCircle2} variant={kpis.matchPct >= 80 ? 'success' : kpis.matchPct >= 50 ? 'warning' : 'danger'} />
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="dados">
          <TabsList>
            <TabsTrigger value="dados"          className="gap-1.5"><Clock   className="h-3.5 w-3.5" />Dados</TabsTrigger>
            <TabsTrigger value="colaboradores"  className="gap-1.5"><Users   className="h-3.5 w-3.5" />Colaboradores</TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="sync"         className="gap-1.5"><Play    className="h-3.5 w-3.5" />Sync Manual</TabsTrigger>
            )}
          </TabsList>

          {/* ─ TAB: Dados ─ */}
          <TabsContent value="dados" className="space-y-4 mt-4">
            {/* Status pills */}
            <div className="flex flex-wrap gap-2">
              {(Object.entries(counts) as [TimelogStatus, number][]).map(([s, n]) => {
                const cfg = STATUS_CONFIG[s];
                const Icon = cfg.icon;
                return (
                  <button
                    key={s}
                    onClick={() => setFilter('status', filters.status === s ? '' : s)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all
                      ${filters.status === s ? cfg.color + ' ring-2 ring-offset-1' : cfg.color + ' opacity-70 hover:opacity-100'}`}
                  >
                    <Icon className="h-3 w-3" />{cfg.label}<span className="font-bold">{n}</span>
                  </button>
                );
              })}
              {filters.status && (
                <button
                  onClick={() => setFilter('status', '')}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border border-dashed text-muted-foreground hover:border-foreground transition-all"
                >
                  Limpar ×
                </button>
              )}
            </div>

            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground font-medium">De</label>
                    <Input type="date" value={filters.dateFrom ?? ''} onChange={e => setFilter('dateFrom', e.target.value)} className="h-8 text-sm w-36" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground font-medium">Até</label>
                    <Input type="date" value={filters.dateTo ?? ''} onChange={e => setFilter('dateTo', e.target.value)} className="h-8 text-sm w-36" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground font-medium">Utilizador</label>
                    <Select value={filters.userCanonical || '__all__'} onValueChange={v => setFilter('userCanonical', v === '__all__' ? '' : v)}>
                      <SelectTrigger className="h-8 text-sm w-44"><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos</SelectItem>
                        {users.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground font-medium">Task ID</label>
                    <Input type="number" placeholder="Ex: 12345" value={filters.taskId ?? ''} onChange={e => setFilter('taskId', e.target.value)} className="h-8 text-sm w-32" />
                  </div>
                  <Button variant="ghost" size="sm" className="text-muted-foreground h-8"
                    onClick={() => setFilters({ dateFrom: iso90DaysAgo(), dateTo: isoToday(), status: '', userCanonical: '', taskId: '' })}>
                    Limpar tudo
                  </Button>
                  <span className="ml-auto text-xs text-muted-foreground self-end pb-0.5">
                    {isFetching ? 'Carregando…' : `${rows.length} registos`}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="w-24">Task</TableHead>
                        <TableHead>Work Item</TableHead>
                        <TableHead className="w-28">Data</TableHead>
                        <TableHead>Utilizador</TableHead>
                        <TableHead className="text-right w-24">VDESK</TableHead>
                        <TableHead className="text-right w-24">DevOps</TableHead>
                        <TableHead className="text-right w-24">Gap</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                        <TableHead className="w-24">OS / Link</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading
                        ? Array.from({ length: 8 }).map((_, i) => (
                            <TableRow key={i}>
                              {Array.from({ length: 9 }).map((_, j) => (
                                <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                              ))}
                            </TableRow>
                          ))
                        : rows.length === 0
                        ? (
                            <TableRow>
                              <TableCell colSpan={9} className="text-center py-16 text-muted-foreground">
                                <Clock className="h-10 w-10 mx-auto mb-3 opacity-20" />
                                <p className="font-medium mb-1">Sem dados VDESK para este período.</p>
                                {isAdmin && (
                                  <p className="text-xs">Use o separador <strong>Sync Manual</strong> para importar o histórico.</p>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        : rows.map((row, idx) => (
                            <TableRow key={`${row.task_id}-${row.log_date}-${row.user_canonical}-${idx}`} className="text-sm">
                              <TableCell className="font-mono font-medium text-xs">#{row.task_id}</TableCell>
                              <TableCell className="max-w-xs">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="truncate block max-w-[220px] text-xs">
                                      {row.work_item_title ?? <span className="text-muted-foreground italic">—</span>}
                                    </span>
                                  </TooltipTrigger>
                                  {row.work_item_title && (
                                    <TooltipContent side="top" className="max-w-sm text-xs">
                                      {row.work_item_title}
                                      {row.work_item_state && <span className="ml-2 text-muted-foreground">({row.work_item_state})</span>}
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">
                                {new Date(row.log_date).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </TableCell>
                              <TableCell className="text-xs max-w-[160px] truncate">{row.user_canonical}</TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {row.minutes_vdesk > 0 ? fmtMinutes(row.minutes_vdesk) : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {row.minutes_devops > 0 ? fmtMinutes(row.minutes_devops) : <span className="text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell className={`text-right font-mono text-xs font-medium ${row.gap_minutes > 0 ? 'text-amber-600' : row.gap_minutes < 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                                {row.gap_minutes !== 0 ? fmtMinutes(row.gap_minutes) : '✓'}
                              </TableCell>
                              <TableCell><StatusBadge status={row.status} /></TableCell>
                              <TableCell className="text-xs">
                                <div className="flex items-center gap-1.5">
                                  {row.num_os_sample && <span className="font-mono text-muted-foreground text-[10px]">{row.num_os_sample}</span>}
                                  {row.work_item_url && (
                                    <a href={row.work_item_url} target="_blank" rel="noopener noreferrer"
                                      className="text-muted-foreground hover:text-foreground transition-colors">
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                    </TableBody>
                  </Table>
                </div>
                {rows.length >= 2000 && (
                  <div className="p-3 border-t text-center text-xs text-muted-foreground">
                    Mostrando os primeiros 2 000 registos. Afine os filtros para ver mais.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─ TAB: Colaboradores ─ */}
          <TabsContent value="colaboradores" className="mt-4">
            <CollaboradoresTab />
          </TabsContent>

          {/* ─ TAB: Sync Manual (admin only) ─ */}
          {isAdmin && (
            <TabsContent value="sync" className="mt-4 space-y-4">
              <AdminSyncPanel onSynced={handleRefresh} />

              {syncRuns.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm">Histórico de Syncs</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
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
                        {syncRuns.map(r => (
                          <TableRow key={r.id} className="text-xs">
                            <TableCell className="whitespace-nowrap">{fmtDateTime(r.started_at)}</TableCell>
                            <TableCell className="text-right">{r.rows_inserted}</TableCell>
                            <TableCell className="text-right">{r.rows_updated}</TableCell>
                            <TableCell>{r.triggered_by}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  r.status === 'ok'      ? 'text-emerald-700 border-emerald-500/30 bg-emerald-500/10' :
                                  r.status === 'running' ? 'text-blue-700 border-blue-500/30 bg-blue-500/10' :
                                  r.status === 'partial' ? 'text-amber-700 border-amber-500/30 bg-amber-500/10' :
                                                           'text-red-700 border-red-500/30 bg-red-500/10'
                                }
                              >
                                {r.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground max-w-[200px] truncate text-[11px]">
                              {r.error_message ?? '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
