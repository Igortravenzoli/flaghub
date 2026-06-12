import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { TrendingUp, TrendingDown, Target, BarChart3, FileText, Activity, Building2 } from 'lucide-react';
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
  {
    key: 'deal_title', header: 'Negócio', className: 'max-w-[250px] font-medium',
    render: (r) => (
      <div className="max-w-[250px]">
        <span title={r.deal_title ?? ''} className="block truncate">{r.deal_title || '—'}</span>
        {(r.itens?.length ?? 0) > 0 && (
          <span
            className="block truncate text-[11px] text-muted-foreground font-normal"
            title={r.itens.map((i) => `${i.quantidade}× ${i.produto}`).join(', ')}
          >
            {r.itens.map((i) => `${i.quantidade}× ${i.produto}`).join(', ')}
          </span>
        )}
      </div>
    ),
  },
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

const META_MENSAL = 110_000; // referência 100% — exibição apenas percentual

function formatMonthYm(ym: string) {
  const [y, m] = ym.split('-');
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${months[parseInt(m, 10) - 1] ?? m} ${y}`;
}

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

/** Returns a qualitative label for the deal-value performance */
function getDealValueSentiment(mesesComDados: { percentualMeta: number; atingiuMeta: boolean }[]): {
  label: string; description: string; icon: React.ComponentType<{ className?: string }>; accent: string;
} {
  if (mesesComDados.length === 0) return { label: 'Sem dados', description: 'Aguardando fechamentos', icon: Activity, accent: 'text-muted-foreground' };
  const acima = mesesComDados.filter(m => m.atingiuMeta).length;
  const pct = acima / mesesComDados.length;
  if (pct >= 0.7) return { label: 'Acima da Média', description: `${acima}/${mesesComDados.length} meses acima da meta mensal`, icon: TrendingUp, accent: 'text-[hsl(142,71%,45%)]' };
  if (pct >= 0.4) return { label: 'Na Média', description: `${acima}/${mesesComDados.length} meses acima da meta mensal`, icon: Activity, accent: 'text-[hsl(43,85%,46%)]' };
  return { label: 'Abaixo da Média', description: `${acima}/${mesesComDados.length} meses acima da meta mensal`, icon: TrendingDown, accent: 'text-destructive' };
}

interface PipeDriveTabProps {
  canViewValues?: boolean;
  showValues?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  periodLabel?: string;
}

export function PipeDriveTab({
  canViewValues = false,
  showValues = false,
  dateFrom,
  dateTo,
  periodLabel,
}: PipeDriveTabProps) {
  const { items, isLoading, isError, refetch } = useComercialVendas();
  const [selectedBandeira, setSelectedBandeira] = useState<string | null>(null);
  const [drawerItem, setDrawerItem] = useState<ComercialVenda | null>(null);

  // ── Filtro de período da página (calendário) aplicado aos negócios ──
  // Comparação por ano-mês em string ("YYYY-MM") — evita o bug de fuso em que
  // "2026-04-01" vira 31/03 local e o mês inteiro some do trimestre.
  const itemsFiltrados = useMemo(() => {
    if (!dateFrom && !dateTo) return items;
    const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const fromYm = dateFrom ? ymOf(dateFrom) : null;
    const toYm = dateTo ? ymOf(dateTo) : null;
    return items.filter((item) => {
      const itemYm = item.period_month?.slice(0, 7) || item.closed_date?.slice(0, 7);
      if (!itemYm) return false;
      if (fromYm && itemYm < fromYm) return false;
      if (toYm && itemYm > toYm) return false;
      return true;
    });
  }, [items, dateFrom, dateTo]);

  // ── Stats sobre o período filtrado (somente percentuais) ──
  const stats = useMemo(() => {
    const totalValue = itemsFiltrados.reduce((s, i) => s + (i.deal_value ?? 0), 0);

    const orgMap = new Map<string, number>();
    for (const item of itemsFiltrados) {
      const org = item.organization || 'Outros';
      orgMap.set(org, (orgMap.get(org) ?? 0) + (item.deal_value ?? 0));
    }
    const vendasPorOrg = [...orgMap.entries()]
      .map(([bandeira, val]) => ({
        bandeira,
        percentual: totalValue > 0 ? Math.round((val / totalValue) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.percentual - a.percentual);

    const mesMap = new Map<string, number>();
    for (const item of itemsFiltrados) {
      const pm = item.period_month?.slice(0, 7) || item.closed_date?.slice(0, 7);
      if (!pm) continue;
      mesMap.set(pm, (mesMap.get(pm) ?? 0) + (item.deal_value ?? 0));
    }
    const vendasPorMes = [...mesMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, val]) => {
        const pct = Math.round((val / META_MENSAL) * 1000) / 10;
        return { mes: formatMonthYm(ym), percentualMeta: pct, atingiuMeta: pct >= 100 };
      });

    return {
      totalDeals: itemsFiltrados.length,
      vendasPorOrg,
      vendasPorMes,
      orgs: vendasPorOrg.map((v) => v.bandeira),
    };
  }, [itemsFiltrados]);

  const filteredVendas = useMemo(() => {
    if (!selectedBandeira) return stats.vendasPorOrg;
    return stats.vendasPorOrg.filter((v) => v.bandeira === selectedBandeira);
  }, [selectedBandeira, stats.vendasPorOrg]);

  const mesesComDados = stats.vendasPorMes.filter((m) => m.percentualMeta > 0);
  const mediaAtingimento = mesesComDados.length > 0
    ? Math.round(mesesComDados.reduce((s, m) => s + m.percentualMeta, 0) / mesesComDados.length * 10) / 10
    : 0;

  const sentiment = getDealValueSentiment(mesesComDados);

  const kpiCards = useMemo(() => ([
    {
      key: 'deals',
      label: 'Total negócios',
      value: stats.totalDeals,
      icon: FileText,
      accent: 'text-sky-600 bg-sky-500/12 border-sky-500/20',
    },
    {
      key: 'orgs',
      label: 'Organizações',
      value: stats.orgs.length,
      icon: Building2,
      accent: 'text-violet-600 bg-violet-500/12 border-violet-500/20',
    },
    {
      key: 'media',
      label: 'Média mensal',
      value: `${mediaAtingimento}%`,
      icon: Target,
      accent: 'text-emerald-600 bg-emerald-500/12 border-emerald-500/20',
    },
    {
      key: 'meta',
      label: 'Meses na meta',
      value: `${mesesComDados.filter((m) => m.atingiuMeta).length}/${mesesComDados.length}`,
      icon: TrendingUp,
      accent: 'text-amber-600 bg-amber-500/12 border-amber-500/20',
    },
  ]), [mediaAtingimento, mesesComDados, stats.orgs.length, stats.totalDeals]);

  const drawerFields: DrawerField[] = drawerItem ? [
    { label: 'Negócio', value: drawerItem.deal_title },
    { label: 'Organização', value: drawerItem.organization },
    { label: 'Observação', value: drawerItem.observation },
    { label: 'Fechamento', value: drawerItem.closed_date ? new Date(drawerItem.closed_date).toLocaleDateString('pt-BR') : '—' },
    { label: 'Período', value: drawerItem.period_month ? new Date(drawerItem.period_month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—' },
    {
      label: 'Produtos vendidos',
      value: (drawerItem.itens?.length ?? 0) > 0
        ? drawerItem.itens.map((i) => `${i.quantidade}× ${i.produto}`).join(', ')
        : '—',
    },
  ] : [];

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-4 items-stretch">
        <div className="grid gap-4 min-h-[352px] xl:grid-rows-[auto_1fr]">
          <Card className="border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Resumo do Fechamento{periodLabel ? ` — ${periodLabel}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">Negócios, organizações e leitura da meta mensal</p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4">
              {kpiCards.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.key}
                    className={`flex min-h-[116px] flex-col justify-between px-4 py-4 text-left ${index < kpiCards.length - 1 ? 'lg:border-r lg:border-border' : ''} ${index < 2 ? 'border-b border-border lg:border-b-0' : ''}`}
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
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="border bg-card">
            <div className="grid h-full grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
              <div className="flex flex-col justify-between px-4 py-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Situação comercial</p>
                  <p className={`text-2xl font-semibold ${sentiment.accent}`}>{isLoading ? '...' : sentiment.label}</p>
                </div>
                <p className="text-xs text-muted-foreground">{sentiment.description}</p>
              </div>

              <div className="flex flex-col justify-between px-4 py-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Meta mensal</p>
                  <p className="text-2xl font-semibold text-foreground font-mono">
                    {canViewValues
                      ? (showValues ? 'R$ 110K' : <span className="text-muted-foreground tracking-widest">R$ •••</span>)
                      : '—'}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Referência de 100% para o gráfico mensal</p>
              </div>

              <div className="flex flex-col justify-between px-4 py-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Fechamentos lidos</p>
                  <p className="text-2xl font-semibold text-foreground">{isLoading ? '...' : stats.vendasPorMes.length}</p>
                </div>
                <p className="text-xs text-muted-foreground">Meses com base para leitura do atingimento</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-4 min-h-[352px]">
          <div className="mb-1">
            <h3 className="text-sm font-semibold text-foreground">Fechamentos por Mês — % da Meta Mensal</h3>
            <p className="text-xs text-muted-foreground">Linha pontilhada = meta do mês (100%)</p>
          </div>
          <div className="h-[280px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.vendasPorMes} margin={{ left: 10, right: 20, top: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip content={<CustomTooltipMensal />} />
                <ReferenceLine y={100} stroke="hsl(var(--primary))" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Meta 100%', position: 'right', fill: 'hsl(var(--primary))', fontSize: 10 }} />
                <Bar dataKey="percentualMeta" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {stats.vendasPorMes.map((entry, i) => {
                    if (entry.percentualMeta < 50) return <Cell key={i} fill="hsl(var(--destructive))" />;
                    const intensity = Math.min(1, Math.max(0, (entry.percentualMeta - 50) / 100));
                    const lightness = 55 - intensity * 20;
                    const saturation = 45 + intensity * 30;
                    return <Cell key={i} fill={`hsl(142, ${saturation}%, ${lightness}%)`} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Vendas por Organização</h3>
              <p className="text-xs text-muted-foreground">Distribuição percentual</p>
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

      {/* Data table */}
      {!isLoading && itemsFiltrados.length === 0 ? (
        <DashboardEmptyState description="Nenhum negócio no período selecionado." />
      ) : (
        <DashboardDataTable
          title={`Negócios Fechados${periodLabel ? ` — ${periodLabel}` : ''}`}
          subtitle={`${itemsFiltrados.length} registros no período`}
          columns={columns}
          data={itemsFiltrados}
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
