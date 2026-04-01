
-- 1. Recreate the view as SECURITY DEFINER to bypass base table admin-only RLS
-- while still masking lead_email for non-admins via CASE WHEN
DROP VIEW IF EXISTS public.vw_devops_lead_area_map_safe;
CREATE VIEW public.vw_devops_lead_area_map_safe
WITH (security_barrier = true) AS
  SELECT
    id,
    CASE WHEN public.hub_is_admin() THEN lead_email ELSE '***' END AS lead_email,
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

-- 2. Add explicit deny policy for anon role on login_attempts
DROP POLICY IF EXISTS "login_attempts_deny_anon" ON public.login_attempts;
CREATE POLICY "login_attempts_deny_anon"
  ON public.login_attempts
  FOR ALL
  TO anon
  USING (false);
