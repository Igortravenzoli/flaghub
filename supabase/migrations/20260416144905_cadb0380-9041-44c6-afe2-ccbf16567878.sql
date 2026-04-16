DROP POLICY IF EXISTS "Admin can update profiles" ON public.profiles;
CREATE POLICY "Admin can update profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());