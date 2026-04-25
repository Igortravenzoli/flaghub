
-- Add explicit anon deny policy
CREATE POLICY "Deny anonymous access"
  ON public.import_batches
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Recreate the three policies targeting authenticated instead of public

-- 1. SELECT
DROP POLICY IF EXISTS "Users can view batches from their network" ON public.import_batches;
CREATE POLICY "Users can view batches from their network"
  ON public.import_batches
  FOR SELECT
  TO authenticated
  USING (
    network_id IN (
      SELECT profiles.network_id
      FROM profiles
      WHERE profiles.user_id = auth.uid()
    )
  );

-- 2. INSERT
DROP POLICY IF EXISTS "Users can create batches for their network" ON public.import_batches;
CREATE POLICY "Users can create batches for their network"
  ON public.import_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    imported_by = auth.uid()
    AND network_id IN (
      SELECT profiles.network_id
      FROM profiles
      WHERE profiles.user_id = auth.uid()
    )
  );

-- 3. UPDATE
DROP POLICY IF EXISTS "Users can update their own batches" ON public.import_batches;
CREATE POLICY "Users can update their own batches"
  ON public.import_batches
  FOR UPDATE
  TO authenticated
  USING (imported_by = auth.uid());
