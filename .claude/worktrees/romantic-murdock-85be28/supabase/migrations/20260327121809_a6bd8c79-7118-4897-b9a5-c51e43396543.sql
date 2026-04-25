-- Fix get_cron_secret to allow pg_cron (postgres role) to call it
-- pg_cron runs as 'postgres' user with no auth.uid(), so hub_is_admin() always fails
CREATE OR REPLACE FUNCTION public.get_cron_secret()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow postgres role (used by pg_cron) OR authenticated admins
  IF current_user = 'postgres' OR public.hub_is_admin() THEN
    RETURN (
      SELECT decrypted_secret 
      FROM vault.decrypted_secrets 
      WHERE name = 'cron_secret'
      LIMIT 1
    );
  END IF;
  RAISE EXCEPTION 'Permission denied';
END;
$function$;