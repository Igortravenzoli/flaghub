-- Hotfix: align rpc_capture_sprint_snapshot return type (timestamp without time zone).

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
      COALESCE(dwi.tags, '') AS tags_text
    FROM pbi_lifecycle_summary ls
    LEFT JOIN devops_work_items dwi ON dwi.id = ls.work_item_id
    LEFT JOIN pbi_health_summary hs ON hs.work_item_id = ls.work_item_id
    WHERE (ls.last_committed_sprint = p_sprint_code OR ls.first_committed_sprint = p_sprint_code)
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE NOT (
      tags_text ILIKE '%Retorno de QA%'
      OR (work_item_type = 'Bug' AND tags_text NOT ILIKE '%Retorno de QA%')
      OR ((tags_text ILIKE '%Avião%' OR tags_text ILIKE '%Aviao%') AND tags_text NOT ILIKE '%Retorno de QA%')
    ))::bigint,
    COUNT(*) FILTER (WHERE
      tags_text ILIKE '%Retorno de QA%'
      OR (work_item_type = 'Bug' AND tags_text NOT ILIKE '%Retorno de QA%')
      OR ((tags_text ILIKE '%Avião%' OR tags_text ILIKE '%Aviao%') AND tags_text NOT ILIKE '%Retorno de QA%')
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
    NOW()::timestamp;
END;
$$;