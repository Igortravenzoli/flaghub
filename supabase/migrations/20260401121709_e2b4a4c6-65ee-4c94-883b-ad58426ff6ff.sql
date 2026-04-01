DROP VIEW IF EXISTS public.vw_hub_integrations_safe;

CREATE VIEW public.vw_hub_integrations_safe
  WITH (security_invoker = false)
AS
SELECT
  id,
  key,
  name,
  type,
  auth_type,
  base_url,
  is_active,
  last_health_at,
  created_at
FROM public.hub_integrations;

GRANT SELECT ON public.vw_hub_integrations_safe TO authenticated;