
-- Drop the overly broad select policy
DROP POLICY IF EXISTS "Authenticated users can read active devops queries" ON public.devops_queries;

-- Create restricted select policy for technical area members only
CREATE POLICY "devops_queries_select_restricted"
  ON public.devops_queries
  FOR SELECT
  TO authenticated
  USING (
    hub_is_admin()
    OR (
      EXISTS (
        SELECT 1
        FROM hub_area_members m
        JOIN hub_areas a ON a.id = m.area_id
        WHERE m.user_id = (SELECT auth.uid())
          AND m.is_active = true
          AND a.key = ANY (ARRAY['fabrica','qualidade','programacao','devops','infraestrutura','produtos'])
      )
    )
  );
