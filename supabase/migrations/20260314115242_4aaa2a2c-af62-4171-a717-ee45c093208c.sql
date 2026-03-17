
-- Fix: replace SECURITY DEFINER view with SECURITY INVOKER
DROP VIEW IF EXISTS public.vw_hub_integrations_safe;

CREATE VIEW public.vw_hub_integrations_safe
WITH (security_invoker = true)
AS
SELECT
  id, key, name, type, auth_type, base_url, is_active, last_health_at, created_at,
  CASE WHEN hub_is_admin() THEN config ELSE NULL END AS config
FROM public.hub_integrations;
