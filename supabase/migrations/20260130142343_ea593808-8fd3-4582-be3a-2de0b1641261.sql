-- Fix RLS so the client-side import process can write audit events and update its own import status

-- 1) Allow Admin/Gestão to UPDATE imports they created (needed to move status off 'processing')
DROP POLICY IF EXISTS "Admin can update imports" ON public.imports;

CREATE POLICY "Admin/Gestao can update own imports"
ON public.imports
FOR UPDATE
USING (
  public.is_admin()
  OR (
    public.is_admin_or_gestao()
    AND imported_by = auth.uid()
    AND network_id = public.auth_network_id()
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    public.is_admin_or_gestao()
    AND imported_by = auth.uid()
    AND network_id = public.auth_network_id()
  )
);

-- 2) Allow Admin/Gestão to INSERT into import_events for imports they own (audit log)
CREATE POLICY "Admin/Gestao can create import events"
ON public.import_events
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.imports i
    WHERE i.id = import_events.import_id
      AND public.is_admin_or_gestao()
      AND (
        public.is_admin()
        OR (i.imported_by = auth.uid() AND i.network_id = public.auth_network_id())
      )
  )
);
