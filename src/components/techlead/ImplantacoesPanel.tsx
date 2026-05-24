import { useState, useMemo } from 'react';
import { useCustomerServiceKpis } from '@/hooks/useCustomerServiceKpis';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardDataTable, DataTableColumn } from '@/components/dashboard/DashboardDataTable';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Package, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import type { CSKpiItem } from '@/hooks/useCustomerServiceKpis';

type ImplFilter = 'all' | 'impl_andamento' | 'impl_finalizadas' | 'consultor' | 'produto';

const ENCERRADO = ['finalizado', 'concluído', 'concluido', '8 - encerrado', 'encerrado', '11 - cancelado', 'cancelado'];

const PIE_COLORS = [
  'hsl(199,89%,48%)', 'hsl(43,85%,46%)', 'hsl(142,71%,45%)',
  'hsl(262,83%,58%)', 'hsl(0,84%,60%)', 'hsl(174,58%,40%)',
  'hsl(29,80%,50%)', 'hsl(340,75%,55%)',
];

function fmtDateStr(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR');
}

const implColumns: DataTableColumn<CSKpiItem>[] = [
  { key: 'title', header: 'Cliente', className: 'max-w-[200px] truncate font-medium' },
  { key: 'consultor_impl', header: 'Consultor' },
  { key: 'solucao', header: 'Solução' },
  { key: 'status_implantacao', header: 'Status', render: r => <Badge variant="outline" className="text-xs">{r.status_implantacao || '—'}</Badge> },
  { key: 'created_date', header: 'Início', render: r => fmtDateStr(r.created_date) },
  { key: 'changed_date', header: 'Fim', render: r => fmtDateStr(r.changed_date) },
];

export function ImplantacoesPanel() {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const { implantacoes, implAndamento, implFinalizadas, implTotal, isLoading, isError, refetch } =
    useCustomerServiceKpis(yearStart, now, 'all');

  const [implFilter, setImplFilter] = useState<ImplFilter>('all');
  const [implFilterValue, setImplFilterValue] = useState<string | null>(null);

  const consultorChartData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of implantacoes) {
      const c = i.consultor_impl || 'Não atribuído';
      map[c] = (map[c] || 0) + 1;
    }
    return Object.entries(map).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }));
  }, [implantacoes]);

  const implProductChartData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of implantacoes) {
      const p = i.solucao || 'Sem produto';
      map[p] = (map[p] || 0) + 1;
    }
    return Object.entries(map).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value }));
  }, [implantacoes]);

  const filteredImpl = useMemo(() => {
    if (implFilter === 'impl_andamento') return implantacoes.filter(i => i.status_implantacao && !ENCERRADO.includes(i.status_implantacao.toLowerCase()));
    if (implFilter === 'impl_finalizadas') return implantacoes.filter(i => i.status_implantacao && ENCERRADO.includes(i.status_implantacao.toLowerCase()));
    if (implFilter === 'consultor' && implFilterValue) return implantacoes.filter(i => (i.consultor_impl || 'Não atribuído') === implFilterValue);
    if (implFilter === 'produto' && implFilterValue) return implantacoes.filter(i => (i.solucao || 'Sem produto') === implFilterValue);
    return implantacoes;
  }, [implantacoes, implFilter, implFilterValue]);

  const handleImplClick = (filter: ImplFilter, value?: string) => {
    if (implFilter === filter && implFilterValue === (value || null)) {
      setImplFilter('all');
      setImplFilterValue(null);
    } else {
      setImplFilter(filter);
      setImplFilterValue(value || null);
    }
  };

  if (isError) return <DashboardEmptyState variant="error" onRetry={refetch} />;

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <DashboardKpiCard label="Total Implantações" value={implTotal} icon={Package} isLoading={isLoading} onClick={() => handleImplClick('all')} active={implFilter === 'all'} />
        <DashboardKpiCard label="Em Andamento" value={implAndamento} icon={Clock} isLoading={isLoading} delay={80} accent="bg-[hsl(43,85%,46%)]" onClick={() => handleImplClick('impl_andamento')} active={implFilter === 'impl_andamento'} />
        <DashboardKpiCard label="Finalizadas" value={implFinalizadas} icon={TrendingUp} isLoading={isLoading} delay={160} accent="bg-[hsl(142,71%,45%)]" onClick={() => handleImplClick('impl_finalizadas')} active={implFilter === 'impl_finalizadas'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {consultorChartData.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Implantações por Consultor</h3>
              {implFilter === 'consultor' && implFilterValue && (
                <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => { setImplFilter('all'); setImplFilterValue(null); }}>
                  {implFilterValue} ✕
                </Badge>
              )}
            </div>
            <ResponsiveContainer width="100%" height={Math.max(180, consultorChartData.length * 32)}>
              <BarChart data={consultorChartData} layout="vertical" onClick={(e) => { if (e?.activeLabel) handleImplClick('consultor', e.activeLabel); }} className="cursor-pointer">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={130} />
                <RechartsTooltip />
                <Bar dataKey="value" fill="hsl(262,83%,58%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {implProductChartData.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Implantações por Produto</h3>
              {implFilter === 'produto' && implFilterValue && (
                <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => { setImplFilter('all'); setImplFilterValue(null); }}>
                  {implFilterValue} ✕
                </Badge>
              )}
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={implProductChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  cornerRadius={4}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
                  fontSize={10}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                  onClick={(_, idx) => { const item = implProductChartData[idx]; if (item) handleImplClick('produto', item.name); }}
                  className="cursor-pointer"
                >
                  {implProductChartData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(v: number) => [v, 'Qtd']} contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid hsl(var(--border))' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {!isLoading && filteredImpl.length === 0 ? (
        <DashboardEmptyState description="Nenhuma implantação encontrada." />
      ) : (
        <DashboardDataTable
          title="Implantações"
          subtitle={`${filteredImpl.length} registros${implFilter !== 'all' ? ` • filtro: ${implFilter}${implFilterValue ? ` (${implFilterValue})` : ''}` : ''}`}
          columns={implColumns}
          data={filteredImpl}
          isLoading={isLoading}
          getRowKey={(r) => `${r.title ?? ''}-${r.created_date ?? ''}`}
          searchPlaceholder="Buscar implantação..."
        />
      )}
    </div>
  );
}
