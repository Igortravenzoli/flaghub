
-- Allow all authenticated users to read hub_areas (needed for access request flow)
CREATE POLICY "hub_areas_select_all_authenticated"
ON public.hub_areas
FOR SELECT
TO authenticated
USING (is_active = true);
