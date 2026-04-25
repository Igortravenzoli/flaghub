
-- Add mutation policies to pbi_stage_events: only hub admins can write
DROP POLICY IF EXISTS "pbi_stage_events_insert_admin" ON public.pbi_stage_events;
CREATE POLICY "pbi_stage_events_insert_admin"
  ON public.pbi_stage_events
  FOR INSERT
  TO authenticated
  WITH CHECK (public.hub_is_admin());

DROP POLICY IF EXISTS "pbi_stage_events_update_admin" ON public.pbi_stage_events;
CREATE POLICY "pbi_stage_events_update_admin"
  ON public.pbi_stage_events
  FOR UPDATE
  TO authenticated
  USING (public.hub_is_admin());

DROP POLICY IF EXISTS "pbi_stage_events_delete_admin" ON public.pbi_stage_events;
CREATE POLICY "pbi_stage_events_delete_admin"
  ON public.pbi_stage_events
  FOR DELETE
  TO authenticated
  USING (public.hub_is_admin());
