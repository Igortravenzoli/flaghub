import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PbiHealthSummary, PbiLifecycleSummary } from '@/types/pbi';

const CHUNK_SIZE = 150;

function uniqueIds(ids: Array<number | null | undefined>): number[] {
  return [...new Set(ids.filter((id): id is number => Number.isFinite(id) && (id || 0) > 0))];
}

function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  if (arr.length <= chunkSize) return [arr];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

export function usePbiHealthBatch(ids: Array<number | null | undefined>, enabled = true) {
  const stableIds = useMemo(() => uniqueIds(ids), [ids]);

  const query = useQuery({
    queryKey: ['pbi', 'health-batch', stableIds],
    enabled: enabled && stableIds.length > 0,
    queryFn: async () => {
      const healthRows: PbiHealthSummary[] = [];
      const lifecycleRows: PbiLifecycleSummary[] = [];

      for (const chunk of chunkArray(stableIds, CHUNK_SIZE)) {
        const [{ data: hData, error: hErr }, { data: lData, error: lErr }] = await Promise.all([
          (supabase as any)
            .from('pbi_health_summary')
            .select('*')
            .in('work_item_id', chunk),
          (supabase as any)
            .from('pbi_lifecycle_summary')
            .select('*')
            .in('work_item_id', chunk),
        ]);

        if (hErr) throw hErr;
        if (lErr) throw lErr;

        healthRows.push(...((hData || []) as PbiHealthSummary[]));
        lifecycleRows.push(...((lData || []) as PbiLifecycleSummary[]));
      }

      const healthById = new Map<number, PbiHealthSummary>();
      for (const row of healthRows) {
        healthById.set(row.work_item_id, row);
      }

      const lifecycleById = new Map<number, PbiLifecycleSummary>();
      for (const row of lifecycleRows) {
        lifecycleById.set(row.work_item_id, row);
      }

      return { healthById, lifecycleById };
    },
    staleTime: 60 * 1000,
  });

  const healthById = query.data?.healthById || new Map<number, PbiHealthSummary>();
  const lifecycleById = query.data?.lifecycleById || new Map<number, PbiLifecycleSummary>();

  const overview = useMemo(() => {
    const counts = { total: stableIds.length, verde: 0, amarelo: 0, vermelho: 0 };
    for (const id of stableIds) {
      const status = healthById.get(id)?.health_status;
      if (status === 'verde') counts.verde += 1;
      if (status === 'amarelo') counts.amarelo += 1;
      if (status === 'vermelho') counts.vermelho += 1;
    }
    return counts;
  }, [healthById, stableIds]);

  return {
    healthById,
    lifecycleById,
    overview,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
