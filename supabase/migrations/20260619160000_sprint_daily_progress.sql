-- ============================================================================
-- Migration: 20260619160000_sprint_daily_progress.sql
-- Série histórica DIÁRIA da sprint ABERTA (visão "evolução"), mantendo intactas
-- a visão "ao vivo" (GerenciaTab calcula do estado atual) e a foto canônica de
-- fim de sprint (sprint_indicator_snapshots, 1 linha/sprint).
--
-- 100% aditivo: NÃO altera rpc_reconstruct_sprint_snapshot nem o cron de fim de
-- sprint (job 51). Apenas:
--   1. Tabela sprint_daily_progress — 1 linha por (sprint, dia BRT).
--   2. rpc_capture_sprint_daily_progress — captura a sprint aberta as-of NOW(),
--      reusando fn_classifica_demanda / fn_demanda_nao_planejada (mesmas regras
--      do gerencial). UPSERT idempotente por (sprint_code, captured_date).
--   3. rpc_get_sprint_daily_progress — leitura da série de uma sprint.
--   4. cron job "sprint-daily-progress" — diário 03:05 UTC (00:05 BRT).
-- ============================================================================

-- ── 1. Tabela de progresso diário ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sprint_daily_progress (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_code                 text NOT NULL,
  captured_date               date NOT NULL,
  snapshot_datetime           timestamptz NOT NULL DEFAULT now(),
  as_of_datetime              timestamptz,
  sprint_start_date           date,
  sprint_end_date             date,
  total_demands               integer NOT NULL DEFAULT 0,
  planned_demands             integer NOT NULL DEFAULT 0,
  unplanned_demands           integer NOT NULL DEFAULT 0,
  delivered_demands           integer NOT NULL DEFAULT 0,
  finalized_demands           integer NOT NULL DEFAULT 0,
  itens_criticos              integer NOT NULL DEFAULT 0,
  itens_atencao               integer NOT NULL DEFAULT 0,
  itens_saudaveis             integer NOT NULL DEFAULT 0,
  avg_lead_time_days          numeric,
  max_lead_time_days          numeric,
  transbordo_count            integer NOT NULL DEFAULT 0,
  qa_done_items               integer NOT NULL DEFAULT 0,
  qa_items_with_return        integer NOT NULL DEFAULT 0,
  qa_return_cycles_total      integer NOT NULL DEFAULT 0,
  qa_return_rate_pct          numeric NOT NULL DEFAULT 0,
  qa_avg_return_cycles        numeric NOT NULL DEFAULT 0,
  qa_concluidos               integer NOT NULL DEFAULT 0,
  qa_concluidos_sem_retorno   integer NOT NULL DEFAULT 0,
  qa_concluidos_com_retorno   integer NOT NULL DEFAULT 0,
  work_item_count             integer NOT NULL DEFAULT 0,
  category_breakdown          jsonb,
  CONSTRAINT uq_sprint_daily_progress UNIQUE (sprint_code, captured_date)
);

COMMENT ON TABLE public.sprint_daily_progress IS
  'Série diária da sprint aberta (1 linha por sprint/dia BRT). Visão "evolução" — '
  'complementa a foto de fim de sprint (sprint_indicator_snapshots) e a visão ao vivo.';

CREATE INDEX IF NOT EXISTS idx_sprint_daily_progress_sprint
  ON public.sprint_daily_progress (sprint_code, captured_date);

ALTER TABLE public.sprint_daily_progress ENABLE ROW LEVEL SECURITY;

-- Leitura é feita via RPC SECURITY DEFINER; nenhuma policy de acesso direto.

-- ── 2. Captura diária da sprint ABERTA (as-of NOW) ───────────────────────────
DROP FUNCTION IF EXISTS public.rpc_capture_sprint_daily_progress(text);

CREATE OR REPLACE FUNCTION public.rpc_capture_sprint_daily_progress(
  p_sprint_code text DEFAULT NULL
)
RETURNS TABLE(
  out_sprint_code text,
  out_captured_date date,
  out_total bigint,
  out_finalized bigint,
  out_qa_concluidos bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_sprint text;
  v_as_of timestamptz := now();
  v_captured_date date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_sprint_start date; v_sprint_end date;
  v_total bigint; v_planned bigint; v_unplanned bigint; v_delivered bigint; v_finalized bigint;
  v_criticos bigint; v_atencao bigint; v_saudaveis bigint;
  v_avg_lead numeric; v_max_lead numeric; v_transbordo bigint;
  v_qa_done bigint; v_qa_with_return bigint; v_qa_cycles bigint;
  v_qa_concluidos bigint; v_qa_concluidos_sr bigint; v_qa_concluidos_cr bigint;
  v_work_item_ids bigint[];
  v_rate numeric; v_avg_cycles numeric;
  v_breakdown jsonb;
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

  -- Resolve a sprint: explícita, ou a sprint cuja janela oficial contém HOJE (BRT).
  IF p_sprint_code IS NOT NULL THEN
    v_sprint := p_sprint_code;
  ELSE
    SELECT cands.sc INTO v_sprint
    FROM (
      SELECT DISTINCT COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) AS sc
      FROM public.pbi_lifecycle_summary ls
      WHERE COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$'
    ) cands
    JOIN LATERAL public.fn_sprint_official_range(cands.sc) r ON true
    WHERE v_captured_date BETWEEN r.sprint_start AND r.sprint_end
    ORDER BY r.sprint_end DESC
    LIMIT 1;
  END IF;

  -- Nenhuma sprint aberta hoje (dia de intervalo entre sprints) → nada a capturar.
  IF v_sprint IS NULL THEN
    RETURN;
  END IF;

  SELECT r.sprint_start, r.sprint_end INTO v_sprint_start, v_sprint_end
  FROM public.fn_sprint_official_range(v_sprint) r LIMIT 1;

  -- ── Indicadores no estado atual (as-of NOW) ────────────────────────────────
  WITH items AS (
    SELECT
      ls.work_item_id, w.state AS cur_state,
      w.closed_by, w.closed_by_email, w.closed_date,
      COALESCE(ls.qa_return_count,0) AS qrc_now,
      ls.total_lead_time_days, ls.transbordou_sprint,
      hs.health_status,
      COALESCE(w.work_item_type,'Unknown') AS wtype,
      COALESCE(w.tags,'') AS tags_text
    FROM pbi_lifecycle_summary ls
    LEFT JOIN devops_work_items w ON w.id = ls.work_item_id
    LEFT JOIN pbi_health_summary hs ON hs.work_item_id = ls.work_item_id
    WHERE ls.last_committed_sprint = v_sprint OR ls.first_committed_sprint = v_sprint
  ),
  fin AS (
    SELECT i.*,
      (lower(trim(i.cur_state)) IN ('done','closed','resolved')) AS done_at,
      EXISTS (
        SELECT 1 FROM qa_authorized_closers c WHERE c.is_active AND (
          lower(c.display_name) = lower(i.closed_by)
          OR (i.closed_date IS NOT NULL AND lower(c.email) = lower(i.closed_by_email))
        )
      ) AS qa_closed_at
    FROM items i
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE NOT public.fn_demanda_nao_planejada(wtype, tags_text)),
    COUNT(*) FILTER (WHERE public.fn_demanda_nao_planejada(wtype, tags_text)),
    COUNT(*) FILTER (WHERE lower(trim(cur_state)) IN ('em teste','aguardando deploy','deploy','homologação','homologacao')),
    COUNT(*) FILTER (WHERE done_at),
    COUNT(*) FILTER (WHERE health_status='vermelho'),
    COUNT(*) FILTER (WHERE health_status='amarelo'),
    COUNT(*) FILTER (WHERE health_status='verde'),
    ROUND(AVG(total_lead_time_days),1), COALESCE(MAX(total_lead_time_days),0),
    COUNT(*) FILTER (WHERE transbordou_sprint),
    COUNT(*) FILTER (WHERE done_at),
    COUNT(*) FILTER (WHERE done_at AND qrc_now > 0),
    COALESCE(SUM(qrc_now) FILTER (WHERE done_at),0),
    COUNT(*) FILTER (WHERE done_at AND qa_closed_at),
    COUNT(*) FILTER (WHERE done_at AND qa_closed_at AND qrc_now = 0),
    COUNT(*) FILTER (WHERE done_at AND qa_closed_at AND qrc_now > 0),
    ARRAY_AGG(DISTINCT work_item_id)
  INTO
    v_total, v_planned, v_unplanned, v_delivered, v_finalized,
    v_criticos, v_atencao, v_saudaveis, v_avg_lead, v_max_lead, v_transbordo,
    v_qa_done, v_qa_with_return, v_qa_cycles,
    v_qa_concluidos, v_qa_concluidos_sr, v_qa_concluidos_cr,
    v_work_item_ids
  FROM fin;

  -- ── Breakdown por categoria e por fábrica (Epic raiz), estado atual ─────────
  WITH RECURSIVE base AS (
    SELECT
      ls.work_item_id, w.state AS cur_state, w.parent_id,
      COALESCE(w.work_item_type,'Unknown') AS wtype,
      COALESCE(w.tags,'') AS tags_text
    FROM pbi_lifecycle_summary ls
    LEFT JOIN devops_work_items w ON w.id = ls.work_item_id
    WHERE ls.last_committed_sprint = v_sprint OR ls.first_committed_sprint = v_sprint
  ),
  anc AS (
    SELECT b.work_item_id AS start_id, w2.id, w2.parent_id, w2.work_item_type, w2.title, 1 AS depth
    FROM base b JOIN devops_work_items w2 ON w2.id = b.parent_id
    UNION ALL
    SELECT a.start_id, p.id, p.parent_id, p.work_item_type, p.title, a.depth + 1
    FROM anc a JOIN devops_work_items p ON p.id = a.parent_id
    WHERE a.depth < 10
  ),
  fab AS (
    SELECT start_id,
      COALESCE(
        (array_agg(title ORDER BY depth) FILTER (WHERE work_item_type = 'Epic'))[1],
        (array_agg(title ORDER BY depth DESC))[1]
      ) AS fabrica
    FROM anc GROUP BY start_id
  ),
  cls AS (
    SELECT
      b.work_item_id,
      public.fn_classifica_demanda(b.wtype, b.tags_text) AS cat,
      COALESCE(f.fabrica, 'Sem fábrica') AS fabrica,
      (lower(trim(b.cur_state)) IN ('done','closed','resolved')) AS done_at,
      (lower(trim(b.cur_state)) IN ('aguardando teste','em teste','aguardando deploy')) AS entregue_at
    FROM base b
    LEFT JOIN fab f ON f.start_id = b.work_item_id
  ),
  scoped AS (
    SELECT '__geral__' AS escopo, c.cat, c.done_at, c.entregue_at FROM cls c
    UNION ALL
    SELECT c.fabrica, c.cat, c.done_at, c.entregue_at FROM cls c
  ),
  agg AS (
    SELECT escopo, jsonb_build_object(
      'total', COUNT(*),
      'cats', jsonb_build_object(
        'priorizacao',            COUNT(*) FILTER (WHERE cat = 'priorizacao'),
        'priorizacao_transbordo', COUNT(*) FILTER (WHERE cat = 'priorizacao_transbordo'),
        'bug',                    COUNT(*) FILTER (WHERE cat = 'bug'),
        'retorno_qa',             COUNT(*) FILTER (WHERE cat = 'retorno_qa'),
        'aviao_sprint',           COUNT(*) FILTER (WHERE cat = 'aviao_sprint'),
        'aviao_transbordado',     COUNT(*) FILTER (WHERE cat = 'aviao_transbordado')
      ),
      'entregue', jsonb_build_object(
        'total',       COUNT(*) FILTER (WHERE entregue_at),
        'bug',         COUNT(*) FILTER (WHERE entregue_at AND cat = 'bug'),
        'retorno_qa',  COUNT(*) FILTER (WHERE entregue_at AND cat = 'retorno_qa'),
        'priorizacao', COUNT(*) FILTER (WHERE entregue_at AND cat IN ('priorizacao','priorizacao_transbordo')),
        'aviao',       COUNT(*) FILTER (WHERE entregue_at AND cat IN ('aviao_sprint','aviao_transbordado'))
      ),
      'done', jsonb_build_object(
        'total',       COUNT(*) FILTER (WHERE done_at),
        'bug',         COUNT(*) FILTER (WHERE done_at AND cat = 'bug'),
        'retorno_qa',  COUNT(*) FILTER (WHERE done_at AND cat = 'retorno_qa'),
        'priorizacao', COUNT(*) FILTER (WHERE done_at AND cat IN ('priorizacao','priorizacao_transbordo')),
        'aviao',       COUNT(*) FILTER (WHERE done_at AND cat IN ('aviao_sprint','aviao_transbordado'))
      ),
      'priorizado_done',   COUNT(*) FILTER (WHERE done_at AND cat IN ('priorizacao','priorizacao_transbordo')),
      'priorizado_em_dev', COUNT(*) FILTER (WHERE NOT done_at AND cat IN ('priorizacao','priorizacao_transbordo'))
    ) AS payload
    FROM scoped
    GROUP BY escopo
  )
  SELECT jsonb_build_object(
    'geral',    (SELECT payload FROM agg WHERE escopo = '__geral__'),
    'fabricas', COALESCE((SELECT jsonb_object_agg(escopo, payload) FROM agg WHERE escopo <> '__geral__'), '{}'::jsonb)
  )
  INTO v_breakdown;

  v_rate := CASE WHEN COALESCE(v_qa_done,0) > 0
    THEN ROUND((COALESCE(v_qa_with_return,0)::numeric / v_qa_done::numeric) * 100, 1) ELSE 0 END;
  v_avg_cycles := CASE WHEN COALESCE(v_qa_with_return,0) > 0
    THEN ROUND((COALESCE(v_qa_cycles,0)::numeric / v_qa_with_return::numeric), 2) ELSE 0 END;

  -- ── UPSERT idempotente: 1 linha por (sprint, dia BRT) ──────────────────────
  INSERT INTO public.sprint_daily_progress (
    sprint_code, captured_date, snapshot_datetime, as_of_datetime,
    sprint_start_date, sprint_end_date,
    total_demands, planned_demands, unplanned_demands, delivered_demands, finalized_demands,
    itens_criticos, itens_atencao, itens_saudaveis,
    avg_lead_time_days, max_lead_time_days, transbordo_count,
    qa_done_items, qa_items_with_return, qa_return_cycles_total,
    qa_return_rate_pct, qa_avg_return_cycles,
    qa_concluidos, qa_concluidos_sem_retorno, qa_concluidos_com_retorno,
    work_item_count, category_breakdown
  ) VALUES (
    v_sprint, v_captured_date, now(), v_as_of,
    v_sprint_start, v_sprint_end,
    COALESCE(v_total,0), COALESCE(v_planned,0), COALESCE(v_unplanned,0),
    COALESCE(v_delivered,0), COALESCE(v_finalized,0),
    COALESCE(v_criticos,0), COALESCE(v_atencao,0), COALESCE(v_saudaveis,0),
    v_avg_lead, v_max_lead, COALESCE(v_transbordo,0),
    COALESCE(v_qa_done,0), COALESCE(v_qa_with_return,0), COALESCE(v_qa_cycles,0),
    COALESCE(v_rate,0), COALESCE(v_avg_cycles,0),
    COALESCE(v_qa_concluidos,0), COALESCE(v_qa_concluidos_sr,0), COALESCE(v_qa_concluidos_cr,0),
    COALESCE(array_length(v_work_item_ids,1),0), v_breakdown
  )
  ON CONFLICT (sprint_code, captured_date) DO UPDATE SET
    snapshot_datetime         = EXCLUDED.snapshot_datetime,
    as_of_datetime            = EXCLUDED.as_of_datetime,
    sprint_start_date         = EXCLUDED.sprint_start_date,
    sprint_end_date           = EXCLUDED.sprint_end_date,
    total_demands             = EXCLUDED.total_demands,
    planned_demands           = EXCLUDED.planned_demands,
    unplanned_demands         = EXCLUDED.unplanned_demands,
    delivered_demands         = EXCLUDED.delivered_demands,
    finalized_demands         = EXCLUDED.finalized_demands,
    itens_criticos            = EXCLUDED.itens_criticos,
    itens_atencao             = EXCLUDED.itens_atencao,
    itens_saudaveis           = EXCLUDED.itens_saudaveis,
    avg_lead_time_days        = EXCLUDED.avg_lead_time_days,
    max_lead_time_days        = EXCLUDED.max_lead_time_days,
    transbordo_count          = EXCLUDED.transbordo_count,
    qa_done_items             = EXCLUDED.qa_done_items,
    qa_items_with_return      = EXCLUDED.qa_items_with_return,
    qa_return_cycles_total    = EXCLUDED.qa_return_cycles_total,
    qa_return_rate_pct        = EXCLUDED.qa_return_rate_pct,
    qa_avg_return_cycles      = EXCLUDED.qa_avg_return_cycles,
    qa_concluidos             = EXCLUDED.qa_concluidos,
    qa_concluidos_sem_retorno = EXCLUDED.qa_concluidos_sem_retorno,
    qa_concluidos_com_retorno = EXCLUDED.qa_concluidos_com_retorno,
    work_item_count           = EXCLUDED.work_item_count,
    category_breakdown        = EXCLUDED.category_breakdown;

  RETURN QUERY SELECT v_sprint, v_captured_date,
    COALESCE(v_total,0), COALESCE(v_finalized,0), COALESCE(v_qa_concluidos,0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_capture_sprint_daily_progress(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_capture_sprint_daily_progress(text) IS
  'Captura 1 ponto diário (estado atual) da sprint aberta — ou de p_sprint_code. '
  'UPSERT por (sprint_code, captured_date BRT). Alimenta a visão de evolução.';

-- ── 3. Leitura da série diária de uma sprint ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_get_sprint_daily_progress(p_sprint_code text)
RETURNS SETOF public.sprint_daily_progress
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $function$
  SELECT * FROM public.sprint_daily_progress
  WHERE sprint_code = p_sprint_code
  ORDER BY captured_date ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_get_sprint_daily_progress(text) TO authenticated, service_role;

-- ── 4. Cron diário (00:05 BRT). SQL puro, sem Edge Function. ─────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sprint-daily-progress') THEN
    PERFORM cron.unschedule('sprint-daily-progress');
  END IF;
  PERFORM cron.schedule(
    'sprint-daily-progress',
    '5 3 * * *',
    'SELECT public.rpc_capture_sprint_daily_progress();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron schedule sprint-daily-progress falhou (%). Agende o job manualmente.', SQLERRM;
END $$;
