import { useMemo, useState } from 'react';
import { SectorLayout } from '@/components/setores/SectorLayout';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn, ColumnFilter } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { PbiHealthBadge } from '@/components/pbi/PbiHealthBadge';
import { useComercialKpis, ComercialClient, ClientStatusFilter } from '@/hooks/useComercialKpis';
import { useDevopsOperationalQueue } from '@/hooks/useDevopsOperationalQueue';
import { usePbiHealthBatch } from '@/hooks/usePbiHealthBatch';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import { useDashboardExport } from '@/hooks/useDashboardExport';
import { UserCheck, ShieldBan, HeartPulse, AlertTriangle, Layers, MoreHorizontal, Eye, EyeOff, Users, CalendarDays, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getDateBoundsFromItems } from '@/lib/dateBounds';
import type { Integration } from '@/components/setores/SectorIntegrations';
import MovimentacaoTab from '@/components/comercial/MovimentacaoTab';
import { PesquisaTab } from '@/components/comercial/PesquisaTab';
import { PipeDriveTab } from '@/components/comercial/PipeDriveTab';
import MetasTab from '@/components/comercial/MetasTab';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { useHubAreas } from '@/hooks/useHubAreas';
import { useHubIsAdmin } from '@/hooks/useHubPermissions';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

// ── Windows-style drilldown calendar ─────────────────────────────
const CAL_MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const CAL_MONTHS_ABBR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'] as const;
const CAL_WEEKDAYS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
type CalLevel = 'day' | 'month' | 'year';

function ComercialCalendarPicker({
  dateFrom,
  dateTo,
  preset,
  onPresetChange,
  onCustomRange,
  onAfterSelect,
  currentYear,
}: {
  dateFrom?: Date;
  dateTo?: Date;
  preset: string;
  onPresetChange: (p: string) => void;
  onCustomRange: (from: Date, to: Date) => void;
  onAfterSelect?: () => void;
  currentYear: number;
}) {
  const today = new Date();
  const [level, setLevel] = useState<CalLevel>('month');
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [pendingMonths, setPendingMonths] = useState<Set<string>>(new Set());

  const inRange = (d: Date) => !!dateFrom && !!dateTo && d >= dateFrom && d <= dateTo;

  const viewYear = viewDate.getFullYear();

  const monthKey = (yr: number, mo: number) => `${yr}-${mo}`;

  // ── Multi-select helpers ──────────────────────────────────────
  function toggleMonth(yr: number, mo: number) {
    const key = monthKey(yr, mo);
    setPendingMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyMonths() {
    if (pendingMonths.size === 0) return;
    const sorted = Array.from(pendingMonths)
      .map(k => { const [y, m] = k.split('-').map(Number); return { y, m }; })
      .sort((a, b) => a.y !== b.y ? a.y - b.y : a.m - b.m);
    const first = sorted[0], last = sorted[sorted.length - 1];
    onCustomRange(
      new Date(first.y, first.m, 1, 0, 0, 0),
      new Date(last.y, last.m + 1, 0, 23, 59, 59),
    );
    setPendingMonths(new Set());
    onAfterSelect?.();
  }

  function clearPending() { setPendingMonths(new Set()); }

  function selectYear(yr: number) {
    if (yr === currentYear) {
      onPresetChange('1y');
    } else {
      onCustomRange(new Date(yr, 0, 1), new Date(yr, 11, 31, 23, 59, 59));
    }
    setPendingMonths(new Set());
    setViewDate(new Date(yr, 0, 1));
    setLevel('month');
    onAfterSelect?.();
  }

  function selectQuarter(q: number) {
    const startMo = (q - 1) * 3;
    const keys = [0, 1, 2].map(i => monthKey(viewYear, startMo + i));
    const allIn = keys.every(k => pendingMonths.has(k));
    setPendingMonths(prev => {
      const next = new Set(prev);
      keys.forEach(k => allIn ? next.delete(k) : next.add(k));
      return next;
    });
  }

  function isQuarterActive(q: number) {
    const startMo = (q - 1) * 3;
    return [0, 1, 2].every(i => pendingMonths.has(monthKey(viewYear, startMo + i)));
  }

  // ─── Day view ───────────────────────────────────────────────────
  const renderDayView = () => {
    const yr = viewDate.getFullYear(), mo = viewDate.getMonth();
    const lastDay = new Date(yr, mo + 1, 0).getDate();
    const startDow = (new Date(yr, mo, 1).getDay() + 6) % 7;
    const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: lastDay }, (_, i) => i + 1)];
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    return (
      <div className="mt-2">
        <div className="grid grid-cols-7 mb-1">
          {CAL_WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-0.5">{d}</div>
          ))}
        </div>
        <div className="space-y-0.5">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-0.5">
              {week.map((day, di) => {
                if (!day) return <div key={di} />;
                const d = new Date(yr, mo, day);
                const sel = inRange(d);
                const isToday = d.toDateString() === today.toDateString();
                return (
                  <button key={di} type="button"
                    onClick={() => { onCustomRange(new Date(yr, mo, day, 0, 0, 0), new Date(yr, mo, day, 23, 59, 59)); onAfterSelect?.(); }}
                    className={`h-7 w-full rounded text-xs transition-colors font-mono
                      ${sel ? 'bg-primary text-primary-foreground font-semibold' :
                        isToday ? 'ring-1 ring-primary text-primary font-semibold hover:bg-muted' :
                        'text-foreground hover:bg-muted'}`}
                  >{day}</button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── Month view ─────────────────────────────────────────────────
  const renderMonthView = () => {
    const yr = viewDate.getFullYear();
    const hasPending = pendingMonths.size > 0;
    return (
      <div className="mt-2 space-y-2">
        <div className="grid grid-cols-4 gap-1">
          {CAL_MONTHS.map((m, idx) => {
            const pending = pendingMonths.has(monthKey(yr, idx));
            const isCurrentMonth = yr === today.getFullYear() && idx === today.getMonth();
            return (
              <button key={m} type="button"
                onClick={() => toggleMonth(yr, idx)}
                className={`py-2 rounded text-xs font-medium border transition-colors
                  ${pending ? 'bg-primary text-primary-foreground border-primary' :
                    isCurrentMonth ? 'border-primary/50 text-primary bg-primary/5 hover:bg-primary/10' :
                    'bg-background border-border text-foreground hover:bg-muted'}`}
              >{m}</button>
            );
          })}
        </div>
        {hasPending && (
          <div className="flex items-center gap-2 pt-1 border-t border-border">
            <button type="button" onClick={applyMonths}
              className="flex-1 py-1.5 rounded text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              Aplicar ({pendingMonths.size} {pendingMonths.size === 1 ? 'mês' : 'meses'})
            </button>
            <button type="button" onClick={clearPending}
              className="px-3 py-1.5 rounded text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors">
              Limpar
            </button>
          </div>
        )}
      </div>
    );
  };

  // ─── Year view ──────────────────────────────────────────────────
  const renderYearView = () => {
    const decStart = Math.floor(viewDate.getFullYear() / 12) * 12;
    return (
      <div className="grid grid-cols-4 gap-1 mt-2">
        {Array.from({ length: 12 }, (_, i) => decStart + i).map(yr => {
          const sel = !!dateFrom && dateFrom.getFullYear() === yr &&
            !!dateTo && dateTo.getFullYear() === yr && dateFrom.getMonth() === 0 && dateTo.getMonth() === 11;
          const isCurrent = yr === today.getFullYear();
          return (
            <button key={yr} type="button"
              onClick={() => selectYear(yr)}
              title={`Selecionar ano ${yr}`}
              className={`py-2 rounded text-xs border transition-colors
                ${sel ? 'bg-primary text-primary-foreground border-primary font-semibold' :
                  isCurrent ? 'border-primary/50 text-primary bg-primary/5 font-semibold hover:bg-primary/10' :
                  'bg-background border-border text-foreground hover:bg-muted'}`}
            >{yr}</button>
          );
        })}
      </div>
    );
  };

  const headerLabel = () => {
    if (level === 'day') return `${CAL_MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
    if (level === 'month') return String(viewDate.getFullYear());
    const ds = Math.floor(viewDate.getFullYear() / 12) * 12;
    return `${ds} – ${ds + 11}`;
  };

  const handlePrev = () => {
    if (level === 'day') setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else if (level === 'month') setViewDate(d => new Date(d.getFullYear() - 1, 0, 1));
    else setViewDate(d => new Date(d.getFullYear() - 12, 0, 1));
  };
  const handleNext = () => {
    if (level === 'day') setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else if (level === 'month') setViewDate(d => new Date(d.getFullYear() + 1, 0, 1));
    else setViewDate(d => new Date(d.getFullYear() + 12, 0, 1));
  };
  const handleHeaderClick = () => {
    if (level === 'day') setLevel('month');
    else if (level === 'month') setLevel('year');
  };

  const btnQ = (q: number) => {
    const active = isQuarterActive(q);
    return (
      <button key={q} type="button"
        onClick={() => selectQuarter(q)}
        title={`${['Jan–Mar','Abr–Jun','Jul–Set','Out–Dez'][q - 1]} ${viewYear}`}
        className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors
          ${active ? 'bg-primary text-primary-foreground border-primary' :
          'border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}
      >Q{q}</button>
    );
  };

  return (
    <div className="rounded-lg border bg-card px-3 py-2.5 space-y-0">
      {/* ─ Linha 1: nav + label + Q1-Q4 + actions ─ */}
      <div className="flex items-center gap-1 select-none">
        <button type="button" onClick={handlePrev}
          className="h-7 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground text-base leading-none flex-shrink-0"
        >‹</button>

        <button type="button" onClick={handleHeaderClick}
          className={`px-2 py-1 rounded text-sm font-semibold transition-colors hover:bg-muted min-w-[90px] text-center flex-shrink-0
            ${level === 'year' ? 'pointer-events-none' : 'cursor-pointer'}`}
        >{headerLabel()}</button>

        <button type="button" onClick={handleNext}
          className="h-7 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground text-base leading-none flex-shrink-0"
        >›</button>

        <div className="w-px h-4 bg-border mx-1 flex-shrink-0" />

        {/* Q1-Q4 */}
        <div className="flex gap-1 flex-shrink-0">
          {[1, 2, 3, 4].map(q => btnQ(q))}
        </div>

      </div>

      {/* ─ Conteúdo do calendário ─ */}
      {level === 'day' && renderDayView()}
      {level === 'month' && renderMonthView()}
      {level === 'year' && renderYearView()}
    </div>
  );
}

const INTERNAL_CLIENT_LIST = [
  { id: 924, label: 'Flag (Outros)' },
  { id: 1528, label: 'Padrao Froneri' },
  { id: 1636, label: 'Qa Flag' },
  { id: 1853, label: 'Suporte Flag' },
] as const;
const INTERNAL_IDS = new Set(INTERNAL_CLIENT_LIST.map(c => c.id));

type HealthFilter = 'all' | 'verde' | 'amarelo' | 'vermelho';

const integrations: Integration[] = [
  { name: 'Flag.Ai.Gateway', type: 'api', status: 'up', lastCheck: '', latency: '—', description: 'Clientes VDesk' },
];

const columns: DataTableColumn<ComercialClient>[] = [
  { key: 'id', header: 'ID', className: 'font-mono text-xs w-16' },
  { key: 'nome', header: 'Nome', className: 'max-w-[250px] truncate font-medium' },
  { key: 'apelido', header: 'Apelido' },
  { key: 'bandeira', header: 'Bandeira', render: (r) => r.bandeira ? <Badge variant="outline" className="text-xs">{r.bandeira}</Badge> : '—' },
  { key: 'sistemas_label', header: 'Sistemas', className: 'max-w-[200px] truncate text-xs text-muted-foreground' },
  {
    key: 'status', header: 'Status', render: (r) => {
      const s = r.status?.toLowerCase();
      const variant = s === 'ativo' ? 'default' : s === 'bloqueado' ? 'destructive' : 'secondary';
      return <Badge variant={variant} className="text-xs">{r.status || '—'}</Badge>;
    }
  },
];

const tableColumnFilters: ColumnFilter[] = [
  { key: 'nome', label: 'Nome' },
  { key: 'apelido', label: 'Apelido' },
  { key: 'bandeira', label: 'Bandeira' },
  {
    key: 'sistemas_label',
    label: 'Sistemas',
    extractValue: (row: ComercialClient) =>
      row.sistemas_label ? row.sistemas_label.split(',').map((s: string) => s.trim()).filter(Boolean) : null,
  },
  { key: 'status', label: 'Status' },
];

const operationalColumns = [
  {
    key: 'work_item_id',
    header: 'ID',
    className: 'font-mono text-xs w-16',
    render: (row: any) => row.web_url ? (
      <a href={row.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono" onClick={(event) => event.stopPropagation()}>
        {row.work_item_id || '—'}
      </a>
    ) : (row.work_item_id || '—'),
  },
  { key: 'work_item_type', header: 'Tipo', render: (row: any) => <Badge variant="outline" className="text-xs">{row.work_item_type || '—'}</Badge> },
  { key: 'title', header: 'Título', className: 'max-w-[360px] truncate' },
  { key: 'assigned_to_display', header: 'Responsável' },
  { key: 'state', header: 'Status', render: (row: any) => <Badge variant="secondary" className="text-xs">{row.state || '—'}</Badge> },
  { key: 'priority', header: 'Prior.', render: (row: any) => row.priority != null ? `P${row.priority}` : '—' },
  { key: 'iteration_path', header: 'Sprint', className: 'text-xs text-muted-foreground max-w-[180px] truncate', render: (row: any) => row.iteration_path ? (row.iteration_path.split('\\').pop() || row.iteration_path) : '—' },
] as DataTableColumn<any>[];

export default function ComercialDashboard() {
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>('ativo');
  const [activeTab, setActiveTab] = useState('visao-clientes');
  const [selectedBandeira, setSelectedBandeira] = useState<string | null>(null);
  const [selectedSistema, setSelectedSistema] = useState<string | null>(null);
  const [multiOnly, setMultiOnly] = useState(false);
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const currentYear = new Date().getFullYear();
  const [calOpen, setCalOpen] = useState(false);
  const filters = useDashboardFilters('1y');
  const { clients, allClients, totalClientes, bandeiras, stats, lastSync, isLoading, isError, refetch } = useComercialKpis(statusFilter, filters.dateFrom, filters.dateTo);
  const operational = useDevopsOperationalQueue(['04-Em Fila Comercial']);
  const { exportCSV, exportPDF } = useDashboardExport();
  const [drawerClient, setDrawerClient] = useState<ComercialClient | null>(null);
  const [drawerOperacionalItem, setDrawerOperacionalItem] = useState<any | null>(null);

  const { isOwner } = useHubAreas();
  const isHubAdmin = useHubIsAdmin();
  const canViewValues = isOwner('comercial') || isHubAdmin;
  const [showValues, setShowValues] = useState(false);

  const [tableExpanded, setTableExpanded] = useState(false);
  const [visibleInternalIds, setVisibleInternalIds] = useState<number[]>([]);
  const visibleInternalSet = useMemo(() => new Set(visibleInternalIds), [visibleInternalIds]);
  // displayClients usa allClients (sem filtro de data) para garantir que os 4 internos
  // sejam sempre removidos, mesmo que tenham synced_at antigo fora do período selecionado.
  const displayClients = useMemo(
    () => allClients.filter(c => !INTERNAL_IDS.has(Number(c.id)) || visibleInternalSet.has(Number(c.id))),
    [allClients, visibleInternalSet]
  );
  const hiddenInternalCount = INTERNAL_CLIENT_LIST.length - visibleInternalIds.length;
  const hiddenInternalActiveCount = useMemo(
    () => allClients.filter(c => INTERNAL_IDS.has(Number(c.id)) && !visibleInternalSet.has(Number(c.id))).length,
    [allClients, visibleInternalSet]
  );

  const { minDate, maxDate } = useMemo(
    () => getDateBoundsFromItems(clients, [(c) => c.synced_at]),
    [clients]
  );

  const clientInsights = useMemo(() => {
    const semBandeira = displayClients.filter((client) => !client.bandeira || !client.bandeira.trim()).length;
    const multissistema = displayClients.filter((client) => {
      const systems = client.sistemas_label
        ?.split(',')
        .map((system) => system.trim())
        .filter(Boolean) ?? [];
      return systems.length > 1;
    }).length;
    const mediaSistemas = displayClients.length > 0
      ? Math.round((displayClients.reduce((total, client) => {
          const systems = client.sistemas_label
            ?.split(',')
            .map((system) => system.trim())
            .filter(Boolean) ?? [];
          return total + systems.length;
        }, 0) / displayClients.length) * 10) / 10
      : 0;

    return {
      semBandeira,
      multissistema,
      mediaSistemas,
    };
  }, [displayClients]);

  const sistemasUnicos = useMemo(() => {
    const set = new Set<string>();
    allClients.forEach(c => {
      c.sistemas_label?.split(',').map((s: string) => s.trim()).filter(Boolean).forEach((s: string) => set.add(s));
    });
    return [...set].sort();
  }, [allClients]);

  const sistemaChartData = useMemo(() => {
    const source = (statusFilter === 'todos' || statusFilter === 'ativo')
      ? displayClients.filter(c => c.status?.toLowerCase() === 'ativo')
      : displayClients;
    const byBandeira = selectedBandeira ? source.filter(c => (c.bandeira || 'Sem bandeira') === selectedBandeira) : source;
    const target = multiOnly
      ? byBandeira.filter(c => ((c.sistemas_label?.split(',').map(s => s.trim()).filter(Boolean) ?? []).length > 1))
      : byBandeira;
    const map = new Map<string, number>();
    target.forEach(c => {
      const sistemas = c.sistemas_label?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
      if (sistemas.length === 0) {
        map.set('Sem sistema', (map.get('Sem sistema') || 0) + 1);
      } else {
        sistemas.forEach(s => map.set(s, (map.get(s) || 0) + 1));
      }
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [displayClients, statusFilter, selectedBandeira, multiOnly]);

  const operacionalItems = operational.items.filter(i => i.query_name === '04-Em Fila Comercial');
  const pbiHealthIds = useMemo(
    () => operacionalItems
      .filter((item) => item.work_item_id && ['Product Backlog Item', 'User Story', 'Bug'].includes(item.work_item_type || ''))
      .map((item) => item.work_item_id as number),
    [operacionalItems]
  );
  const pbiHealthBatch = usePbiHealthBatch(pbiHealthIds, pbiHealthIds.length > 0);

  const operationalColumnsWithHealth = useMemo<DataTableColumn<any>[]>(() => [
    {
      key: 'health',
      header: 'Saúde',
      className: 'w-20',
      render: (row) => <PbiHealthBadge status={row.work_item_id ? pbiHealthBatch.healthById.get(row.work_item_id)?.health_status : null} compact />,
    },
    ...operationalColumns,
  ], [pbiHealthBatch.healthById]);

  const healthFilteredItems = useMemo(() => {
    if (healthFilter === 'all') return operacionalItems;
    return operacionalItems.filter((item) => item.work_item_id && pbiHealthBatch.healthById.get(item.work_item_id)?.health_status === healthFilter);
  }, [healthFilter, operacionalItems, pbiHealthBatch.healthById]);

  const handleExportCSV = () => exportCSV({
    title: 'Base de Clientes', area: 'Comercial', periodLabel: filters.presetLabel,
    columns: ['id', 'nome', 'apelido', 'bandeira', 'sistemas_label', 'status'],
    rows: displayClients as any[],
  });

  const handleExportPDF = () => exportPDF({
    title: 'Base de Clientes', area: 'Comercial', periodLabel: filters.presetLabel,
    kpis: [
      { label: 'Ativos', value: Math.max(0, stats.ativos - hiddenInternalActiveCount) },
      { label: 'Bloqueados', value: stats.bloqueados },
    ],
    columns: ['id', 'nome', 'apelido', 'bandeira', 'status'],
    rows: displayClients as any[],
  });

  const drawerFields: DrawerField[] = drawerClient ? [
    { label: 'ID', value: drawerClient.id },
    { label: 'Nome', value: drawerClient.nome },
    { label: 'Apelido', value: drawerClient.apelido },
    { label: 'Bandeira', value: drawerClient.bandeira },
    { label: 'Status', value: drawerClient.status },
    { label: 'Sistemas', value: drawerClient.sistemas_label },
    { label: 'Última Sync', value: drawerClient.synced_at ? new Date(drawerClient.synced_at).toLocaleString('pt-BR') : '—' },
  ] : [];

  const handleKpiClick = (filter: ClientStatusFilter) => {
    setStatusFilter(prev => prev === filter ? 'todos' : filter);
  };

  const handleHealthClick = (filter: HealthFilter) => {
    setHealthFilter((prev) => prev === filter ? 'all' : filter);
  };

  return (
    <SectorLayout title="Comercial" subtitle="Base de Clientes — Gateway/VDesk" lastUpdate="" integrations={integrations} areaKey="comercial" syncFunctions={[{ name: 'vdesk-sync-base-clientes', label: 'Sincronizar Base de Clientes (VDesk)' }]}>
      <div className="flex items-center justify-between mb-2">
        <DashboardLastSyncBadge syncedAt={lastSync} status="ok" />
        {canViewValues && (
          <button
            type="button"
            onClick={() => setShowValues(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/60"
            title={showValues ? 'Ocultar valores monetários' : 'Exibir valores monetários'}
          >
            {showValues ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      <Popover open={calOpen} onOpenChange={setCalOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-background text-sm text-foreground hover:bg-muted transition-colors"
          >
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="font-medium">{filters.presetLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 ml-1" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <ComercialCalendarPicker
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            preset={filters.preset}
            onPresetChange={filters.setPreset}
            onCustomRange={filters.setCustomRange}
            onAfterSelect={() => setCalOpen(false)}
            currentYear={currentYear}
          />
        </PopoverContent>
      </Popover>

      {isError ? (
        <DashboardEmptyState variant="error" onRetry={() => refetch()} />
      ) : (

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-full overflow-x-auto">
            <TabsList className="bg-transparent p-0 h-auto gap-0.5 flex-shrink-0">
              <TabsTrigger value="visao-clientes" className="text-xs h-8">Visão Clientes</TabsTrigger>
              <TabsTrigger value="ganho-perda" className="text-xs h-8">Ganho/Perda</TabsTrigger>
              <TabsTrigger value="fechamento-comercial" className="text-xs h-8">Fechamento Comercial</TabsTrigger>
              <TabsTrigger value="pesquisa" className="text-xs h-8">Pesquisa Satisfação</TabsTrigger>
              <TabsTrigger value="metas" className="text-xs h-8">Metas</TabsTrigger>
            </TabsList>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition-colors flex-shrink-0 ml-auto
                  ${activeTab === 'esteira-saude'
                    ? 'bg-background shadow-sm text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/60'}`}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  Mais
                  {activeTab === 'esteira-saude' && (
                    <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={() => setActiveTab('esteira-saude')}
                  className={`gap-2 text-xs ${activeTab === 'esteira-saude' ? 'font-medium text-primary' : ''}`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Esteira / Saúde
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <TabsContent value="visao-clientes" className="space-y-4 mt-0">
            {(() => {
              const clientHasSistema = (c: any, sis: string) => {
                const list = c.sistemas_label?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? [];
                if (sis === 'Sem sistema') return list.length === 0;
                return list.includes(sis);
              };
              const ativosClients = (statusFilter === 'todos' || statusFilter === 'ativo')
                ? displayClients.filter(c => c.status?.toLowerCase() === 'ativo')
                : [];
              // Cross-filter: se um sistema está selecionado, restringe a base da bandeira
              const bandeiraBase = selectedSistema
                ? ativosClients.filter(c => clientHasSistema(c, selectedSistema))
                : ativosClients;
              const bandeiraSource = multiOnly
                ? bandeiraBase.filter(c => ((c.sistemas_label?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? []).length > 1))
                : bandeiraBase;
              const bandeiraMap = new Map<string, number>();
              bandeiraSource.forEach(c => {
                const b = c.bandeira || 'Sem bandeira';
                bandeiraMap.set(b, (bandeiraMap.get(b) || 0) + 1);
              });
              const bandeiraData = Array.from(bandeiraMap.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);
              const handleBarClick = (data: any) => {
                if (data?.name) setSelectedBandeira(prev => prev === data.name ? null : data.name);
              };
              const handleSliceClick = (data: any) => {
                const name = data?.name ?? data?.payload?.name;
                if (name && name !== 'Outros') setSelectedSistema(prev => prev === name ? null : name);
              };
              return (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Bloco 1 — BASE DE CLIENTES + KPIs internos */}
                  <Card className="p-5 border flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">BASE DE CLIENTES</p>
                        <p className="text-3xl font-semibold text-foreground font-mono mt-0.5">{isLoading ? '—' : displayClients.length}</p>
                      </div>
                      <UserCheck className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-border border-t pt-3 -mx-5 px-5">
                      <button
                        onClick={() => handleKpiClick('ativo')}
                        className={`flex flex-col items-center py-2 rounded-l transition-colors hover:bg-muted/30 ${statusFilter === 'ativo' ? 'bg-primary/5' : ''}`}
                      >
                        <p className="text-2xl font-semibold font-mono">{isLoading ? '—' : Math.max(0, stats.ativos - hiddenInternalActiveCount)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Ativos</p>
                      </button>
                      <button
                        onClick={() => handleKpiClick('bloqueado')}
                        className={`flex flex-col items-center py-2 rounded-r transition-colors hover:bg-muted/30 ${statusFilter === 'bloqueado' ? 'bg-primary/5' : ''}`}
                      >
                        <p className="text-2xl font-semibold text-destructive font-mono">{isLoading ? '—' : stats.bloqueados}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Bloqueados</p>
                      </button>
                    </div>
                    {/* KPIs internos — clicáveis */}
                    <div className="grid grid-cols-3 gap-2 border-t pt-3 mt-3">
                      <button
                        type="button"
                        onClick={() => { setSelectedBandeira(null); setSelectedSistema(null); setMultiOnly(false); }}
                        title="Ver todos (limpar filtros)"
                        className="rounded-lg border bg-muted/30 px-2.5 py-2 text-left transition-colors hover:bg-muted/60 hover:border-primary/40"
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Bandeiras</p>
                        <p className="text-xl font-semibold text-foreground mt-1">{isLoading ? '—' : bandeiras.length}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMultiOnly(v => !v)}
                        title="Filtrar clientes com mais de um sistema"
                        className={`rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-muted/60 ${multiOnly ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/30' : 'bg-muted/30'}`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Multissist.</p>
                        <p className="text-xl font-semibold text-foreground mt-1">{isLoading ? '—' : clientInsights.multissistema}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBandeira(prev => prev === 'Sem bandeira' ? null : 'Sem bandeira')}
                        title="Filtrar clientes sem bandeira"
                        className={`rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-muted/60 ${selectedBandeira === 'Sem bandeira' ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/30' : 'bg-muted/30'}`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Sem bandeira</p>
                        <p className={`text-xl font-semibold mt-1 ${clientInsights.semBandeira > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {isLoading ? '—' : clientInsights.semBandeira}
                        </p>
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      {isLoading ? 'Carteira atual' : `Média de ${clientInsights.mediaSistemas} sistemas por cliente na carteira atual`}
                    </p>
                  </Card>

                  {/* Bloco 2 — Clientes Ativos por Bandeira */}
                  <Card className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold">Clientes Ativos por Bandeira</h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {selectedSistema ? `Filtrado por ${selectedSistema}` : `${ativosClients.length} clientes · ${bandeiraData.length} bandeiras`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {selectedSistema && (
                          <Badge variant="outline" className="text-xs cursor-pointer hover:bg-destructive/20" onClick={() => setSelectedSistema(null)}>
                            {selectedSistema} ✕
                          </Badge>
                        )}
                        {selectedBandeira && (
                          <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-destructive/20" onClick={() => setSelectedBandeira(null)}>
                            {selectedBandeira} ✕
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="h-[190px]">
                      {bandeiraData.length > 0 && !isLoading ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={bandeiraData} margin={{ top: 4, right: 16, bottom: 36, left: 0 }}>
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [v, 'Clientes']} />
                            <Bar
                              dataKey="count"
                              radius={[3, 3, 0, 0]}
                              maxBarSize={40}
                              cursor="pointer"
                              onClick={handleBarClick}
                              isAnimationActive
                              animationDuration={900}
                              animationEasing="ease-out"
                            >
                              {bandeiraData.map((entry, i) => (
                                <Cell key={i} fill="hsl(var(--primary))" opacity={selectedBandeira && selectedBandeira !== entry.name ? 0.25 : 0.85} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados para o período.</div>
                      )}
                    </div>
                  </Card>

                  {/* Bloco 3 — Clientes por Sistema */}
                  <Card className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold">Clientes por Sistema</h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {selectedBandeira ? `Filtrado por ${selectedBandeira}` : 'Distribuição da carteira ativa por produto'}
                        </p>
                      </div>
                      {selectedSistema && (
                        <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-destructive/20 flex-shrink-0" onClick={() => setSelectedSistema(null)}>
                          {selectedSistema} ✕
                        </Badge>
                      )}
                    </div>
                    <div className="h-[190px]">
                      {sistemaChartData.length > 0 && !isLoading ? (() => {
                        const totalAssoc = sistemaChartData.reduce((s, d) => s + d.count, 0);
                        const TOP = 6;
                        const donut = sistemaChartData.length > TOP
                          ? [...sistemaChartData.slice(0, TOP), { name: 'Outros', count: sistemaChartData.slice(TOP).reduce((s, d) => s + d.count, 0) }]
                          : sistemaChartData;
                        const op = (i: number) => Math.max(0.25, 1 - i * 0.13);
                        const dimFor = (name: string, i: number) =>
                          selectedSistema && selectedSistema !== name ? 0.18 : op(i);
                        return (
                          <div className="flex items-center gap-4 h-full">
                            <div className="relative flex-shrink-0" style={{ width: 150, height: 150 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={donut}
                                    dataKey="count"
                                    nameKey="name"
                                    innerRadius={48}
                                    outerRadius={70}
                                    paddingAngle={1.5}
                                    stroke="none"
                                    startAngle={90}
                                    endAngle={-270}
                                    cursor="pointer"
                                    onClick={handleSliceClick}
                                    isAnimationActive
                                    animationBegin={150}
                                    animationDuration={900}
                                    animationEasing="ease-out"
                                  >
                                    {donut.map((entry, i) => (
                                      <Cell key={i} fill="hsl(var(--primary))" fillOpacity={dimFor(entry.name, i)} />
                                    ))}
                                  </Pie>
                                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [v, 'Clientes']} />
                                </PieChart>
                              </ResponsiveContainer>
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-2xl font-bold text-foreground leading-none">{sistemaChartData.length}</span>
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">sistemas</span>
                              </div>
                            </div>
                            <div className="flex-1 min-w-0 space-y-1 overflow-y-auto max-h-[170px] pr-1">
                              {donut.map((s, i) => {
                                const isActive = selectedSistema === s.name;
                                const clickable = s.name !== 'Outros';
                                return (
                                  <button
                                    key={s.name}
                                    type="button"
                                    disabled={!clickable}
                                    onClick={() => clickable && setSelectedSistema(prev => prev === s.name ? null : s.name)}
                                    style={{ animationDelay: `${i * 70}ms`, animationFillMode: 'both' }}
                                    className={`flex items-center justify-between gap-2 text-xs w-full rounded px-1 py-0.5 animate-in fade-in slide-in-from-left-1 duration-500
                                      ${clickable ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default'}
                                      ${isActive ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}
                                  >
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: 'hsl(var(--primary))', opacity: op(i) }} />
                                      <span className="truncate text-foreground">{s.name}</span>
                                    </span>
                                    <span className="font-mono text-muted-foreground flex-shrink-0">
                                      {totalAssoc > 0 ? ((s.count / totalAssoc) * 100).toFixed(0) : 0}%
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })() : (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Sem dados de sistema.</div>
                      )}
                    </div>
                  </Card>
                </div>
              );
            })()}

            <div className="flex items-center gap-2 mt-1 mb-1 flex-wrap">
              <span className="text-xs text-muted-foreground">Filtrar:</span>
              <ToggleGroup type="single" value={statusFilter} onValueChange={(v) => setStatusFilter((v || 'todos') as ClientStatusFilter)} size="sm">
                <ToggleGroupItem value="todos" className="text-xs h-7 px-3">Todos</ToggleGroupItem>
                <ToggleGroupItem value="ativo" className="text-xs h-7 px-3">Ativos</ToggleGroupItem>
                <ToggleGroupItem value="bloqueado" className="text-xs h-7 px-3">Bloqueados</ToggleGroupItem>
              </ToggleGroup>
              <div className="ml-auto">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 hover:bg-muted/60 transition-colors"
                    >
                      <Users className="h-3 w-3" />
                      {hiddenInternalCount > 0
                        ? `${hiddenInternalCount} interno${hiddenInternalCount > 1 ? 's' : ''} oculto${hiddenInternalCount > 1 ? 's' : ''}`
                        : 'Internos visíveis'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-3" align="end">
                    <p className="text-[11px] font-semibold mb-2.5 text-muted-foreground uppercase tracking-wider">Clientes Internos</p>
                    <div className="space-y-2">
                      {INTERNAL_CLIENT_LIST.map(({ id, label }) => (
                        <div key={id} className="flex items-center gap-2">
                          <Checkbox
                            id={`internal-${id}`}
                            checked={visibleInternalSet.has(id)}
                            onCheckedChange={(checked) =>
                              setVisibleInternalIds(prev =>
                                checked ? [...prev, id] : prev.filter(i => i !== id)
                              )
                            }
                          />
                          <label htmlFor={`internal-${id}`} className="text-xs cursor-pointer select-none">{label}</label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {(() => {
              const filteredClients = selectedBandeira
                ? displayClients.filter(c => (c.bandeira || 'Sem bandeira') === selectedBandeira)
                : displayClients;
              const count = filteredClients.length;
              return (
                <div>
                  <button
                    type="button"
                    onClick={() => setTableExpanded(prev => !prev)}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors text-sm font-medium text-foreground"
                  >
                    <span>
                      Base de Clientes
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {isLoading ? '…' : `${count} cliente${count !== 1 ? 's' : ''}${selectedBandeira ? ` · ${selectedBandeira}` : ''}${statusFilter !== 'todos' ? ` · ${statusFilter}` : ''}`}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs">{tableExpanded ? '▲ Recolher' : '▼ Expandir'}</span>
                  </button>

                  {tableExpanded && (
                    <div className="mt-2">
                      {!isLoading && count === 0 ? (
                        <DashboardEmptyState description="Nenhum cliente encontrado com o filtro selecionado." />
                      ) : (
                        <DashboardDataTable
                          title="Base de Clientes"
                          subtitle={`${count} clientes${statusFilter !== 'todos' ? ` (${statusFilter})` : ''}${selectedBandeira ? ` • ${selectedBandeira}` : ''}`}
                          columns={columns}
                          data={filteredClients}
                          isLoading={isLoading}
                          getRowKey={(r) => r.id}
                          onRowClick={(r) => setDrawerClient(r)}
                          searchPlaceholder="Buscar cliente..."
                          columnFilters={tableColumnFilters}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </TabsContent>


          <TabsContent value="ganho-perda" className="space-y-4 mt-0">
            <MovimentacaoTab
              canViewValues={canViewValues}
              showValues={showValues}
              bandeiras={bandeiras}
              sistemas={sistemasUnicos}
            />
          </TabsContent>

          <TabsContent value="metas" className="space-y-4 mt-0">
            <MetasTab
              canViewValues={canViewValues}
              showValues={showValues}
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
            />
          </TabsContent>

          <TabsContent value="fechamento-comercial" className="space-y-4 mt-0">
            <PipeDriveTab canViewValues={canViewValues} showValues={showValues} />
          </TabsContent>

          <TabsContent value="esteira-saude" className="space-y-4 mt-0">
            <Card className="p-5 border transition-colors duration-150">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SAÚDE PBI</p>
                  <p className="text-3xl font-semibold text-foreground font-mono mt-0.5">{pbiHealthBatch.isLoading ? '—' : pbiHealthBatch.overview.total}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">PBIs monitorados</p>
                </div>
                <Layers className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div className="grid grid-cols-3 divide-x divide-border border-t pt-3 -mx-5 px-5">
                <button onClick={() => handleHealthClick('verde')} className={`flex flex-col items-center py-2 transition-colors hover:bg-muted/30 ${healthFilter === 'verde' ? 'bg-primary/5' : ''}`}>
                  <p className="text-xl font-semibold font-mono" style={{ color: 'hsl(142,71%,45%)' }}>{pbiHealthBatch.overview.verde}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Saudável</p>
                </button>
                <button onClick={() => handleHealthClick('amarelo')} className={`flex flex-col items-center py-2 transition-colors hover:bg-muted/30 ${healthFilter === 'amarelo' ? 'bg-primary/5' : ''}`}>
                  <p className="text-xl font-semibold font-mono" style={{ color: 'hsl(43,85%,46%)' }}>{pbiHealthBatch.overview.amarelo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Atenção</p>
                </button>
                <button onClick={() => handleHealthClick('vermelho')} className={`flex flex-col items-center py-2 transition-colors hover:bg-muted/30 ${healthFilter === 'vermelho' ? 'bg-primary/5' : ''}`}>
                  <p className="text-xl font-semibold text-destructive font-mono">{pbiHealthBatch.overview.vermelho}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Crítica</p>
                </button>
              </div>
            </Card>

            {healthFilteredItems.length === 0 && !operational.isLoading ? (
              <DashboardEmptyState description="Nenhum item da esteira comercial para o filtro selecionado." />
            ) : (
              <DashboardDataTable
                title="Esteira / Saúde Comercial"
                subtitle={`${healthFilteredItems.length} itens${healthFilter !== 'all' ? ` • filtro ${healthFilter === 'verde' ? 'Saudável' : healthFilter === 'amarelo' ? 'Atenção' : healthFilter === 'vermelho' ? 'Crítica' : healthFilter}` : ''}`}
                columns={operationalColumnsWithHealth}
                data={healthFilteredItems}
                isLoading={pbiHealthBatch.isLoading || operational.isLoading}
                getRowKey={(row) => String(row.work_item_id ?? Math.random())}
                onRowClick={(row) => setDrawerOperacionalItem(row)}
                searchPlaceholder="Buscar item monitorado..."
              />
            )}
          </TabsContent>

          <TabsContent value="pesquisa" className="space-y-4 mt-0">
            <PesquisaTab />
          </TabsContent>
        </Tabs>
      )}

      <DashboardDrawer
        open={!!drawerClient}
        onClose={() => setDrawerClient(null)}
        title={drawerClient?.nome}
        subtitle={drawerClient?.apelido || undefined}
        fields={drawerFields}
      />

      <DashboardDrawer
        open={!!drawerOperacionalItem}
        onClose={() => setDrawerOperacionalItem(null)}
        title={drawerOperacionalItem?.title || undefined}
        subtitle={drawerOperacionalItem?.work_item_type || undefined}
        fields={drawerOperacionalItem ? [
          { label: 'ID', value: drawerOperacionalItem.work_item_id },
          { label: 'Título', value: drawerOperacionalItem.title },
          { label: 'Tipo', value: drawerOperacionalItem.work_item_type },
          { label: 'Estado', value: drawerOperacionalItem.state },
          { label: 'Responsável', value: drawerOperacionalItem.assigned_to_display },
          { label: 'Prioridade', value: drawerOperacionalItem.priority != null ? `P${drawerOperacionalItem.priority}` : '—' },
          { label: 'Sprint', value: drawerOperacionalItem.iteration_path?.split('\\').pop() || '—' },
        ] : []}
        workItemId={drawerOperacionalItem?.work_item_id}
        workItemType={drawerOperacionalItem?.work_item_type}
        externalUrl={drawerOperacionalItem?.web_url}
      />
    </SectorLayout>
  );
}
