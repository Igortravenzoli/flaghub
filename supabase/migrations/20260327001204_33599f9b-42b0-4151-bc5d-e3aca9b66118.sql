-- Fix remaining overly permissive SELECT policies (round 2)

-- 1. pbi_stage_events: restrict to admin or area members (exposes responsible_email)
DROP POLICY IF EXISTS "Authenticated users can read pbi stage events" ON public.pbi_stage_events;
CREATE POLICY "pbi_stage_events_select_restricted"
  ON public.pbi_stage_events FOR SELECT TO authenticated
  USING (
    public.hub_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hub_area_members m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
    )
  );

-- 2. alert_deliveries: restrict to admins (payload may contain sensitive data)
DROP POLICY IF EXISTS "alert_deliveries_select_auth" ON public.alert_deliveries;
CREATE POLICY "alert_deliveries_select_admin"
  ON public.alert_deliveries FOR SELECT TO authenticated
  USING (public.hub_is_admin());

-- 3. alert_rules: restrict to admins (exposes recipients, thresholds, metric config)
DROP POLICY IF EXISTS "alert_rules_select_auth" ON public.alert_rules;
CREATE POLICY "alert_rules_select_admin"
  ON public.alert_rules FOR SELECT TO authenticated
  USING (public.hub_is_admin());

-- 4. hub_integration_endpoints: restrict to admins (consistent with hub_integrations)
DROP POLICY IF EXISTS "hub_endpoints_select" ON public.hub_integration_endpoints;
CREATE POLICY "hub_endpoints_select_admin"
  ON public.hub_integration_endpoints FOR SELECT TO authenticated
  USING (public.hub_is_admin());