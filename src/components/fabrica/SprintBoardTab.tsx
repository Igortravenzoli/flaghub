import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { LayoutGrid, TrendingUp, AlertTriangle, ArrowUpDown } from 'lucide-react';
import type { FabricaItem } from '@/hooks/useFabricaKpis';

interface SprintBoardTabProps {
  allItems: FabricaItem[];
  sortedSprints: string[];
  isLoading: boolean;
}

const STATE_ORDER = ['New', 'To Do', 'Em desenvolvimento', 'In Progress', 'Active', 'Aguardando Teste', 'Em Teste', 'Aguardando Deploy', 'Done', 'Closed', 'Resolved'];
const STATE_COLORS: Record<string, string> = {
  'New': 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  'To Do': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'Em desenvolvimento': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  'Active': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  'Aguardando Teste': 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
  'Em Teste': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200',
  'Aguardando Deploy': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  'Done': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200',
  'Closed': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200',
  'Resolved': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200',
};

const CHART_COLORS: Record<string, string> = {
  'New': '#94a3b8',
  'To Do': '#f59e0b',
  'Em desenvolvimento': '#3b82f6',
  'In Progress': '#3b82f6',
  'Active': '#3b82f6',
  'Aguardando Teste': '#f43f5e',
  'Em Teste': '#a855f7',
  'Aguardando Deploy': '#10b981',
  'Done': '#22c55e',
  'Closed': '#22c55e',
  'Resolved': '#22c55e',
};

type TypeFilter = 'all' | 'pbi_story' | 'task' | 'bug';
type SortBy = 'sprint-desc' | 'sprint-asc' | 'total-desc' | 'total-asc';

function extractSprintLabel(path: string): string {
  return path.split('\\').pop() || path;
}

export function SprintBoardTab({ allItems, sortedSprints, isLoading }: SprintBoardTabProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('pbi_story');
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [sortBy, setSortBy] = useState<SortBy>('sprint-desc');

  // Filter items by type
  const filteredItems = useMemo(() => {
    switch (typeFilter) {
      case 'pbi_story': return allItems.filter(i => i.work_item_type === 'Product Backlog Item' || i.work_item_type === 'User Story');
      case 'task': return allItems.filter(i => i.work_item_type === 'Task');
      case 'bug': return allItems.filter(i => i.work_item_type === 'Bug');
      default: return allItems;
    }
  }, [allItems, typeFilter]);

  // Discover all states present
  const allStates = useMemo(() => {
    const stateSet = new Set<string>();
    for (const item of filteredItems) {
      if (item.state) stateSet.add(item.state);
    }
    return [...stateSet].sort((a, b) => {
      const ia = STATE_ORDER.indexOf(a);
      const ib = STATE_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [filteredItems]);

  // Build pivot: sprint → state → count
  const pivot = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const item of filteredItems) {
      const sprint = item.iteration_path || '(Sem Sprint)';
      const state = item.state || '(Sem Estado)';
      if (!map.has(sprint)) map.set(sprint, new Map());
      const stateMap = map.get(sprint)!;
      stateMap.set(state, (stateMap.get(state) || 0) + 1);
    }
    return map;
  }, [filteredItems]);

  // Sort sprints based on sortBy
  const displaySprints = useMemo(() => {
    const sprints = sortedSprints.filter(sp => pivot.has(sp));
    const noSprint = pivot.has('(Sem Sprint)') ? ['(Sem Sprint)'] : [];
    const baseSprints = [...sprints, ...noSprint];

    const getTotal = (sp: string) => {
      const m = pivot.get(sp);
      if (!m) return 0;
      let t = 0;
      for (const c of m.values()) t += c;
      return t;
    };

    switch (sortBy) {
      case 'sprint-asc':
        return baseSprints;
      case 'sprint-desc':
        return [...baseSprints].reverse();
      case 'total-desc':
        return [...baseSprints].sort((a, b) => getTotal(b) - getTotal(a));
      case 'total-asc':
        return [...baseSprints].sort((a, b) => getTotal(a) - getTotal(b));
      default:
        return baseSprints;
    }
  }, [sortedSprints, pivot, sortBy]);

  // Totals row
  const totalsByState = useMemo(() => {
    const totals = new Map<string, number>();
    for (const [, stateMap] of pivot) {
      for (const [state, count] of stateMap) {
        totals.set(state, (totals.get(state) || 0) + count);
      }
    }
    return totals;
  }, [pivot]);

  const grandTotal = useMemo(() => {
    let sum = 0;
    for (const count of totalsByState.values()) sum += count;
    return sum;
  }, [totalsByState]);

  // KPI summaries
  const kpis = useMemo(() => {
    const sprintCount = displaySprints.length;
    const avgPerSprint = sprintCount > 0 ? Math.round(grandTotal / sprintCount * 10) / 10 : 0;
    const inProgressStates = new Set(['In Progress', 'Active', 'Em desenvolvimento']);
    const doneStates = new Set(['Done', 'Closed', 'Resolved']);
    const totalInProgress = [...totalsByState.entries()].filter(([s]) => inProgressStates.has(s)).reduce((a, [, v]) => a + v, 0);
    const totalDone = [...totalsByState.entries()].filter(([s]) => doneStates.has(s)).reduce((a, [, v]) => a + v, 0);
    const deliveryRate = grandTotal > 0 ? Math.round((totalDone / grandTotal) * 100) : 0;
    return { sprintCount, avgPerSprint, totalInProgress, totalDone, deliveryRate };
  }, [displaySprints, grandTotal, totalsByState]);

  // Chart data
  const chartData = useMemo(() =>
    displaySprints.map(sp => {
      const stateMap = pivot.get(sp) || new Map();
      const row: Record<string, any> = { sprint: extractSprintLabel(sp) };
      let total = 0;
      for (const state of allStates) {
        const count = stateMap.get(state) || 0;
        row[state] = count;
        total += count;
      }
      row['Total'] = total;
      return row;
    }),
    [displaySprints, pivot, allStates]
  );

  if (isLoading) return <div className="text-center py-12 text-muted-foreground animate-pulse">Carregando Sprint Board…</div>;

  return (
    <div className="space-y-4">
      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground font-semibold uppercase">Total Itens</p>
          <p className="text-2xl font-black">{grandTotal}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground font-semibold uppercase">Sprints</p>
          <p className="text-2xl font-black">{kpis.sprintCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground font-semibold uppercase">Média / Sprint</p>
          <p className="text-2xl font-black">{kpis.avgPerSprint}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground font-semibold uppercase">Em Progresso</p>
          <p className="text-2xl font-black text-blue-500">{kpis.totalInProgress}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground font-semibold uppercase">Taxa Entrega</p>
          <p className="text-2xl font-black">
            <span className={kpis.deliveryRate >= 70 ? 'text-green-500' : kpis.deliveryRate >= 40 ? 'text-amber-500' : 'text-red-500'}>
              {kpis.deliveryRate}%
            </span>
          </p>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="pbi_story">PBI / Story</SelectItem>
            <SelectItem value="task">Task</SelectItem>
            <SelectItem value="bug">Bug</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1 ml-auto">
          <Badge
            variant={viewMode === 'table' ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => setViewMode('table')}
          >
            <LayoutGrid className="h-3 w-3 mr-1" /> Tabela
          </Badge>
          <Badge
            variant={viewMode === 'chart' ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => setViewMode('chart')}
          >
            <TrendingUp className="h-3 w-3 mr-1" /> Gráfico
          </Badge>
        </div>
      </div>

      {viewMode === 'table' ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-bold text-xs min-w-[180px] sticky left-0 bg-muted/50 z-10">Sprint</TableHead>
                  {allStates.map(state => (
                    <TableHead key={state} className="text-xs text-center min-w-[80px]">
                      <Badge variant="outline" className={`text-[10px] ${STATE_COLORS[state] || ''}`}>
                        {state}
                      </Badge>
                    </TableHead>
                  ))}
                  <TableHead className="text-xs text-center font-bold min-w-[80px]">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displaySprints.map((sp, idx) => {
                  const stateMap = pivot.get(sp) || new Map();
                  let rowTotal = 0;
                  for (const count of stateMap.values()) rowTotal += count;
                  return (
                    <TableRow key={sp} className={idx % 2 === 0 ? '' : 'bg-muted/20'}>
                      <TableCell className="font-medium text-xs sticky left-0 bg-background z-10">
                        {extractSprintLabel(sp)}
                      </TableCell>
                      {allStates.map(state => {
                        const count = stateMap.get(state) || 0;
                        return (
                          <TableCell key={state} className="text-center text-sm font-mono">
                            {count > 0 ? (
                              <span className="font-semibold">{count}</span>
                            ) : (
                              <span className="text-muted-foreground/30">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center text-sm font-mono font-bold">{rowTotal}</TableCell>
                    </TableRow>
                  );
                })}
                {/* Totals Row */}
                <TableRow className="bg-muted/60 border-t-2 border-border font-bold">
                  <TableCell className="font-bold text-xs sticky left-0 bg-muted/60 z-10">Total Geral</TableCell>
                  {allStates.map(state => (
                    <TableCell key={state} className="text-center text-sm font-mono font-bold">
                      {totalsByState.get(state) || 0}
                    </TableCell>
                  ))}
                  <TableCell className="text-center text-sm font-mono font-black">{grandTotal}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <CardHeader className="px-0 pt-0 pb-3">
            <CardTitle className="text-sm">Distribuição por Sprint × Estado</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <ResponsiveContainer width="100%" height={Math.max(300, displaySprints.length * 40)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="sprint" width={100} tick={{ fontSize: 10 }} />
                <RechartsTooltip
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                {allStates.map(state => (
                  <Bar
                    key={state}
                    dataKey={state}
                    stackId="a"
                    fill={CHART_COLORS[state] || '#64748b'}
                    name={state}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Trend insight */}
      {displaySprints.length >= 3 && (
        <Card className="p-3 border-l-4 border-l-blue-500">
          <div className="flex items-center gap-2 text-xs">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <span className="text-muted-foreground">
              Últimas 3 sprints: média de{' '}
              <span className="font-bold text-foreground">
                {Math.round(
                  displaySprints.slice(-3).reduce((sum, sp) => {
                    const m = pivot.get(sp);
                    let t = 0;
                    if (m) for (const c of m.values()) t += c;
                    return sum + t;
                  }, 0) / 3
                )}
              </span>{' '}
              itens/sprint
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
