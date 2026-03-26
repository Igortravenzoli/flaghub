-- ========================================
-- Fase 2.1: Refinar roles e herança de áreas (fix)
-- ========================================

-- Remover constraint antiga que ainda aceita apenas viewer/owner
ALTER TABLE public.hub_area_members
  DROP CONSTRAINT IF EXISTS hub_area_members_area_role_check;

-- Remover tentativa anterior, se existir
ALTER TABLE public.hub_area_members
  DROP CONSTRAINT IF EXISTS hub_area_members_role_check;

-- Renomear valores legados
UPDATE public.hub_area_members
SET area_role = 'leitura'
WHERE area_role = 'viewer';

-- Atualizar default da coluna
ALTER TABLE public.hub_area_members
  ALTER COLUMN area_role SET DEFAULT 'leitura';

-- Garantir apenas os novos valores
ALTER TABLE public.hub_area_members
  ADD CONSTRAINT hub_area_members_role_check
  CHECK (area_role IN ('leitura', 'operacional', 'owner'));

-- Tabela de herança de áreas
CREATE TABLE IF NOT EXISTS public.hub_area_inheritance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_area_key text NOT NULL,
  child_area_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_area_key, child_area_key)
);

ALTER TABLE public.hub_area_inheritance ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'hub_area_inheritance'
      AND policyname = 'hub_area_inheritance_select_auth'
  ) THEN
    CREATE POLICY "hub_area_inheritance_select_auth"
    ON public.hub_area_inheritance
    FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'hub_area_inheritance'
      AND policyname = 'hub_area_inheritance_admin_all'
  ) THEN
    CREATE POLICY "hub_area_inheritance_admin_all"
    ON public.hub_area_inheritance
    FOR ALL TO authenticated
    USING (public.hub_is_admin())
    WITH CHECK (public.hub_is_admin());
  END IF;
END $$;

-- Seed inicial: HelpDesk herda Tickets
INSERT INTO public.hub_area_inheritance (parent_area_key, child_area_key)
VALUES ('helpdesk', 'tickets')
ON CONFLICT (parent_area_key, child_area_key) DO NOTHING;

-- Função com suporte à herança
CREATE OR REPLACE FUNCTION public.hub_user_has_area(p_area_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hub_area_members m
    WHERE m.user_id = (SELECT auth.uid())
      AND m.area_id = p_area_id
      AND m.is_active = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.hub_area_inheritance ai
    JOIN public.hub_areas child ON child.id = p_area_id
    JOIN public.hub_areas parent ON parent.key = ai.parent_area_key
    JOIN public.hub_area_members m ON m.area_id = parent.id
    WHERE ai.child_area_key = child.key
      AND m.user_id = (SELECT auth.uid())
      AND m.is_active = true
  );
$$;