import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';

export interface ComercialVenda {
  id: string;
  deal_title: string | null;
  organization: string | null;
  observation: string | null;
  deal_value: number | null;
  closed_date: string | null;
  period_month: string | null;
  source_sheet: string | null;
  created_at: string;
}

export function useComercialVendas() {
  const query = useQuery({
    queryKey: ['comercial', 'vendas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comercial_vendas')
        .select('*')
        .order('closed_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ComercialVenda[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const items = query.data ?? [];

  const stats = useMemo(() => {
    if (items.length === 0)
      return {
        totalDeals: 0,
        vendasPorOrg: [] as { bandeira: string; percentual: number }[],
        vendasPorMes: [] as { mes: string; percentualMeta: number; atingiuMeta: boolean }[],
        orgs: [] as string[],
      };

    const totalValue = items.reduce((s, i) => s + (i.deal_value ?? 0), 0);

    // Group by organization -> % distribution
    const orgMap = new Map<string, number>();
    for (const item of items) {
      const org = item.organization || 'Outros';
      orgMap.set(org, (orgMap.get(org) ?? 0) + (item.deal_value ?? 0));
    }
    const vendasPorOrg = [...orgMap.entries()]
      .map(([bandeira, val]) => ({
        bandeira,
        percentual: totalValue > 0 ? Math.round((val / totalValue) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.percentual - a.percentual);

    // Group by period_month -> % of meta (use average deal as proxy since no explicit meta)
    const mesMap = new Map<string, number>();
    for (const item of items) {
      const pm = item.period_month?.slice(0, 7) || 'unknown';
      mesMap.set(pm, (mesMap.get(pm) ?? 0) + (item.deal_value ?? 0));
    }
    const mesValues = [...mesMap.values()];
    const avgMes = mesValues.length > 0 ? mesValues.reduce((s, v) => s + v, 0) / mesValues.length : 1;

    const vendasPorMes = [...mesMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, val]) => {
        const pct = avgMes > 0 ? Math.round((val / avgMes) * 1000) / 10 : 0;
        return {
          mes: formatMonth(mes),
          percentualMeta: pct,
          atingiuMeta: pct >= 100,
        };
      });

    return {
      totalDeals: items.length,
      vendasPorOrg,
      vendasPorMes,
      orgs: vendasPorOrg.map((v) => v.bandeira),
    };
  }, [items]);

  return { items, stats, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}

function formatMonth(ym: string) {
  const [y, m] = ym.split('-');
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${months[parseInt(m, 10) - 1] ?? m} ${y}`;
}
