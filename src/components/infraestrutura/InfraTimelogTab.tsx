import { useMemo, useState } from 'react';
import {
  useInfraTimelog, aggregateInfraTimelog, INFRA_TIMELOG_DEFAULT_COLLABS,
} from '@/hooks/useInfraTimelog';
import { InfraItem } from '@/hooks/useInfraestruturaKpis';
import { HoursRankingCard } from '@/components/timelog/HoursRankingCard';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Timer, Users, ListChecks, CalendarClock } from 'lucide-react';

// Aba Timelog do setor Infraestrutura — reaproveita o pipeline da Fábrica
// (devops_time_logs + rpc_devops_timelog_agg + HoursRankingCard); a única
// diferença é o filtro de colaboradores, que vem marcado apenas com Igor e
// Rodolfo por padrão.

const COLLAB_CHIPS = INFRA_TIMELOG_DEFAULT_COLLABS.map((key) => ({
  key,
  label: key.charAt(0).toUpperCase() + key.slice(1),
}));

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return '—'; }
}

export function InfraTimelogTab({ dateFrom, dateTo, items }: {
  dateFrom?: Date;
  dateTo?: Date;
  items: InfraItem[];
}) {
  const [activeCollabs, setActiveCollabs] = useState<Set<string>>(
    () => new Set(INFRA_TIMELOG_DEFAULT_COLLABS),
  );

  const workItemIds = useMemo(
    () => items.map((i) => i.id).filter((id): id is number => id != null),
    [items],
  );

  const { data, isLoading, isError, refetch } = useInfraTimelog(dateFrom, dateTo, workItemIds);

  const titleById = useMemo(() => {
    const map = new Map<number, string | null>();
    for (const item of items) {
      if (item.id != null) map.set(item.id, item.title ?? null);
    }
    for (const task of data?.childTasks ?? []) {
      if (!map.has(task.id)) map.set(task.id, task.title);
    }
    return map;
  }, [items, data?.childTasks]);

  const agg = useMemo(
    () => aggregateInfraTimelog(data?.rows ?? [], activeCollabs, titleById),
    [data?.rows, activeCollabs, titleById],
  );

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  function toggleCollab(key: string) {
    setActiveCollabs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-primary" />
          <h2 className="text-base font-bold tracking-tight uppercase">Timelog Infra</h2>
          <span className="text-[11px] text-muted-foreground">apontamentos DevOps nos itens do setor</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[11px] text-muted-foreground mr-1">Colaboradores:</span>
          {COLLAB_CHIPS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleCollab(key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activeCollabs.has(key)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted/40'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Horas no período', value: `${agg.totalHoras}h`, icon: Timer, color: '#3b82f6' },
          { label: 'Apontamentos', value: agg.apontamentos, icon: CalendarClock, color: '#8b5cf6' },
          { label: 'Itens com horas', value: agg.itensComApontamento, icon: ListChecks, color: '#10b981' },
          { label: 'Colaboradores ativos', value: agg.colaboradoresAtivos.length, icon: Users, color: '#f59e0b' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 rounded-md" style={{ background: `${color}15` }}>
                <Icon className="h-3 w-3" style={{ color }} />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
            </div>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <span className="text-2xl font-bold font-mono" style={{ color }}>{value}</span>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <HoursRankingCard
          title="Horas por colaborador"
          icon={Users}
          data={agg.porColaborador}
          isLoading={isLoading}
          emptyMessage="Nenhum apontamento de Igor/Rodolfo no período"
          summaryBadge={agg.totalHoras > 0 ? `${agg.totalHoras}h registradas` : undefined}
        />
        <HoursRankingCard
          title="Horas por item de infra"
          icon={ListChecks}
          data={agg.porItem}
          isLoading={isLoading}
          emptyMessage="Nenhum item de infra com horas no período"
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Apontamentos detalhados</CardTitle>
          <p className="text-xs text-muted-foreground">
            {agg.detalhe.length} registro{agg.detalhe.length !== 1 ? 's' : ''} · agregado por item × colaborador no período
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : agg.detalhe.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum apontamento no escopo atual — confira o período/sprint e se os colaboradores estão marcados.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b border-border">
                <tr className="text-muted-foreground text-[11px]">
                  <th className="py-2 pl-4 pr-3 text-left font-medium">Item</th>
                  <th className="py-2 px-3 text-left font-medium">Título</th>
                  <th className="py-2 px-3 text-left font-medium">Colaborador</th>
                  <th className="py-2 px-3 text-right font-medium">Horas</th>
                  <th className="py-2 px-4 text-left font-medium">Último apontamento</th>
                </tr>
              </thead>
              <tbody>
                {agg.detalhe.map((row) => (
                  <tr key={`${row.work_item_id}-${row.user_name}`} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pl-4 pr-3 font-mono font-semibold text-primary">#{row.work_item_id}</td>
                    <td className="py-2 px-3 max-w-[320px] truncate">{row.title ?? '—'}</td>
                    <td className="py-2 px-3">{row.user_name}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold">
                      {(Math.round((row.total_minutes / 60) * 10) / 10)}h
                    </td>
                    <td className="py-2 px-4 text-muted-foreground">{fmtDate(row.max_log_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
