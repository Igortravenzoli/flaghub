
-- RPC: Bottleneck summary by stage
CREATE OR REPLACE FUNCTION public.rpc_pbi_bottleneck_summary(
  p_sector text DEFAULT NULL,
  p_sprint_code text DEFAULT NULL,
  p_date_start date DEFAULT NULL,
  p_date_end date DEFAULT NULL
)
RETURNS TABLE(
  stage_key text,
  stage_label text,
  avg_days_in_stage numeric,
  max_days_in_stage numeric,
  count_in_stage bigint,
  count_overtime bigint,
  overflow_count_in_stage bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    se.stage_key,
    COALESCE(sc.label_pt, se.stage_key) AS stage_label,
    ROUND(AVG(COALESCE(se.duration_days, 0)), 1) AS avg_days_in_stage,
    COALESCE(MAX(se.duration_days), 0) AS max_days_in_stage,
    COUNT(*) AS count_in_stage,
    COUNT(*) FILTER (WHERE se.duration_days > COALESCE(th.warn_days, 14)) AS count_overtime,
    COUNT(*) FILTER (WHERE se.is_overflow = true) AS overflow_count_in_stage
  FROM pbi_stage_events se
  LEFT JOIN pbi_stage_config sc ON sc.stage_key = se.stage_key AND sc.is_active = true
  LEFT JOIN pbi_health_thresholds th ON th.stage_key = se.stage_key AND th.is_active = true
  WHERE (p_sector IS NULL OR se.sector = p_sector)
    AND (p_sprint_code IS NULL OR se.sprint_code = p_sprint_code)
    AND (p_date_start IS NULL OR se.entered_at::date >= p_date_start)
    AND (p_date_end IS NULL OR se.entered_at::date <= p_date_end)
  GROUP BY se.stage_key, sc.label_pt
  ORDER BY MIN(COALESCE(sc.sort_order, 999));
$$;

-- RPC: Health overview counts
CREATE OR REPLACE FUNCTION public.rpc_pbi_health_overview(
  p_sector text DEFAULT NULL,
  p_sprint_code text DEFAULT NULL,
  p_date_start date DEFAULT NULL,
  p_date_end date DEFAULT NULL
)
RETURNS TABLE(
  total_count bigint,
  verde_count bigint,
  amarelo_count bigint,
  vermelho_count bigint,
  items_with_bottleneck bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE hs.health_status = 'verde') AS verde_count,
    COUNT(*) FILTER (WHERE hs.health_status = 'amarelo') AS amarelo_count,
    COUNT(*) FILTER (WHERE hs.health_status = 'vermelho') AS vermelho_count,
    COUNT(*) FILTER (WHERE hs.bottleneck_stage IS NOT NULL) AS items_with_bottleneck
  FROM pbi_health_summary hs
  LEFT JOIN pbi_lifecycle_summary ls ON ls.work_item_id = hs.work_item_id
  WHERE (p_sector IS NULL OR hs.sector = p_sector)
    AND (p_sprint_code IS NULL OR ls.first_committed_sprint = p_sprint_code OR ls.last_committed_sprint = p_sprint_code)
    AND (p_date_start IS NULL OR hs.computed_at::date >= p_date_start)
    AND (p_date_end IS NULL OR hs.computed_at::date <= p_date_end);
$$;

-- RPC: Feature PBI summary
CREATE OR REPLACE FUNCTION public.rpc_feature_pbi_summary(
  p_sector text DEFAULT NULL,
  p_sprint_code text DEFAULT NULL,
  p_date_start date DEFAULT NULL,
  p_date_end date DEFAULT NULL
)
RETURNS TABLE(
  feature_id integer,
  feature_title text,
  epic_id integer,
  epic_title text,
  pbi_count bigint,
  bug_count bigint,
  verde_count bigint,
  amarelo_count bigint,
  vermelho_count bigint,
  avg_lead_time_days numeric,
  overflow_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hierarchy AS (
    SELECT
      wi.id AS work_item_id,
      wi.work_item_type,
      p.id AS feature_id,
      p.title AS feature_title,
      gp.id AS epic_id,
      gp.title AS epic_title
    FROM devops_work_items wi
    LEFT JOIN devops_work_items p ON p.id = wi.parent_id
    LEFT JOIN devops_work_items gp ON gp.id = p.parent_id
    WHERE wi.work_item_type IN ('Product Backlog Item', 'User Story', 'Bug')
  )
  SELECT
    h.feature_id::int,
    COALESCE(h.feature_title, 'Sem feature') AS feature_title,
    h.epic_id::int,
    COALESCE(h.epic_title, '') AS epic_title,
    COUNT(*) FILTER (WHERE h.work_item_type IN ('Product Backlog Item', 'User Story')) AS pbi_count,
    COUNT(*) FILTER (WHERE h.work_item_type = 'Bug') AS bug_count,
    COUNT(*) FILTER (WHERE hs.health_status = 'verde') AS verde_count,
    COUNT(*) FILTER (WHERE hs.health_status = 'amarelo') AS amarelo_count,
    COUNT(*) FILTER (WHERE hs.health_status = 'vermelho') AS vermelho_count,
    ROUND(AVG(ls.total_lead_time_days), 1) AS avg_lead_time_days,
    COALESCE(SUM(ls.overflow_count), 0) AS overflow_count
  FROM hierarchy h
  LEFT JOIN pbi_lifecycle_summary ls ON ls.work_item_id = h.work_item_id
  LEFT JOIN pbi_health_summary hs ON hs.work_item_id = h.work_item_id
  WHERE (p_sector IS NULL OR ls.sector = p_sector OR hs.sector = p_sector)
    AND (p_sprint_code IS NULL OR ls.first_committed_sprint = p_sprint_code OR ls.last_committed_sprint = p_sprint_code)
    AND (p_date_start IS NULL OR ls.computed_at::date >= p_date_start)
    AND (p_date_end IS NULL OR ls.computed_at::date <= p_date_end)
  GROUP BY h.feature_id, h.feature_title, h.epic_id, h.epic_title
  ORDER BY COUNT(*) DESC;
$$;
