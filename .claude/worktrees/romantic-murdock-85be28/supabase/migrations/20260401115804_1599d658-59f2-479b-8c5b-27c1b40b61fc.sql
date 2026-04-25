-- 1. Restrict pbi_lifecycle_summary SELECT to devops area members
DROP POLICY IF EXISTS "Authenticated users can read pbi lifecycle summary" ON public.pbi_lifecycle_summary;
CREATE POLICY "pbi_lifecycle_summary_select_restricted" ON public.pbi_lifecycle_summary
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

-- 2. Restrict pbi_health_summary SELECT to devops area members
DROP POLICY IF EXISTS "Authenticated users can read pbi health summary" ON public.pbi_health_summary;
CREATE POLICY "pbi_health_summary_select_restricted" ON public.pbi_health_summary
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

-- 3. Restrict devops_lead_area_map: replace area-member policy with admin-only
DROP POLICY IF EXISTS "lead_area_map_select_restricted" ON public.devops_lead_area_map;
CREATE POLICY "devops_lead_area_map_select_admin_only" ON public.devops_lead_area_map
  FOR SELECT TO authenticated
  USING (hub_is_admin());

-- 4. Create safe view masking lead_email for non-admin consumers
CREATE OR REPLACE VIEW public.vw_devops_lead_area_map_safe
WITH (security_invoker = on) AS
  SELECT
    id,
    CASE WHEN hub_is_admin() THEN lead_email ELSE '***' END AS lead_email,
    canonical_name,
    area_key,
    squad_label,
    pipeline_role,
    visual_priority,
    counts_as_design,
    counts_as_fabrica,
    counts_as_qualidade,
    is_active
  FROM public.devops_lead_area_map;