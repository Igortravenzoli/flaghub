import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle, Search, ChevronLeft, ChevronRight, ArrowUpDown, Filter,
  TrendingDown, Users, BarChart3, Repeat
} from 'lucide-react';
import { TransbordoItem } from '@/hooks/useFabricaKpis';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--info))',
  'hsl(142, 71%, 45%)',
  'hsl(43, 85%, 46%)',
  'hsl(280, 65%, 60%)',
  'hsl(200, 80%, 50%)',
  'hsl(340, 75%, 55%)',
  'hsl(160, 60%, 45%)',
];

const stateColors: Record<string, string> = {
  'In Progress': 'bg-[hsl(var(--info))] text-white',
  'Active': 'bg-[hsl(var(--info))] text-white',
  'Em desenvolvimento': 'bg-[hsl(var(--info))] text-white',
  'Aguardando Teste': 'bg-rose-100 text-rose-700 border border-rose-300',
  'To Do': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'New': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'Done': 'bg-[hsl(var(--success))] text-white',
  'Closed': 'bg-[hsl(var(--success))] text-white',
  'Resolved': 'bg-[hsl(var(--success))] text-white',
};

type SortField = 'overflowCount' | 'title' | 'assigned_to_display' | 'state';
type SortDir = 'asc' | 'desc';

interface TransbordoTabProps {
  items: TransbordoItem[];
  transbordoPct: number | null;
  transbordoCount: number;
  realOverflowItemCount?: number;
  realOverflowCount?: number;
  realOverflowPct?: number | null;
  transbordoTotal: number;
  currentSprint: string | null;
  selectedSprint: string;
  isLoading: boolean;
}

function parseSprintLabel(label: string): { year: number; num: number } {
  const sMatch = label.match(/S(\d+)-(\d{4})/i);
  if (sMatch) return { year: parseInt(sMatch[2], 10), num: parseInt(sMatch[1], 10) };
  return { year: 0, num: 0 };
}

function KpiCard({ label, value, suffix, icon: Icon, accent, description, delay = 0, isLoading }: {
  label: string; value: number | string | null; suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string; description?: string; delay?: number; isLoading?: boolean;
}) {
  if (isLoading) {
    return <Card className="relative overflow-hidden"><div className="p-5"><Skeleton className="h-4 w-20 mb-3" /><Skeleton className="h-9 w-16 mb-1" /><Skeleton className="h-3 w-32" /></div></Card>;
  }
  return (
    <Card className="relative overflow-hidden group transition-all duration-300 hover:shadow-lg animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <div className={`absolute top-0 left-0 w-1 h-full ${accent || 'bg-primary'}`} />
      <div className="p-5 pl-6">
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-2 rounded-xl ${accent ? accent + '/10' : 'bg-primary/10'}`}>
            <Icon className={`h-4 w-4 ${accent ? accent.replace('bg-', 'text-') : 'text-primary'}`} />
          </div>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{label}</p>
        </div>
        <p className="text-3xl font-black text-foreground tracking-tight">
          {value ?? <span className="text-sm font-normal text-muted-foreground">—</span>}
          {suffix && <span className="text-lg font-semibold text-muted-foreground ml-1">{suffix}</span>}
        </p>
        {description && <p className="text-[11px] text-muted-foreground/70 mt-1.5">{description}</p>}
      </div>
    </Card>
  );
}

export function TransbordoTab({
  items,
  transbordoPct,
  transbordoCount,
  realOverflowItemCount = 0,
  realOverflowCount = 0,
  realOverflowPct = 0,
  transbordoTotal,
  currentSprint,
  selectedSprint,
  isLoading,
}: TransbordoTabProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>('overflowCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'warning'>('all');
  const PAGE_SIZE = 20;

  // KPI derivations
  const criticalCount = items.filter(i => i.overflowCount >= 3).length;
  const avgOverflow = items.length > 0 ? Math.round(items.reduce((s, i) => s + i.overflowCount, 0) / items.length * 10) / 10 : 0;

  // Top 10 by recurrence
  const top10 = useMemo(() =>
    [...items].sort((a, b) => b.overflowCount - a.overflowCount).slice(0, 10),
    [items]
  );

  // Transbordos por Sprint (replaces frequency distribution)
  const bySprint = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      for (const sp of item.sprintsOverflowed) {
        const label = sp.split('\\').pop() || sp;
        map[label] = (map[label] || 0) + 1;
      }
    }
    let rows = Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => {
        const pa = parseSprintLabel(a.name);
        const pb = parseSprintLabel(b.name);
        if (pa.year !== pb.year) return pa.year - pb.year;
        return pa.num - pb.num;
      });

    if (selectedSprint !== 'all') {
      const selectedLabel = selectedSprint.split('\\').pop() || selectedSprint;
      const ps = parseSprintLabel(selectedLabel);
      rows = rows.filter((r) => {
        const pr = parseSprintLabel(r.name);
        if (ps.year === 0 || pr.year === 0) return r.name === selectedLabel;
        if (pr.year !== ps.year) return false;
        return pr.num <= ps.num && pr.num >= Math.max(1, ps.num - 5);
      });
    } else {
      rows = rows.slice(-15);
    }

    return rows;
  }, [items, selectedSprint]);

  // By responsible
  const byResponsible = useMemo(() => {
    const map: Record<string, { count: number; totalOverflows: number }> = {};
    for (const item of items) {
      const name = item.assigned_to_display || 'Não atribuído';
      if (!map[name]) map[name] = { count: 0, totalOverflows: 0 };
      map[name].count++;
      map[name].totalOverflows += item.overflowCount;
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name: name.split(' ').slice(0, 2).join(' '), ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [items]);

  // By state
  const byState = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      const st = item.state || 'Desconhecido';
      map[st] = (map[st] || 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [items]);

  // Filtered & sorted items
  const processedItems = useMemo(() => {
    let result = [...items];
    
    if (filterSeverity === 'critical') result = result.filter(i => i.overflowCount >= 3);
    else if (filterSeverity === 'warning') result = result.filter(i => i.overflowCount >= 2 && i.overflowCount < 3);

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        [i.title, i.assigned_to_display, String(i.id), i.state, i.iteration_path]
          .some(v => v && String(v).toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'overflowCount': cmp = a.overflowCount - b.overflowCount; break;
        case 'title': cmp = (a.title || '').localeCompare(b.title || ''); break;
        case 'assigned_to_display': cmp = (a.assigned_to_display || '').localeCompare(b.assigned_to_display || ''); break;
        case 'state': cmp = (a.state || '').localeCompare(b.state || ''); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [items, search, sortField, sortDir, filterSeverity]);

  const totalPages = Math.max(1, Math.ceil(processedItems.length / PAGE_SIZE));
  const pagedItems = processedItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
    setPage(0);
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="text-xs font-semibold cursor-pointer hover:text-foreground select-none"
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortField === field ? 'text-primary' : 'text-muted-foreground/40'}`} />
      </div>
    </TableHead>
  );

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><div className="p-5"><Skeleton className="h-4 w-20 mb-3" /><Skeleton className="h-9 w-16" /></div></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Taxa de Migração"
          value={transbordoPct != null ? `${transbordoPct}%` : null}
          icon={AlertTriangle}
          accent={transbordoPct != null && transbordoPct > 50 ? 'bg-destructive' : 'bg-[hsl(43,85%,46%)]'}
          description={`${transbordoCount} de ${transbordoTotal} PBIs com troca de sprint`}
        />
        <KpiCard
          label="Transbordo Real"
          value={realOverflowItemCount}
          icon={TrendingDown}
          accent="bg-destructive"
          description={realOverflowPct != null ? `${realOverflowPct}% da carteira • ${realOverflowCount} evento(s)` : 'Sem dados'}
          delay={80}
        />
        <KpiCard
          label="Média de Transbordos"
          value={avgOverflow}
          suffix="×"
          icon={Repeat}
          accent="bg-[hsl(var(--info))]"
          description="Vezes médias que um PBI mudou de sprint"
          delay={160}
        />
        <KpiCard
          label="Críticos (≥3 migrações)"
          value={criticalCount}
          icon={BarChart3}
          accent="bg-primary"
          description={currentSprint ? `Sprint atual: ${currentSprint.split('\\').pop()}` : 'Todos os períodos'}
          delay={240}
        />
      </div>

      <Card className="border-border/70 bg-muted/20">
        <CardContent className="p-3 text-xs text-muted-foreground flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span><strong className="text-foreground">Migração de Sprint</strong>: qualquer troca de sprint detectada no histórico.</span>
          <span><strong className="text-foreground">Transbordo Real</strong>: migrações após o comprometimento inicial (migrações - 1).</span>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Transbordos por Sprint (replaces frequency) */}
        {bySprint.length > 0 && (
          <Card className="lg:col-span-2 animate-fade-in" style={{ animationDelay: '300ms' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Repeat className="h-4 w-4 text-primary" />Transbordos por Sprint
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={bySprint}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={10} stroke="hsl(var(--muted-foreground))" angle={-35} textAnchor="end" height={60} />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(v: number) => [`${v} PBIs`, 'Transbordos']}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {bySprint.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* By state pie */}
        {byState.length > 0 && (
          <Card className="animate-fade-in" style={{ animationDelay: '400ms' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />Por Estado Product Backlog Item
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={byState} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                    {byState.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 justify-center">
                {byState.map((s, idx) => (
                  <div key={s.name} className="flex items-center gap-1.5 text-xs">
                    <div className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }} />
                    <span className="text-muted-foreground">{s.name}</span>
                    <span className="font-semibold text-foreground">{s.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* By responsible chart */}
      {byResponsible.length > 0 && (
        <Card className="animate-fade-in" style={{ animationDelay: '450ms' }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />Transbordos por Responsável
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(180, byResponsible.length * 28)}>
              <BarChart data={byResponsible} layout="vertical" margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="name" fontSize={10} stroke="hsl(var(--muted-foreground))" width={90} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(v: number) => [`${v} PBIs`, 'Itens']}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}


      {/* Detail table */}
      <Card className="overflow-hidden animate-fade-in">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[hsl(43,85%,46%)]" />
              Itens Transbordados
            </h3>
            <p className="text-xs text-muted-foreground">{processedItems.length} itens encontrados</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex gap-1">
              {(['all', 'critical', 'warning'] as const).map(f => (
                <Badge
                  key={f}
                  variant={filterSeverity === f ? 'default' : 'outline'}
                  className="cursor-pointer text-xs transition-all"
                  onClick={() => { setFilterSeverity(f); setPage(0); }}
                >
                  {f === 'all' ? 'Todos' : f === 'critical' ? '≥3× Críticos' : '2× Atenção'}
                </Badge>
              ))}
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar PBI..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="overflow-auto max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-semibold w-16">ID</TableHead>
                <SortHeader field="title">Título</SortHeader>
                <SortHeader field="state">Status</SortHeader>
                <SortHeader field="assigned_to_display">Responsável</SortHeader>
                <SortHeader field="overflowCount">Transbordos</SortHeader>
                <TableHead className="text-xs font-semibold">Sprint Atual</TableHead>
                <TableHead className="text-xs font-semibold">Histórico de Sprints</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum item encontrado com os filtros aplicados.
                  </TableCell>
                </TableRow>
              ) : pagedItems.map(item => (
                <TableRow key={item.id} className={`hover:bg-muted/30 transition-colors ${item.overflowCount >= 3 ? 'bg-destructive/5' : ''}`}>
                  <TableCell className="font-mono text-xs">
                    {item.web_url ? (
                      <a href={item.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{item.id}</a>
                    ) : item.id}
                  </TableCell>
                  <TableCell className="text-sm max-w-[280px]">
                    <span className="line-clamp-2">{item.title || '—'}</span>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs font-mono ${stateColors[item.state || ''] || ''}`}>{item.state || '—'}</Badge>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{item.assigned_to_display || '—'}</TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={item.overflowCount >= 3 ? 'destructive' : item.overflowCount >= 2 ? 'default' : 'secondary'}
                      className="text-xs font-bold"
                    >
                      {item.overflowCount}×
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {item.iteration_path ? item.iteration_path.split('\\').pop() : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[250px]">
                      {item.sprintsOverflowed.map((sp, idx) => {
                        const label = sp.split('\\').pop() || sp;
                        const isCurrent = sp === item.iteration_path;
                        return (
                          <Badge
                            key={`${sp}-${idx}`}
                            variant={isCurrent ? 'default' : 'outline'}
                            className="text-[10px] px-1.5 py-0 whitespace-nowrap"
                          >
                            {label}
                          </Badge>
                        );
                      })}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {processedItems.length > PAGE_SIZE && (
          <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>{processedItems.length} itens • Página {page + 1} de {totalPages}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
