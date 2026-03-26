import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { TrendingUp, TrendingDown, Target, BarChart3, FileText } from 'lucide-react';
import { useComercialVendas, ComercialVenda } from '@/hooks/useComercialVendas';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  CartesianGrid, ReferenceLine,
} from 'recharts';

const BAR_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
];

const columns: DataTableColumn<ComercialVenda>[] = [
  { key: 'deal_title', header: 'Negócio', className: 'max-w-[250px] truncate font-medium' },
  {
    key: 'organization', header: 'Organização',
    render: (r) => r.organization ? <Badge variant="outline" className="text-xs">{r.organization}</Badge> : '—',
  },
  { key: 'observation', header: 'Obs.', className: 'max-w-[150px] truncate text-xs text-muted-foreground' },
  {
    key: 'closed_date', header: 'Fechamento', className: 'text-xs',
    render: (r) => r.closed_date ? new Date(r.closed_date).toLocaleDateString('pt-BR') : '—',
  },
];

function CustomTooltipVendas({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{d.bandeira}</p>
      <p className="text-muted-foreground">{d.percentual.toFixed(1)}% do total</p>
    </div>
  );
}

function CustomTooltipMensal({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{d.mes}</p>
      <p className="text-muted-foreground">
        {d.percentualMeta > 0 ? `${d.percentualMeta.toFixed(1)}% da média` : 'Sem dados'}
      </p>
    </div>
  );
}

export function PipeDriveTab() {
  const { items, stats, isLoading, isError, refetch } = useComercialVendas();
  const [selectedBandeira, setSelectedBandeira] = useState<string | null>(null);
  const [drawerItem, setDrawerItem] = useState<ComercialVenda | null>(null);

  const filteredVendas = useMemo(() => {
    if (!selectedBandeira) return stats.vendasPorOrg;
    return stats.vendasPorOrg.filter((v) => v.bandeira === selectedBandeira);
  }, [selectedBandeira, stats.vendasPorOrg]);

  const mesesComDados = stats.vendasPorMes.filter((m) => m.percentualMeta > 0);
  const mediaAtingimento = mesesComDados.length > 0
    ? Math.round(mesesComDados.reduce((s, m) => s + m.percentualMeta, 0) / mesesComDados.length * 10) / 10
    : 0;

  const drawerFields: DrawerField[] = drawerItem ? [
    { label: 'Negócio', value: drawerItem.deal_title },
    { label: 'Organização', value: drawerItem.organization },
    { label: 'Observação', value: drawerItem.observation },
    { label: 'Fechamento', value: drawerItem.closed_date ? new Date(drawerItem.closed_date).toLocaleDateString('pt-BR') : '—' },
    { label: 'Período', value: drawerItem.period_month ? new Date(drawerItem.period_month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—' },
  ] : [];

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashboardKpiCard
          label="Total Negócios"
          value={stats.totalDeals}
          icon={FileText}
          isLoading={isLoading}
        />
        <DashboardKpiCard
          label="Organizações"
          value={stats.orgs.length}
          icon={BarChart3}
          isLoading={isLoading}
          delay={80}
        />
        <DashboardKpiCard
          label="Média Ating. Mensal"
          value={`${mediaAtingimento}%`}
          icon={Target}
          isLoading={isLoading}
          delay={160}
        />
        <DashboardKpiCard
          label="Meses Acima Média"
          value={`${mesesComDados.filter((m) => m.atingiuMeta).length}/${mesesComDados.length}`}
          icon={TrendingUp}
          isLoading={isLoading}
          delay={240}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Vendas por Org — horizontal bar */}
        <Card className="lg:col-span-3 p-4">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Vendas por Organização</h3>
              <p className="text-xs text-muted-foreground">Distribuição percentual do deal value</p>
            </div>
            {selectedBandeira && (
              <Badge variant="secondary" className="cursor-pointer text-xs" onClick={() => setSelectedBandeira(null)}>
                {selectedBandeira} ✕
              </Badge>
            )}
          </div>
          <div className="h-[260px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredVendas} layout="vertical" margin={{ left: 70, right: 30, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" domain={[0, 'auto']} tickFormatter={(v) => `${v}%`} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis type="category" dataKey="bandeira" tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} width={65} />
                <Tooltip content={<CustomTooltipVendas />} />
                <Bar dataKey="percentual" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => setSelectedBandeira(d.bandeira === selectedBandeira ? null : d.bandeira)}>
                  {filteredVendas.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Summary card */}
        <Card className="lg:col-span-2 p-6 flex flex-col items-center justify-center text-center">
          <p className="text-xs text-muted-foreground mb-1">Venda Total (Deal Value)</p>
          <div className="flex items-center gap-2 mb-3">
            <Badge className="bg-muted text-muted-foreground border-0 text-xs">
              <TrendingDown className="h-3 w-3 mr-1" />
              % omitido
            </Badge>
          </div>
          <p className="text-4xl font-bold text-foreground tracking-tight">—</p>
          <p className="text-xs text-muted-foreground mt-2">Valor omitido por política de confidencialidade</p>
          <Badge variant="outline" className="mt-4 text-[10px]">
            Fonte: Dados importados ({stats.totalDeals} negócios)
          </Badge>
        </Card>
      </div>

      {/* Negócios por mês */}
      {stats.vendasPorMes.length > 0 && (
        <Card className="p-4">
          <div className="mb-1">
            <h3 className="text-sm font-semibold text-foreground">Vendas por Mês — % da Média Mensal</h3>
            <p className="text-xs text-muted-foreground">Referência: média mensal = 100%</p>
          </div>
          <div className="h-[240px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.vendasPorMes} margin={{ left: 10, right: 20, top: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip content={<CustomTooltipMensal />} />
                <ReferenceLine y={100} stroke="hsl(var(--primary))" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Média 100%', position: 'right', fill: 'hsl(var(--primary))', fontSize: 10 }} />
                <Bar dataKey="percentualMeta" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {stats.vendasPorMes.map((entry, i) => (
                    <Cell key={i} fill={entry.atingiuMeta ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Data table */}
      {!isLoading && items.length === 0 ? (
        <DashboardEmptyState description="Nenhum negócio encontrado. Importe dados na aba de Importações." />
      ) : (
        <DashboardDataTable
          title="Negócios Fechados"
          subtitle={`${items.length} registros`}
          columns={columns}
          data={items}
          isLoading={isLoading}
          getRowKey={(r) => r.id}
          onRowClick={(r) => setDrawerItem(r)}
          searchPlaceholder="Buscar negócio..."
        />
      )}

      <DashboardDrawer
        open={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        title={drawerItem?.deal_title || undefined}
        subtitle="Detalhes do Negócio"
        fields={drawerFields}
      />
    </div>
  );
}
