import { useState, useMemo, useRef, useCallback } from 'react';
import { MovimentacaoFormDialog, MovimentacaoFormData } from './MovimentacaoFormDialog';
import { useComercialMovimentacaoManual, useComercialMovimentacaoUpdate, useComercialMovimentacaoDelete } from '@/hooks/useComercialMovimentacaoManual';
import { DashboardDataTable, DataTableColumn, ColumnFilter } from '@/components/dashboard/DashboardDataTable';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
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
  { key: 'status_encerramento', header: 'Observação', className: 'max-w-[200px] truncate text-xs text-muted-foreground', render: (r: MovimentacaoCliente) => r.status_encerramento || '—' },
  {
    key: 'acoes', header: 'Ações', sortable: false, className: 'w-[140px]', render: () => null,
  },
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
  canViewValues?: boolean;
  showValues?: boolean;
  bandeiras?: string[];
  sistemas?: string[];
}

export default function MovimentacaoTab({ dateFrom, dateTo, canViewValues = false, showValues = false, bandeiras = [], sistemas = [] }: Props) {
  const [drawerItem, setDrawerItem] = useState<MovimentacaoCliente | null>(null);
  const [tipoFilter, setTipoFilter] = useState<string | null>(null);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<MovimentacaoCliente | null>(null);
  const { mutateAsync: createMovimentacao } = useComercialMovimentacaoManual();
  const { mutateAsync: updateMovimentacao } = useComercialMovimentacaoUpdate();
  const { mutateAsync: deleteMovimentacao } = useComercialMovimentacaoDelete();
  const { items: rawItems, isLoading, isError, refetch } = useComercialMovimentacao('todos', dateFrom, dateTo);

  // Período herdado do filtro da página (via hook) + tipo + risco restrito
  const items = useMemo(() => {
    let filtered = rawItems;
    if (!canViewValues) {
      filtered = filtered.filter(i => i.tipo !== 'risco');
    }
    if (tipoFilter) {
      filtered = filtered.filter((i) => i.tipo === tipoFilter);
    }
    return filtered;
  }, [rawItems, tipoFilter, canViewValues]);

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

  // Bar chart data: perdas x ganhos grouped by month
  // Agrupa pelo "YYYY-MM" da string — new Date('2026-04-01') vira 31/03 no fuso
  // local e jogava registros do dia 1 para o mês anterior.
  const chartData = useMemo(() => {
    const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const monthMap = new Map<string, { label: string; ganhos: number; perdas: number; sortKey: string }>();
    for (const item of items) {
      if (item.tipo === 'risco') continue; // Risco não é movimentação
      if (!item.data_evento) continue;
      const key = item.data_evento.slice(0, 7);
      const [y, m] = key.split('-');
      const label = `${MESES[parseInt(m, 10) - 1] ?? m}. de ${y.slice(2)}`;
      if (!monthMap.has(key)) monthMap.set(key, { label, ganhos: 0, perdas: 0, sortKey: key });
      const entry = monthMap.get(key)!;
      if (item.tipo === 'ganho') entry.ganhos++;
      else if (item.tipo === 'perda') entry.perdas++;
    }
    return Array.from(monthMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [items]);

  const handleKpiClick = useCallback((tipo: string | null) => {
    setTipoFilter((prev) => prev === tipo ? null : tipo);
  }, []);

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

  const handleManualSubmit = useCallback(async (data: MovimentacaoFormData) => {
    if (editingItem) {
      await updateMovimentacao({
        id: editingItem.id,
        tipo: data.tipo,
        bandeira: data.bandeira,
        sistema: data.sistema,
        motivo: data.motivo,
        status_encerramento: data.status_encerramento,
        valor_mensal: data.valor_mensal,
        ano_referencia: data.ano_referencia,
        data_evento: data.data_evento,
      });
    } else {
      await createMovimentacao({
        cliente_codigo: Number(data.cliente_codigo),
        cliente_nome: data.cliente_nome,
        tipo: data.tipo,
        bandeira: data.bandeira,
        sistema: data.sistema,
        motivo: data.motivo,
        status_encerramento: data.status_encerramento,
        valor_mensal: data.valor_mensal,
        ano_referencia: data.ano_referencia,
        data_evento: data.data_evento,
      });
    }
    setEditingItem(null);
    setShowManualDialog(false);
    await refetch();
  }, [createMovimentacao, editingItem, refetch, updateMovimentacao]);

  const handleEdit = useCallback((item: MovimentacaoCliente) => {
    setEditingItem(item);
    setShowManualDialog(true);
  }, []);

  const handleDelete = useCallback(async (item: MovimentacaoCliente) => {
    const confirmed = window.confirm(`Remover a movimentação de ${item.cliente_nome || 'cliente'}?`);
    if (!confirmed) return;
    await deleteMovimentacao(item.id);
    await refetch();
  }, [deleteMovimentacao, refetch]);

  const tableColumns = useMemo<DataTableColumn<MovimentacaoCliente>[]>(() => (
    columns.map((column) => {
      if (column.key !== 'acoes') return column;
      return {
        ...column,
        render: (row) => (
          <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
            <Button type="button" variant="outline" size="sm" onClick={() => handleEdit(row)}>
              Editar
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(row)}>
              Excluir
            </Button>
          </div>
        ),
      };
    })
  ), [handleDelete, handleEdit]);

  const drawerFields: DrawerField[] = drawerItem ? [
    { label: 'Código', value: drawerItem.cliente_codigo },
    { label: 'Cliente', value: drawerItem.cliente_nome },
    { label: 'Tipo', value: tipoLabel(drawerItem.tipo) },
    { label: 'Bandeira', value: drawerItem.bandeira },
    { label: 'Sistema', value: drawerItem.sistema },
    { label: 'Categoria', value: drawerItem.motivo },
    { label: 'Observação', value: drawerItem.status_encerramento },
    ...(canViewValues ? [{
      label: 'Valor Mensal',
      value: showValues
        ? (drawerItem.valor_mensal ? `R$ ${drawerItem.valor_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—')
        : 'R$ •••',
    }] : []),
    { label: 'Ano Referência', value: drawerItem.ano_referencia },
    { label: 'Data', value: drawerItem.data_evento ? new Date(drawerItem.data_evento).toLocaleDateString('pt-BR') : '—' },
  ] : [];

  const kpiCards = useMemo(() => {
    const cards = [
      { key: 'ganho', label: 'Ganhos', value: stats.totalGanhos, icon: TrendingUp, accent: 'text-emerald-600 bg-emerald-500/12 border-emerald-500/20' },
      { key: 'perda', label: 'Perdas', value: stats.totalPerdas, icon: TrendingDown, accent: 'text-rose-600 bg-rose-500/12 border-rose-500/20' },
      ...(canViewValues ? [{ key: 'risco', label: 'Em risco', value: stats.totalRiscos, icon: AlertTriangle, accent: 'text-amber-600 bg-amber-500/12 border-amber-500/20' }] : []),
      { key: 'total', label: 'Total', value: stats.totalGanhos + stats.totalPerdas, icon: BarChart3, accent: 'text-sky-600 bg-sky-500/12 border-sky-500/20' },
      { key: 'saldo', label: 'Saldo', value: stats.saldoClientes >= 0 ? `+${stats.saldoClientes}` : String(stats.saldoClientes), icon: BarChart3, accent: stats.saldoClientes >= 0 ? 'text-emerald-600 bg-emerald-500/12 border-emerald-500/20' : 'text-rose-600 bg-rose-500/12 border-rose-500/20' },
    ];
    return cards;
  }, [stats, canViewValues]);

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

      <MovimentacaoFormDialog
        open={showManualDialog}
        onClose={() => { setShowManualDialog(false); setEditingItem(null); }}
        onSubmit={handleManualSubmit}
        initialData={editingItem ? {
          cliente_codigo: editingItem.cliente_codigo != null ? String(editingItem.cliente_codigo) : '',
          cliente_nome: editingItem.cliente_nome || '',
          tipo: editingItem.tipo as MovimentacaoFormData['tipo'],
          bandeira: editingItem.bandeira || '',
          sistema: editingItem.sistema || '',
          motivo: editingItem.motivo || '',
          status_encerramento: editingItem.status_encerramento || '',
          valor_mensal: editingItem.valor_mensal || undefined,
          ano_referencia: editingItem.ano_referencia || undefined,
          data_evento: editingItem.data_evento || undefined,
        } : undefined}
        mode={editingItem ? 'edit' : 'create'}
        bandeiras={bandeiras}
        sistemas={sistemas}
        canViewValues={canViewValues}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr] gap-4 items-stretch">
        <div className="grid gap-4 min-h-[352px] xl:grid-rows-[auto_1fr]">
          <Card className="border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Resumo da Movimentação</p>
                <p className="text-xs text-muted-foreground">Ganhos, perdas e saldo no período selecionado</p>
              </div>
              <span className="text-[11px] text-muted-foreground">Clique para filtrar</span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5">
              {kpiCards.map((item, index) => {
                const Icon = item.icon;
                const filterValue = item.key === 'total' || item.key === 'saldo' ? null : item.key;
                const isClickable = item.key !== 'saldo';
                const isActive = item.key === 'saldo' ? false : tipoFilter === filterValue;

                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`group flex min-h-[116px] flex-col justify-between px-4 py-4 text-left transition-colors ${index < kpiCards.length - 1 ? 'lg:border-r lg:border-border' : ''} ${index < 4 ? 'border-b border-border lg:border-b-0' : ''} ${index === 1 ? 'lg:border-r lg:border-border' : ''} ${isClickable ? 'hover:bg-muted/30' : 'cursor-default'} ${isActive ? 'bg-primary/5' : ''}`}
                    onClick={isClickable ? () => handleKpiClick(filterValue) : undefined}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {item.label}
                      </span>
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${item.accent}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-3xl font-semibold tracking-tight text-foreground">
                        {isLoading ? '...' : item.value}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {item.key === 'saldo' ? 'Resultado líquido' : isActive ? 'Filtro ativo' : 'Visualizar registros'}
                        </span>
                        {isActive && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="border bg-card">
            <div className="grid h-full grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
              <div className="flex flex-col justify-between px-4 py-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Taxa de ganhos</p>
                  <p className="text-2xl font-semibold text-emerald-600">{isLoading ? '...' : `${stats.pctGanhos}%`}</p>
                </div>
                <p className="text-xs text-muted-foreground">Participação de ganhos no total filtrado</p>
              </div>

              <div className="flex flex-col justify-between px-4 py-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Taxa de perdas</p>
                  <p className="text-2xl font-semibold text-rose-600">{isLoading ? '...' : `${stats.pctPerdas}%`}</p>
                </div>
                <p className="text-xs text-muted-foreground">Participação de perdas no total filtrado</p>
              </div>

              <div className="flex flex-col justify-between px-4 py-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Leitura do saldo</p>
                  <p className={`text-2xl font-semibold ${stats.saldoClientes >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {isLoading ? '...' : stats.saldoClientes >= 0 ? 'Positivo' : 'Negativo'}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Diferença líquida entre ganhos e perdas</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-4 space-y-2 min-h-[352px] h-full">
          <CardHeader className="p-0">
            <CardTitle className="text-sm font-semibold">Perdas × Ganhos por Mês</CardTitle>
            <p className="text-xs text-muted-foreground">Visão gerencial da movimentação de clientes</p>
          </CardHeader>
          <div className="h-[280px]">
            {chartData.length > 0 && !isLoading ? (
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
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Sem dados para gerar o gráfico no período selecionado.
              </div>
            )}
          </div>
        </Card>
      </div>

      {!isLoading && items.length === 0 ? (
        <DashboardEmptyState description="Nenhuma movimentação no período selecionado. Ajuste o filtro de período ou importe dados." />
      ) : (
        <DashboardDataTable
          title="Movimentação de Clientes"
          subtitle={`${items.length} registros no período`}
          headerActions={
            <Button size="sm" variant="default" onClick={() => setShowManualDialog(true)}>
              + Nova Movimentação
            </Button>
          }
          columns={tableColumns}
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
        subtitle={drawerItem?.tipo === 'ganho' ? 'Novo Cliente' : drawerItem?.tipo === 'risco' ? 'Cliente em Risco' : 'Perda de Cliente'}
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
