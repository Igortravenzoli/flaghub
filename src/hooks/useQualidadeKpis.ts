import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

export interface QualidadeItem {
  id: number | null;
  title: string | null;
  work_item_type: string | null;
  state: string | null;
  assigned_to_display: string | null;
  priority: number | null;
  tags?: string | null;
  created_date: string | null;
  changed_date: string | null;
  iteration_path?: string | null;
  sprint_code?: string | null;
  web_url: string | null;
  qa_retorno_count?: number;
  returned_by?: string | null;
  is_current_queue?: boolean;
  is_waiting_deploy?: boolean;
  has_sprint_code?: boolean;
  snapshot_at?: string | null;
}

const QUALITY_TEST_STATES = new Set(['Em Teste', 'Aguardando Deploy']);
const QUALITY_TESTING_STATES = new Set(['Em Teste']);
const QUALITY_DEPLOY_STATES = new Set(['Aguardando Deploy']);

function isQualityQueueState(state: string | null | undefined): boolean {
  return QUALITY_TEST_STATES.has(state || '');
}

function isInRange(dateStr: string | null, from: Date, to: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

export function useQualidadeKpis(dateFrom?: Date, dateTo?: Date, sprintFilter: string = 'all') {
  const query = useQuery({
    queryKey: ['qualidade', 'kpis'],
    queryFn: async () => {
      return fetchAllRows<QualidadeItem>((from, to) =>
        supabase.from('vw_qualidade_kpis').select('*').range(from, to)
      );
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Fetch retorno QA counts from state_history (primary), pbi_lifecycle_summary, and custom_fields (fallbacks)
  const retornoQuery = useQuery({
    queryKey: ['qualidade', 'retornos'],
    queryFn: async () => {
      const qaIds = (query.data || []).map(i => i.id).filter(Boolean) as number[];
      if (qaIds.length === 0) return new Map<number, number>();
      
      const retornoMap = new Map<number, number>();
      for (let i = 0; i < qaIds.length; i += 1000) {
        const chunk = qaIds.slice(i, i + 1000);
        const [{ data: wiData }, { data: lcData }] = await Promise.all([
          supabase
            .from('devops_work_items')
            .select('id, custom_fields, state_history')
            .in('id', chunk),
          (supabase as any)
            .from('pbi_lifecycle_summary')
            .select('work_item_id, qa_return_count')
            .in('work_item_id', chunk),
        ]);
        
        // First populate from lifecycle summary
        for (const row of (lcData || [])) {
          if (row.qa_return_count > 0) {
            retornoMap.set(row.work_item_id, row.qa_return_count);
          }
        }
        
        // Then compute from state_history (highest priority)
        for (const item of (wiData || [])) {
          const stateHistory = (item as any).state_history as Array<{ oldValue: string | null; newValue: string }> | null;
          if (stateHistory && stateHistory.length > 0) {
            // Count entries into "Em Teste" after the first one
            let emTesteEntries = 0;
            for (const change of stateHistory) {
              if (change.newValue === 'Em Teste') emTesteEntries++;
            }
            const qaReturns = Math.max(0, emTesteEntries - 1);
            if (qaReturns > 0) {
              retornoMap.set(item.id, qaReturns);
            }
          } else {
            // Fallback to custom_fields
            const cf = item.custom_fields as Record<string, any> | null;
            const retornoCount = cf?.qa_return_count ?? cf?.qa_retorno_count;
            if (retornoCount != null && Number(retornoCount) > 0) {
              retornoMap.set(item.id, Math.max(Number(retornoCount), retornoMap.get(item.id) || 0));
            }
          }
        }
      }
      return retornoMap;
    },
    enabled: !!query.data && query.data.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const lastSyncQuery = useQuery({
    queryKey: ['qualidade', 'last-sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('devops_queries')
        .select('last_synced_at')
        .eq('sector', 'qualidade')
        .order('last_synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.last_synced_at || null;
    },
    staleTime: 60 * 1000,
  });

  const allItems = query.data || [];
  const retornoMap = retornoQuery.data || new Map<number, number>();

  // Enrich items with retorno count
  const enrichedItems: QualidadeItem[] = allItems.map(item => ({
    ...item,
    qa_retorno_count: item.id ? (retornoMap.get(item.id) ?? 0) : 0,
  }));

  const currentQueueItems = enrichedItems.filter(i => isQualityQueueState(i.state));

  const sprintScopedItems = sprintFilter === 'all'
    ? currentQueueItems
    : currentQueueItems.filter(i => i.iteration_path === sprintFilter);

  const items = (dateFrom && dateTo)
    ? sprintScopedItems.filter(i => isInRange(i.created_date, dateFrom, dateTo) || isInRange(i.changed_date, dateFrom, dateTo))
    : sprintScopedItems;

  const total = items.length;
  const filaAtual = currentQueueItems.length;
  const filaQA = items.length;
  const emTeste = items.filter(i => QUALITY_TESTING_STATES.has(i.state || '')).length;
  const aguardandoDeploy = items.filter(i => QUALITY_DEPLOY_STATES.has(i.state || '')).length;
  const finalizados = 0;
  const taxaVazao = total > 0 ? Math.round((aguardandoDeploy / total) * 100) : 0;
  const herdadosSprintPassada = sprintFilter === 'all'
    ? 0
    : currentQueueItems.filter(i => i.iteration_path !== sprintFilter).length;

  // Retorno QA KPIs
  const itensComRetorno = items.filter(i => (i.qa_retorno_count ?? 0) > 0);
  const totalRetornos = items.reduce((sum, i) => sum + (i.qa_retorno_count ?? 0), 0);
  const taxaRetorno = total > 0 ? Math.round((itensComRetorno.length / total) * 100) : 0;

  const avioesTestados = currentQueueItems.filter(i => {
    const hasAviaoTag = (i.tags || '').toUpperCase().includes('AVIAO');
    const testedState = QUALITY_TEST_STATES.has(i.state || '');
    return hasAviaoTag && testedState;
  }).length;

  return {
    items,
    allItems,
    enrichedItems,
    currentQueueItems,
    total,
    filaQA,
    filaAtual,
    emTeste,
    aguardandoDeploy,
    finalizados,
    taxaVazao,
    herdadosSprintPassada,
    totalRetornos,
    itensComRetorno: itensComRetorno.length,
    taxaRetorno,
    avioesTestados,
    lastSync: lastSyncQuery.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
