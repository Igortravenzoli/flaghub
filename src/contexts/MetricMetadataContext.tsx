import { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type MetricRow = {
  metric_key: string | null;
  metric_name: string | null;
  formula_description: string | null;
  notes: string | null;
};

type MetricMetadataValue = {
  getMetricInfo: (metricName: string, metricKey?: string) => { formula?: string; description?: string } | null;
};

const MetricMetadataContext = createContext<MetricMetadataValue | null>(null);

function normalizeAreaKey(areaKey?: string): string | null {
  if (!areaKey) return null;
  if (areaKey === 'customer-service') return 'customer_service';
  return areaKey;
}

export function MetricMetadataProvider({ areaKey, children }: { areaKey?: string; children: React.ReactNode }) {
  const normalizedAreaKey = normalizeAreaKey(areaKey);

  const query = useQuery({
    queryKey: ['metric-formulas', normalizedAreaKey],
    queryFn: async () => {
      if (!normalizedAreaKey) return [] as MetricRow[];
      const { data, error } = await (supabase as any)
        .from('vw_hub_metric_formulas')
        .select('metric_key, metric_name, formula_description, notes')
        .eq('area_key', normalizedAreaKey)
        .eq('status', 'active');
      if (error) throw error;
      return (data || []) as MetricRow[];
    },
    enabled: !!normalizedAreaKey,
    staleTime: 10 * 60 * 1000,
  });

  const value = useMemo<MetricMetadataValue>(() => {
    const byName = new Map<string, MetricRow>();
    const byKey = new Map<string, MetricRow>();

    for (const row of (query.data || [])) {
      if (row.metric_name) byName.set(row.metric_name.toLowerCase(), row);
      if (row.metric_key) byKey.set(row.metric_key.toLowerCase(), row);
    }

    return {
      getMetricInfo: (metricName: string, metricKey?: string) => {
        const fromKey = metricKey ? byKey.get(metricKey.toLowerCase()) : undefined;
        const fromName = byName.get(metricName.toLowerCase());
        const row = fromKey || fromName;
        if (!row) return null;
        return {
          formula: row.formula_description || undefined,
          description: row.notes || undefined,
        };
      },
    };
  }, [query.data]);

  return (
    <MetricMetadataContext.Provider value={value}>
      {children}
    </MetricMetadataContext.Provider>
  );
}

export function useMetricMetadata() {
  return useContext(MetricMetadataContext);
}
