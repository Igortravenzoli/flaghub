-- Fix remaining WARN-level issues

-- 1. domain_network_mapping: add explicit admin-only SELECT
CREATE POLICY "domain_network_mapping_select_admin"
  ON public.domain_network_mapping FOR SELECT TO authenticated
  USING (public.hub_is_admin());

-- 2. user_roles: fix policy targeting 'public' role instead of 'authenticated'
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));