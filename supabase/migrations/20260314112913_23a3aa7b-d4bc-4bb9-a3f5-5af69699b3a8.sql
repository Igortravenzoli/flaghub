
-- Fix handle_new_user trigger: create profile only, NO auto role/network assignment
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_domain TEXT;
BEGIN
  -- Extract domain
  v_domain := SPLIT_PART(NEW.email, '@', 2);
  
  -- Create profile WITHOUT network_id (admin must approve)
  INSERT INTO public.profiles (user_id, full_name, network_id)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      SPLIT_PART(NEW.email, '@', 1)
    ),
    NULL
  )
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);
  
  -- DO NOT auto-create role — user must request access, admin must approve
  -- Log provisioning event
  INSERT INTO public.hub_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    NEW.id,
    'user.first_login',
    'user',
    NEW.id::text,
    jsonb_build_object('email', NEW.email, 'domain', v_domain)
  );
  
  RETURN NEW;
END;
$$;
