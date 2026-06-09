-- ============================================================================
-- Migration: 20260609130000_fix_snapshot_cron_admin_guard.sql
-- Corrige o agendamento de snapshots de fim de sprint.
--
-- O cron "snapshot-sprint-end-daily" (pg_cron, role postgres) chamava
-- rpc_backfill_closed_sprint_snapshots / rpc_capture_sprint_snapshot, mas o
-- guard "IF NOT public.hub_is_admin()" rejeitava a chamada (sem JWT => não
-- admin), fazendo o job FALHAR todos os dias. Resultado: nenhum snapshot novo
-- desde 2026-05-22 (S10).
--
-- Fix mínimo: o guard passa a aceitar também o contexto server-side do cron
-- (session_user postgres/supabase_admin), mantendo admin via UI e seguindo
-- bloqueando usuários autenticados comuns (session_user = authenticator).
-- ============================================================================

-- public.rpc_capture_sprint_snapshot(text,text) (guards substituídos: 1)
CREATE OR REPLACE FUNCTION public.rpc_capture_sprint_snapshot(p_sprint_code text, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(snapshot_id uuid, sprint_code text, total_demands bigint, planned_demands bigint, unplanned_demands bigint, delivered_demands bigint, finalized_demands bigint, captured_at timestamp without time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot_id uuid;
  v_total bigint; v_planned bigint; v_unplanned bigint; v_delivered bigint; v_finalized bigint;
  v_criticos bigint; v_atencao bigint; v_saudaveis bigint;
  v_work_item_ids bigint[];
  v_inconsistencies jsonb;
  v_avg_lead numeric; v_max_lead numeric; v_transbordo_count bigint;
  v_sprint_start date; v_sprint_end date;
  v_qa_done_items bigint; v_qa_items_with_return bigint; v_qa_return_cycles_total bigint;
  v_qa_return_rate_pct numeric; v_qa_avg_return_cycles numeric;
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

  SELECT r.sprint_start, r.sprint_end INTO v_sprint_start, v_sprint_end
  FROM public.fn_sprint_official_range(p_sprint_code) r LIMIT 1;

  WITH base_items AS (
    SELECT
      ls.work_item_id, ls.current_stage, ls.total_lead_time_days, ls.transbordou_sprint, ls.qa_return_count,
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
    COUNT(*) FILTER (WHERE NOT (tags_text ILIKE '%Retorno de QA%' OR (work_item_type = 'Bug' AND tags_text NOT ILIKE '%Retorno de QA%') OR ((tags_text ILIKE '%Avião%' OR tags_text ILIKE '%Aviao%') AND tags_text NOT ILIKE '%Retorno de QA%')))::bigint,
    COUNT(*) FILTER (WHERE tags_text ILIKE '%Retorno de QA%' OR (work_item_type = 'Bug' AND tags_text NOT ILIKE '%Retorno de QA%') OR ((tags_text ILIKE '%Avião%' OR tags_text ILIKE '%Aviao%') AND tags_text NOT ILIKE '%Retorno de QA%'))::bigint,
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
  INTO v_total, v_planned, v_unplanned, v_delivered, v_finalized,
       v_criticos, v_atencao, v_saudaveis, v_work_item_ids,
       v_avg_lead, v_max_lead, v_transbordo_count,
       v_qa_done_items, v_qa_items_with_return, v_qa_return_cycles_total
  FROM base_items;

  v_qa_return_rate_pct := CASE WHEN COALESCE(v_qa_done_items,0) > 0
    THEN ROUND((COALESCE(v_qa_items_with_return,0)::numeric / v_qa_done_items::numeric) * 100, 1) ELSE 0 END;
  v_qa_avg_return_cycles := CASE WHEN COALESCE(v_qa_items_with_return,0) > 0
    THEN ROUND((COALESCE(v_qa_return_cycles_total,0)::numeric / v_qa_items_with_return::numeric), 2) ELSE 0 END;

  v_inconsistencies := jsonb_build_object(
    'total_items', COALESCE(v_total,0), 'snapshot_time', NOW()::text,
    'qa_done_items', COALESCE(v_qa_done_items,0),
    'qa_items_with_return', COALESCE(v_qa_items_with_return,0),
    'qa_return_cycles_total', COALESCE(v_qa_return_cycles_total,0)
  );

  INSERT INTO public.sprint_indicator_snapshots (
    sprint_code, sprint_start_date, sprint_end_date,
    total_demands, planned_demands, unplanned_demands, delivered_demands, finalized_demands,
    itens_criticos, itens_atencao, itens_saudaveis,
    source_work_item_ids, work_item_count_in_snapshot,
    avg_lead_time_days, max_lead_time_days, transbordo_count,
    inconsistencies_found, notes, snapshot_datetime,
    qa_done_items, qa_items_with_return, qa_return_cycles_total,
    qa_return_rate_pct, qa_avg_return_cycles
  ) VALUES (
    p_sprint_code, v_sprint_start, v_sprint_end,
    COALESCE(v_total,0), COALESCE(v_planned,0), COALESCE(v_unplanned,0),
    COALESCE(v_delivered,0), COALESCE(v_finalized,0),
    COALESCE(v_criticos,0), COALESCE(v_atencao,0), COALESCE(v_saudaveis,0),
    v_work_item_ids, COALESCE(array_length(v_work_item_ids,1),0),
    v_avg_lead, v_max_lead, COALESCE(v_transbordo_count,0),
    v_inconsistencies, p_notes, NOW(),
    COALESCE(v_qa_done_items,0), COALESCE(v_qa_items_with_return,0),
    COALESCE(v_qa_return_cycles_total,0),
    COALESCE(v_qa_return_rate_pct,0), COALESCE(v_qa_avg_return_cycles,0)
  ) RETURNING id INTO v_snapshot_id;

  RETURN QUERY SELECT v_snapshot_id, p_sprint_code,
    COALESCE(v_total,0), COALESCE(v_planned,0), COALESCE(v_unplanned,0),
    COALESCE(v_delivered,0), COALESCE(v_finalized,0), NOW()::timestamp;
END;
$function$
;

-- public.rpc_backfill_closed_sprint_snapshots(int,boolean,text) (guards substituídos: 1)
CREATE OR REPLACE FUNCTION public.rpc_backfill_closed_sprint_snapshots(p_year integer DEFAULT (EXTRACT(year FROM now()))::integer, p_force_reprocess boolean DEFAULT false, p_notes text DEFAULT 'backfill_closed_sprints'::text)
 RETURNS TABLE(sprint_code text, status text, snapshot_id uuid, qa_done_items bigint, qa_items_with_return bigint, qa_return_cycles_total bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sprint text;
  v_existing_snapshot_id uuid;
  v_new_snapshot_id uuid;
  v_sprint_end date;
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

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
      sprint_code := v_sprint; status := 'invalid_sprint_code';
      snapshot_id := NULL; qa_done_items := NULL; qa_items_with_return := NULL; qa_return_cycles_total := NULL;
      RETURN NEXT; CONTINUE;
    END IF;

    IF v_sprint_end >= CURRENT_DATE THEN
      sprint_code := v_sprint; status := 'open_sprint_skipped';
      snapshot_id := NULL; qa_done_items := NULL; qa_items_with_return := NULL; qa_return_cycles_total := NULL;
      RETURN NEXT; CONTINUE;
    END IF;

    SELECT sis.id INTO v_existing_snapshot_id
    FROM public.sprint_indicator_snapshots sis
    WHERE sis.sprint_code = v_sprint
    ORDER BY sis.snapshot_datetime DESC LIMIT 1;

    IF v_existing_snapshot_id IS NOT NULL AND NOT p_force_reprocess THEN
      sprint_code := v_sprint; status := 'already_has_snapshot'; snapshot_id := v_existing_snapshot_id;
      SELECT sis.qa_done_items, sis.qa_items_with_return, sis.qa_return_cycles_total
      INTO qa_done_items, qa_items_with_return, qa_return_cycles_total
      FROM public.sprint_indicator_snapshots sis WHERE sis.id = v_existing_snapshot_id;
      RETURN NEXT; CONTINUE;
    END IF;

    SELECT r.snapshot_id INTO v_new_snapshot_id
    FROM public.rpc_capture_sprint_snapshot(
      v_sprint,
      COALESCE(p_notes, 'backfill_closed_sprints') || CASE WHEN p_force_reprocess THEN ' [forced]' ELSE '' END
    ) r LIMIT 1;

    sprint_code := v_sprint;
    status := CASE WHEN v_existing_snapshot_id IS NULL THEN 'captured' ELSE 'reprocessed' END;
    snapshot_id := v_new_snapshot_id;
    SELECT sis.qa_done_items, sis.qa_items_with_return, sis.qa_return_cycles_total
    INTO qa_done_items, qa_items_with_return, qa_return_cycles_total
    FROM public.sprint_indicator_snapshots sis WHERE sis.id = v_new_snapshot_id;
    RETURN NEXT;
  END LOOP;
END;
$function$
;

