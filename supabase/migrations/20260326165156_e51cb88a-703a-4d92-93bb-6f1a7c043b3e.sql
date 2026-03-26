-- ========================================
-- Fix linter warnings relevantes no banco
-- ========================================

-- 1) login_attempts: RLS habilitado sem policy
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'login_attempts'
      AND policyname = 'login_attempts_no_client_access'
  ) THEN
    CREATE POLICY "login_attempts_no_client_access"
    ON public.login_attempts
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);
  END IF;
END $$;

-- 2) rpc_devops_timelog_agg: search_path explícito
CREATE OR REPLACE FUNCTION public.rpc_devops_timelog_agg(
  p_from date DEFAULT NULL::date,
  p_to date DEFAULT NULL::date,
  p_work_item_ids integer[] DEFAULT NULL::integer[]
)
RETURNS TABLE(
  work_item_id integer,
  user_name text,
  total_minutes integer,
  min_log_date date,
  max_log_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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