
-- Allow area owners (comercial) to insert into comercial_movimentacao_clientes
CREATE POLICY "comercial_movimentacao_insert_area_owner"
ON public.comercial_movimentacao_clientes
FOR INSERT
TO authenticated
WITH CHECK (
  hub_is_admin()
  OR EXISTS (
    SELECT 1
    FROM hub_area_members m
    JOIN hub_areas a ON a.id = m.area_id
    WHERE m.user_id = (SELECT auth.uid())
      AND m.is_active = true
      AND a.key = 'comercial'
      AND m.area_role IN ('owner', 'operacional')
  )
);

-- Allow area owners (comercial) to delete from comercial_movimentacao_clientes (for purge)
CREATE POLICY "comercial_movimentacao_delete_area_owner"
ON public.comercial_movimentacao_clientes
FOR DELETE
TO authenticated
USING (
  hub_is_admin()
  OR EXISTS (
    SELECT 1
    FROM hub_area_members m
    JOIN hub_areas a ON a.id = m.area_id
    WHERE m.user_id = (SELECT auth.uid())
      AND m.is_active = true
      AND a.key = 'comercial'
      AND m.area_role IN ('owner', 'operacional')
  )
);
