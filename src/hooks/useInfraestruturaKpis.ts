import { CADENCIA_MINIMA_MS } from '@/lib/cadencia';
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

/** Todas as colunas da `vw_infraestrutura_kpis` — a tela de mesa usa todas. */
export const VW_INFRA_COLUNAS =
  'id, title, work_item_type, state, assigned_to_display, priority, effort, tags, created_date, changed_date, web_url, iteration_path';

/**
 * As colunas que o telão (Visão Executiva em tvMode) e o card do Home leem:
 * estado (contagens), tags (melhoria/ISO/#Risco), sprint (done por sprint e
 * filtro do Home), datas (recorte do período; `created_date` também nos dias sem
 * risco) e título (lista de riscos #Risco). Fora: web_url, assigned_to_display,
 * work_item_type, priority, effort — ~42% dos bytes da view.
 */
export const VW_INFRA_COLUNAS_ENXUTAS =
  'id, title, state, tags, created_date, changed_date, iteration_path';

const INFRA_ITEM_VAZIO: Omit<InfraItem, 'id'> = {
  title: null, work_item_type: null, state: null, assigned_to_display: null, priority: null,
  effort: null, tags: null, iteration_path: null, created_date: null, changed_date: null, web_url: null,
};

export function completarInfraItem(parcial: Partial<InfraItem>): InfraItem {
  return { ...INFRA_ITEM_VAZIO, id: null, ...parcial };
}

export interface UseInfraestruturaKpisOptions {
  /** Lê só `VW_INFRA_COLUNAS_ENXUTAS` (cache próprio). Telão e Home com a política do telão. */
  visaoEnxuta?: boolean;
  /**
   * Histórico de sprint (`iteration_history`) para migrações/transbordo:
   *   • 'todos' (padrão): de todos os itens da view — a tela de mesa expõe os
   *     contadores por item em `allItems`;
   *   • 'escopo': só dos itens no recorte (`items`) — basta para `sprintMigracoes`
   *     e `transbordo`, que somam só o recorte (telão);
   *   • 'nenhum': não busca — quem só lê contagens (cards do Home).
   */
  transbordo?: 'todos' | 'escopo' | 'nenhum';
}

/** Migrações de sprint relevantes num `iteration_history` (regra única do hook). */
export function contarMigracoesSprint(history: Array<{ oldValue: string; newValue: string }> | null | undefined): number {
  return (history || []).filter((h) => {
    const oldValue = h.oldValue || '';
    const newValue = h.newValue || '';
    const oldCode = extractSprintCodeFromPath(oldValue);
    const newCode = extractSprintCodeFromPath(newValue);

    if (!newCode) return false;
    if (oldCode) return oldCode !== newCode;
    return !/backlog/i.test(oldValue);
  }).length;
}

export function useInfraestruturaKpis(
  dateFrom?: Date,
  dateTo?: Date,
  sprintFilter: string | string[] = 'all',
  options?: UseInfraestruturaKpisOptions,
) {
  const visaoEnxuta = options?.visaoEnxuta ?? false;
  const modoTransbordo = options?.transbordo ?? 'todos';
  const query = useQuery({
    // Cache próprio para a leitura enxuta: com a mesma chave a mesa receberia
    // linhas sem web_url/responsável.
    queryKey: visaoEnxuta ? ['infraestrutura', 'kpis', 'enxuta'] : ['infraestrutura', 'kpis'],
    queryFn: async () => {
      // Paginado: com os itens [INFRA] a view passa de 900 linhas (cap 1000/request)
      const linhas = await fetchAllRows<InfraItem>((from, to) =>
        supabase
          .from('vw_infraestrutura_kpis')
          .select(visaoEnxuta ? VW_INFRA_COLUNAS_ENXUTAS : VW_INFRA_COLUNAS)
          .range(from, to) as unknown as PromiseLike<{ data: InfraItem[] | null; error: unknown }>
      );
      return visaoEnxuta ? linhas.map(completarInfraItem) : linhas;
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
    staleTime: CADENCIA_MINIMA_MS,
  });

  const allItems = query.data || [];

  // Sprint é o filtro primário (single ou multi). Quando há sprint
  // selecionada, NÃO recorta por data — itens planejados na sprint mas
  // criados/alterados fora da janela contam normalmente (paridade com o board).
  const sprintSet = Array.isArray(sprintFilter)
    ? new Set(sprintFilter.filter(s => s && s !== 'all'))
    : null;
  const hasSprintScope = sprintSet ? sprintSet.size > 0 : sprintFilter !== 'all';

  /** O recorte de `items` (sprint, ou período sem sprint) — só sobre campos da view. */
  const recortar = <T extends InfraItem>(lista: T[]): T[] => {
    const porSprint = !hasSprintScope
      ? lista
      : lista.filter(i => !!i.iteration_path && (sprintSet ? sprintSet.has(i.iteration_path) : i.iteration_path === sprintFilter));
    return (!hasSprintScope && dateFrom && dateTo)
      ? porSprint.filter(i => isInRange(i.created_date, dateFrom, dateTo) || isInRange(i.changed_date, dateFrom, dateTo))
      : porSprint;
  };

  /**
   * Ids cujo `iteration_history` é baixado. Ordenados na chave: a view não tem
   * ORDER, e a mesma lista em outra ordem virava outra chave (= outro download).
   */
  const idsTransbordo = modoTransbordo === 'nenhum'
    ? []
    : [...new Set((modoTransbordo === 'escopo' ? recortar(allItems) : allItems)
        .map(i => i.id)
        .filter((id): id is number => id != null))].sort((a, b) => a - b);

  const transbordoMapQuery = useQuery({
    queryKey: ['infraestrutura', 'transbordo-map', idsTransbordo.join(',')],
    queryFn: async () => {
      const ids = idsTransbordo;
      if (ids.length === 0) return new Map<number, { sprintMigrationCount: number; realOverflowCount: number }>();

      const map = new Map<number, { sprintMigrationCount: number; realOverflowCount: number }>();
      for (let i = 0; i < ids.length; i += 1000) {
        const chunk = ids.slice(i, i + 1000);
        const { data } = await (supabase as any)
          .from('devops_work_items')
          .select('id, iteration_history')
          .in('id', chunk);

        for (const row of (data || [])) {
          const migracoes = contarMigracoesSprint(row.iteration_history as Array<{ oldValue: string; newValue: string }> | null);
          map.set(row.id, {
            sprintMigrationCount: migracoes,
            realOverflowCount: Math.max(0, migracoes - 1),
          });
        }
      }

      return map;
    },
    enabled: idsTransbordo.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const transbordoMap = transbordoMapQuery.data || new Map<number, { sprintMigrationCount: number; realOverflowCount: number }>();

  const allItemsEnriched = allItems.map((item) => ({
    ...item,
    sprint_migration_count: item.id ? (transbordoMap.get(item.id)?.sprintMigrationCount || 0) : 0,
    real_overflow_count: item.id ? (transbordoMap.get(item.id)?.realOverflowCount || 0) : 0,
    transbordo_count: item.id ? (transbordoMap.get(item.id)?.realOverflowCount || 0) : 0,
  }));

  const items = recortar(allItemsEnriched);

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

  const hasTag = (i: InfraItem, tag: string) => i.tags?.toUpperCase().includes(tag.toUpperCase()) ?? false;
  const countByTag = (tag: string) => items.filter(i => hasTag(i, tag)).length;
  const melhorias = countByTag('MELHORIA');
  const iso27001 = countByTag('ISO27001') + countByTag('ISO');
  // Riscos mapeados no board DevOps pela tag #Risco (combina com os riscos do
  // SG-LST-012). Atemporal: risco aberto vale independente do filtro de sprint,
  // e a data de criação alimenta o contador "dias sem riscos novos".
  const riscoItens = allItemsEnriched.filter(i => hasTag(i, 'RISCO'));
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
    riscoItens,
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
