import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Clock, Download, RefreshCw, AlertTriangle, CheckCircle2,
  GitMerge, ExternalLink, Minus, Activity,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useTimelogUnificado,
  useTimelogSyncRuns,
  type TimelogFilters,
  type TimelogStatus,
  type TimelogUnificadoRow,
} from '@/hooks/useTimelogUnificado';

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

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Status configuration ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TimelogStatus, { label: string; color: string; icon: React.ElementType }> = {
  match:       { label: 'Match',        color: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30', icon: CheckCircle2 },
  divergent:   { label: 'Divergente',   color: 'bg-amber-500/15 text-amber-700 border-amber-500/30',     icon: AlertTriangle },
  only_vdesk:  { label: 'Só VDESK',     color: 'bg-blue-500/15 text-blue-700 border-blue-500/30',         icon: Minus },
  only_devops: { label: 'Só DevOps',    color: 'bg-purple-500/15 text-purple-700 border-purple-500/30',   icon: GitMerge },
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
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  variant?: 'default' | 'success' | 'warning' | 'danger';
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function TimelogHibridoDashboard() {
  const queryClient = useQueryClient();

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

  // Distinct users for filter dropdown
  const users = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => r.user_canonical && set.add(r.user_canonical));
    return Array.from(set).sort();
  }, [rows]);

  // KPI aggregates
  const kpis = useMemo(() => {
    const totalVdesk   = rows.reduce((s, r) => s + r.minutes_vdesk, 0);
    const totalDevops  = rows.reduce((s, r) => s + r.minutes_devops, 0);
    const totalGap     = rows.reduce((s, r) => s + r.gap_minutes, 0);
    const matchCount   = rows.filter(r => r.status === 'match').length;
    const matchPct     = rows.length > 0 ? Math.round((matchCount / rows.length) * 100) : 0;
    const gapTasks     = new Set(rows.filter(r => r.gap_minutes !== 0).map(r => r.task_id)).size;
    return { totalVdesk, totalDevops, totalGap, matchPct, matchCount, gapTasks, total: rows.length };
  }, [rows]);

  // Status breakdown counts
  const counts = useMemo(() => ({
    match:       rows.filter(r => r.status === 'match').length,
    divergent:   rows.filter(r => r.status === 'divergent').length,
    only_vdesk:  rows.filter(r => r.status === 'only_vdesk').length,
    only_devops: rows.filter(r => r.status === 'only_devops').length,
  }), [rows]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['timelog-unificado'] });
    queryClient.invalidateQueries({ queryKey: ['timelog-sync-runs'] });
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
                <p className="text-xs text-muted-foreground">
                  Consolidação VDESK ↔ Azure DevOps
                </p>
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
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isFetching}
                className="gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportCsv(rows)}
                disabled={rows.length === 0}
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
          <KpiCard
            label="VDESK Total"
            value={fmtMinutes(kpis.totalVdesk)}
            sub={`${kpis.total} registos`}
            icon={Clock}
          />
          <KpiCard
            label="DevOps Total"
            value={fmtMinutes(kpis.totalDevops)}
            sub="lançados no DevOps"
            icon={GitMerge}
            variant="success"
          />
          <KpiCard
            label="Gap Acumulado"
            value={fmtMinutes(kpis.totalGap)}
            sub={`${kpis.gapTasks} tasks com desvio`}
            icon={AlertTriangle}
            variant={kpis.totalGap > 0 ? 'warning' : 'success'}
          />
          <KpiCard
            label="Match Rate"
            value={`${kpis.matchPct}%`}
            sub={`${kpis.matchCount} registos sincronizados`}
            icon={CheckCircle2}
            variant={kpis.matchPct >= 80 ? 'success' : kpis.matchPct >= 50 ? 'warning' : 'danger'}
          />
        </div>

        {/* ── Status breakdown pills ── */}
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
                <Icon className="h-3 w-3" />
                {cfg.label}
                <span className="font-bold">{n}</span>
              </button>
            );
          })}
          {filters.status && (
            <button
              onClick={() => setFilter('status', '')}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border border-dashed text-muted-foreground hover:border-foreground transition-all"
            >
              Limpar filtro ×
            </button>
          )}
        </div>

        {/* ── Filters ── */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">De</label>
                <Input
                  type="date"
                  value={filters.dateFrom ?? ''}
                  onChange={e => setFilter('dateFrom', e.target.value)}
                  className="h-8 text-sm w-36"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">Até</label>
                <Input
                  type="date"
                  value={filters.dateTo ?? ''}
                  onChange={e => setFilter('dateTo', e.target.value)}
                  className="h-8 text-sm w-36"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">Utilizador</label>
                <Select
                  value={filters.userCanonical || '__all__'}
                  onValueChange={v => setFilter('userCanonical', v === '__all__' ? '' : v)}
                >
                  <SelectTrigger className="h-8 text-sm w-44">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground font-medium">Task ID</label>
                <Input
                  type="number"
                  placeholder="Ex: 12345"
                  value={filters.taskId ?? ''}
                  onChange={e => setFilter('taskId', e.target.value)}
                  className="h-8 text-sm w-32"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-8"
                onClick={() =>
                  setFilters({
                    dateFrom: iso90DaysAgo(),
                    dateTo: isoToday(),
                    status: '',
                    userCanonical: '',
                    taskId: '',
                  })
                }
              >
                Limpar tudo
              </Button>
              <span className="ml-auto text-xs text-muted-foreground self-end pb-0.5">
                {isFetching ? 'Carregando…' : `${rows.length} registos`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* ── Table ── */}
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
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : rows.length === 0
                    ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                            <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            Nenhum registo encontrado para os filtros seleccionados.
                          </TableCell>
                        </TableRow>
                      )
                    : rows.map((row, idx) => (
                        <TableRow key={`${row.task_id}-${row.log_date}-${row.user_canonical}-${idx}`} className="text-sm">
                          <TableCell className="font-mono font-medium text-xs">
                            #{row.task_id}
                          </TableCell>
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
                                  {row.work_item_state && (
                                    <span className="ml-2 text-muted-foreground">({row.work_item_state})</span>
                                  )}
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(row.log_date).toLocaleDateString('pt-PT', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                            })}
                          </TableCell>
                          <TableCell className="text-xs max-w-[160px] truncate">
                            {row.user_canonical}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.minutes_vdesk > 0 ? fmtMinutes(row.minutes_vdesk) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.minutes_devops > 0 ? fmtMinutes(row.minutes_devops) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-xs font-medium ${row.gap_minutes > 0 ? 'text-amber-600' : row.gap_minutes < 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                            {row.gap_minutes !== 0 ? fmtMinutes(row.gap_minutes) : '✓'}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={row.status} />
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1.5">
                              {row.num_os_sample && (
                                <span className="font-mono text-muted-foreground text-[10px]">
                                  {row.num_os_sample}
                                </span>
                              )}
                              {row.work_item_url && (
                                <a
                                  href={row.work_item_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
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
      </div>
    </div>
  );
}
