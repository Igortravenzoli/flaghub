-- ============================================================================
-- Migration: 20260609150000_snapshot_unplanned_rules_v2.sql
-- Alinha o cálculo de planejado/não-planejado dos snapshots às regras
-- gerenciais validadas com a Fábrica (mesmas regras do GerenciaTab):
--
--   1. Retorno de QA: qualquer item (Avião, Bug, PBI) com tag "Retorno de QA"
--      → NÃO planejado
--   2. Avião (tag Avião, com ou sem Transbordo) → NÃO planejado
--   3. Tag Priorização (sem Retorno de QA) → PLANEJADO — inclui Bugs com tag
--      Priorização ("bug problema") e itens de priorização transbordados
--   4. Bug (tipo ou tag BUG) sem tag Retorno de QA → NÃO planejado
--   5. Demais itens → planejado (fallback)
--
-- Mudanças vs. regra anterior:
--   - Bug com tag PRIORIZACAO passa a contar como planejado;
--   - matching por segmento de tag via regex (a regra antiga com ILIKE
--     '%Retorno de QA%' não reconhecia a variante "RETORNO QA").
-- ============================================================================

-- ── 0. Helper único de classificação ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_demanda_nao_planejada(p_type text, p_tags text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_tags,'') ~* '(^|;)\s*retorno\s*(de\s*)?qa\s*(;|$)' THEN true
    WHEN COALESCE(p_tags,'') ~* '(^|;)\s*avi[aã]o\M' THEN true
    WHEN COALESCE(p_tags,'') ~* '(^|;)\s*prioriza[cç][aã]o\s*(;|$)' THEN false
    WHEN COALESCE(p_type,'') = 'Bug' OR COALESCE(p_tags,'') ~* '(^|;)\s*bug\s*(;|$)' THEN true
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.fn_demanda_nao_planejada(text, text) IS
  'Regra única de demanda não planejada: Retorno de QA > Avião > tag Priorização (planejado, inclui bugs priorizados) > Bug > planejado.';

-- ── 1. Reconstrução fim-de-sprint (23:59 BRT) com a nova regra ───────────────
CREATE OR REPLACE FUNCTION public.rpc_reconstruct_sprint_snapshot(
  p_sprint_code text,
  p_as_of timestamptz DEFAULT NULL
)
RETURNS TABLE(
  sprint_code text,
  as_of_datetime timestamptz,
  total bigint,
  qa_done bigint,
  qa_concluidos bigint,
  itens_exatos bigint,
  itens_aprox bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_as_of timestamptz;
  v_sprint_start date; v_sprint_end date;
  v_total bigint; v_planned bigint; v_unplanned bigint; v_delivered bigint; v_finalized bigint;
  v_criticos bigint; v_atencao bigint; v_saudaveis bigint;
  v_avg_lead numeric; v_max_lead numeric; v_transbordo bigint;
  v_qa_done bigint; v_qa_with_return bigint; v_qa_cycles bigint;
  v_qa_concluidos bigint; v_qa_concluidos_sr bigint; v_qa_concluidos_cr bigint;
  v_exatos bigint; v_aprox bigint;
  v_work_item_ids bigint[];
  v_rate numeric; v_avg_cycles numeric;
  v_snapshot_id uuid;
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

  SELECT r.sprint_start, r.sprint_end INTO v_sprint_start, v_sprint_end
  FROM public.fn_sprint_official_range(p_sprint_code) r LIMIT 1;

  v_as_of := COALESCE(
    p_as_of,
    (((v_sprint_end + 1)::timestamp - interval '1 second') AT TIME ZONE 'America/Sao_Paulo')
  );

  WITH items AS (
    SELECT
      ls.work_item_id, w.state AS cur_state, w.changed_date, w.state_history,
      w.closed_by, w.closed_by_email, w.closed_date,
      COALESCE(ls.qa_return_count,0) AS qrc_now,
      ls.total_lead_time_days, ls.transbordou_sprint,
      hs.health_status,
      COALESCE(w.work_item_type,'Unknown') AS wtype,
      COALESCE(w.tags,'') AS tags_text
    FROM pbi_lifecycle_summary ls
    LEFT JOIN devops_work_items w ON w.id = ls.work_item_id
    LEFT JOIN pbi_health_summary hs ON hs.work_item_id = ls.work_item_id
    WHERE ls.last_committed_sprint = p_sprint_code OR ls.first_committed_sprint = p_sprint_code
  ),
  asof AS (
    SELECT i.*,
      CASE WHEN i.changed_date <= v_as_of THEN i.cur_state
           ELSE COALESCE(
             (SELECT e->>'newValue' FROM jsonb_array_elements(i.state_history) e
               WHERE (e->>'revisedDate')::timestamptz <= v_as_of
               ORDER BY (e->>'revisedDate')::timestamptz DESC LIMIT 1),
             (SELECT e->>'oldValue' FROM jsonb_array_elements(i.state_history) e
               ORDER BY (e->>'revisedDate')::timestamptz ASC LIMIT 1),
             i.cur_state  -- sem histórico: estado atual como melhor estimativa (item marcado como aproximado)
           ) END AS state_at,
      COALESCE(
        (SELECT e->>'revisedBy' FROM jsonb_array_elements(i.state_history) e
          WHERE lower(trim(e->>'newValue')) IN ('done','closed','resolved')
            AND (e->>'revisedDate')::timestamptz <= v_as_of
          ORDER BY (e->>'revisedDate')::timestamptz DESC LIMIT 1),
        CASE WHEN i.changed_date <= v_as_of THEN i.closed_by ELSE NULL END
      ) AS closer_at,
      CASE WHEN i.state_history IS NULL THEN i.qrc_now
           ELSE GREATEST(0, (SELECT COUNT(*) FROM jsonb_array_elements(i.state_history) e
             WHERE lower(trim(e->>'newValue')) = 'em teste'
               AND (e->>'revisedDate')::timestamptz <= v_as_of) - 1) END AS qrc_at,
      -- exato quando não mudou após o corte OU temos histórico p/ reverter
      (i.changed_date <= v_as_of OR i.state_history IS NOT NULL) AS is_exato
    FROM items i
  ),
  fin AS (
    SELECT a.*,
      (lower(trim(a.state_at)) IN ('done','closed','resolved')) AS done_at,
      EXISTS (
        SELECT 1 FROM qa_authorized_closers c WHERE c.is_active AND (
          lower(c.display_name) = lower(a.closer_at)
          OR (a.closed_date IS NOT NULL AND a.closed_date <= v_as_of
              AND lower(c.email) = lower(a.closed_by_email))
        )
      ) AS qa_closed_at
    FROM asof a
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE NOT public.fn_demanda_nao_planejada(wtype, tags_text)),
    COUNT(*) FILTER (WHERE public.fn_demanda_nao_planejada(wtype, tags_text)),
    COUNT(*) FILTER (WHERE lower(trim(state_at)) IN ('em teste','aguardando deploy','deploy','homologação','homologacao')),
    COUNT(*) FILTER (WHERE done_at),
    COUNT(*) FILTER (WHERE health_status='vermelho'),
    COUNT(*) FILTER (WHERE health_status='amarelo'),
    COUNT(*) FILTER (WHERE health_status='verde'),
    ROUND(AVG(total_lead_time_days),1), COALESCE(MAX(total_lead_time_days),0),
    COUNT(*) FILTER (WHERE transbordou_sprint),
    COUNT(*) FILTER (WHERE done_at),
    COUNT(*) FILTER (WHERE done_at AND qrc_at > 0),
    COALESCE(SUM(qrc_at) FILTER (WHERE done_at),0),
    COUNT(*) FILTER (WHERE done_at AND qa_closed_at),
    COUNT(*) FILTER (WHERE done_at AND qa_closed_at AND qrc_at = 0),
    COUNT(*) FILTER (WHERE done_at AND qa_closed_at AND qrc_at > 0),
    COUNT(*) FILTER (WHERE is_exato),
    COUNT(*) FILTER (WHERE NOT is_exato),
    ARRAY_AGG(DISTINCT work_item_id)
  INTO
    v_total, v_planned, v_unplanned, v_delivered, v_finalized,
    v_criticos, v_atencao, v_saudaveis, v_avg_lead, v_max_lead, v_transbordo,
    v_qa_done, v_qa_with_return, v_qa_cycles,
    v_qa_concluidos, v_qa_concluidos_sr, v_qa_concluidos_cr,
    v_exatos, v_aprox, v_work_item_ids
  FROM fin;

  v_rate := CASE WHEN COALESCE(v_qa_done,0) > 0
    THEN ROUND((COALESCE(v_qa_with_return,0)::numeric / v_qa_done::numeric) * 100, 1) ELSE 0 END;
  v_avg_cycles := CASE WHEN COALESCE(v_qa_with_return,0) > 0
    THEN ROUND((COALESCE(v_qa_cycles,0)::numeric / v_qa_with_return::numeric), 2) ELSE 0 END;

  -- Substitui snapshots anteriores desta sprint pela versão fim-de-sprint
  DELETE FROM public.sprint_indicator_snapshots WHERE sprint_indicator_snapshots.sprint_code = p_sprint_code;

  INSERT INTO public.sprint_indicator_snapshots (
    sprint_code, sprint_start_date, sprint_end_date,
    total_demands, planned_demands, unplanned_demands, delivered_demands, finalized_demands,
    itens_criticos, itens_atencao, itens_saudaveis,
    source_work_item_ids, work_item_count_in_snapshot,
    avg_lead_time_days, max_lead_time_days, transbordo_count,
    notes, snapshot_datetime, as_of_datetime, snapshot_source,
    qa_done_items, qa_items_with_return, qa_return_cycles_total,
    qa_return_rate_pct, qa_avg_return_cycles,
    qa_concluidos, qa_concluidos_sem_retorno, qa_concluidos_com_retorno
  ) VALUES (
    p_sprint_code, v_sprint_start, v_sprint_end,
    COALESCE(v_total,0), COALESCE(v_planned,0), COALESCE(v_unplanned,0),
    COALESCE(v_delivered,0), COALESCE(v_finalized,0),
    COALESCE(v_criticos,0), COALESCE(v_atencao,0), COALESCE(v_saudaveis,0),
    v_work_item_ids, COALESCE(array_length(v_work_item_ids,1),0),
    v_avg_lead, v_max_lead, COALESCE(v_transbordo,0),
    format('reconstrucao_fim_sprint %s @%s (state_history): %s itens = %s exatos + %s aproximados. health/lead-time do estado atual.',
           p_sprint_code, v_as_of::text, COALESCE(v_total,0), COALESCE(v_exatos,0), COALESCE(v_aprox,0)),
    NOW(), v_as_of, 'fim_sprint_reconstruido',
    COALESCE(v_qa_done,0), COALESCE(v_qa_with_return,0), COALESCE(v_qa_cycles,0),
    COALESCE(v_rate,0), COALESCE(v_avg_cycles,0),
    COALESCE(v_qa_concluidos,0), COALESCE(v_qa_concluidos_sr,0), COALESCE(v_qa_concluidos_cr,0)
  ) RETURNING id INTO v_snapshot_id;

  RETURN QUERY SELECT p_sprint_code, v_as_of, COALESCE(v_total,0), COALESCE(v_qa_done,0),
    COALESCE(v_qa_concluidos,0), COALESCE(v_exatos,0), COALESCE(v_aprox,0);
END;
$function$;

-- ── 2. Captura ao vivo com a nova regra ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_capture_sprint_snapshot(p_sprint_code text, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(snapshot_id uuid, sprint_code text, total_demands bigint, planned_demands bigint, unplanned_demands bigint, delivered_demands bigint, finalized_demands bigint, captured_at timestamp without time zone)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  v_qa_concluidos bigint; v_qa_concluidos_sr bigint; v_qa_concluidos_cr bigint;
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
      COALESCE(dwi.tags, '') AS tags_text,
      EXISTS (
        SELECT 1 FROM qa_authorized_closers c WHERE c.is_active AND (
          lower(c.email) = lower(dwi.closed_by_email) OR lower(c.display_name) = lower(dwi.closed_by)
        )
      ) AS qa_closed
    FROM pbi_lifecycle_summary ls
    LEFT JOIN devops_work_items dwi ON dwi.id = ls.work_item_id
    LEFT JOIN pbi_health_summary hs ON hs.work_item_id = ls.work_item_id
    WHERE (ls.last_committed_sprint = p_sprint_code OR ls.first_committed_sprint = p_sprint_code)
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE NOT public.fn_demanda_nao_planejada(work_item_type, tags_text))::bigint,
    COUNT(*) FILTER (WHERE public.fn_demanda_nao_planejada(work_item_type, tags_text))::bigint,
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
    COALESCE(SUM(CASE WHEN current_stage = 'done' THEN COALESCE(qa_return_count, 0) ELSE 0 END), 0)::bigint,
    COUNT(*) FILTER (WHERE qa_closed)::bigint,
    COUNT(*) FILTER (WHERE qa_closed AND COALESCE(qa_return_count,0) = 0)::bigint,
    COUNT(*) FILTER (WHERE qa_closed AND COALESCE(qa_return_count,0) > 0)::bigint
  INTO v_total, v_planned, v_unplanned, v_delivered, v_finalized,
       v_criticos, v_atencao, v_saudaveis, v_work_item_ids,
       v_avg_lead, v_max_lead, v_transbordo_count,
       v_qa_done_items, v_qa_items_with_return, v_qa_return_cycles_total,
       v_qa_concluidos, v_qa_concluidos_sr, v_qa_concluidos_cr
  FROM base_items;

  v_qa_return_rate_pct := CASE WHEN COALESCE(v_qa_done_items,0) > 0
    THEN ROUND((COALESCE(v_qa_items_with_return,0)::numeric / v_qa_done_items::numeric) * 100, 1) ELSE 0 END;
  v_qa_avg_return_cycles := CASE WHEN COALESCE(v_qa_items_with_return,0) > 0
    THEN ROUND((COALESCE(v_qa_return_cycles_total,0)::numeric / v_qa_items_with_return::numeric), 2) ELSE 0 END;

  v_inconsistencies := jsonb_build_object(
    'total_items', COALESCE(v_total,0), 'snapshot_time', NOW()::text,
    'qa_done_items', COALESCE(v_qa_done_items,0),
    'qa_concluidos', COALESCE(v_qa_concluidos,0)
  );

  INSERT INTO public.sprint_indicator_snapshots (
    sprint_code, sprint_start_date, sprint_end_date,
    total_demands, planned_demands, unplanned_demands, delivered_demands, finalized_demands,
    itens_criticos, itens_atencao, itens_saudaveis,
    source_work_item_ids, work_item_count_in_snapshot,
    avg_lead_time_days, max_lead_time_days, transbordo_count,
    inconsistencies_found, notes, snapshot_datetime, as_of_datetime, snapshot_source,
    qa_done_items, qa_items_with_return, qa_return_cycles_total,
    qa_return_rate_pct, qa_avg_return_cycles,
    qa_concluidos, qa_concluidos_sem_retorno, qa_concluidos_com_retorno
  ) VALUES (
    p_sprint_code, v_sprint_start, v_sprint_end,
    COALESCE(v_total,0), COALESCE(v_planned,0), COALESCE(v_unplanned,0),
    COALESCE(v_delivered,0), COALESCE(v_finalized,0),
    COALESCE(v_criticos,0), COALESCE(v_atencao,0), COALESCE(v_saudaveis,0),
    v_work_item_ids, COALESCE(array_length(v_work_item_ids,1),0),
    v_avg_lead, v_max_lead, COALESCE(v_transbordo_count,0),
    v_inconsistencies, p_notes, NOW(), NOW(), 'estado_atual',
    COALESCE(v_qa_done_items,0), COALESCE(v_qa_items_with_return,0),
    COALESCE(v_qa_return_cycles_total,0),
    COALESCE(v_qa_return_rate_pct,0), COALESCE(v_qa_avg_return_cycles,0),
    COALESCE(v_qa_concluidos,0), COALESCE(v_qa_concluidos_sr,0), COALESCE(v_qa_concluidos_cr,0)
  ) RETURNING id INTO v_snapshot_id;

  RETURN QUERY SELECT v_snapshot_id, p_sprint_code,
    COALESCE(v_total,0), COALESCE(v_planned,0), COALESCE(v_unplanned,0),
    COALESCE(v_delivered,0), COALESCE(v_finalized,0), NOW()::timestamp;
END;
$function$;
