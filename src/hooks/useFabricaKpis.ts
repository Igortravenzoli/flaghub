import { CADENCIA_MINIMA_MS } from '@/lib/cadencia';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { extractSprintCodeFromPath } from '@/lib/sprintCalendar';
import { useFabricaRoster } from '@/hooks/useFabricaRoster';
import { normalizeProduct, extractProducts } from '@/lib/products';
import { ehEstadoEntregue } from '@/lib/fabricaEstados';
import { SQUADS } from '@/lib/fabricaRoster';

const normalizeFabricaState = (state: string | null | undefined): string => (state || '').trim().toLowerCase();

export const FABRICA_IN_PROGRESS_STATES = new Set([
  'in progress',
  'active',
  'em desenvolvimento',
  'aguardando teste',
  'em teste',
  'aguardando deploy',
]);
const FABRICA_TODO_STATES = new Set(['to do', 'new']);
const DONE_STATES = new Set(['done', 'closed', 'resolved']);
const FABRICA_MANAGER_ITEM_TYPES = new Set(['Product Backlog Item', 'User Story', 'Bug']);
const FABRICA_COUNTABLE_STATES = new Set([
  ...FABRICA_IN_PROGRESS_STATES,
  ...FABRICA_TODO_STATES,
  ...DONE_STATES,
]);

/**
 * Exclusão-padrão do filtro de colaboradores do gestor.
 *
 * Vazio desde 12/08/2026. Era `{'ari'}` para tirar o Design da conta, e isso
 * zerava as HORAS dele junto — o recorte era sobre o nome do apontamento. Agora
 * o Design é área de horas no roster (ver AREAS): fica fora dos KPIs de sprint
 * pelo próprio recorte de fábrica, e as horas aparecem. "Ari entra só no
 * contexto de horas" (decisão do gestor).
 */
export const KPI_DEFAULT_EXCLUDED_COLLABORATORS = new Set<string>();

/** Marcador de título usado pela Infra (a vw_infraestrutura_kpis consome estes itens). */
const INFRA_PREFIX = '[INFRA]';

/**
 * Epics/PBIs guarda-chuva que NÃO são trabalho da Fábrica: o item e todos os
 * filhos somem da listagem e dos KPIs do setor.
 *   2700  — INFRA (consumido pela Infraestrutura via vw_infraestrutura_kpis)
 *   16687 — PBI FlagDash · Painéis Gerenciais
 *
 * A exclusão é só de EXIBIÇÃO. As fotografias de sprint continuam contando
 * estes itens de propósito (decisão de 25/07/2026): assim o esforço e as
 * movimentações ficam preservados no histórico caso um dia se queira medi-los.
 */
export const EPICS_FORA_DA_FABRICA = new Set<number>([2700, 16687]);

function isEpicForaDaFabrica(id?: number | null, parentId?: number | null): boolean {
  return (id != null && EPICS_FORA_DA_FABRICA.has(id))
      || (parentId != null && EPICS_FORA_DA_FABRICA.has(parentId));
}

export function isFabricaInProgress(state: string | null | undefined): boolean {
  return FABRICA_IN_PROGRESS_STATES.has(normalizeFabricaState(state));
}

export function isFabricaCountableState(state: string | null | undefined): boolean {
  return FABRICA_COUNTABLE_STATES.has(normalizeFabricaState(state));
}

/** "Entregue" = já saiu do dev, aguardando teste/deploy/homologação. Régua única — @/lib/fabricaEstados. */
export function isFabricaEntregue(state: string | null | undefined): boolean {
  return ehEstadoEntregue(state);
}

function isFabricaManagerItem(workItemType: string | null | undefined): boolean {
  return FABRICA_MANAGER_ITEM_TYPES.has(workItemType || '');
}

function isFabricaTaskItem(workItemType: string | null | undefined): boolean {
  return workItemType === 'Task';
}

function isFabricaTodo(state: string | null | undefined): boolean {
  return FABRICA_TODO_STATES.has(normalizeFabricaState(state));
}

export function isDone(state: string | null | undefined): boolean {
  return DONE_STATES.has(normalizeFabricaState(state));
}

export interface TransbordoItem extends FabricaItem {
  /** Backward-compatible alias (legacy board uses this field) */
  overflowCount: number;
  /** Number of sprint-to-sprint moves detected */
  sprintMigrationCount: number;
  /** Real overflow count after commitment (migration count - 1, min 0) */
  realOverflowCount: number;
  sprintsOverflowed: string[];
}

export interface FabricaItem {
  id: number | null;
  title: string | null;
  work_item_type: string | null;
  state: string | null;
  assigned_to_display: string | null;
  priority: number | null;
  effort: number | null;
  iteration_path: string | null;
  created_date: string | null;
  changed_date: string | null;
  parent_id: number | null;
  parent_title: string | null;
  parent_type: string | null;
  web_url: string | null;
  /** Tags string (semicolon-separated) — populated from vw_fabrica_kpis */
  tags?: string | null;
  /**
   * false for Tasks/Bugs whose parent PBI is also in the queue,
   * and for child Tasks pulled in via the second UNION.
   * Use kpiItems (count_in_kpi !== false) for metric counts to avoid
   * double-counting PBIs alongside their child Tasks.
   */
  count_in_kpi?: boolean;
}

export interface TimelogAggregation {
  name: string;
  hours: number;
  minutes: number;
}

/** Uma task (ou o próprio item) que compõe as horas de um PBI/Bug. */
export interface PbiTaskDetalhe {
  id: number;
  title: string;
  state: string | null;
  web_url: string | null;
  devopsMinutes: number;
  vdeskMinutes: number;
  /** consolidado — max(devops, vdesk), nunca a soma */
  minutes: number;
  /** true quando o apontamento foi feito no próprio PBI/Bug, não numa task filha */
  isProprioItem: boolean;
  colaboradores: TimelogAggregation[];
}

/** Horas consolidadas a nível de PBI/Bug (próprias + tasks filhas), DevOps + VDESK */
export interface PbiTimelogConsolidado {
  id: number;
  title: string;
  work_item_type: string | null;
  state: string | null;
  assigned_to_display: string | null;
  web_url: string | null;
  devopsMinutes: number;
  vdeskMinutes: number;
  totalMinutes: number;
  devopsHours: number;
  vdeskHours: number;
  /** Quantidade de tasks filhas com apontamento */
  taskCount: number;
  /** Horas consolidadas por colaborador dentro do PBI/Bug (soma = totalMinutes) */
  colaboradores: TimelogAggregation[];
  /** Drill-down: as tasks que compõem o total, da maior para a menor */
  tasks: PbiTaskDetalhe[];
  /**
   * Guarda-chuva de `EPICS_FORA_DA_FABRICA`: as horas contam, mas o item não é
   * entrega de squad e fica fora de todo KPI. A UI marca com badge para o gestor
   * não ler como se fosse trabalho de sprint.
   */
  foraDoEscopoSquad: boolean;
}

export interface TimelogFabricaScope {
  key: string;
  displayName: string;
  taskIds: number[];
  hours: number;
  minutes: number;
  /** Horas por colaborador dentro da fábrica (soma reconcilia com `minutes`) */
  collaborators: TimelogAggregation[];
}

interface UseFabricaKpisOptions {
  includeTimeLogs?: boolean;
  includeWorkItemMeta?: boolean;
}

function isInRange(dateStr: string | null, from: Date, to: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

function parseSprintOrder(iterPath: string): { year: number; num: number } {
  const sMatch = iterPath.match(/\\S(\d+)-(\d{4})$/);
  if (sMatch) return { year: parseInt(sMatch[2]), num: parseInt(sMatch[1]) };
  const sprintMatch = iterPath.match(/\\Sprint\s*(\d+)$/);
  if (sprintMatch) return { year: 0, num: parseInt(sprintMatch[1]) };
  return { year: 0, num: 0 };
}

function sprintCompare(a: string, b: string): number {
  const pa = parseSprintOrder(a);
  const pb = parseSprintOrder(b);
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.num - pb.num;
}

/** Known product tags — only these are considered "products" */
/** Normalise collaborator names for filtering/dedup: strip diacritics, punctuation, lowercase, collapse spaces */
export function normalizeCollaboratorName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getCollaboratorExclusionKeys(name: string | null | undefined): string[] {
  const normalized = normalizeCollaboratorName(name);
  if (!normalized) return [];

  const parts = normalized.split(' ').filter(Boolean);
  return [...new Set([
    normalized,
    parts[0],
    parts.slice(0, 2).join(' '),
  ].filter(Boolean))];
}

export function isCollaboratorExcluded(name: string | null | undefined, excludedCollaborators?: Set<string>): boolean {
  if (!excludedCollaborators || excludedCollaborators.size === 0) return false;
  return getCollaboratorExclusionKeys(name).some((key) => excludedCollaborators.has(key));
}

export interface ApontamentoConsolidado {
  taskId: number;
  /** Nome canônico do colaborador */
  name: string;
  devops: number;
  vdesk: number;
  /** max(devops, vdesk) — NÃO a soma */
  consolidado: number;
}

/**
 * VDESK e DevOps descrevem A MESMA hora, não duas.
 *
 * O FlagHub lança automaticamente no DevOps o que veio do VDESK (nota
 * "Lançamento automatizado FlagHub"). Somar as duas fontes dobrava as horas de
 * quem usa a automação: em 07/2026, Anderson/Carlos/Emerson/Klélbio/Thales
 * tinham 476 h no VDESK e as MESMAS 476 h no DevOps — o card mostrava ~2x.
 *
 * Consolidado = por (work item, colaborador) o MAIOR dos dois lados. É a mesma
 * régua do card "Reconciliação Vdesk ↔ Devops", que trata as fontes como duas
 * vistas do mesmo apontamento em vez de somá-las.
 */
export function consolidarApontamentos(
  devopsLogs: Array<{ work_item_id: number | null; user_name: string | null; time_minutes: number | null }>,
  vdeskLogs: Array<{ task_devops: number; usuario_vdesk: string; tempo_segundos: number }>,
  canonical: (raw: string | null | undefined) => string,
): ApontamentoConsolidado[] {
  const acc = new Map<string, { taskId: number; name: string; devops: number; vdesk: number }>();
  const touch = (taskId: number, rawName: string | null | undefined) => {
    const name = canonical(rawName);
    const key = `${taskId}::${name}`;
    let e = acc.get(key);
    if (!e) { e = { taskId, name, devops: 0, vdesk: 0 }; acc.set(key, e); }
    return e;
  };
  for (const tl of devopsLogs) {
    if (tl.work_item_id == null) continue;
    touch(tl.work_item_id, tl.user_name).devops += tl.time_minutes || 0;
  }
  for (const vl of vdeskLogs) {
    touch(vl.task_devops, vl.usuario_vdesk).vdesk += vl.tempo_segundos / 60;
  }
  return [...acc.values()].map((e) => ({ ...e, consolidado: Math.max(e.devops, e.vdesk) }));
}

/** Capacidade contratada de um colaborador por dia. */
export const CAPACIDADE_DIA_HORAS = 7;

/**
 * Acima disto o dia é sinalizado. A folga de 1 h sobre a capacidade é de
 * propósito: hora extra pontual é normal e não deveria virar alerta — o que
 * interessa ao gestor é excesso de trabalho ou lançamento errado.
 */
export const LIMITE_ALERTA_DIA_HORAS = 8;

/**
 * Acima disto não cabe num dia: é digitação, não jornada. Separar as duas
 * leituras evita misturar conversa de carga de trabalho com correção de
 * apontamento — em 07/2026 havia lançamentos de 30 h e 50 h num único dia.
 */
export const LIMITE_ERRO_DIA_HORAS = 12;

/** Horas de um colaborador com as duas fontes visíveis ao lado do consolidado. */
export interface ColaboradorHoras {
  name: string;
  devopsMinutes: number;
  vdeskMinutes: number;
  /** consolidado — max por work item, nunca a soma */
  minutes: number;
}

export interface DiaSobrecarga {
  /** Nome canônico do colaborador */
  name: string;
  /** ISO date (YYYY-MM-DD) */
  dia: string;
  minutes: number;
}

/**
 * Dias em que um colaborador passou de `LIMITE_ALERTA_DIA_HORAS`.
 *
 * O lançamento é preservado como está — a régua da Flag é que o apontado é o
 * apontado, certo ou errado (decisão de 11/08/2026). Isto é sinalização, não
 * saneamento: em 07/2026 o mês tinha 3 lançamentos de 30:00 h e 21 dias-pessoa
 * acima de 12 h que passavam despercebidos na conferência.
 *
 * Consolida por (work item, dia, pessoa) com `max` antes de somar o dia, senão
 * quem usa a automação VDESK→DevOps apareceria com o dobro da jornada.
 */
export function calcularDiasSobrecarga(
  devopsLogs: Array<{ work_item_id: number | null; user_name: string | null; log_date: string; time_minutes: number | null }>,
  vdeskLogs: Array<{ task_devops: number; usuario_vdesk: string; log_date: string; tempo_segundos: number }>,
  canonical: (raw: string | null | undefined) => string,
  limiteHoras: number = LIMITE_ALERTA_DIA_HORAS,
): DiaSobrecarga[] {
  const porTarefaDia = new Map<string, { name: string; dia: string; devops: number; vdesk: number }>();
  const touch = (taskId: number | null, rawName: string | null | undefined, logDate: string) => {
    const dia = (logDate || '').slice(0, 10);
    const name = canonical(rawName);
    const key = `${taskId ?? 'sem-item'}::${dia}::${name}`;
    let e = porTarefaDia.get(key);
    if (!e) { e = { name, dia, devops: 0, vdesk: 0 }; porTarefaDia.set(key, e); }
    return e;
  };
  for (const tl of devopsLogs) {
    if (!tl.log_date) continue;
    touch(tl.work_item_id, tl.user_name, tl.log_date).devops += tl.time_minutes || 0;
  }
  for (const vl of vdeskLogs) {
    if (!vl.log_date) continue;
    touch(vl.task_devops, vl.usuario_vdesk, vl.log_date).vdesk += vl.tempo_segundos / 60;
  }

  const porDia = new Map<string, DiaSobrecarga>();
  for (const e of porTarefaDia.values()) {
    const key = `${e.name}::${e.dia}`;
    const atual = porDia.get(key) ?? { name: e.name, dia: e.dia, minutes: 0 };
    atual.minutes += Math.max(e.devops, e.vdesk);
    porDia.set(key, atual);
  }

  const limite = limiteHoras * 60;
  return [...porDia.values()]
    .filter((d) => d.minutes > limite)
    .map((d) => ({ ...d, minutes: Math.round(d.minutes) }))
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
}

export function useFabricaKpis(
  dateFrom?: Date,
  dateTo?: Date,
  sprintFilter: string | string[] = 'all',
  options?: UseFabricaKpisOptions,
  excludedCollaborators?: Set<string>,
) {
  const includeTimeLogs = options?.includeTimeLogs ?? true;
  const includeWorkItemMeta = options?.includeWorkItemMeta ?? true;

  const query = useQuery({
    queryKey: ['fabrica', 'kpis'],
    queryFn: async () => {
      return fetchAllRows<FabricaItem>((from, to) =>
        supabase.from('vw_fabrica_kpis').select('*').range(from, to)
      );
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const lastSyncQuery = useQuery({
    queryKey: ['fabrica', 'last-sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('devops_queries')
        .select('last_synced_at')
        .eq('sector', 'fabrica')
        .order('last_synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.last_synced_at || null;
    },
    staleTime: CADENCIA_MINIMA_MS,
  });

  // ── Time logs: server-side filtered by date range ──
  const fromStr = dateFrom ? dateFrom.toISOString().split('T')[0] : undefined;
  const toStr = dateTo ? dateTo.toISOString().split('T')[0] : undefined;

  const timeLogsQuery = useQuery({
    queryKey: ['fabrica', 'time-logs', fromStr, toStr, includeTimeLogs],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('rpc_devops_timelog_agg', {
        p_from: fromStr ?? null,
        p_to: toStr ?? null,
        p_work_item_ids: null,
      });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        work_item_id: row.work_item_id as number | null,
        time_minutes: row.total_minutes as number | null,
        user_name: row.user_name as string | null,
        log_date: row.max_log_date as string | null,
      }));
    },
    enabled: includeTimeLogs,
    staleTime: 5 * 60 * 1000,
  });

  /**
   * Apontamentos DevOps com o DIA preservado.
   *
   * `rpc_devops_timelog_agg` agrupa por (work item, pessoa) e só devolve
   * min/max da data — não dá para saber quanto foi lançado em cada dia. Esta
   * consulta existe só para a régua de jornada (ver `diasSobrecarga`).
   */
  const timeLogsDiaQuery = useQuery({
    queryKey: ['fabrica', 'time-logs-dia', fromStr, toStr, includeTimeLogs],
    queryFn: async () => {
      const data = await fetchAllRows<any>((from, to) => {
        let q = (supabase as any)
          .from('v_devops_time_logs_ativos')
          .select('work_item_id, user_name, log_date, time_minutes');
        if (fromStr) q = q.gte('log_date', fromStr);
        if (toStr)   q = q.lte('log_date', toStr);
        return q.range(from, to);
      });
      return (data || []) as Array<{
        work_item_id: number | null;
        user_name: string | null;
        log_date: string;
        time_minutes: number | null;
      }>;
    },
    enabled: includeTimeLogs,
    staleTime: 5 * 60 * 1000,
  });

  // ── VDESK time logs: server-side filtered by date range ──
  const vdeskLogsQuery = useQuery({
    queryKey: ['fabrica', 'vdesk-time-logs', fromStr, toStr, includeTimeLogs],
    queryFn: async () => {
      // Sem `.limit()` fixo: o corte em 5 000 sumia com apontamentos em silêncio
      // assim que a janela passava de ~2 meses.
      const data = await fetchAllRows<any>((from, to) => {
        let q = (supabase as any)
          .from('vdesk_time_logs')
          .select('id, task_devops, usuario_vdesk, log_date, tempo_segundos');
        if (fromStr) q = q.gte('log_date', fromStr);
        if (toStr)   q = q.lte('log_date', toStr);
        return q.range(from, to);
      });
      return (data || []) as Array<{
        id: string;
        task_devops: number;
        usuario_vdesk: string;
        log_date: string;
        tempo_segundos: number;
      }>;
    },
    enabled: includeTimeLogs,
    staleTime: 5 * 60 * 1000,
  });

  // Work items with tags for product mapping & iteration_history
  const workItemsQuery = useQuery({
    queryKey: ['fabrica', 'work-items-tags', includeWorkItemMeta],
    queryFn: async () => {
      return fetchAllRows<{
        id: number;
        tags: string | null;
        title: string | null;
        parent_id: number | null;
        assigned_to_display: string | null;
        area_path: string | null;
        work_item_type: string | null;
        iteration_history: any;
        state: string | null;
        iteration_path: string | null;
        priority: number | null;
        effort: number | null;
        created_date: string | null;
        changed_date: string | null;
        web_url: string | null;
      }>((from, to) =>
        supabase
          .from('devops_work_items')
          .select('id, tags, title, parent_id, assigned_to_display, area_path, work_item_type, iteration_history, state, iteration_path, priority, effort, created_date, changed_date, web_url')
          .range(from, to)
      );
    },
    enabled: includeWorkItemMeta,
    staleTime: 5 * 60 * 1000,
  });

  // Persistent collaborator name map — admin-managed, overrides in-memory normalisation
  const collabMapQuery = useQuery({
    queryKey: ['devops', 'collaborator-map', includeTimeLogs],
    queryFn: async () => {
        // Table not yet in generated types (migration pending) — cast to any
        const { data } = await (supabase as any)
          .from('devops_collaborator_map')
          .select('timelog_name, canonical_name') as { data: Array<{ timelog_name: string; canonical_name: string }> | null };
      const map = new Map<string, string>();
      for (const r of (data || [])) {
        map.set(r.timelog_name.toLowerCase(), r.canonical_name);
      }
      return map;
    },
    enabled: includeTimeLogs,
      staleTime: 10 * 60 * 1000, // 10 min — rarely changes
  });

  const allItems = query.data || [];
  const nonInfraItems = allItems.filter((i) => {
    if (isEpicForaDaFabrica(i.id, i.parent_id)) return false;
    return !i.title?.startsWith(INFRA_PREFIX);
  });

  const dateScopedItems = (dateFrom && dateTo)
    ? nonInfraItems.filter(i => isInRange(i.created_date, dateFrom, dateTo) || isInRange(i.changed_date, dateFrom, dateTo))
    : nonInfraItems;

  const nonInfraWorkItems = (workItemsQuery.data || []).filter((wi) => {
    if (isEpicForaDaFabrica(wi.id, wi.parent_id)) return false;
    return !wi.title?.startsWith(INFRA_PREFIX);
  });

  const dateScopedWorkItems = (dateFrom && dateTo)
    ? nonInfraWorkItems.filter((wi) => isInRange(wi.created_date, dateFrom, dateTo) || isInRange(wi.changed_date, dateFrom, dateTo))
    : nonInfraWorkItems;

  const effectiveSprintFilter = Array.isArray(sprintFilter)
    ? sprintFilter.filter(Boolean)
    : (sprintFilter === '__pending__' ? 'all' : sprintFilter);

  /**
   * Filtro por CÓDIGO de sprint ("S15-2026"), além do `iteration_path` completo.
   *
   * O modo TV só conhece o código (`getCurrentOfficialSprintCode()`), não o PATH,
   * e por isso o kiosk chamava este hook com `'all'` + range de datas — o que
   * escopava por "created OU changed dentro da janela", **sem olhar a sprint**.
   * Medido em 29/07/2026: 197 itens no telão, dos quais só 94 eram de S15
   * (48 vinham do Backlog e 27 de S14). Decisão de Igor: no KPI do telão vale
   * apenas a sprint vigente.
   *
   * Se o código não casar com nenhum item (sprint inexistente ou base ainda
   * vazia), cai de volta na janela de datas em vez de zerar o telão em silêncio.
   */
  const filtroCodigo = (typeof effectiveSprintFilter === 'string'
    && effectiveSprintFilter !== 'all'
    && /^S\d+-\d{4}$/i.test(effectiveSprintFilter))
    ? effectiveSprintFilter.toUpperCase()
    : null;
  const casaCodigo = (path?: string | null): boolean =>
    !!filtroCodigo && extractSprintCodeFromPath(path)?.toUpperCase() === filtroCodigo;

  const itemsPorCodigo = filtroCodigo ? nonInfraItems.filter((i) => casaCodigo(i.iteration_path)) : [];
  const wiPorCodigo = filtroCodigo ? nonInfraWorkItems.filter((wi) => casaCodigo(wi.iteration_path)) : [];
  const codigoResolveu = filtroCodigo !== null && (itemsPorCodigo.length > 0 || wiPorCodigo.length > 0);

  // Sprint is the primary filter. In custom mode (all sprints), date range scopes work items.
  const items = (() => {
    if (codigoResolveu) return itemsPorCodigo;
    if (effectiveSprintFilter === 'all' || filtroCodigo) return dateScopedItems;
    if (Array.isArray(effectiveSprintFilter)) {
      const sprintSet = new Set(effectiveSprintFilter);
      return nonInfraItems.filter(i => !!i.iteration_path && sprintSet.has(i.iteration_path));
    }
    return nonInfraItems.filter(i => i.iteration_path === effectiveSprintFilter);
  })();

  const scopedWorkItems = (() => {
    if (codigoResolveu) return wiPorCodigo;
    if (effectiveSprintFilter === 'all' || filtroCodigo) return dateScopedWorkItems;
    if (Array.isArray(effectiveSprintFilter)) {
      const sprintSet = new Set(effectiveSprintFilter);
      return nonInfraWorkItems.filter((wi) => !!wi.iteration_path && sprintSet.has(wi.iteration_path));
    }
    return nonInfraWorkItems.filter((wi) => wi.iteration_path === effectiveSprintFilter);
  })();

  const viewIds = new Set(items.map((item) => item.id).filter((id): id is number => id != null));
  const fallbackManagerItems: FabricaItem[] = scopedWorkItems
    .filter((wi) => isFabricaManagerItem(wi.work_item_type) && !viewIds.has(wi.id))
    .map((wi) => ({
      id: wi.id,
      title: wi.title,
      work_item_type: wi.work_item_type,
      state: wi.state,
      assigned_to_display: wi.assigned_to_display,
      priority: wi.priority,
      effort: wi.effort,
      iteration_path: wi.iteration_path,
      created_date: wi.created_date,
      changed_date: wi.changed_date,
      parent_id: wi.parent_id,
      parent_title: null,
      parent_type: null,
      web_url: wi.web_url,
      tags: wi.tags,
      count_in_kpi: true,
    }));

  /**
   * Tasks também são repostas (não só itens de gestor).
   *
   * A view só entrega Task que esteja na fila ou cujo PBI pai esteja — quando o
   * pai sai da fila (tipicamente ao concluir) a Task desaparecia do escopo, e com
   * ela o dev: `allCollaborators` sai de `scopedItems`, então quem só tem Task
   * nessa situação não era listado nem podia ser marcado no filtro. Caso medido
   * em 29/07/2026: Johnny C. dos Santos, 6 Tasks Done em S15, nenhuma na view —
   * ausente da lista de colaboradores enquanto as horas dele seguiam aparecendo
   * no ranking. Não infla "Itens no escopo": `kpiItems` filtra itens de gestor.
   */
  const idsGestorDaFabrica = new Set(
    nonInfraWorkItems
      .filter((wi) => isFabricaManagerItem(wi.work_item_type) && wi.id != null)
      .map((wi) => wi.id as number),
  );
  const fallbackTaskItems: FabricaItem[] = scopedWorkItems
    .filter((wi) => isFabricaTaskItem(wi.work_item_type)
      && !viewIds.has(wi.id)
      && wi.parent_id != null
      && idsGestorDaFabrica.has(wi.parent_id))
    .map((wi) => ({
      id: wi.id,
      title: wi.title,
      work_item_type: wi.work_item_type,
      state: wi.state,
      assigned_to_display: wi.assigned_to_display,
      priority: wi.priority,
      effort: wi.effort,
      iteration_path: wi.iteration_path,
      created_date: wi.created_date,
      changed_date: wi.changed_date,
      parent_id: wi.parent_id,
      parent_title: null,
      parent_type: null,
      web_url: wi.web_url,
      tags: wi.tags,
      count_in_kpi: true,
    }));

  const scopedItems = [...items, ...fallbackManagerItems, ...fallbackTaskItems];

  /**
   * Escopo de pessoas = roster ativo da Fábrica (`fabrica_squad_membership`).
   *
   * Antes o recorte vivia SÓ no localStorage do navegador do gestor
   * (`fabrica.excluded-collabs.v1`, semeado com {'ari'}) e não era passado pelo
   * kiosk nem pela Home — então a mesma sprint tinha totais diferentes por tela,
   * sem ninguém clicar em nada. Agora o roster manda, igual em todas.
   *
   * Semântica preservada de EXCLUSÃO (fail-open): quem não tem responsável
   * continua no escopo, e se o roster falhar ou vier vazio NADA é excluído — uma
   * lista de inclusão zeraria KPIs e horas no telão em caso de erro de RLS.
   * Casamento por nome COMPLETO normalizado: `getCollaboratorExclusionKeys` casa
   * por primeiro nome, e existem dois "Alessandro" no escopo de S15.
   */
  const rosterQuery = useFabricaRoster();
  /**
   * SÓ as fábricas entram aqui.
   *
   * Este conjunto recorta ESCOPO DE ITEM (via `foraDoRoster`), não contagem de
   * horas. As áreas de horas (INFRA, DESIGN, QUALIDADE) vivem na mesma tabela,
   * mas cadastrar alguém nelas não pode arrastar os PBIs dessa pessoa para
   * dentro dos KPIs de sprint da Fábrica — foi a condição da decisão de
   * 12/08/2026 ("só para horas"). Ver AREAS em @/lib/fabricaRoster.
   */
  const rosterNomes = (() => {
    const set = new Set<string>();
    for (const r of rosterQuery.data || []) {
      if (!SQUADS.includes(r.squad)) continue;
      const n = normalizeCollaboratorName(r.colaborador);
      if (n) set.add(n);
    }
    return set;
  })();
  const rosterPronto = rosterQuery.isSuccess && rosterNomes.size > 0;

  const foraDoRoster = (name: string | null | undefined): boolean => {
    if (!rosterPronto || !name) return false;
    return !rosterNomes.has(normalizeCollaboratorName(name));
  };

  /**
   * O recorte do roster vale SÓ para `assigned_to_display` (responsável do work
   * item) — a grafia que foi conferida nome a nome contra o roster no PROD.
   *
   * Não vale para nome de APONTAMENTO: `vdesk_time_logs.usuario_vdesk` guarda
   * login curto ("Carlos", "Emerson Luis" — ver 20260514150000_vdesk_shortname_map.sql)
   * e `devops_time_logs.user_name` guarda o nome do plugin. Nenhum dos dois casa
   * com nome completo, então aplicar o roster ali zerava 100% das horas VDESK em
   * silêncio. É justamente para isso que existe `devops_collaborator_map`.
   */
  const isExcluded = (name: string | null | undefined): boolean =>
    isCollaboratorExcluded(name, excludedCollaborators) || foraDoRoster(name);

  /** Exclusão para nome de apontamento: só o recorte manual do gestor. */
  const isExcludedApontamento = (name: string | null | undefined): boolean =>
    isCollaboratorExcluded(name, excludedCollaborators);

  /**
   * Nome canônico de um nome de APONTAMENTO (DevOps `user_name` ou VDESK
   * `usuario_vdesk`). `devops_collaborator_map.timelog_name` já cobre os dois
   * lados, inclusive os logins curtos do VDESK ("Carlos", "Emerson Luis").
   */
  const canonicalApontamento = (rawName: string | null | undefined): string => {
    const raw = (rawName || '').trim() || 'Desconhecido';
    const collabMap = collabMapQuery.data || new Map<string, string>();
    const normalized = normalizeCollaboratorName(raw);
    return collabMap.get(raw.toLowerCase()) ?? collabMap.get(normalized) ?? raw;
  };

  const filteredItems = scopedItems.filter((item) => !isExcluded(item.assigned_to_display));

  /**
   * Escopo de TRABALHO da Fábrica — só o recorte do roster, NUNCA os checkboxes
   * de colaborador do topo.
   *
   * Os checkboxes dizem "de quem quero contar as horas"; eles não deveriam dizer
   * "quais itens são da Fábrica". Enquanto o escopo de timelog saía de
   * `filteredItems`, filtrar um colaborador derrubava os PBIs de TODOS os outros
   * donos — e junto as tasks filhas onde essa pessoa tinha apontado. Filtrar
   * "Douglas" no topo esvaziava o card "Horas por PBI/Bug", porque as tasks dele
   * penduram em PBIs de outras pessoas (reportado em 11/08/2026).
   *
   * Quem é excluído continua sem contar hora: isso é feito em
   * `isExcludedApontamento`, sobre o NOME DO APONTAMENTO, que é o correto.
   */
  const itemsDaFabrica = scopedItems.filter((item) => !foraDoRoster(item.assigned_to_display));

  /**
   * Os guarda-chuva de `EPICS_FORA_DA_FABRICA` voltam SÓ para o escopo de timelog.
   *
   * 2700 ("[INFRA] - SPRINT") e 16687 saem dos KPIs de propósito — não são
   * entrega de squad. Mas as horas apontadas nas tasks deles são trabalho real e
   * sumiam da tela: em 07/2026, 108:56 das 115:56 do Igor Cardoso (94%) estavam
   * sob 2700, e ele aparecia com UM PBI só quando filtrado.
   *
   * Seguro porque `managerScopedItems`/`managerScopedIds` alimentam apenas
   * `managerIdByTaskId`, `timelogScopeIds` e `horasPorPbi` — nenhum KPI de squad
   * passa por aqui (esses saem de `filteredItems`).
   */
  const guardaChuvaTimelog: FabricaItem[] = (workItemsQuery.data || [])
    .filter((wi) => EPICS_FORA_DA_FABRICA.has(wi.id))
    .map((wi) => ({
      id: wi.id,
      title: wi.title,
      work_item_type: wi.work_item_type,
      state: wi.state,
      assigned_to_display: wi.assigned_to_display,
      priority: wi.priority,
      effort: wi.effort,
      iteration_path: wi.iteration_path,
      created_date: wi.created_date,
      changed_date: wi.changed_date,
      parent_id: wi.parent_id,
      parent_title: null,
      parent_type: null,
      web_url: wi.web_url,
      tags: wi.tags,
      count_in_kpi: false,
    }));

  const managerScopedItems = [
    ...itemsDaFabrica.filter((item) => isFabricaManagerItem(item.work_item_type)),
    ...guardaChuvaTimelog,
  ];
  const managerScopedIds = new Set(
    managerScopedItems.map((item) => item.id).filter((id): id is number => id != null)
  );

  // Apontamentos (DevOps e VDESK) são feitos nas Tasks — a consolidação precisa
  // somar as horas de TODAS as tasks filhas no PBI/Bug pai, inclusive tasks que
  // não aparecem na fila (vw_fabrica_kpis), ex.: tasks já concluídas.
  // managerIdByTaskId: task id → PBI/Bug raiz no escopo gerencial.
  const managerIdByTaskId: Record<number, number> = (() => {
    const out: Record<number, number> = {};
    const allWis = workItemsQuery.data || [];
    const parentById = new Map<number, number | null>();
    for (const wi of allWis) parentById.set(wi.id, wi.parent_id);
    for (const wi of allWis) {
      if (wi.work_item_type !== 'Task') continue;
      let parentId = wi.parent_id;
      let depth = 0;
      while (parentId != null && depth < 10) {
        if (managerScopedIds.has(parentId)) { out[wi.id] = parentId; break; }
        parentId = parentById.get(parentId) ?? null;
        depth++;
      }
    }
    // Tasks vindas da fila cujo pai está no escopo — cobre tasks ainda não
    // sincronizadas em devops_work_items
    for (const item of itemsDaFabrica) {
      if (
        isFabricaTaskItem(item.work_item_type) && item.id != null && item.parent_id != null
        && managerScopedIds.has(item.parent_id) && out[item.id] === undefined
      ) {
        out[item.id] = item.parent_id;
      }
    }
    return out;
  })();

  const managerScopedTaskIds = Object.keys(managerIdByTaskId).map(Number);
  const timelogScopeIds = new Set<number>([
    ...managerScopedIds,
    ...managerScopedTaskIds,
  ]);

  /**
   * Lista do filtro de colaboradores.
   *
   * Duas origens, unidas:
   *  1. responsável de work item no escopo, recortado pelo ROSTER (senão o gestor
   *     veria nomes que nunca entram na conta);
   *  2. QUEM APONTOU HORA no período — regra do gestor: "se tem timelog lançado,
   *     precisa ser listado". O roster NÃO vale aqui. Antes a lista saía só de (1)
   *     e ficava em 18 nomes: em 07/2026, 9 pessoas com apontamento (Ana Luiza,
   *     Leonardo, Mauricio, Rodolfo, Igor, Thiago, Thales, Alessandro Sales e
   *     Marco Aurélio — 884 h) não estavam no roster da Fábrica e sumiam do filtro.
   *
   * Continua SEM o recorte dos checkboxes: quem o gestor desmarcou tem que seguir
   * na lista para poder ser remarcado.
   */
  const allCollaborators: string[] = (() => {
    const set = new Set<string>();
    for (const item of scopedItems) {
      if (item.assigned_to_display && !foraDoRoster(item.assigned_to_display)) {
        set.add(item.assigned_to_display);
      }
    }
    for (const tl of (timeLogsQuery.data || [])) {
      if (tl.user_name) set.add(canonicalApontamento(tl.user_name));
    }
    for (const vl of (vdeskLogsQuery.data || [])) {
      if (vl.usuario_vdesk) set.add(canonicalApontamento(vl.usuario_vdesk));
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  })();

  // kpiItems: exclude Tasks/Bugs whose parent PBI is also in the view (count_in_kpi flag)
  // AND exclude collaborators that are unchecked in the filter
  // AND keep only countable KPI states (exclude Removed/other non-board states)
  // AND only manager-like items (PBI/US/Bug) — régua única do gestor: Tasks
  // avulsas (pai fora da fila) inflavam a Executiva/TV vs o "Itens no Escopo".
  const kpiItems = filteredItems.filter(i =>
    i.count_in_kpi !== false && isFabricaManagerItem(i.work_item_type) && isFabricaCountableState(i.state)
  );

  const total      = kpiItems.length;
  const inProgress = kpiItems.filter(i => isFabricaInProgress(i.state)).length; // inclui "entregue"
  const entregue   = kpiItems.filter(i => isFabricaEntregue(i.state)).length;
  const toDo       = kpiItems.filter(i => isFabricaTodo(i.state)).length;
  const done       = kpiItems.filter(i => isDone(i.state)).length;

  const porColaborador = filteredItems.reduce((acc, item) => {
    const name = item.assigned_to_display || 'Não atribuído';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── Timelog aggregations ──
  const timeLogs = timeLogsQuery.data || [];
  // Scope time logs to manager baseline + linked tasks to keep parity with gestor filter.
  const itemIdsInScope = timelogScopeIds;
  const scopedTimeLogs = timeLogs.filter((tl) => {
    if (tl.work_item_id == null || !itemIdsInScope.has(tl.work_item_id)) return false;
    return !isExcludedApontamento(tl.user_name);
  });

  const totalHoursLogged = scopedTimeLogs.reduce((sum, tl) => sum + (tl.time_minutes || 0), 0) / 60;
  const hasTimeLogs = scopedTimeLogs.length > 0;

  // Alocação completa: TODO apontamento do período (sem o filtro de fila/estado),
  // para a visão "horas trabalhadas no período" que não some quando o item avança.
  const completeTimeLogs = timeLogs.filter((tl) => tl.work_item_id != null && !isExcludedApontamento(tl.user_name));
  const hasTimeLogsFull = completeTimeLogs.length > 0;

  // Build work item lookup
  const wiMap = new Map<number, { tags: string | null; title: string | null; parent_id: number | null; assigned_to_display: string | null; area_path: string | null; work_item_type: string | null; iteration_history: any; state?: string | null; web_url?: string | null }>();
  const tagsByWorkItemId: Record<number, string> = {};
  for (const wi of (workItemsQuery.data || [])) {
    wiMap.set(wi.id, wi);
    if (wi.tags) tagsByWorkItemId[wi.id] = wi.tags;
  }

  // Produtos de um item logado: tasks normalmente não têm tag de produto,
  // então sobe a cadeia de pais (task → PBI/Bug → ...) até encontrar produtos.
  function productsForWorkItem(startId: number, maxDepth = 10): string[] {
    let current = wiMap.get(startId);
    let depth = 0;
    while (current && depth < maxDepth) {
      const products = extractProducts(current.tags || null);
      if (products.length > 0) return products;
      if (!current.parent_id) break;
      current = wiMap.get(current.parent_id);
      depth++;
    }
    return [];
  }

  // Find top-level Epic by walking parent_id
  function findEpic(startId: number, maxDepth = 10): { title: string; id: number } | null {
    let currentId = startId;
    let current = wiMap.get(currentId);
    let depth = 0;
    while (current && depth < maxDepth) {
      if (current.work_item_type === 'Epic') {
        return { title: current.title || `Epic #${currentId}`, id: currentId };
      }
      if (!current.parent_id) break;
      currentId = current.parent_id;
      current = wiMap.get(currentId);
      depth++;
    }
    if (current && depth > 0) {
      return { title: current.title || `Item #${currentId}`, id: currentId };
    }
    return null;
  }

  // Fábrica (squad) de cada work item — resolvida pelo Epic raiz, mesma regra do timelog.
  // Cobre todos os itens não-infra (todas as sprints) para alimentar visão e histograma por fábrica.
  const fabricaByItemId: Record<number, string> = (() => {
    const out: Record<number, string> = {};
    if (wiMap.size === 0) return out;
    for (const item of nonInfraItems) {
      if (item.id == null) continue;
      const epic = findEpic(item.id);
      if (epic) out[item.id] = epic.title;
    }
    for (const wi of nonInfraWorkItems) {
      if (out[wi.id] !== undefined || !isFabricaManagerItem(wi.work_item_type)) continue;
      const epic = findEpic(wi.id);
      if (epic) out[wi.id] = epic.title;
    }
    return out;
  })();

  // Hours by collaborator
  const horasPorColaborador: TimelogAggregation[] = (() => {
    if (!hasTimeLogs) return [];
    const map: Record<string, number> = {};
    const labelMap: Record<string, string> = {};
    const collabMap = collabMapQuery.data || new Map<string, string>();
    for (const tl of scopedTimeLogs) {
      const rawName = tl.user_name || 'Desconhecido';
      if (isExcludedApontamento(rawName)) continue;
      const normalized = normalizeCollaboratorName(rawName) || 'desconhecido';
      // Persistent map takes precedence over first-seen heuristic
      const canonical = collabMap.get(rawName.toLowerCase()) ?? collabMap.get(normalized);
      if (canonical) {
        labelMap[normalized] = canonical;
      } else {
        labelMap[normalized] = labelMap[normalized] ?? rawName;
      }
      map[normalized] = (map[normalized] || 0) + (tl.time_minutes || 0);
    }
    return Object.entries(map)
      .map(([normalized, minutes]) => ({
        name: labelMap[normalized] || normalized,
        hours: Math.round(minutes / 60 * 10) / 10,
        minutes,
      }))
      .sort((a, b) => b.hours - a.hours);
  })();

  const collaboratorTaskIdsDevops: Record<string, number[]> = (() => {
    const byName = new Map<string, Set<number>>();
    const collabMap = collabMapQuery.data || new Map<string, string>();
    for (const tl of scopedTimeLogs) {
      if (!tl.work_item_id) continue;
      const rawName = tl.user_name || 'Desconhecido';
      if (isExcludedApontamento(rawName)) continue;
      const normalized = normalizeCollaboratorName(rawName) || 'desconhecido';
      const canonical = collabMap.get(rawName.toLowerCase()) ?? collabMap.get(normalized);
      const label = canonical || rawName;
      const set = byName.get(label) ?? new Set<number>();
      set.add(tl.work_item_id);
      byName.set(label, set);
    }
    const out: Record<string, number[]> = {};
    for (const [label, ids] of byName.entries()) {
      out[label] = Array.from(ids);
    }
    return out;
  })();

  // Hours by product
  const horasPorProduto: TimelogAggregation[] = (() => {
    if (!hasTimeLogs) return [];
    const map: Record<string, number> = {};
    for (const tl of scopedTimeLogs) {
      const products = tl.work_item_id ? productsForWorkItem(tl.work_item_id) : [];
      if (products.length > 0) {
        const share = (tl.time_minutes || 0) / products.length;
        for (const p of products) {
          const normalized = normalizeProduct(p);
          map[normalized] = (map[normalized] || 0) + share;
        }
      }
    }
    return Object.entries(map)
      .map(([name, minutes]) => ({ name, hours: Math.round(minutes / 60 * 10) / 10, minutes }))
      .sort((a, b) => b.hours - a.hours);
  })();

  // Hours by fábrica/squad (grouped by parent Epic)
  const horasPorFabrica: TimelogAggregation[] = (() => {
    if (!hasTimeLogs) return [];
    const map: Record<string, number> = {};
    for (const tl of scopedTimeLogs) {
      if (!tl.work_item_id) continue;
      const epic = findEpic(tl.work_item_id);
      const label = epic?.title || 'Sem Epic';
      map[label] = (map[label] || 0) + (tl.time_minutes || 0);
    }
    return Object.entries(map)
      .map(([name, minutes]) => ({
        name: `${name} ${(minutes / 60 / 8).toFixed(1)}d (${Math.round(minutes / 60 * 10) / 10}h)`,
        hours: Math.round(minutes / 60 * 10) / 10,
        minutes,
      }))
      .sort((a, b) => b.hours - a.hours);
  })();

  // Agrega timelog por fábrica (Epic raiz) + colaboradores. `keyOf` devolve o
  // rótulo da fábrica ou null para descartar o lançamento (ex.: Infra/Sem Épico).
  const collabNameMap = collabMapQuery.data || new Map<string, string>();
  const aggregateFabrica = (
    logs: typeof scopedTimeLogs,
    keyOf: (epic: { title: string; id: number } | null) => string | null,
  ): TimelogFabricaScope[] => {
    const minutesByKey = new Map<string, number>();
    const taskIdsByKey = new Map<string, Set<number>>();
    const collabByKey = new Map<string, Map<string, number>>();
    const collabLabelByKey = new Map<string, Map<string, string>>();
    for (const tl of logs) {
      if (!tl.work_item_id) continue;
      const epic = findEpic(tl.work_item_id);
      const key = keyOf(epic);
      if (key == null) continue;
      const mins = tl.time_minutes || 0;
      minutesByKey.set(key, (minutesByKey.get(key) || 0) + mins);
      const ids = taskIdsByKey.get(key) ?? new Set<number>();
      ids.add(tl.work_item_id);
      taskIdsByKey.set(key, ids);

      const rawName = tl.user_name || 'Desconhecido';
      const normalized = normalizeCollaboratorName(rawName) || 'desconhecido';
      const canonical = collabNameMap.get(rawName.toLowerCase()) ?? collabNameMap.get(normalized) ?? rawName;
      const cMap = collabByKey.get(key) ?? new Map<string, number>();
      cMap.set(normalized, (cMap.get(normalized) || 0) + mins);
      collabByKey.set(key, cMap);
      const lMap = collabLabelByKey.get(key) ?? new Map<string, string>();
      if (!lMap.has(normalized)) lMap.set(normalized, canonical);
      collabLabelByKey.set(key, lMap);
    }
    return Array.from(minutesByKey.entries())
      .map(([key, minutes]) => {
        const cMap = collabByKey.get(key) || new Map<string, number>();
        const lMap = collabLabelByKey.get(key) || new Map<string, string>();
        const collaborators: TimelogAggregation[] = Array.from(cMap.entries())
          .map(([norm, mins]) => ({
            name: lMap.get(norm) || norm,
            hours: Math.round(mins / 60 * 10) / 10,
            minutes: mins,
          }))
          .sort((a, b) => b.minutes - a.minutes);
        return {
          key,
          displayName: `${key} ${(minutes / 60 / 8).toFixed(1)}d (${Math.round(minutes / 60 * 10) / 10}h)`,
          taskIds: Array.from(taskIdsByKey.get(key) || []),
          hours: Math.round(minutes / 60 * 10) / 10,
          minutes,
          collaborators,
        };
      })
      .sort((a, b) => b.hours - a.hours);
  };

  // Visão "fila ativa" — preserva o comportamento atual (escopo do board).
  const horasPorFabricaScope: TimelogFabricaScope[] = hasTimeLogs
    ? aggregateFabrica(scopedTimeLogs, (epic) => epic?.title || 'Sem Epic')
    : [];

  // Visão "alocação completa" — todo apontamento do período, só épicos de squad
  // (descarta Infra e itens sem Épico, que não pertencem a nenhuma fábrica).
  const horasPorFabricaFull: TimelogFabricaScope[] = hasTimeLogsFull
    ? aggregateFabrica(completeTimeLogs, (epic) =>
        epic && !/infra/i.test(epic.title) ? epic.title : null)
    : [];
  const totalHoursLoggedFull = horasPorFabricaFull.reduce((sum, r) => sum + r.minutes, 0) / 60;

  /**
   * O complemento de `horasPorFabricaFull`: apontamento sem Épico ou sob épico
   * de Infra. NÃO entra na conta das squads (inflaria a utilização de quem está
   * no roster) — serve para o balde "Sem squad" ter o que mostrar.
   *
   * Sem isto, filtrar o Igor Cardoso deixava "Capacidade × Realizado" dizendo
   * "sem apontamentos" com 108 h lançadas: as tasks dele penduram no 2700, cujo
   * épico raiz (9990) nem existe na base sincronizada (reportado em 11/08/2026).
   */
  const horasForaDasFabricas: TimelogFabricaScope[] = hasTimeLogsFull
    ? aggregateFabrica(completeTimeLogs, (epic) =>
        (!epic || /infra/i.test(epic.title)) ? 'Outras' : null)
    : [];

  // ── VDESK aggregations (automatic, more reliable source) ──
  const vdeskLogs = vdeskLogsQuery.data || [];
  const scopedVdeskLogs = vdeskLogs.filter((vl) => {
    if (!itemIdsInScope.has(vl.task_devops)) return false;
    return !isExcludedApontamento(vl.usuario_vdesk) && !isExcludedApontamento(normalizeCollaboratorName(vl.usuario_vdesk));
  });
  const totalVdeskHours = scopedVdeskLogs.reduce((sum, vl) => sum + vl.tempo_segundos, 0) / 3600;
  const hasVdeskData = scopedVdeskLogs.length > 0;

  const horasVdeskPorColaborador: TimelogAggregation[] = (() => {
    if (!hasVdeskData) return [];
    const map: Record<string, number> = {};
    const labelMap: Record<string, string> = {};
    const collabMap = collabMapQuery.data || new Map<string, string>();
    for (const vl of scopedVdeskLogs) {
      const rawName = vl.usuario_vdesk || 'Desconhecido';
      if (isExcludedApontamento(rawName)) continue;
      const normalized = normalizeCollaboratorName(rawName) || 'desconhecido';
      const canonical = collabMap.get(rawName.toLowerCase()) ?? collabMap.get(normalized);
      if (canonical) labelMap[normalized] = canonical;
      else labelMap[normalized] = labelMap[normalized] ?? rawName;
      map[normalized] = (map[normalized] || 0) + vl.tempo_segundos;
    }
    return Object.entries(map)
      .map(([normalized, seconds]) => ({
        name: labelMap[normalized] || normalized,
        hours: Math.round(seconds / 3600 * 10) / 10,
        minutes: Math.round(seconds / 60),
      }))
      .sort((a, b) => b.hours - a.hours);
  })();

  const collaboratorTaskIdsVdesk: Record<string, number[]> = (() => {
    const byName = new Map<string, Set<number>>();
    const collabMap = collabMapQuery.data || new Map<string, string>();
    for (const vl of scopedVdeskLogs) {
      const rawName = vl.usuario_vdesk || 'Desconhecido';
      if (isExcludedApontamento(rawName)) continue;
      const normalized = normalizeCollaboratorName(rawName) || 'desconhecido';
      const canonical = collabMap.get(rawName.toLowerCase()) ?? collabMap.get(normalized);
      const label = canonical || rawName;
      const set = byName.get(label) ?? new Set<number>();
      set.add(vl.task_devops);
      byName.set(label, set);
    }
    const out: Record<string, number[]> = {};
    for (const [label, ids] of byName.entries()) {
      out[label] = Array.from(ids);
    }
    return out;
  })();

  const horasVdeskPorProduto: TimelogAggregation[] = (() => {
    if (!hasVdeskData) return [];
    const map: Record<string, number> = {};
    for (const vl of scopedVdeskLogs) {
      const products = productsForWorkItem(vl.task_devops);
      if (products.length > 0) {
        const share = vl.tempo_segundos / products.length;
        for (const p of products) {
          const normalized = normalizeProduct(p);
          map[normalized] = (map[normalized] || 0) + share;
        }
      }
    }
    return Object.entries(map)
      .map(([name, seconds]) => ({ name, hours: Math.round(seconds / 3600 * 10) / 10, minutes: Math.round(seconds / 60) }))
      .sort((a, b) => b.hours - a.hours);
  })();

  const consolidadoPorTarefa = consolidarApontamentos(
    scopedTimeLogs,
    scopedVdeskLogs,
    canonicalApontamento,
  );

  /**
   * Jornada acima do limite — régua sobre TODO apontamento do período, não só o
   * escopo da fila: excesso de jornada é fato de RH, não de sprint.
   */
  const diasSobrecarga: DiaSobrecarga[] = calcularDiasSobrecarga(
    (timeLogsDiaQuery.data || []).filter((tl) => !isExcludedApontamento(tl.user_name)),
    (vdeskLogsQuery.data || []).filter((vl) => !isExcludedApontamento(vl.usuario_vdesk)),
    canonicalApontamento,
  );

  const sobrecargaPorColaborador: Record<string, DiaSobrecarga[]> = (() => {
    const out: Record<string, DiaSobrecarga[]> = {};
    for (const d of diasSobrecarga) (out[d.name] ??= []).push(d);
    for (const lista of Object.values(out)) lista.sort((a, b) => a.dia.localeCompare(b.dia));
    return out;
  })();

  const agregarPorColaborador = (linhas: ApontamentoConsolidado[]): TimelogAggregation[] => {
    const map = new Map<string, number>();
    for (const e of linhas) {
      if (isExcludedApontamento(e.name)) continue;
      map.set(e.name, (map.get(e.name) || 0) + e.consolidado);
    }
    return [...map.entries()]
      .map(([name, minutes]) => ({
        name,
        hours: Math.round(minutes / 60 * 10) / 10,
        minutes: Math.round(minutes),
      }))
      .sort((a, b) => b.minutes - a.minutes);
  };

  /** Horas por colaborador sem dupla contagem — a régua confrontável com o TimeLog. */
  const horasConsolidadasPorColaborador: TimelogAggregation[] = agregarPorColaborador(consolidadoPorTarefa);

  /**
   * Mesma régua, mas sobre TODO apontamento do período — sem o recorte da fila
   * da Fábrica.
   *
   * A aba TimeLog cobre só PBI/Bug na fila + tasks filhas: em 07/2026 isso era
   * 1.270 h de 3.367 h (37,7% do mês). Para controle de horas do colaborador o
   * gestor precisa do mês inteiro, independente de squad ou sprint.
   */
  const horasPeriodoTotalPorColaborador: ColaboradorHoras[] = (() => {
    const linhas = consolidarApontamentos(
      completeTimeLogs,
      (vdeskLogsQuery.data || []).filter((vl) => !isExcludedApontamento(vl.usuario_vdesk)),
      canonicalApontamento,
    );
    const map = new Map<string, ColaboradorHoras>();
    for (const e of linhas) {
      if (isExcludedApontamento(e.name)) continue;
      const a = map.get(e.name) ?? { name: e.name, devopsMinutes: 0, vdeskMinutes: 0, minutes: 0 };
      a.devopsMinutes += e.devops;
      a.vdeskMinutes  += e.vdesk;
      a.minutes       += e.consolidado;
      map.set(e.name, a);
    }
    return [...map.values()]
      .map((a) => ({
        name: a.name,
        devopsMinutes: Math.round(a.devopsMinutes),
        vdeskMinutes: Math.round(a.vdeskMinutes),
        minutes: Math.round(a.minutes),
      }))
      .sort((a, b) => b.minutes - a.minutes);
  })();

  const totalHorasConsolidadas =
    consolidadoPorTarefa
      .filter((e) => !isExcludedApontamento(e.name))
      .reduce((s, e) => s + e.consolidado, 0) / 60;

  // ── Consolidação a nível de PBI/Bug: horas próprias + horas das tasks filhas ──
  const horasPorPbi: PbiTimelogConsolidado[] = (() => {
    const acc = new Map<number, { devopsMinutes: number; vdeskMinutes: number; taskIds: Set<number> }>();
    const resolveManagerId = (rawId: number): number | null => {
      if (managerScopedIds.has(rawId)) return rawId;
      return managerIdByTaskId[rawId] ?? null;
    };
    const add = (rawId: number, source: 'devops' | 'vdesk', minutes: number) => {
      const managerId = resolveManagerId(rawId);
      if (managerId == null) return;
      const entry = acc.get(managerId) ?? { devopsMinutes: 0, vdeskMinutes: 0, taskIds: new Set<number>() };
      if (source === 'devops') entry.devopsMinutes += minutes;
      else entry.vdeskMinutes += minutes;
      if (rawId !== managerId) entry.taskIds.add(rawId);
      acc.set(managerId, entry);
    };
    for (const tl of scopedTimeLogs) {
      if (tl.work_item_id != null) add(tl.work_item_id, 'devops', tl.time_minutes || 0);
    }
    for (const vl of scopedVdeskLogs) {
      add(vl.task_devops, 'vdesk', vl.tempo_segundos / 60);
    }

    // Consolidado (sem dupla contagem) e quebra por colaborador, subindo a task
    // filha para o PBI/Bug pai — é o que alimenta o funil de colaborador no card.
    const consolidadoPorPbi = new Map<number, Map<string, number>>();
    // Mesma quebra, um nível abaixo: por task — alimenta o drill-down do card.
    const tasksPorPbi = new Map<number, Map<number, PbiTaskDetalhe>>();

    for (const e of consolidadoPorTarefa) {
      if (isExcludedApontamento(e.name)) continue;
      const managerId = resolveManagerId(e.taskId);
      if (managerId == null) continue;

      const porNome = consolidadoPorPbi.get(managerId) ?? new Map<string, number>();
      porNome.set(e.name, (porNome.get(e.name) || 0) + e.consolidado);
      consolidadoPorPbi.set(managerId, porNome);

      const porTask = tasksPorPbi.get(managerId) ?? new Map<number, PbiTaskDetalhe>();
      let t = porTask.get(e.taskId);
      if (!t) {
        const wi = wiMap.get(e.taskId);
        t = {
          id: e.taskId,
          title: wi?.title ?? `#${e.taskId}`,
          state: wi?.state ?? null,
          web_url: wi?.web_url ?? null,
          devopsMinutes: 0,
          vdeskMinutes: 0,
          minutes: 0,
          isProprioItem: e.taskId === managerId,
          colaboradores: [],
        };
        porTask.set(e.taskId, t);
      }
      t.devopsMinutes += e.devops;
      t.vdeskMinutes  += e.vdesk;
      t.minutes       += e.consolidado;
      t.colaboradores.push({
        name: e.name,
        hours: Math.round(e.consolidado / 60 * 10) / 10,
        minutes: Math.round(e.consolidado),
      });
      tasksPorPbi.set(managerId, porTask);
    }

    const itemById = new Map<number, FabricaItem>();
    for (const item of managerScopedItems) {
      if (item.id != null) itemById.set(item.id, item);
    }
    return [...acc.entries()]
      .map(([id, v]) => {
        const item = itemById.get(id);
        const porNome = consolidadoPorPbi.get(id) ?? new Map<string, number>();
        const colaboradores: TimelogAggregation[] = [...porNome.entries()]
          .map(([name, minutes]) => ({
            name,
            hours: Math.round(minutes / 60 * 10) / 10,
            minutes: Math.round(minutes),
          }))
          .sort((a, b) => b.minutes - a.minutes);
        const consolidadoMinutes = colaboradores.reduce((s, c) => s + c.minutes, 0);
        const tasks: PbiTaskDetalhe[] = [...(tasksPorPbi.get(id)?.values() ?? [])]
          .map((t) => ({
            ...t,
            devopsMinutes: Math.round(t.devopsMinutes),
            vdeskMinutes: Math.round(t.vdeskMinutes),
            minutes: Math.round(t.minutes),
            colaboradores: [...t.colaboradores].sort((a, b) => b.minutes - a.minutes),
          }))
          .sort((a, b) => b.minutes - a.minutes);
        return {
          id,
          title: item?.title ?? `#${id}`,
          work_item_type: item?.work_item_type ?? null,
          state: item?.state ?? null,
          assigned_to_display: item?.assigned_to_display ?? null,
          web_url: item?.web_url ?? null,
          devopsMinutes: Math.round(v.devopsMinutes),
          vdeskMinutes: Math.round(v.vdeskMinutes),
          // `totalMinutes` passa a ser o CONSOLIDADO: somar devops+vdesk contava
          // duas vezes a hora que o FlagHub replicou do VDESK para o DevOps.
          totalMinutes: consolidadoMinutes,
          devopsHours: Math.round(v.devopsMinutes / 60 * 10) / 10,
          vdeskHours: Math.round(v.vdeskMinutes / 60 * 10) / 10,
          taskCount: v.taskIds.size,
          colaboradores,
          tasks,
          foraDoEscopoSquad: EPICS_FORA_DA_FABRICA.has(id),
        };
      })
      .sort((a, b) => b.totalMinutes - a.totalMinutes);
  })();

  // Coverage: how much of max(vdesk,devops) total hours is covered by the other source
  const vdeskMatchRate: number | null = (() => {
    if (!hasVdeskData || !hasTimeLogs) return null;
    const maxH = Math.max(totalVdeskHours, totalHoursLogged);
    if (maxH === 0) return null;
    return Math.round(Math.min(totalVdeskHours, totalHoursLogged) / maxH * 100);
  })();

  // ── Corporate KPIs ──
  const pbis = filteredItems.filter(
    i => i.work_item_type === 'Product Backlog Item' || i.work_item_type === 'User Story'
  );
  const pbisWithEffort = pbis.filter(i => i.effort != null && i.effort > 0);

  let leadTimeMedio: number | null = null;
  let leadTimeSource: 'timelog' | 'effort' | null = null;

  if (hasTimeLogs && pbis.length > 0) {
    leadTimeMedio = Math.round((totalHoursLogged / pbis.length) * 10) / 10;
    leadTimeSource = 'timelog';
  } else if (pbisWithEffort.length > 0) {
    const totalEffort = pbisWithEffort.reduce((sum, i) => sum + (i.effort || 0), 0);
    leadTimeMedio = Math.round((totalEffort / pbisWithEffort.length) * 10) / 10;
    leadTimeSource = 'effort';
  }

  const sprintSet = new Set(nonInfraItems.map(i => i.iteration_path).filter(Boolean) as string[]);
  const sprintCount = sprintSet.size;
  const sortedSprints = [...sprintSet].sort(sprintCompare);
  const currentSprint = sortedSprints.length > 0 ? sortedSprints[sortedSprints.length - 1] : null;

  let velocidadeMedia: number | null = null;
  let velocidadeSource: 'timelog' | 'effort' | null = null;

  if (hasTimeLogs && sprintCount > 0) {
    velocidadeMedia = Math.round((totalHoursLogged / sprintCount) * 10) / 10;
    velocidadeSource = 'timelog';
  } else if (sprintCount > 0 && pbisWithEffort.length > 0) {
    const effortBySprint: Record<string, number> = {};
    for (const item of pbisWithEffort) {
      const sp = item.iteration_path || 'unknown';
      effortBySprint[sp] = (effortBySprint[sp] || 0) + (item.effort || 0);
    }
    const sprintsWithEffort = Object.values(effortBySprint);
    if (sprintsWithEffort.length > 0) {
      const avgPerSprint = sprintsWithEffort.reduce((a, b) => a + b, 0) / sprintsWithEffort.length;
      velocidadeMedia = Math.round(avgPerSprint * 10) / 10;
      velocidadeSource = 'effort';
    }
  }

  // Transbordo — PBIs with iteration_history changes
  let transbordoPct: number | null = null;
  let transbordoCount = 0;
  let sprintMigrationCount = 0;
  let realOverflowCount = 0;
  let realOverflowItemCount = 0;
  let realOverflowPct: number | null = null;
  let transbordoTotal = 0;
  let transbordoItems: TransbordoItem[] = [];

  const allPbis = filteredItems.filter(
    i => i.work_item_type === 'Product Backlog Item' || i.work_item_type === 'User Story'
  );
  transbordoTotal = allPbis.length;

  const overflowedPbis = allPbis.filter(i => {
    if (!i.id) return false;
    const wi = wiMap.get(i.id);
    const history = (wi?.iteration_history || []) as Array<{ oldValue: string; newValue: string; revisedDate: string }>;

    const relevantChanges = history.filter((h) => {
      const oldValue = h.oldValue || '';
      const newValue = h.newValue || '';
      const oldCode = extractSprintCodeFromPath(oldValue);
      const newCode = extractSprintCodeFromPath(newValue);

      if (!newCode) return false;
      if (oldCode) return oldCode !== newCode;

      const isBacklogEntry = /backlog/i.test(oldValue);
      return !isBacklogEntry;
    });

    return relevantChanges.length > 0;
  });

  sprintMigrationCount = overflowedPbis.length;
  transbordoCount = sprintMigrationCount;
  transbordoPct = transbordoTotal > 0
    ? Math.round((sprintMigrationCount / transbordoTotal) * 100)
    : 0;

  const seen = new Set<number>();
  transbordoItems = overflowedPbis
    .filter(i => {
      if (!i.id || seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    })
    .map(i => {
      const wi = wiMap.get(i.id!);
      const history = (wi?.iteration_history || []) as Array<{ oldValue: string; newValue: string; revisedDate: string }>;
      const relevantChanges = history.filter((h) => {
        const oldValue = h.oldValue || '';
        const newValue = h.newValue || '';
        const oldCode = extractSprintCodeFromPath(oldValue);
        const newCode = extractSprintCodeFromPath(newValue);

        if (!newCode) return false;
        if (oldCode) return oldCode !== newCode;

        return !/backlog/i.test(oldValue);
      });

      const sprintsMoved = relevantChanges.map(h => h.oldValue);
      if (i.iteration_path) sprintsMoved.push(i.iteration_path);
      const uniqueSprints = [...new Set(sprintsMoved)].sort(sprintCompare);
      const itemSprintMigrationCount = relevantChanges.length;
      const itemRealOverflowCount = Math.max(0, itemSprintMigrationCount - 1);

      return {
        ...i,
        // Keep overflowCount as compatibility alias for existing UI consumers
        overflowCount: itemSprintMigrationCount,
        sprintMigrationCount: itemSprintMigrationCount,
        realOverflowCount: itemRealOverflowCount,
        sprintsOverflowed: uniqueSprints,
      };
    });

  realOverflowItemCount = transbordoItems.filter((i) => i.realOverflowCount > 0).length;
  realOverflowCount = transbordoItems.reduce((sum, i) => sum + i.realOverflowCount, 0);
  realOverflowPct = transbordoTotal > 0
    ? Math.round((realOverflowItemCount / transbordoTotal) * 100)
    : 0;

  return {
    items: filteredItems,
    allSprintItems: scopedItems,
    allItems: nonInfraItems,
    allWorkItems: nonInfraWorkItems,
    total,
    inProgress,
    entregue,
    toDo,
    done,
    porColaborador,
    lastSync: lastSyncQuery.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
      // Phase 4: roll-up — kpiItems excludes double-counted Tasks whose parent is in view
      kpiItems,
    // Corporate KPIs
    leadTimeMedio,
    leadTimeSource,
    velocidadeMedia,
    velocidadeSource,
    transbordoPct,
    transbordoCount,
    sprintMigrationCount,
    realOverflowCount,
    realOverflowItemCount,
    realOverflowPct,
    transbordoTotal,
    transbordoItems,
    currentSprint,
    sortedSprints,
    sprintCount,
    hasTimeLogs,
    totalHoursLogged,
    hasTimeLogsFull,
    totalHoursLoggedFull,
    // Timelog aggregations (DevOps — manual entries)
    horasPorColaborador,
    horasPorProduto,
    horasPorFabrica,
    horasPorFabricaScope,
    horasPorFabricaFull,
    /** Apontamento sem Épico ou de Infra — alimenta o balde "Sem squad" */
    horasForaDasFabricas,
    collaboratorTaskIdsDevops,
    collaboratorTaskIdsVdesk,
    // Consolidado VDESK+DevOps sem dupla contagem (max por work item/colaborador)
    horasConsolidadasPorColaborador,
    /** Idem, sobre todo o período — sem o recorte da fila da Fábrica */
    horasPeriodoTotalPorColaborador,
    totalHorasConsolidadas,
    /** Dias-pessoa acima de LIMITE_ALERTA_DIA_HORAS no período */
    diasSobrecarga,
    /** Os mesmos dias, indexados por colaborador */
    sobrecargaPorColaborador,
    // VDESK aggregations (automatic — more reliable)
    hasVdeskData,
    totalVdeskHours,
    horasVdeskPorColaborador,
    horasVdeskPorProduto,
    vdeskMatchRate,
    vdeskIsLoading: vdeskLogsQuery.isLoading,
    /** Raw scoped VDESK log entries (with id) — for post-to-DevOps queue UI */
    scopedVdeskLogs,
    tagsByWorkItemId,
    /** Fábrica (Epic raiz) por work item id — para visões gerenciais por fábrica */
    fabricaByItemId,
    /** Escopo completo do timelog: PBIs/Bugs gerenciais + todas as suas tasks */
    timelogScopeIds: [...timelogScopeIds],
    /** Task id → PBI/Bug pai no escopo gerencial (consolidação de horas) */
    managerIdByTaskId,
    /** Horas consolidadas por PBI/Bug (próprias + tasks filhas), DevOps + VDESK */
    horasPorPbi,
    allCollaborators,
  };
}
