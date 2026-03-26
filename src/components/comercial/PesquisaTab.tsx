import { useState } from 'react';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { Badge } from '@/components/ui/badge';
import { useComercialPesquisa, PesquisaSatisfacao } from '@/hooks/useComercialMovimentacao';
import { Star, Users, BarChart3 } from 'lucide-react';

const columns: DataTableColumn<PesquisaSatisfacao>[] = [
  { key: 'cliente_codigo', header: 'Código', className: 'font-mono text-xs w-16' },
  { key: 'cliente_nome', header: 'Cliente', className: 'max-w-[200px] truncate font-medium' },
  { key: 'bandeira', header: 'Bandeira', render: (r) => r.bandeira ? <Badge variant="outline" className="text-xs">{r.bandeira}</Badge> : '—' },
  {
    key: 'data_pesquisa', header: 'Data', className: 'text-xs',
    render: (r) => r.data_pesquisa ? new Date(r.data_pesquisa).toLocaleDateString('pt-BR') : '—',
  },
  { key: 'responsavel_contato', header: 'Contato', className: 'text-xs text-muted-foreground' },
  {
    key: 'notas_por_produto', header: 'Média', render: (r) => {
      if (!r.notas_por_produto) return '—';
      const vals = Object.values(r.notas_por_produto).filter((v): v is number => typeof v === 'number');
      if (vals.length === 0) return '—';
      const avg = vals.reduce((s, n) => s + n, 0) / vals.length;
      const color = avg >= 4 ? 'text-[hsl(var(--chart-2))]' : avg >= 3 ? 'text-[hsl(var(--chart-4))]' : 'text-destructive';
      return <span className={`font-semibold ${color}`}>{avg.toFixed(1)}</span>;
    },
  },
];

export function PesquisaTab() {
  const { items, stats, isLoading, isError, refetch } = useComercialPesquisa();
  const [drawerItem, setDrawerItem] = useState<PesquisaSatisfacao | null>(null);

  const drawerFields: DrawerField[] = drawerItem ? [
    { label: 'Código', value: drawerItem.cliente_codigo },
    { label: 'Cliente', value: drawerItem.cliente_nome },
    { label: 'Bandeira', value: drawerItem.bandeira },
    { label: 'Data', value: drawerItem.data_pesquisa ? new Date(drawerItem.data_pesquisa).toLocaleDateString('pt-BR') : '—' },
    { label: 'Contato', value: drawerItem.responsavel_contato },
    ...(drawerItem.notas_por_produto
      ? Object.entries(drawerItem.notas_por_produto).map(([k, v]) => ({
          label: k,
          value: v != null ? String(v) : 'Não usa',
        }))
      : []),
  ] : [];

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <DashboardKpiCard label="Pesquisas" value={stats.total} icon={Users} isLoading={isLoading} />
        <DashboardKpiCard label="Média Geral" value={stats.mediaGeral ?? '—'} icon={Star} isLoading={isLoading} delay={80} />
        <DashboardKpiCard label="Bandeiras" value={stats.bandeiras.length} icon={BarChart3} isLoading={isLoading} delay={160} />
      </div>

      {!isLoading && items.length === 0 ? (
        <DashboardEmptyState description="Nenhuma pesquisa de satisfação encontrada. Importe dados na aba de Importações." />
      ) : (
        <DashboardDataTable
          title="Pesquisa de Satisfação"
          subtitle={`${items.length} respostas`}
          columns={columns}
          data={items}
          isLoading={isLoading}
          getRowKey={(r) => r.id}
          onRowClick={(r) => setDrawerItem(r)}
          searchPlaceholder="Buscar cliente..."
        />
      )}

      <DashboardDrawer
        open={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        title={drawerItem?.cliente_nome || undefined}
        subtitle="Pesquisa de Satisfação"
        fields={drawerFields}
      />
    </div>
  );
}
