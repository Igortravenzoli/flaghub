-- ============================================================================
-- Migration: 20260428000003_fix_import_events_policy.sql
-- Purpose:   Restrict the import_events INSERT policy to `authenticated` role.
--            The previous policy applied to `public` (anon + authenticated),
--            allowing anon to attempt inserts (blocked by WITH CHECK, but
--            still reachable and causes unnecessary query plan evaluation).
--            Fixes MEDIO-3 from pentest report.
-- ============================================================================

-- Drop the overly broad INSERT policy
DROP POLICY IF EXISTS "Admin/Gestao can create import events" ON public.import_events;

-- Recreate with explicit TO authenticated
CREATE POLICY "Admin/Gestao can create import events"
ON public.import_events
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.imports i
    WHERE i.id = import_events.import_id
      AND public.is_admin_or_gestao()
      AND (
        public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.network_id = i.network_id
        )
      )
  )
);

-- Ensure anon has no direct table access (belt-and-suspenders)
REVOKE INSERT ON public.import_events FROM anon;
