import { useState, useMemo, useRef, useCallback } from 'react';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ImportModeDialog, ImportMode } from '@/components/setores/ImportModeDialog';
import { useComercialMovimentacao, MovimentacaoCliente } from '@/hooks/useComercialMovimentacao';
import { useMovimentacaoImport } from '@/hooks/useMovimentacaoImport';
import { TrendingUp, TrendingDown, BarChart3, Percent, Upload, Loader2 } from 'lucide-react';

const columns: DataTableColumn<MovimentacaoCliente>[] = [
  { key: 'cliente_codigo', header: 'Código', className: 'font-mono text-xs w-16' },
  { key: 'cliente_nome', header: 'Cliente', className: 'max-w-[200px] truncate font-medium' },
  {
    key: 'tipo', header: 'Tipo', render: (r) => (
      <Badge variant={r.tipo === 'ganho' ? 'default' : 'destructive'} className="text-xs">
        {r.tipo === 'ganho' ? 'Ganho' : 'Perda'}
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

interface Props {
  dateFrom?: Date;
  dateTo?: Date;
}

export function MovimentacaoTab({ dateFrom, dateTo }: Props) {
  const [tipoFilter, setTipoFilter] = useState<'todos' | 'perda' | 'ganho'>('todos');
  const [anoFilter, setAnoFilter] = useState<string>('todos');
  const [drawerItem, setDrawerItem] = useState<MovimentacaoCliente | null>(null);
  const { items: rawItems, allItems, stats: rawStats, isLoading, isError, refetch } = useComercialMovimentacao(tipoFilter, dateFrom, dateTo);

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
    const total = items.length;
    const pctGanhos = total > 0 ? Math.round((ganhos.length / total) * 100) : 0;
    const pctPerdas = total > 0 ? Math.round((perdas.length / total) * 100) : 0;
    return {
      totalGanhos: ganhos.length,
      totalPerdas: perdas.length,
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashboardKpiCard label="Ganhos" value={`${stats.pctGanhos}%`} icon={TrendingUp} isLoading={isLoading} />
        <DashboardKpiCard label="Perdas" value={`${stats.pctPerdas}%`} icon={TrendingDown} isLoading={isLoading} delay={80} />
        <DashboardKpiCard label="Total Movimentações" value={items.length} icon={Percent} isLoading={isLoading} delay={160} />
        <DashboardKpiCard label="Saldo (Clientes)" value={stats.saldoClientes >= 0 ? `+${stats.saldoClientes}` : String(stats.saldoClientes)} icon={BarChart3} isLoading={isLoading} delay={240} />
      </div>

      <div className="flex items-center gap-4 mt-1 mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Tipo:</span>
          <ToggleGroup type="single" value={tipoFilter} onValueChange={(v) => setTipoFilter((v || 'todos') as any)} size="sm">
            <ToggleGroupItem value="todos" className="text-xs h-7 px-3">Todos</ToggleGroupItem>
            <ToggleGroupItem value="ganho" className="text-xs h-7 px-3">Ganhos</ToggleGroupItem>
            <ToggleGroupItem value="perda" className="text-xs h-7 px-3">Perdas</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Ano:</span>
          <ToggleGroup type="single" value={anoFilter} onValueChange={(v) => setAnoFilter(v || 'todos')} size="sm">
            <ToggleGroupItem value="todos" className="text-xs h-7 px-3">Todos</ToggleGroupItem>
            {availableYears.map((y) => (
              <ToggleGroupItem key={y} value={String(y)} className="text-xs h-7 px-3">{y}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {!isLoading && items.length === 0 ? (
        <DashboardEmptyState description="Nenhuma movimentação encontrada. Use o botão 'Importar XLSX' para carregar dados." />
      ) : (
        <DashboardDataTable
          title="Movimentação de Clientes"
          subtitle={`${items.length} registros${tipoFilter !== 'todos' ? ` (${tipoFilter === 'ganho' ? 'ganhos' : 'perdas'})` : ''}${anoFilter !== 'todos' ? ` • ${anoFilter}` : ''}`}
          columns={columns}
          data={items}
          isLoading={isLoading}
          getRowKey={(r) => r.id}
          onRowClick={(r) => setDrawerItem(r)}
          searchPlaceholder="Buscar cliente ou bandeira..."
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
