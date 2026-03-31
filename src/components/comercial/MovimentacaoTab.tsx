import { useState, useMemo, useRef, useCallback } from 'react';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn, ColumnFilter } from '@/components/dashboard/DashboardDataTable';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ImportModeDialog, ImportMode } from '@/components/setores/ImportModeDialog';
import { useComercialMovimentacao, MovimentacaoCliente } from '@/hooks/useComercialMovimentacao';
import { useMovimentacaoImport } from '@/hooks/useMovimentacaoImport';
import { TrendingUp, TrendingDown, BarChart3, Upload, Loader2, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend } from 'recharts';

function tipoLabel(tipo: string) {
  if (tipo === 'ganho') return 'Ganho';
  if (tipo === 'risco') return 'Risco';
  return 'Perda';
}

function tipoBadgeVariant(tipo: string): 'default' | 'destructive' | 'secondary' {
  if (tipo === 'ganho') return 'default';
  if (tipo === 'risco') return 'secondary';
  return 'destructive';
}

const columns: DataTableColumn<MovimentacaoCliente>[] = [
  { key: 'cliente_codigo', header: 'Código', className: 'font-mono text-xs w-16' },
  { key: 'cliente_nome', header: 'Cliente', className: 'max-w-[200px] truncate font-medium' },
  {
    key: 'tipo', header: 'Tipo', render: (r) => (
      <Badge variant={tipoBadgeVariant(r.tipo)} className={`text-xs${r.tipo === 'risco' ? ' bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30' : ''}`}>
        {tipoLabel(r.tipo)}
      </Badge>
    ),
  },
  { key: 'bandeira', header: 'Bandeira', render: (r) => r.bandeira ? <Badge variant="outline" className="text-xs">{r.bandeira}</Badge> : '—' },
  { key: 'sistema', header: 'Sistema', className: 'text-xs text-muted-foreground' },
  {
    key: 'data_evento', header: 'Data', className: 'text-xs',
    render: (r) => r.data_evento ? new Date(r.data_evento).toLocaleDateString('pt-BR') : '—',
  },
  { key: 'motivo', header: 'Categoria', className: 'max-w-[180px] truncate text-xs text-muted-foreground' },
];

const tableColumnFilters: ColumnFilter[] = [
  { key: 'cliente_nome', label: 'Cliente' },
  { key: 'bandeira', label: 'Bandeira' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'sistema', label: 'Sistema' },
  { key: 'motivo', label: 'Categoria' },
];

interface Props {
  dateFrom?: Date;
  dateTo?: Date;
}

export function MovimentacaoTab({ dateFrom, dateTo }: Props) {
  const [anoFilter, setAnoFilter] = useState<string>('todos');
  const [drawerItem, setDrawerItem] = useState<MovimentacaoCliente | null>(null);
  const { items: rawItems, allItems, stats: rawStats, isLoading, isError, refetch } = useComercialMovimentacao('todos', dateFrom, dateTo);

  // Filter by year
  const items = useMemo(() => {
    if (anoFilter === 'todos') return rawItems;
    const year = parseInt(anoFilter);
    return rawItems.filter((i) => {
      if (i.ano_referencia) return i.ano_referencia === year;
      if (i.data_evento) return new Date(i.data_evento).getFullYear() === year;
      return false;
    });
  }, [rawItems, anoFilter]);

  // Recalculate stats for filtered items
  const stats = useMemo(() => {
    const perdas = items.filter((i) => i.tipo === 'perda');
    const ganhos = items.filter((i) => i.tipo === 'ganho');
    const riscos = items.filter((i) => i.tipo === 'risco');
    const total = items.length;
    const pctGanhos = total > 0 ? Math.round((ganhos.length / total) * 100) : 0;
    const pctPerdas = total > 0 ? Math.round((perdas.length / total) * 100) : 0;
    return {
      totalGanhos: ganhos.length,
      totalPerdas: perdas.length,
      totalRiscos: riscos.length,
      pctGanhos,
      pctPerdas,
      saldoClientes: ganhos.length - perdas.length,
    };
  }, [items]);

  // Available years from data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const i of allItems) {
      if (i.ano_referencia) years.add(i.ano_referencia);
      else if (i.data_evento) years.add(new Date(i.data_evento).getFullYear());
    }
    return [...years].sort((a, b) => b - a);
  }, [allItems]);

  // Bar chart data: perdas x ganhos grouped by month
  const chartData = useMemo(() => {
    const monthMap = new Map<string, { label: string; ganhos: number; perdas: number; riscos: number; sortKey: string }>();
    for (const item of items) {
      const d = item.data_evento ? new Date(item.data_evento) : null;
      if (!d) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      if (!monthMap.has(key)) monthMap.set(key, { label, ganhos: 0, perdas: 0, riscos: 0, sortKey: key });
      const entry = monthMap.get(key)!;
      if (item.tipo === 'ganho') entry.ganhos++;
      else if (item.tipo === 'risco') entry.riscos++;
      else if (item.tipo === 'perda') entry.perdas++;
    }
    return Array.from(monthMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [items]);

  // Import state
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showModeDialog, setShowModeDialog] = useState(false);
  const { upload, isUploading, progress } = useMovimentacaoImport();

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingFile(f);
    setShowModeDialog(true);
    e.target.value = '';
  }, []);

  const handleConfirmImport = useCallback(async (mode: ImportMode) => {
    setShowModeDialog(false);
    if (!pendingFile) return;
    try {
      await upload(pendingFile, mode);
      refetch();
    } finally {
      setPendingFile(null);
    }
  }, [pendingFile, upload, refetch]);

  const drawerFields: DrawerField[] = drawerItem ? [
    { label: 'Código', value: drawerItem.cliente_codigo },
    { label: 'Cliente', value: drawerItem.cliente_nome },
    { label: 'Tipo', value: drawerItem.tipo === 'ganho' ? 'Ganho' : 'Perda' },
    { label: 'Bandeira', value: drawerItem.bandeira },
    { label: 'Sistema', value: drawerItem.sistema },
    { label: 'Categoria', value: drawerItem.motivo },
    { label: 'Observação', value: drawerItem.status_encerramento },
    { label: 'Data', value: drawerItem.data_evento ? new Date(drawerItem.data_evento).toLocaleDateString('pt-BR') : '—' },
  ] : [];

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      {/* Upload bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isUploading && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {progress}
            </span>
          )}
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={isUploading}>
            <Upload className="h-4 w-4 mr-1" />
            Importar XLSX
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <DashboardKpiCard label="Ganhos (Clientes)" value={stats.totalGanhos} icon={TrendingUp} isLoading={isLoading} />
        <DashboardKpiCard label="Perdas (Clientes)" value={stats.totalPerdas} icon={TrendingDown} isLoading={isLoading} delay={80} />
        <DashboardKpiCard label="Em Risco" value={stats.totalRiscos} icon={AlertTriangle} isLoading={isLoading} delay={120} accent="bg-amber-500" />
        <DashboardKpiCard label="Total Movimentações" value={items.length} icon={BarChart3} isLoading={isLoading} delay={160} />
        <DashboardKpiCard label="Saldo (Clientes)" value={stats.saldoClientes >= 0 ? `+${stats.saldoClientes}` : String(stats.saldoClientes)} icon={BarChart3} isLoading={isLoading} delay={240} />
      </div>

      {/* Year filter only */}
      <div className="flex items-center gap-2 mt-1 mb-1">
        <span className="text-xs text-muted-foreground">Ano:</span>
        <ToggleGroup type="single" value={anoFilter} onValueChange={(v) => setAnoFilter(v || 'todos')} size="sm">
          <ToggleGroupItem value="todos" className="text-xs h-7 px-3">Todos</ToggleGroupItem>
          {availableYears.map((y) => (
            <ToggleGroupItem key={y} value={String(y)} className="text-xs h-7 px-3">{y}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Bar chart: Perdas x Ganhos por mês */}
      {chartData.length > 0 && !isLoading && (
        <Card className="p-4 space-y-2">
          <CardHeader className="p-0">
            <CardTitle className="text-sm font-semibold">Perdas × Ganhos por Mês</CardTitle>
            <p className="text-xs text-muted-foreground">Visão gerencial da movimentação de clientes</p>
          </CardHeader>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 40, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ganhos" name="Ganhos" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="perdas" name="Perdas" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {!isLoading && items.length === 0 ? (
        <DashboardEmptyState description="Nenhuma movimentação encontrada. Use o botão 'Importar XLSX' para carregar dados." />
      ) : (
        <DashboardDataTable
          title="Movimentação de Clientes"
          subtitle={`${items.length} registros${anoFilter !== 'todos' ? ` • ${anoFilter}` : ''}`}
          columns={columns}
          data={items}
          isLoading={isLoading}
          getRowKey={(r) => r.id}
          onRowClick={(r) => setDrawerItem(r)}
          searchPlaceholder="Buscar cliente ou bandeira..."
          columnFilters={tableColumnFilters}
        />
      )}

      <DashboardDrawer
        open={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        title={drawerItem?.cliente_nome || undefined}
        subtitle={drawerItem?.tipo === 'ganho' ? 'Novo Cliente' : 'Perda de Cliente'}
        fields={drawerFields}
      />

      <ImportModeDialog
        open={showModeDialog}
        onClose={() => { setShowModeDialog(false); setPendingFile(null); }}
        onConfirm={handleConfirmImport}
        fileName={pendingFile?.name}
      />
    </div>
  );
}
