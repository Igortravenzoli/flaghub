/**
 * Hooks da aba de Logs da Fábrica — rastreabilidade das rotinas automáticas.
 *
 * Todas as fontes já são gravadas hoje; esta camada só expõe.
 *
 *  • devops_qa_return_events → disparo dos alertas de Retorno QA
 *  • timelog_sync_runs       → execuções do sync VDESK
 *  • timelog_post_queue      → rastro de cada lançamento enviado ao DevOps
 *  • rpc_fabrica_apontamentos_sem_email → quem tem hora que não pode ser lançada
 *
 * Permissões: a leitura exige usuário aprovado (`hub_is_approved()` — qualquer
 * membresia ativa de área, ou admin). NÃO há recorte por setor no banco; o
 * recorte da aba (`canManageTimelog`) é UX, não segurança.
 *
 * Cada consulta paginada devolve `truncated` para a UI poder avisar quando a
 * lista foi cortada — num log, lista truncada silenciosamente induz a conclusão
 * errada ("não teve lançamento" quando na verdade "não coube").
 */
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Janela em dias oferecida no seletor de período da aba. */
export const LOG_PERIOD_OPTIONS = [7, 30, 90] as const;
export type LogPeriodDays = (typeof LOG_PERIOD_OPTIONS)[number];

const LIMITE_LINHAS = 500;

export interface LogPage<T> {
  rows: T[];
  /** true quando o resultado bateu no teto — a lista NÃO está completa. */
  truncated: boolean;
}

/**
 * Data de N dias atrás em horário LOCAL (YYYY-MM-DD).
 * Não usar toISOString: entre 21h e 23h59 BRT a data UTC já virou e a janela
 * sairia deslocada em um dia — a mesma classe de bug "data +1 dia" que o
 * projeto já enfrentou na exibição de apontamentos.
 */
export function isoNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Início do dia local como ISO com offset explícito (para colunas timestamptz). */
function inicioDoDiaLocalIso(dateStr: string): string {
  const offsetMin = new Date().getTimezoneOffset();      // BRT → +180
  const sinal = offsetMin <= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${dateStr}T00:00:00${sinal}${hh}:${mm}`;
}

// ─── 1. Alertas de Retorno QA ────────────────────────────────────────────────

/** Domínio real da coluna alert_status (CHECK em 20260428100000). */
export type QaAlertStatus = 'pending' | 'sent' | 'failed' | 'fallback_sent' | 'skipped';

export interface QaAlertLogRow {
  id: number;
  work_item_id: number;
  work_item_title: string | null;
  work_item_type: string | null;
  web_url: string | null;
  sprint_code: string | null;
  detected_at: string;
  transition_date: string | null;
  detection_method: string | null;
  detected_tags: string | null;
  transition_from_state: string | null;
  transition_to_state: string | null;
  assigned_to_display: string | null;
  assigned_to_email: string | null;
  alert_status: QaAlertStatus;
  alert_channel_type: string | null;
  alert_sent_at: string | null;
  alert_error: string | null;
  lead_teams_user_id: string | null;
  is_open: boolean;
  resolved_at: string | null;
}

const QA_ALERT_COLUMNS =
  'id,work_item_id,work_item_title,work_item_type,web_url,sprint_code,detected_at,' +
  'transition_date,detection_method,detected_tags,transition_from_state,transition_to_state,' +
  'assigned_to_display,assigned_to_email,alert_status,alert_channel_type,alert_sent_at,' +
  'alert_error,lead_teams_user_id,is_open,resolved_at';

/**
 * A consulta traz o PERÍODO inteiro; o recorte "só com problema" é aplicado na
 * UI. Assim os contadores do cabeçalho descrevem o período (não a visão
 * filtrada) e o aviso de truncamento se refere ao que existe, não ao filtro.
 */
export function useQaAlertLog(days: LogPeriodDays) {
  return useQuery({
    queryKey: ['fabrica-logs', 'qa-alerts', days],
    queryFn: async (): Promise<LogPage<QaAlertLogRow>> => {
      const { data, error } = await (supabase as any)
        .from('devops_qa_return_events')
        .select(QA_ALERT_COLUMNS)
        .gte('detected_at', inicioDoDiaLocalIso(isoNDaysAgo(days)))
        .order('detected_at', { ascending: false })
        .limit(LIMITE_LINHAS);
      if (error) throw error;
      const rows = (data ?? []) as unknown as QaAlertLogRow[];
      return { rows, truncated: rows.length >= LIMITE_LINHAS };
    },
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

/** Alerta que não chegou ao destinatário — a exceção que pede ação. */
export function alertaSemAviso(r: QaAlertLogRow): boolean {
  return r.alert_status === 'failed' || r.alert_status === 'skipped' || r.alert_status === 'pending';
}

// ─── 2. Execuções do sync VDESK ──────────────────────────────────────────────

/**
 * Só os campos que a edge realmente grava (vdesk-sync-timelog/index.ts:237-240).
 * rows_updated / rows_skipped / error_code existem no schema mas nunca são
 * preenchidos — exibi-los mostraria zero permanente e passaria informação falsa.
 */
export interface VdeskSyncRunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  from_date: string;
  to_date: string;
  rows_fetched: number;
  rows_inserted: number;
  pages_fetched: number;
  status: string;
  error_message: string | null;
  triggered_by: string;
}

export function useVdeskSyncRunLog(limit = 30) {
  return useQuery({
    queryKey: ['fabrica-logs', 'vdesk-sync-runs', limit],
    queryFn: async (): Promise<LogPage<VdeskSyncRunRow>> => {
      const { data, error } = await (supabase as any)
        .from('timelog_sync_runs')
        .select(
          'id,started_at,finished_at,duration_ms,from_date,to_date,rows_fetched,' +
          'rows_inserted,pages_fetched,status,error_message,triggered_by'
        )
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      const rows = (data ?? []) as unknown as VdeskSyncRunRow[];
      return { rows, truncated: rows.length >= limit };
    },
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

// ─── 3. Rastro por lançamento (a fila é o livro-razão) ───────────────────────

export interface TimelogPostLogRow {
  id: string;
  vdesk_log_id: string;
  task_devops: number;
  log_date: string;
  time_minutes: number;
  target_user_email: string | null;
  target_user_display: string | null;
  vdesk_user_name: string;
  notes: string | null;
  status: string;
  posted_at: string | null;
  devops_entry_id: string | null;
  error_code: string | null;
  error_message: string | null;
  attempt_count: number;
  dry_run: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Traz o período inteiro; status e busca são aplicados na UI. Manter a busca
 * fora da queryKey evita um round-trip a cada tecla digitada com resposta
 * idêntica do servidor — e manter o status fora impede que um filtro faça o
 * contador do cabeçalho mentir sobre o período.
 */
export function useTimelogPostLog(days: LogPeriodDays) {
  return useQuery({
    queryKey: ['fabrica-logs', 'timelog-post', days],
    queryFn: async (): Promise<LogPage<TimelogPostLogRow>> => {
      const { data, error } = await (supabase as any)
        .from('timelog_post_queue')
        .select(
          'id,vdesk_log_id,task_devops,log_date,time_minutes,target_user_email,' +
          'target_user_display,vdesk_user_name,notes,status,posted_at,devops_entry_id,' +
          'error_code,error_message,attempt_count,dry_run,created_at,updated_at'
        )
        .gte('created_at', inicioDoDiaLocalIso(isoNDaysAgo(days)))
        .order('created_at', { ascending: false })
        .limit(LIMITE_LINHAS);
      if (error) throw error;
      const rows = (data ?? []) as unknown as TimelogPostLogRow[];
      return { rows, truncated: rows.length >= LIMITE_LINHAS };
    },
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

/** Filtro em memória — pessoa, task ou id do lançamento no DevOps. */
export function filtrarLancamentos(
  rows: TimelogPostLogRow[],
  termo: string,
  status: string,
): TimelogPostLogRow[] {
  const t = termo.trim().toLowerCase();
  return rows.filter((r) => {
    if (status && r.status !== status) return false;
    if (!t) return true;
    return (
      r.vdesk_user_name?.toLowerCase().includes(t) ||
      r.target_user_display?.toLowerCase().includes(t) ||
      r.target_user_email?.toLowerCase().includes(t) ||
      String(r.task_devops).includes(t) ||
      r.devops_entry_id?.toLowerCase().includes(t)
    );
  });
}

// ─── 4. Exceção: apontamento sem destinatário resolvível ─────────────────────

export interface ApontamentoSemEmailRow {
  usuario_vdesk: string;
  apontamentos: number;
  minutos: number;
  primeira_data: string;
  ultima_data: string;
}

/**
 * Apontamentos cujo usuário VDESK não tem devops_email ativo no mapa: sem
 * destinatário resolvível, o lançamento não chega ao DevOps.
 *
 * Agregado no banco (rpc_fabrica_apontamentos_sem_email) porque a lista é
 * apresentada como exaustiva — baixar linha a linha teria teto de paginação e
 * subnotificaria pessoas.
 *
 * Nota: estes apontamentos PODEM ter linha na fila (rpc_timelog_queue_post
 * insere mesmo com target_user_email nulo, e a fila mostra o selo "sem e-mail").
 * Os dois blocos se sobrepõem de propósito: lá é o rastro, aqui é a pendência.
 */
export function useApontamentosSemEmail(days: LogPeriodDays) {
  return useQuery({
    queryKey: ['fabrica-logs', 'sem-email', days],
    queryFn: async (): Promise<ApontamentoSemEmailRow[]> => {
      const { data, error } = await (supabase as any).rpc(
        'rpc_fabrica_apontamentos_sem_email',
        { p_days: days }
      );
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        usuario_vdesk: r.usuario_vdesk,
        apontamentos: Number(r.apontamentos),
        minutos: Number(r.minutos),
        primeira_data: r.primeira_data,
        ultima_data: r.ultima_data,
      })) as ApontamentoSemEmailRow[];
    },
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
