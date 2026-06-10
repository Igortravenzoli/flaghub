-- ============================================================================
-- Migration: 20260609142000_qa_historical_read_rpcs.sql
-- Leitura do histórico de QA por Closed By + procedência
--
--   1. rpc_get_sprint_historical_v2  — + qa_concluidos*, snapshot_source, as_of.
--   2. rpc_qa_historical_series(year) — série por sprint p/ o gráfico histórico.
-- ============================================================================

-- ── 1. Estende a leitura por sprint ──────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_get_sprint_historical_v2(text);

CREATE OR REPLACE FUNCTION public.rpc_get_sprint_historical_v2(p_sprint_code text)
 RETURNS TABLE(
   sprint_code text, total_demands bigint, planned_demands bigint, unplanned_demands bigint,
   delivered_demands bigint, finalized_demands bigint, delivered_in_dev bigint, delivered_in_qa bigint,
   unplanned_bug_count bigint, unplanned_retorno_qa_count bigint, unplanned_aviao_count bigint,
   itens_criticos bigint, itens_atencao bigint, itens_saudaveis bigint,
   avg_lead_time_days numeric, max_lead_time_days numeric, transbordo_count bigint,
   work_item_count integer, source_work_item_ids bigint[],
   snapshot_datetime timestamp without time zone, captured_by text, notes text,
   qa_done_items bigint, qa_items_with_return bigint, qa_return_cycles_total bigint,
   qa_return_rate_pct numeric, qa_avg_return_cycles numeric,
   qa_concluidos bigint, qa_concluidos_sem_retorno bigint, qa_concluidos_com_retorno bigint,
   snapshot_source text, as_of_datetime timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    sis.sprint_code, sis.total_demands, sis.planned_demands, sis.unplanned_demands,
    sis.delivered_demands, sis.finalized_demands, sis.delivered_in_dev_count, sis.delivered_in_qa_count,
    sis.unplanned_bug_count, sis.unplanned_retorno_qa_count, sis.unplanned_aviao_count,
    sis.itens_criticos, sis.itens_atencao, sis.itens_saudaveis,
    sis.avg_lead_time_days, sis.max_lead_time_days, sis.transbordo_count,
    sis.work_item_count_in_snapshot, sis.source_work_item_ids,
    sis.snapshot_datetime, sis.captured_by, sis.notes,
    sis.qa_done_items, sis.qa_items_with_return, sis.qa_return_cycles_total,
    sis.qa_return_rate_pct, sis.qa_avg_return_cycles,
    sis.qa_concluidos, sis.qa_concluidos_sem_retorno, sis.qa_concluidos_com_retorno,
    sis.snapshot_source, sis.as_of_datetime
  FROM public.sprint_indicator_snapshots sis
  WHERE sis.sprint_code = p_sprint_code
  ORDER BY sis.snapshot_datetime DESC
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_get_sprint_historical_v2(text) TO authenticated, service_role;

-- ── 2. Série histórica para o gráfico de QA ──────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_qa_historical_series(int);

CREATE OR REPLACE FUNCTION public.rpc_qa_historical_series(
  p_year int DEFAULT EXTRACT(YEAR FROM NOW())::int
)
RETURNS TABLE(
  sprint_code text,
  sprint_number int,
  qa_done_items bigint,
  qa_concluidos bigint,
  qa_concluidos_sem_retorno bigint,
  qa_concluidos_com_retorno bigint,
  qa_return_rate_pct numeric,
  snapshot_source text,
  as_of_datetime timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $function$
  WITH latest AS (
    SELECT DISTINCT ON (sis.sprint_code) sis.*
    FROM public.sprint_indicator_snapshots sis
    WHERE sis.sprint_code ~ '^S[0-9]+-[0-9]{4}$'
      AND split_part(sis.sprint_code, '-', 2)::int = p_year
    ORDER BY sis.sprint_code, sis.snapshot_datetime DESC
  )
  SELECT
    l.sprint_code,
    regexp_replace(split_part(l.sprint_code, '-', 1), '[^0-9]', '', 'g')::int AS sprint_number,
    COALESCE(l.qa_done_items, 0),
    COALESCE(l.qa_concluidos, 0),
    COALESCE(l.qa_concluidos_sem_retorno, 0),
    COALESCE(l.qa_concluidos_com_retorno, 0),
    COALESCE(l.qa_return_rate_pct, 0),
    l.snapshot_source,
    l.as_of_datetime
  FROM latest l
  ORDER BY sprint_number;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_qa_historical_series(int) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_qa_historical_series(int) IS
  'Série por sprint (ano) para o gráfico histórico de QA: qa_concluidos (Closed By) e procedência.';
