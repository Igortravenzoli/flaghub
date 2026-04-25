
-- Drop the existing overly-permissive SELECT policy
DROP POLICY IF EXISTS "devops_time_logs_select_restricted" ON public.devops_time_logs;

-- Recreate with restricted area access (technical areas only)
CREATE POLICY "devops_time_logs_select_restricted"
  ON public.devops_time_logs
  FOR SELECT
  TO authenticated
  USING (
    public.hub_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.hub_area_members m
      JOIN public.hub_areas a ON a.id = m.area_id
      WHERE m.user_id = auth.uid()
        AND m.is_active = true
        AND a.key = ANY (ARRAY[
          'fabrica', 'qualidade', 'programacao',
          'devops', 'infraestrutura', 'produtos'
        ])
    )
  );
