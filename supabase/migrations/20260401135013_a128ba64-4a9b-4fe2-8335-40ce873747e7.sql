-- hub_audit_logs already has no INSERT policy for authenticated users.
-- The edge function uses service_role which bypasses RLS, so no policy changes needed.
-- But let's ensure service_role can insert (it bypasses RLS by default, so this is fine).

-- Create a function to log SSO logins via database trigger
-- This captures Azure SSO logins that don't go through the edge function
CREATE OR REPLACE FUNCTION public.hub_log_sso_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when last_sign_in_at actually changes (new login)
  IF OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at THEN
    INSERT INTO public.hub_audit_logs (action, actor_user_id, entity_type, entity_id, metadata)
    VALUES (
      'login_sso',
      NEW.id,
      'auth',
      NEW.email,
      jsonb_build_object(
        'email', NEW.email,
        'provider', COALESCE(NEW.raw_app_meta_data->>'provider', 'unknown'),
        'signed_in_at', NEW.last_sign_in_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to auth.users for SSO login tracking
DROP TRIGGER IF EXISTS trg_hub_log_sso_login ON auth.users;
CREATE TRIGGER trg_hub_log_sso_login
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.hub_log_sso_login();