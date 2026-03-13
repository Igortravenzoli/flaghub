
-- Phase 4: Backend Confidential Security — IP enforcement via RLS

-- 1. RPC for frontend to check current user's IP status
CREATE OR REPLACE FUNCTION public.hub_check_my_ip()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'ip', public.hub_request_ip(),
    'is_allowed', public.hub_is_ip_allowed()
  );
$$;

-- 2. Update hub_dashboards SELECT policy to enforce IP for confidential dashboards
DROP POLICY IF EXISTS "hub_dashboards_select" ON public.hub_dashboards;
CREATE POLICY "hub_dashboards_select" ON public.hub_dashboards
  FOR SELECT TO authenticated
  USING (
    hub_is_admin()
    OR (
      hub_user_has_area(area_id)
      AND (NOT is_confidential OR hub_is_ip_allowed())
    )
  );

-- 3. Update hub_metrics_registry SELECT policy to enforce IP for confidential metrics
DROP POLICY IF EXISTS "hub_metrics_select" ON public.hub_metrics_registry;
CREATE POLICY "hub_metrics_select" ON public.hub_metrics_registry
  FOR SELECT TO authenticated
  USING (
    hub_is_admin()
    OR (
      EXISTS (
        SELECT 1 FROM hub_dashboards d
        WHERE d.id = hub_metrics_registry.dashboard_id
          AND hub_user_has_area(d.area_id)
      )
      AND (NOT is_confidential OR hub_is_ip_allowed())
    )
  );
