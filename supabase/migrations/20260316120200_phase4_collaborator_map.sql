-- Phase 4 — Collaborator name normalization table
--
-- Maps raw user_name strings from devops_time_logs to canonical display names.
-- Admins populate this table to consolidate differently-spelled variants of the
-- same person (e.g. "Joao Silva" → "João Silva", "j.silva@flag.pt" → "João Silva").
--
-- Lookup in useFabricaKpis: persistent map takes precedence over in-memory
-- normalizeUserName() so admins have the final say on display names.

CREATE TABLE IF NOT EXISTS public.devops_collaborator_map (
    timelog_name   text        PRIMARY KEY,   -- exact or lowercased variant from time log
    canonical_name text        NOT NULL,      -- display name shown in dashboards
    notes          text,                      -- optional admin notes (same person, typo, etc.)
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.devops_collaborator_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collab_map_select_auth" ON public.devops_collaborator_map;

-- All authenticated users can read the mapping (needed by the dashboard hook)
CREATE POLICY "collab_map_select_auth"
    ON public.devops_collaborator_map
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "collab_map_admin_mut" ON public.devops_collaborator_map;

-- Only hub area owners can insert / update / delete mappings
CREATE POLICY "collab_map_admin_mut"
    ON public.devops_collaborator_map
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM   public.hub_area_members ham
            WHERE  ham.user_id   = auth.uid()
              AND  ham.area_role = 'owner'
              AND  ham.is_active = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM   public.hub_area_members ham
            WHERE  ham.user_id   = auth.uid()
              AND  ham.area_role = 'owner'
              AND  ham.is_active = true
        )
    );
