-- Allow users to delete CS implantação records from their own batches (for purge/reimport)
CREATE POLICY cs_impl_delete_own
ON public.cs_implantacoes_records
FOR DELETE
TO authenticated
USING (
  hub_is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.manual_import_batches b
    WHERE b.id = cs_implantacoes_records.batch_id
      AND b.imported_by = auth.uid()
  )
);

-- Allow users to delete CS fila records from their own batches
CREATE POLICY cs_fila_delete_own
ON public.cs_fila_manual_records
FOR DELETE
TO authenticated
USING (
  hub_is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.manual_import_batches b
    WHERE b.id = cs_fila_manual_records.batch_id
      AND b.imported_by = auth.uid()
  )
);