import { useState, useRef, useCallback } from 'react';
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
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Upload, Loader2 } from 'lucide-react';

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
    key: 'valor_mensal', header: 'Valor Mensal', render: (r) =>
      r.valor_mensal != null
        ? `R$ ${r.valor_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : '—',
  },
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
  const [drawerItem, setDrawerItem] = useState<MovimentacaoCliente | null>(null);
  const { items, stats, isLoading, isError, refetch } = useComercialMovimentacao(tipoFilter, dateFrom, dateTo);

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

  const formatBRL = (v: number) =>
    `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const drawerFields: DrawerField[] = drawerItem ? [
    { label: 'Código', value: drawerItem.cliente_codigo },
    { label: 'Cliente', value: drawerItem.cliente_nome },
    { label: 'Tipo', value: drawerItem.tipo === 'ganho' ? 'Ganho' : 'Perda' },
    { label: 'Bandeira', value: drawerItem.bandeira },
    { label: 'Sistema', value: drawerItem.sistema },
    { label: 'Valor Mensal', value: drawerItem.valor_mensal != null ? formatBRL(drawerItem.valor_mensal) : '—' },
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
        <DashboardKpiCard label="Ganhos" value={stats.totalGanhos} icon={TrendingUp} isLoading={isLoading} />
        <DashboardKpiCard label="Perdas" value={stats.totalPerdas} icon={TrendingDown} isLoading={isLoading} delay={80} />
        <DashboardKpiCard label="Receita Ganha" value={formatBRL(stats.valorGanhos)} icon={DollarSign} isLoading={isLoading} delay={160} />
        <DashboardKpiCard label="Saldo (Clientes)" value={stats.saldoClientes >= 0 ? `+${stats.saldoClientes}` : String(stats.saldoClientes)} icon={BarChart3} isLoading={isLoading} delay={240} />
      </div>

      <div className="flex items-center gap-2 mt-1 mb-1">
        <span className="text-xs text-muted-foreground">Filtrar:</span>
        <ToggleGroup type="single" value={tipoFilter} onValueChange={(v) => setTipoFilter((v || 'todos') as any)} size="sm">
          <ToggleGroupItem value="todos" className="text-xs h-7 px-3">Todos</ToggleGroupItem>
          <ToggleGroupItem value="ganho" className="text-xs h-7 px-3">Ganhos</ToggleGroupItem>
          <ToggleGroupItem value="perda" className="text-xs h-7 px-3">Perdas</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!isLoading && items.length === 0 ? (
        <DashboardEmptyState description="Nenhuma movimentação encontrada. Use o botão 'Importar XLSX' para carregar dados." />
      ) : (
        <DashboardDataTable
          title="Movimentação de Clientes"
          subtitle={`${items.length} registros${tipoFilter !== 'todos' ? ` (${tipoFilter === 'ganho' ? 'ganhos' : 'perdas'})` : ''}`}
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
