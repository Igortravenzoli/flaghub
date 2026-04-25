import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Info, Sigma } from 'lucide-react';
import { DashboardDrawer, DrawerField } from '@/components/dashboard/DashboardDrawer';
import { useMetricMetadata, type MetricInfo } from '@/contexts/MetricMetadataContext';

export function KpiHelpTab() {
  const metadata = useMetricMetadata();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MetricInfo | null>(null);

  const metrics = metadata?.listMetrics() || [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return metrics;
    return metrics.filter((m) => {
      const haystack = [m.name, m.key, m.formula, m.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [metrics, query]);

  const fields: DrawerField[] = selected
    ? [
        { label: 'Métrica', value: selected.name },
        { label: 'Chave', value: selected.key || '—' },
        { label: 'Fórmula', value: selected.formula || 'Não cadastrada' },
        { label: 'Descrição', value: selected.description || 'Não cadastrada' },
      ]
    : [];

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Ajuda de KPIs</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Consulte fórmula e contexto operacional das métricas deste setor.
            </p>
          </div>
          <Badge variant="outline" className="w-fit">
            {filtered.length} KPI(s)
          </Badge>
        </div>

        <div className="mt-3 relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar KPI por nome, fórmula ou descrição"
            className="pl-9"
          />
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-6 text-center">
          <Info className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum KPI encontrado para o termo informado.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((metric) => (
            <Card key={metric.key || metric.name} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{metric.name}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {metric.formula || 'Fórmula não cadastrada'}
                  </p>
                </div>
                <Sigma className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <Badge variant="secondary" className="max-w-[70%] truncate">
                  {metric.key || 'sem-chave'}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => setSelected(metric)}>
                  Ver detalhes
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <DashboardDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Ajuda de KPI"
        subtitle={selected?.name}
        fields={fields}
      />
    </div>
  );
}
