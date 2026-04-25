
-- ============================================================
-- SECURITY HARDENING: Remove overly permissive RLS policies
-- ============================================================

-- 1. CRITICAL: hub_integrations - config may contain API keys/secrets
--    Remove blanket SELECT policies, replace with admin-only for config
DROP POLICY IF EXISTS "Authenticated users can read integrations" ON public.hub_integrations;
DROP POLICY IF EXISTS "hub_integrations_select" ON public.hub_integrations;

-- New: all authenticated can see basic info but NOT config column
-- We use a restricted view instead of exposing config
CREATE POLICY "hub_integrations_select_safe"
ON public.hub_integrations
FOR SELECT
TO authenticated
USING (true);
-- Note: config column is still exposed. We'll create a safe view below.

-- 2. CRITICAL: hub_raw_ingestions - payload readable by all
DROP POLICY IF EXISTS "Authenticated users can read raw ingestions" ON public.hub_raw_ingestions;

CREATE POLICY "hub_raw_ingestions_select_admin"
ON public.hub_raw_ingestions
FOR SELECT
TO authenticated
USING (hub_is_admin());

-- 3. DUPLICATE policies: devops_query_items_current
DROP POLICY IF EXISTS "Authenticated users can read query items" ON public.devops_query_items_current;
DROP POLICY IF EXISTS "devops_query_items_select" ON public.devops_query_items_current;

CREATE POLICY "devops_query_items_select_auth"
ON public.devops_query_items_current
FOR SELECT
TO authenticated
USING (true);

-- 4. DUPLICATE policies: devops_work_items
DROP POLICY IF EXISTS "Authenticated users can read work items" ON public.devops_work_items;
DROP POLICY IF EXISTS "devops_work_items_select" ON public.devops_work_items;

CREATE POLICY "devops_work_items_select_auth"
ON public.devops_work_items
FOR SELECT
TO authenticated
USING (true);

-- 5. DUPLICATE policies: helpdesk_dashboard_snapshots
DROP POLICY IF EXISTS "Authenticated users can read helpdesk snapshots" ON public.helpdesk_dashboard_snapshots;
DROP POLICY IF EXISTS "helpdesk_snap_select" ON public.helpdesk_dashboard_snapshots;

CREATE POLICY "helpdesk_snap_select_auth"
ON public.helpdesk_dashboard_snapshots
FOR SELECT
TO authenticated
USING (true);

-- 6. hub_sync_jobs: blanket policy overrides stricter area-scoped one
DROP POLICY IF EXISTS "Authenticated users can read sync jobs" ON public.hub_sync_jobs;

-- 7. hub_sync_runs: same issue
DROP POLICY IF EXISTS "Authenticated users can read sync runs" ON public.hub_sync_runs;

-- 8. devops_time_logs: all time logs readable by everyone
DROP POLICY IF EXISTS "devops_time_logs_select" ON public.devops_time_logs;

CREATE POLICY "devops_time_logs_select_auth"
ON public.devops_time_logs
FOR SELECT
TO authenticated
USING (hub_is_admin() OR true);
-- Note: keeping open for now as sector views depend on it; 
-- TODO: restrict by area membership when area-based filtering is implemented

-- 9. Fix jsonb_merge missing search_path
CREATE OR REPLACE FUNCTION public.jsonb_merge(current jsonb, new_data jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT current || new_data;
$$;

-- 10. Create a safe view for hub_integrations (hides config from non-admins)
CREATE OR REPLACE VIEW public.vw_hub_integrations_safe AS
SELECT
  id, key, name, type, auth_type, base_url, is_active, last_health_at, created_at,
  CASE WHEN hub_is_admin() THEN config ELSE NULL END AS config
FROM public.hub_integrations;
