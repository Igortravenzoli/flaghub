
-- 1. Drop stale devops_time_logs_select_auth policy (OR true bypass) if it still exists
DROP POLICY IF EXISTS "devops_time_logs_select_auth" ON public.devops_time_logs;

-- 2. Scope pbi_stage_events SELECT to DevOps/Fábrica/Qualidade area members only
DROP POLICY IF EXISTS "pbi_stage_events_select_restricted" ON public.pbi_stage_events;
CREATE POLICY "pbi_stage_events_select_restricted" ON public.pbi_stage_events
  FOR SELECT TO authenticated
  USING (
    hub_is_admin()
    OR EXISTS (
      SELECT 1
      FROM hub_area_members m
      JOIN hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key IN ('fabrica', 'qualidade', 'programacao', 'devops', 'infraestrutura', 'produtos')
    )
  );

-- 3. Ensure old hub_integrations_select_safe (USING true) is dropped
DROP POLICY IF EXISTS "hub_integrations_select_safe" ON public.hub_integrations;
DROP POLICY IF EXISTS "hub_integrations_select" ON public.hub_integrations;
