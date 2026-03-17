-- Phase 5 — TimeLog aggregation RPC + metric metadata view

CREATE OR REPLACE FUNCTION public.rpc_devops_timelog_agg(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_work_item_ids int[] DEFAULT NULL
)
RETURNS TABLE (
  work_item_id int,
  user_name text,
  total_minutes int,
  min_log_date date,
  max_log_date date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    tl.work_item_id,
    tl.user_name,
    SUM(COALESCE(tl.time_minutes, 0))::int AS total_minutes,
    MIN(tl.log_date)::date AS min_log_date,
    MAX(tl.log_date)::date AS max_log_date
  FROM public.devops_time_logs tl
  WHERE (p_from IS NULL OR tl.log_date >= p_from)
    AND (p_to IS NULL OR tl.log_date <= p_to)
    AND (
      p_work_item_ids IS NULL
      OR array_length(p_work_item_ids, 1) IS NULL
      OR tl.work_item_id = ANY (p_work_item_ids)
    )
  GROUP BY tl.work_item_id, tl.user_name;
$$;

CREATE OR REPLACE VIEW public.vw_hub_metric_formulas
WITH (security_invoker = true) AS
SELECT
  ha.key AS area_key,
  hd.key AS dashboard_key,
  hmr.key AS metric_key,
  hmr.name AS metric_name,
  hmr.formula_description,
  hmr.notes,
  hmr.status
FROM public.hub_metrics_registry hmr
JOIN public.hub_dashboards hd ON hd.id = hmr.dashboard_id
JOIN public.hub_areas ha ON ha.id = hd.area_id;
