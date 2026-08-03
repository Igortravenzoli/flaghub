-- ============================================================================
-- SN-8 — A série diária adota o mesmo universo da fotografia
--
-- Fecha a incoerência aberta pela SN-7: a foto passou a medir o QUADRO
-- (iteration_path, PBI + User Story + Bug) e a série diária continuava saindo
-- de `pbi_lifecycle_summary.committed_sprint`. Na mesma aba da Fábrica o
-- DailyProgressCard fecharia num escopo menor que o da foto da mesma sprint —
-- exatamente o tipo de divergência que a SN-7 existiu para eliminar.
--
-- Aqui não é preciso reconstruir nada por histórico: a série captura o estado
-- de HOJE, e o ponto de fechamento é gravado na segunda 00:05 BRT, 25 min ANTES
-- da selagem — ou seja, antes de o botão Migrar destravar. Nesse instante o
-- iteration_path do item ainda é o da sprint que fechou.
--
-- Junto: "entregue" passa a usar `fn_estado_entregue` (definição única da
-- SN-7, com Aguardando Teste dentro) tanto na coluna `delivered_demands`
-- quanto no `category_breakdown.entregue`, que aqui também divergiam.
--
-- Pontos diários já gravados NÃO são recalculados: são estado-de-momento, e o
-- estado daquele dia não existe mais para ser medido. A série fica mista e a
-- virada é visível — o escopo dá um degrau no primeiro ponto pós-SN-8.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_capture_sprint_daily_progress_at(
  p_sprint text,
  p_captured_date date
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
  v_sprint text := p_sprint;
  v_captured_date date := p_captured_date;
  v_as_of timestamptz := now();
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

  IF v_sprint IS NULL OR v_captured_date IS NULL THEN
    RETURN;
  END IF;

  SELECT r.sprint_start, r.sprint_end INTO v_sprint_start, v_sprint_end
  FROM public.fn_sprint_official_range(v_sprint) r LIMIT 1;

  -- ── Universo = quadro da sprint (SN-8), estado atual ───────────────────────
  CREATE TEMP TABLE tmp_daily_itens ON COMMIT DROP AS
  SELECT
    w.id AS work_item_id, w.parent_id,
    COALESCE(w.work_item_type,'Unknown') AS wtype,
    COALESCE(w.tags,'') AS tags_text,
    public.fn_estado_done(w.state) AS done_at,
    public.fn_estado_entregue(w.state) AS entregue_at,
    public.fn_classifica_demanda(COALESCE(w.work_item_type,'Unknown'), COALESCE(w.tags,'')) AS cat,
    COALESCE(ls.qa_return_count,0) AS qrc_now,
    ls.total_lead_time_days,
    hs.health_status,
    EXISTS (
      SELECT 1 FROM public.qa_authorized_closers c WHERE c.is_active AND (
        lower(c.display_name) = lower(w.closed_by)
        OR (w.closed_date IS NOT NULL AND lower(c.email) = lower(w.closed_by_email))
      )
    ) AS qa_closed_at
  FROM public.devops_work_items w
  LEFT JOIN public.pbi_lifecycle_summary ls ON ls.work_item_id = w.id
  LEFT JOIN public.pbi_health_summary hs ON hs.work_item_id = w.id
  WHERE w.work_item_type IN ('Product Backlog Item','User Story','Bug')
    AND regexp_replace(w.iteration_path, '^.*\\', '') = v_sprint;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE NOT public.fn_demanda_nao_planejada(wtype, tags_text)),
    COUNT(*) FILTER (WHERE public.fn_demanda_nao_planejada(wtype, tags_text)),
    COUNT(*) FILTER (WHERE entregue_at),
    COUNT(*) FILTER (WHERE done_at),
    COUNT(*) FILTER (WHERE health_status='vermelho'),
    COUNT(*) FILTER (WHERE health_status='amarelo'),
    COUNT(*) FILTER (WHERE health_status='verde'),
    ROUND(AVG(total_lead_time_days),1), COALESCE(MAX(total_lead_time_days),0),
    COUNT(*) FILTER (WHERE public.fn_tem_tag_transbordo(tags_text)),
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
  FROM tmp_daily_itens;

  IF COALESCE(v_total,0) = 0 THEN
    DROP TABLE IF EXISTS tmp_daily_itens;
    RETURN;
  END IF;

  -- ── Breakdown por categoria e por fábrica (Epic raiz) ──────────────────────
  WITH RECURSIVE anc AS (
    SELECT t.work_item_id AS start_id, w2.id, w2.parent_id, w2.work_item_type, w2.title, 1 AS depth
    FROM tmp_daily_itens t JOIN public.devops_work_items w2 ON w2.id = t.parent_id
    UNION ALL
    SELECT a.start_id, p.id, p.parent_id, p.work_item_type, p.title, a.depth + 1
    FROM anc a JOIN public.devops_work_items p ON p.id = a.parent_id
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
    SELECT t.work_item_id, t.cat, t.done_at, t.entregue_at,
           COALESCE(f.fabrica, 'Sem fábrica') AS fabrica
    FROM tmp_daily_itens t LEFT JOIN fab f ON f.start_id = t.work_item_id
  ),
  scoped AS (
    SELECT '__geral__' AS escopo, c.* FROM cls c
    UNION ALL
    SELECT c.fabrica AS escopo, c.* FROM cls c
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
      'ids', jsonb_build_object(
        'entregue',   COALESCE(jsonb_agg(work_item_id) FILTER (WHERE entregue_at), '[]'::jsonb),
        'done',       COALESCE(jsonb_agg(work_item_id) FILTER (WHERE done_at), '[]'::jsonb),
        'bug',        COALESCE(jsonb_agg(work_item_id) FILTER (WHERE cat = 'bug'), '[]'::jsonb),
        'retorno_qa', COALESCE(jsonb_agg(work_item_id) FILTER (WHERE cat = 'retorno_qa'), '[]'::jsonb)
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

  DROP TABLE IF EXISTS tmp_daily_itens;

  RETURN QUERY SELECT v_sprint, v_captured_date,
    COALESCE(v_total,0), COALESCE(v_finalized,0), COALESCE(v_qa_concluidos,0);
END;
$function$;

COMMENT ON FUNCTION public.rpc_capture_sprint_daily_progress_at(text, date) IS
  'Grava UM ponto da série diária (estado atual) para a sprint e a data de '
  'rótulo informadas, sobre o QUADRO da sprint (iteration_path, PBI + User '
  'Story + Bug) — mesmo universo da fotografia desde a SN-8. UPSERT por '
  '(sprint_code, captured_date).';
