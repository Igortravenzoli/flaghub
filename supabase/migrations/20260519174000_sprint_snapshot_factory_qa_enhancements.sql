-- Sprint snapshots v2: factory + QA historical support and closed-sprint backfill.

ALTER TABLE public.sprint_indicator_snapshots
  ADD COLUMN IF NOT EXISTS qa_done_items bigint,
  ADD COLUMN IF NOT EXISTS qa_items_with_return bigint,
  ADD COLUMN IF NOT EXISTS qa_return_cycles_total bigint,
  ADD COLUMN IF NOT EXISTS qa_return_rate_pct numeric,
  ADD COLUMN IF NOT EXISTS qa_avg_return_cycles numeric;

CREATE OR REPLACE FUNCTION public.fn_sprint_official_range(p_sprint_code text)
RETURNS TABLE (
  sprint_start date,
  sprint_end date,
  sprint_year int,
  sprint_number int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_match text[];
  v_year int;
  v_num int;
  v_jan_1 date;
  v_first_monday date;
BEGIN
  v_match := regexp_match(upper(coalesce(p_sprint_code, '')), '^S([0-9]+)-([0-9]{4})$');
  IF v_match IS NULL THEN
    RETURN;
  END IF;

  v_num := v_match[1]::int;
  v_year := v_match[2]::int;

  IF v_num <= 0 OR v_year < 2000 THEN
    RETURN;
  END IF;

  v_jan_1 := make_date(v_year, 1, 1);
  v_first_monday := v_jan_1 + ((8 - extract(isodow from v_jan_1)::int) % 7);

  sprint_start := v_first_monday + ((v_num - 1) * 14);
  sprint_end := sprint_start + 11;
  sprint_year := v_year;
  sprint_number := v_num;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_capture_sprint_snapshot(
  p_sprint_code text,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  snapshot_id uuid,
  sprint_code text,
  total_demands bigint,
  planned_demands bigint,
  unplanned_demands bigint,
  delivered_demands bigint,
  finalized_demands bigint,
  captured_at timestamp
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_snapshot_id uuid;
  v_total bigint;
  v_planned bigint;
  v_unplanned bigint;
  v_delivered bigint;
  v_finalized bigint;
  v_criticos bigint;
  v_atencao bigint;
  v_saudaveis bigint;
  v_work_item_ids bigint[];
  v_inconsistencies jsonb;
  v_avg_lead numeric;
  v_max_lead numeric;
  v_transbordo_count bigint;
  v_sprint_start date;
  v_sprint_end date;
  v_qa_done_items bigint;
  v_qa_items_with_return bigint;
  v_qa_return_cycles_total bigint;
  v_qa_return_rate_pct numeric;
  v_qa_avg_return_cycles numeric;
BEGIN
  SELECT r.sprint_start, r.sprint_end
  INTO v_sprint_start, v_sprint_end
  FROM public.fn_sprint_official_range(p_sprint_code) r
  LIMIT 1;

  WITH base_items AS (
    SELECT
      ls.work_item_id,
      ls.current_stage,
      ls.total_lead_time_days,
      ls.transbordou_sprint,
      ls.qa_return_count,
      hs.health_status,
      COALESCE(dwi.work_item_type, 'Unknown') AS work_item_type,
      COALESCE(dwi.tags, ARRAY[]::text[]) AS tags
    FROM pbi_lifecycle_summary ls
    LEFT JOIN devops_work_items dwi ON dwi.id = ls.work_item_id
    LEFT JOIN pbi_health_summary hs ON hs.work_item_id = ls.work_item_id
    WHERE (ls.last_committed_sprint = p_sprint_code OR ls.first_committed_sprint = p_sprint_code)
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE NOT (
      tags @> ARRAY['Retorno de QA']::text[]
      OR (work_item_type = 'Bug' AND NOT tags @> ARRAY['Retorno de QA']::text[])
      OR (tags @> ARRAY['Avião']::text[] AND NOT tags @> ARRAY['Retorno de QA']::text[])
    ))::bigint,
    COUNT(*) FILTER (WHERE
      tags @> ARRAY['Retorno de QA']::text[]
      OR (work_item_type = 'Bug' AND NOT tags @> ARRAY['Retorno de QA']::text[])
      OR (tags @> ARRAY['Avião']::text[] AND NOT tags @> ARRAY['Retorno de QA']::text[])
    )::bigint,
    COUNT(*) FILTER (WHERE current_stage IN ('qualidade', 'deploy'))::bigint,
    COUNT(*) FILTER (WHERE current_stage = 'done')::bigint,
    COUNT(*) FILTER (WHERE health_status = 'vermelho')::bigint,
    COUNT(*) FILTER (WHERE health_status = 'amarelo')::bigint,
    COUNT(*) FILTER (WHERE health_status = 'verde')::bigint,
    ARRAY_AGG(DISTINCT work_item_id)::bigint[],
    ROUND(AVG(total_lead_time_days), 1)::numeric,
    COALESCE(MAX(total_lead_time_days), 0)::numeric,
    COUNT(*) FILTER (WHERE transbordou_sprint = true)::bigint,
    COUNT(*) FILTER (WHERE current_stage = 'done')::bigint,
    COUNT(*) FILTER (WHERE current_stage = 'done' AND COALESCE(qa_return_count, 0) > 0)::bigint,
    COALESCE(SUM(CASE WHEN current_stage = 'done' THEN COALESCE(qa_return_count, 0) ELSE 0 END), 0)::bigint
  INTO
    v_total,
    v_planned,
    v_unplanned,
    v_delivered,
    v_finalized,
    v_criticos,
    v_atencao,
    v_saudaveis,
    v_work_item_ids,
    v_avg_lead,
    v_max_lead,
    v_transbordo_count,
    v_qa_done_items,
    v_qa_items_with_return,
    v_qa_return_cycles_total
  FROM base_items;

  v_qa_return_rate_pct := CASE
    WHEN COALESCE(v_qa_done_items, 0) > 0
      THEN ROUND((COALESCE(v_qa_items_with_return, 0)::numeric / v_qa_done_items::numeric) * 100, 1)
    ELSE 0
  END;

  v_qa_avg_return_cycles := CASE
    WHEN COALESCE(v_qa_items_with_return, 0) > 0
      THEN ROUND((COALESCE(v_qa_return_cycles_total, 0)::numeric / v_qa_items_with_return::numeric), 2)
    ELSE 0
  END;

  v_inconsistencies := jsonb_build_object(
    'total_items', COALESCE(v_total, 0),
    'snapshot_time', NOW()::text,
    'qa_done_items', COALESCE(v_qa_done_items, 0),
    'qa_items_with_return', COALESCE(v_qa_items_with_return, 0),
    'qa_return_cycles_total', COALESCE(v_qa_return_cycles_total, 0)
  );

  INSERT INTO public.sprint_indicator_snapshots (
    sprint_code,
    sprint_start_date,
    sprint_end_date,
    total_demands,
    planned_demands,
    unplanned_demands,
    delivered_demands,
    finalized_demands,
    itens_criticos,
    itens_atencao,
    itens_saudaveis,
    source_work_item_ids,
    work_item_count_in_snapshot,
    avg_lead_time_days,
    max_lead_time_days,
    transbordo_count,
    inconsistencies_found,
    notes,
    snapshot_datetime,
    qa_done_items,
    qa_items_with_return,
    qa_return_cycles_total,
    qa_return_rate_pct,
    qa_avg_return_cycles
  )
  VALUES (
    p_sprint_code,
    v_sprint_start,
    v_sprint_end,
    COALESCE(v_total, 0),
    COALESCE(v_planned, 0),
    COALESCE(v_unplanned, 0),
    COALESCE(v_delivered, 0),
    COALESCE(v_finalized, 0),
    COALESCE(v_criticos, 0),
    COALESCE(v_atencao, 0),
    COALESCE(v_saudaveis, 0),
    v_work_item_ids,
    COALESCE(array_length(v_work_item_ids, 1), 0),
    v_avg_lead,
    v_max_lead,
    COALESCE(v_transbordo_count, 0),
    v_inconsistencies,
    p_notes,
    NOW(),
    COALESCE(v_qa_done_items, 0),
    COALESCE(v_qa_items_with_return, 0),
    COALESCE(v_qa_return_cycles_total, 0),
    COALESCE(v_qa_return_rate_pct, 0),
    COALESCE(v_qa_avg_return_cycles, 0)
  )
  RETURNING id INTO v_snapshot_id;

  RETURN QUERY
  SELECT
    v_snapshot_id,
    p_sprint_code,
    COALESCE(v_total, 0),
    COALESCE(v_planned, 0),
    COALESCE(v_unplanned, 0),
    COALESCE(v_delivered, 0),
    COALESCE(v_finalized, 0),
    NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_backfill_closed_sprint_snapshots(
  p_year int DEFAULT EXTRACT(YEAR FROM NOW())::int,
  p_force_reprocess boolean DEFAULT false,
  p_notes text DEFAULT 'backfill_closed_sprints'
)
RETURNS TABLE (
  sprint_code text,
  status text,
  snapshot_id uuid,
  qa_done_items bigint,
  qa_items_with_return bigint,
  qa_return_cycles_total bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_sprint text;
  v_existing_snapshot_id uuid;
  v_new_snapshot_id uuid;
  v_sprint_end date;
BEGIN
  FOR v_sprint IN
    WITH sprint_candidates AS (
      SELECT DISTINCT COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) AS sprint_code
      FROM public.pbi_lifecycle_summary ls
      WHERE COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$'
        AND split_part(COALESCE(ls.last_committed_sprint, ls.first_committed_sprint), '-', 2)::int = p_year
    )
    SELECT sc.sprint_code
    FROM sprint_candidates sc
    ORDER BY
      split_part(sc.sprint_code, '-', 2)::int,
      regexp_replace(split_part(sc.sprint_code, '-', 1), '[^0-9]', '', 'g')::int
  LOOP
    SELECT r.sprint_end INTO v_sprint_end
    FROM public.fn_sprint_official_range(v_sprint) r
    LIMIT 1;

    IF v_sprint_end IS NULL THEN
      sprint_code := v_sprint;
      status := 'invalid_sprint_code';
      snapshot_id := NULL;
      qa_done_items := NULL;
      qa_items_with_return := NULL;
      qa_return_cycles_total := NULL;
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF v_sprint_end >= CURRENT_DATE THEN
      sprint_code := v_sprint;
      status := 'open_sprint_skipped';
      snapshot_id := NULL;
      qa_done_items := NULL;
      qa_items_with_return := NULL;
      qa_return_cycles_total := NULL;
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT sis.id
    INTO v_existing_snapshot_id
    FROM public.sprint_indicator_snapshots sis
    WHERE sis.sprint_code = v_sprint
    ORDER BY sis.snapshot_datetime DESC
    LIMIT 1;

    IF v_existing_snapshot_id IS NOT NULL AND NOT p_force_reprocess THEN
      sprint_code := v_sprint;
      status := 'already_has_snapshot';
      snapshot_id := v_existing_snapshot_id;

      SELECT
        sis.qa_done_items,
        sis.qa_items_with_return,
        sis.qa_return_cycles_total
      INTO
        qa_done_items,
        qa_items_with_return,
        qa_return_cycles_total
      FROM public.sprint_indicator_snapshots sis
      WHERE sis.id = v_existing_snapshot_id;

      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT r.snapshot_id
    INTO v_new_snapshot_id
    FROM public.rpc_capture_sprint_snapshot(
      v_sprint,
      COALESCE(p_notes, 'backfill_closed_sprints') || CASE WHEN p_force_reprocess THEN ' [forced]' ELSE '' END
    ) r
    LIMIT 1;

    sprint_code := v_sprint;
    status := CASE WHEN v_existing_snapshot_id IS NULL THEN 'captured' ELSE 'reprocessed' END;
    snapshot_id := v_new_snapshot_id;

    SELECT
      sis.qa_done_items,
      sis.qa_items_with_return,
      sis.qa_return_cycles_total
    INTO
      qa_done_items,
      qa_items_with_return,
      qa_return_cycles_total
    FROM public.sprint_indicator_snapshots sis
    WHERE sis.id = v_new_snapshot_id;

    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_get_sprint_historical_v2(
  p_sprint_code text
)
RETURNS TABLE (
  sprint_code text,
  total_demands bigint,
  planned_demands bigint,
  unplanned_demands bigint,
  delivered_demands bigint,
  finalized_demands bigint,
  delivered_in_dev bigint,
  delivered_in_qa bigint,
  unplanned_bug_count bigint,
  unplanned_retorno_qa_count bigint,
  unplanned_aviao_count bigint,
  itens_criticos bigint,
  itens_atencao bigint,
  itens_saudaveis bigint,
  avg_lead_time_days numeric,
  max_lead_time_days numeric,
  transbordo_count bigint,
  work_item_count int,
  source_work_item_ids bigint[],
  snapshot_datetime timestamp,
  captured_by text,
  notes text,
  qa_done_items bigint,
  qa_items_with_return bigint,
  qa_return_cycles_total bigint,
  qa_return_rate_pct numeric,
  qa_avg_return_cycles numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    sis.sprint_code,
    sis.total_demands,
    sis.planned_demands,
    sis.unplanned_demands,
    sis.delivered_demands,
    sis.finalized_demands,
    sis.delivered_in_dev_count,
    sis.delivered_in_qa_count,
    sis.unplanned_bug_count,
    sis.unplanned_retorno_qa_count,
    sis.unplanned_aviao_count,
    sis.itens_criticos,
    sis.itens_atencao,
    sis.itens_saudaveis,
    sis.avg_lead_time_days,
    sis.max_lead_time_days,
    sis.transbordo_count,
    sis.work_item_count_in_snapshot,
    sis.source_work_item_ids,
    sis.snapshot_datetime,
    sis.captured_by,
    sis.notes,
    sis.qa_done_items,
    sis.qa_items_with_return,
    sis.qa_return_cycles_total,
    sis.qa_return_rate_pct,
    sis.qa_avg_return_cycles
  FROM public.sprint_indicator_snapshots sis
  WHERE sis.sprint_code = p_sprint_code
  ORDER BY sis.snapshot_datetime DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.fn_sprint_official_range IS 'Returns official sprint start/end range from sprint code like S8-2026';
COMMENT ON FUNCTION public.rpc_backfill_closed_sprint_snapshots IS 'Captures snapshots for all closed sprints in year, supporting historical backfill for Factory and QA';