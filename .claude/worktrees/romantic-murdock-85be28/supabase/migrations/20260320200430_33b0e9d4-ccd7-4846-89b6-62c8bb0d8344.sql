
-- Rewrite bottleneck RPC to use pbi_lifecycle_summary (which has data) instead of pbi_stage_events (empty)
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
  WITH stage_data AS (
    SELECT 'backlog' AS sk, ls.backlog_days AS days, ls.overflow_count, ls.work_item_id
    FROM pbi_lifecycle_summary ls
    WHERE ls.current_stage = 'backlog'
      AND (p_sector IS NULL OR ls.sector = p_sector)
      AND (p_sprint_code IS NULL OR ls.first_committed_sprint = p_sprint_code OR ls.last_committed_sprint = p_sprint_code)
      AND (p_date_start IS NULL OR ls.computed_at::date >= p_date_start)
      AND (p_date_end IS NULL OR ls.computed_at::date <= p_date_end)
    UNION ALL
    SELECT 'design', ls.design_days, ls.overflow_count, ls.work_item_id
    FROM pbi_lifecycle_summary ls
    WHERE ls.current_stage = 'design'
      AND (p_sector IS NULL OR ls.sector = p_sector)
      AND (p_sprint_code IS NULL OR ls.first_committed_sprint = p_sprint_code OR ls.last_committed_sprint = p_sprint_code)
      AND (p_date_start IS NULL OR ls.computed_at::date >= p_date_start)
      AND (p_date_end IS NULL OR ls.computed_at::date <= p_date_end)
    UNION ALL
    SELECT 'fabrica', ls.fabrica_days, ls.overflow_count, ls.work_item_id
    FROM pbi_lifecycle_summary ls
    WHERE ls.current_stage = 'fabrica'
      AND (p_sector IS NULL OR ls.sector = p_sector)
      AND (p_sprint_code IS NULL OR ls.first_committed_sprint = p_sprint_code OR ls.last_committed_sprint = p_sprint_code)
      AND (p_date_start IS NULL OR ls.computed_at::date >= p_date_start)
      AND (p_date_end IS NULL OR ls.computed_at::date <= p_date_end)
    UNION ALL
    SELECT 'qualidade', ls.qualidade_days, ls.overflow_count, ls.work_item_id
    FROM pbi_lifecycle_summary ls
    WHERE ls.current_stage = 'qualidade'
      AND (p_sector IS NULL OR ls.sector = p_sector)
      AND (p_sprint_code IS NULL OR ls.first_committed_sprint = p_sprint_code OR ls.last_committed_sprint = p_sprint_code)
      AND (p_date_start IS NULL OR ls.computed_at::date >= p_date_start)
      AND (p_date_end IS NULL OR ls.computed_at::date <= p_date_end)
    UNION ALL
    SELECT 'deploy', ls.deploy_days, ls.overflow_count, ls.work_item_id
    FROM pbi_lifecycle_summary ls
    WHERE ls.current_stage = 'deploy'
      AND (p_sector IS NULL OR ls.sector = p_sector)
      AND (p_sprint_code IS NULL OR ls.first_committed_sprint = p_sprint_code OR ls.last_committed_sprint = p_sprint_code)
      AND (p_date_start IS NULL OR ls.computed_at::date >= p_date_start)
      AND (p_date_end IS NULL OR ls.computed_at::date <= p_date_end)
  )
  SELECT
    sd.sk AS stage_key,
    COALESCE(sc.label_pt, sd.sk) AS stage_label,
    ROUND(AVG(sd.days), 1) AS avg_days_in_stage,
    COALESCE(MAX(sd.days), 0) AS max_days_in_stage,
    COUNT(*) AS count_in_stage,
    COUNT(*) FILTER (WHERE sd.days > COALESCE(th.warn_days, 14)) AS count_overtime,
    COUNT(*) FILTER (WHERE sd.overflow_count > 0) AS overflow_count_in_stage
  FROM stage_data sd
  LEFT JOIN pbi_stage_config sc ON sc.stage_key = sd.sk AND sc.is_active = true
  LEFT JOIN pbi_health_thresholds th ON th.stage_key = sd.sk AND th.is_active = true
  GROUP BY sd.sk, sc.label_pt, sc.sort_order
  ORDER BY COALESCE(sc.sort_order, 999);
$$;
