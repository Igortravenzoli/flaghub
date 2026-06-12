import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { extractSprintCodeFromPath } from '@/lib/sprintCalendar';

export interface InfraItem {
  id: number | null;
  title: string | null;
  work_item_type: string | null;
  state: string | null;
  assigned_to_display: string | null;
  priority: number | null;
  effort: number | null;
  tags: string | null;
  iteration_path?: string | null;
  transbordo_count?: number;
  sprint_migration_count?: number;
  real_overflow_count?: number;
  created_date: string | null;
  changed_date: string | null;
  web_url: string | null;
}

function isInRange(dateStr: string | null, from: Date, to: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

// Estados alinhados ao board DevOps da infra (inclui estados customizados).
const INFRA_PENDENTE_STATES = new Set(['new', 'to do']);
const INFRA_ANDAMENTO_STATES = new Set([
  'in progress', 'active', 'em desenvolvimento', 'em teste', 'aguardando teste', 'aguardando deploy',
]);
const INFRA_DONE_STATES = new Set(['done', 'closed', 'resolved']);

const normState = (s: string | null | undefined) => (s || '').trim().toLowerCase();

export const isInfraPendente = (s: string | null | undefined) => INFRA_PENDENTE_STATES.has(normState(s));
export const isInfraAndamento = (s: string | null | undefined) => INFRA_ANDAMENTO_STATES.has(normState(s));
export const isInfraDone = (s: string | null | undefined) => INFRA_DONE_STATES.has(normState(s));

export interface DoneBySprint {
  sprintPath: string;
  sprintCode: string;
  done: number;
  total: number;
}

export function useInfraestruturaKpis(dateFrom?: Date, dateTo?: Date, sprintFilter: string | string[] = 'all') {
  const query = useQuery({
    queryKey: ['infraestrutura', 'kpis'],
    queryFn: async () => {
      // Paginado: com os itens [INFRA] a view passa de 900 linhas (cap 1000/request)
      return fetchAllRows<InfraItem>((from, to) =>
        supabase.from('vw_infraestrutura_kpis').select('*').range(from, to)
      );
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const lastSyncQuery = useQuery({
    queryKey: ['infraestrutura', 'last-sync'],
    queryFn: async () => {
      // Try sector-specific query first
      const { data } = await supabase
        .from('devops_queries')
        .select('last_synced_at')
        .eq('sector', 'infraestrutura')
        .order('last_synced_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (data?.last_synced_at) return data.last_synced_at;
      // Fallback: use the base general query sync date
      const { data: fallback } = await supabase
        .from('devops_queries')
        .select('last_synced_at')
        .not('last_synced_at', 'is', null)
        .order('last_synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return fallback?.last_synced_at || null;
    },
    staleTime: 60 * 1000,
  });

  const allItems = query.data || [];

  const transbordoMapQuery = useQuery({
    queryKey: ['infraestrutura', 'transbordo-map', allItems.map(i => i.id).filter(Boolean).join(',')],
    queryFn: async () => {
      const ids = allItems.map(i => i.id).filter((id): id is number => id != null);
      if (ids.length === 0) return new Map<number, { sprintMigrationCount: number; realOverflowCount: number }>();

      const map = new Map<number, { sprintMigrationCount: number; realOverflowCount: number }>();
      for (let i = 0; i < ids.length; i += 1000) {
        const chunk = ids.slice(i, i + 1000);
        const { data } = await (supabase as any)
          .from('devops_work_items')
          .select('id, iteration_history')
          .in('id', chunk);

        for (const row of (data || [])) {
          const history = (row.iteration_history || []) as Array<{ oldValue: string; newValue: string }>;
          const relevantChanges = history.filter((h) => {
            const oldValue = h.oldValue || '';
            const newValue = h.newValue || '';
            const oldCode = extractSprintCodeFromPath(oldValue);
            const newCode = extractSprintCodeFromPath(newValue);

            if (!newCode) return false;
            if (oldCode) return oldCode !== newCode;
            return !/backlog/i.test(oldValue);
          });
          map.set(row.id, {
            sprintMigrationCount: relevantChanges.length,
            realOverflowCount: Math.max(0, relevantChanges.length - 1),
          });
        }
      }

      return map;
    },
    enabled: allItems.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const transbordoMap = transbordoMapQuery.data || new Map<number, { sprintMigrationCount: number; realOverflowCount: number }>();

  const allItemsEnriched = allItems.map((item) => ({
    ...item,
    sprint_migration_count: item.id ? (transbordoMap.get(item.id)?.sprintMigrationCount || 0) : 0,
    real_overflow_count: item.id ? (transbordoMap.get(item.id)?.realOverflowCount || 0) : 0,
    transbordo_count: item.id ? (transbordoMap.get(item.id)?.realOverflowCount || 0) : 0,
  }));

  // Sprint é o filtro primário (single ou multi). Quando há sprint
  // selecionada, NÃO recorta por data — itens planejados na sprint mas
  // criados/alterados fora da janela contam normalmente (paridade com o board).
  const sprintSet = Array.isArray(sprintFilter)
    ? new Set(sprintFilter.filter(s => s && s !== 'all'))
    : null;
  const hasSprintScope = sprintSet ? sprintSet.size > 0 : sprintFilter !== 'all';

  const sprintScopedItems = !hasSprintScope
    ? allItemsEnriched
    : allItemsEnriched.filter(i => !!i.iteration_path && (sprintSet ? sprintSet.has(i.iteration_path) : i.iteration_path === sprintFilter));

  const items = (!hasSprintScope && dateFrom && dateTo)
    ? sprintScopedItems.filter(i => isInRange(i.created_date, dateFrom, dateTo) || isInRange(i.changed_date, dateFrom, dateTo))
    : sprintScopedItems;

  const total = items.length;
  const pendentes = items.filter(i => isInfraPendente(i.state)).length;
  const emAndamento = items.filter(i => isInfraAndamento(i.state)).length;
  const concluidos = items.filter(i => isInfraDone(i.state)).length;

  // Done por sprint (todas as sprints mapeadas, ordenadas) — para o histograma
  // de evolução na Visão Geral.
  const doneBySprint: DoneBySprint[] = (() => {
    const bySprint = new Map<string, { done: number; total: number }>();
    for (const item of allItemsEnriched) {
      const code = item.iteration_path ? extractSprintCodeFromPath(item.iteration_path) : null;
      if (!code || !item.iteration_path) continue;
      const cur = bySprint.get(item.iteration_path) ?? { done: 0, total: 0 };
      cur.total++;
      if (isInfraDone(item.state)) cur.done++;
      bySprint.set(item.iteration_path, cur);
    }
    return [...bySprint.entries()]
      .map(([sprintPath, v]) => ({ sprintPath, sprintCode: extractSprintCodeFromPath(sprintPath) || sprintPath, ...v }))
      .sort((a, b) => {
        const pa = a.sprintCode.match(/S(\d+)-(\d{4})/);
        const pb = b.sprintCode.match(/S(\d+)-(\d{4})/);
        if (!pa || !pb) return a.sprintCode.localeCompare(b.sprintCode);
        return (parseInt(pa[2]) - parseInt(pb[2])) || (parseInt(pa[1]) - parseInt(pb[1]));
      });
  })();

  const countByTag = (tag: string) => items.filter(i => i.tags?.toUpperCase().includes(tag.toUpperCase())).length;
  const melhorias = countByTag('MELHORIA');
  const iso27001 = countByTag('ISO27001') + countByTag('ISO');
  const sprintMigracoes = items.reduce((sum, i) => sum + (i.sprint_migration_count || 0), 0);
  const transbordo = items.reduce((sum, i) => sum + (i.real_overflow_count || 0), 0);

  const backlog = pendentes;
  const dev = emAndamento;

  return {
    items,
    allItems: allItemsEnriched,
    total,
    pendentes,
    emAndamento,
    concluidos,
    melhorias,
    iso27001,
    sprintMigracoes,
    transbordo,
    backlog,
    dev,
    doneBySprint,
    lastSync: lastSyncQuery.data,
    isLoading: query.isLoading || transbordoMapQuery.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
