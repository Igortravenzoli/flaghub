-- Permitir que admin possa deletar profiles
CREATE POLICY "Admin can delete profiles"
ON public.profiles
FOR DELETE
USING (is_admin());