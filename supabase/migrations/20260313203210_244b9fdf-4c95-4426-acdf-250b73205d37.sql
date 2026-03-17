
CREATE OR REPLACE FUNCTION public.hub_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
    EXISTS (
      SELECT 1 FROM public.hub_user_global_roles
      WHERE user_id = (SELECT auth.uid())
        AND role = 'admin'
    )
    OR
    public.is_admin();
$$;
