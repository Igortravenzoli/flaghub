
-- Update provision_user to NOT auto-assign role or network.
-- New SSO users get a profile only; admin must approve via hub_access_requests.
CREATE OR REPLACE FUNCTION public.provision_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_domain TEXT;
  v_mapping RECORD;
  v_existing_role RECORD;
BEGIN
  -- Fetch user from auth.users
  SELECT id, email, raw_user_meta_data INTO v_user
  FROM auth.users
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Extract email domain
  v_domain := SPLIT_PART(v_user.email, '@', 2);
  
  -- Check domain mapping (for reference only, no auto-assign)
  SELECT * INTO v_mapping 
  FROM public.domain_network_mapping 
  WHERE email_domain = v_domain;
  
  -- Check if user already has a role (existing user)
  SELECT * INTO v_existing_role
  FROM public.user_roles
  WHERE user_id = p_user_id
  LIMIT 1;
  
  -- Create profile WITHOUT network_id (admin must assign)
  INSERT INTO public.profiles (user_id, full_name, network_id)
  VALUES (
    v_user.id,
    COALESCE(
      v_user.raw_user_meta_data->>'full_name',
      v_user.raw_user_meta_data->>'name',
      SPLIT_PART(v_user.email, '@', 1)
    ),
    NULL  -- No network until admin approves
  )
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = COALESCE(
        EXCLUDED.full_name, 
        public.profiles.full_name
      );
  -- DO NOT auto-assign network_id on conflict either
  
  -- DO NOT auto-create role — admin must approve first
  -- Only log the provisioning event
  PERFORM public.hub_audit_log(
    'user.provisioned',
    p_user_id::text,
    'user',
    jsonb_build_object(
      'email', v_user.email,
      'domain', v_domain,
      'had_existing_role', (v_existing_role IS NOT NULL),
      'domain_mapped', (v_mapping IS NOT NULL)
    )
  );
  
  RETURN jsonb_build_object(
    'success', true, 
    'user_id', v_user.id,
    'email', v_user.email,
    'status', CASE WHEN v_existing_role IS NOT NULL THEN 'active' ELSE 'pending_approval' END,
    'network_id', NULL,
    'role', NULL
  );
END;
$$;
