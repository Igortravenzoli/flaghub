import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  TimelogAggregation,
  getCollaboratorExclusionKeys,
} from '@/hooks/useFabricaKpis';

// ── Timelog Infra ──────────────────────────────────────────────────────
// Reaproveita o pipeline de timelog da Fábrica (extensão TechsBCN coletada
// org-wide pela devops-sync-timelog → devops_time_logs → RPC
// rpc_devops_timelog_agg). Diferenças:
//   • filtro server-side por work item (itens da infra + tasks filhas),
//     em vez do p_work_item_ids: null usado pela fábrica;
//   • include-list de colaboradores: por padrão somente Igor e Rodolfo.

/** Primeiro nome normalizado dos colaboradores visíveis por padrão na infra */
export const INFRA_TIMELOG_DEFAULT_COLLABS = ['igor', 'rodolfo'] as const;

export interface InfraTimelogRow {
  work_item_id: number;
  user_name: string;
  total_minutes: number;
  max_log_date: string | null;
}

export interface InfraTimelogAgg {
  totalMinutes: number;
  totalHoras: number;
  apontamentos: number;
  itensComApontamento: number;
  colaboradoresAtivos: string[];
  porColaborador: TimelogAggregation[];
  porItem: (TimelogAggregation & { workItemId: number })[];
  detalhe: (InfraTimelogRow & { title: string | null })[];
}

/** true quando o nome do timelog corresponde a algum termo da include-list
 *  (compara nome completo normalizado, primeiro nome e dois primeiros nomes). */
export function collaboratorMatchesInclude(
  name: string | null | undefined,
  include: Set<string>,
): boolean {
  if (include.size === 0) return false;
  return getCollaboratorExclusionKeys(name).some((key) => include.has(key));
}

export function aggregateInfraTimelog(
  rows: InfraTimelogRow[],
  include: Set<string>,
  titleById: Map<number, string | null>,
): InfraTimelogAgg {
  const filtered = rows.filter((r) => collaboratorMatchesInclude(r.user_name, include));

  const byCollab = new Map<string, number>();
  const byItem = new Map<number, number>();
  for (const r of filtered) {
    byCollab.set(r.user_name, (byCollab.get(r.user_name) ?? 0) + r.total_minutes);
    byItem.set(r.work_item_id, (byItem.get(r.work_item_id) ?? 0) + r.total_minutes);
  }

  const totalMinutes = filtered.reduce((s, r) => s + r.total_minutes, 0);

  const porColaborador: TimelogAggregation[] = [...byCollab.entries()]
    .map(([name, minutes]) => ({ name, minutes, hours: Math.round((minutes / 60) * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours);

  const porItem = [...byItem.entries()]
    .map(([workItemId, minutes]) => ({
      workItemId,
      name: `#${workItemId} ${titleById.get(workItemId) ?? ''}`.trim(),
      minutes,
      hours: Math.round((minutes / 60) * 10) / 10,
    }))
    .sort((a, b) => b.hours - a.hours);

  return {
    totalMinutes,
    totalHoras: Math.round((totalMinutes / 60) * 10) / 10,
    apontamentos: filtered.length,
    itensComApontamento: byItem.size,
    colaboradoresAtivos: porColaborador.map((c) => c.name),
    porColaborador,
    porItem,
    detalhe: filtered
      .map((r) => ({ ...r, title: titleById.get(r.work_item_id) ?? null }))
      .sort((a, b) => (b.max_log_date ?? '').localeCompare(a.max_log_date ?? '')),
  };
}

interface ChildTask {
  id: number;
  parent_id: number | null;
  title: string | null;
}

export function useInfraTimelog(
  dateFrom: Date | undefined,
  dateTo: Date | undefined,
  workItemIds: number[],
) {
  const fromStr = dateFrom ? dateFrom.toISOString().split('T')[0] : null;
  const toStr = dateTo ? dateTo.toISOString().split('T')[0] : null;
  const idsKey = [...workItemIds].sort((a, b) => a - b).join(',');

  return useQuery({
    queryKey: ['infra', 'timelog', fromStr, toStr, idsKey],
    queryFn: async () => {
      // Apontamentos são feitos nas Tasks — expande os itens da infra com as
      // tasks filhas (1 nível), igual à consolidação da fábrica.
      const childTasks: ChildTask[] = [];
      for (let i = 0; i < workItemIds.length; i += 200) {
        const chunk = workItemIds.slice(i, i + 200);
        const { data, error } = await supabase
          .from('devops_work_items')
          .select('id, parent_id, title')
          .in('parent_id', chunk);
        if (error) throw error;
        childTasks.push(...((data ?? []) as ChildTask[]));
      }

      const allIds = [...new Set([...workItemIds, ...childTasks.map((t) => t.id)])];
      if (allIds.length === 0) {
        return { rows: [] as InfraTimelogRow[], childTasks };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('rpc_devops_timelog_agg', {
        p_from: fromStr,
        p_to: toStr,
        p_work_item_ids: allIds,
      });
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: InfraTimelogRow[] = (data || []).map((row: any) => ({
        work_item_id: row.work_item_id as number,
        user_name: (row.user_name as string) ?? '',
        total_minutes: (row.total_minutes as number) ?? 0,
        max_log_date: (row.max_log_date as string) ?? null,
      }));

      return { rows, childTasks };
    },
    enabled: workItemIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
