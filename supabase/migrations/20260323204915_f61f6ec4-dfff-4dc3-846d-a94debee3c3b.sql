
-- 1. Restrict hub_integrations SELECT to admins only (config may contain secrets)
DROP POLICY IF EXISTS "hub_integrations_select_safe" ON public.hub_integrations;
CREATE POLICY "hub_integrations_select_admin" ON public.hub_integrations
  FOR SELECT TO authenticated
  USING (public.hub_is_admin());

-- 2. Add admin guard to get_cron_secret to prevent any authenticated user from reading it
CREATE OR REPLACE FUNCTION public.get_cron_secret()
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.hub_is_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  RETURN (
    SELECT decrypted_secret 
    FROM vault.decrypted_secrets 
    WHERE name = 'cron_secret'
    LIMIT 1
  );
END;
$function$;
