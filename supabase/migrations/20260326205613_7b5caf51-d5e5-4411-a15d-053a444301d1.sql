-- Resolve effective network for SSO users using either explicit profile.network_id
-- or workspace domain mapping based on auth.users.email.
CREATE OR REPLACE FUNCTION public.hub_effective_network_id(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH profile_network AS (
    SELECT p.network_id
    FROM public.profiles p
    WHERE p.user_id = p_user_id
    LIMIT 1
  ),
  domain_network AS (
    SELECT d.network_id
    FROM auth.users u
    JOIN public.domain_network_mapping d
      ON lower(split_part(u.email, '@', 2)) = lower(d.email_domain)
    WHERE u.id = p_user_id
    LIMIT 1
  )
  SELECT COALESCE(
    (SELECT network_id FROM profile_network),
    (SELECT network_id FROM domain_network)
  );
$$;

-- Fill membership.network_id automatically using the effective network.
CREATE OR REPLACE FUNCTION public.hub_fill_member_network_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.network_id IS NULL THEN
    NEW.network_id := public.hub_effective_network_id(NEW.user_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hub_fill_member_network_id ON public.hub_area_members;
CREATE TRIGGER trg_hub_fill_member_network_id
BEFORE INSERT OR UPDATE OF user_id, network_id
ON public.hub_area_members
FOR EACH ROW
EXECUTE FUNCTION public.hub_fill_member_network_id();

-- Area-network resolution must also work for SSO users whose profile network_id is still null.
CREATE OR REPLACE FUNCTION public.hub_resolve_area_network_id(p_area_key text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH memberships AS (
    SELECT
      m.area_role,
      COALESCE(m.network_id, public.hub_effective_network_id(m.user_id)) AS effective_network_id,
      1 AS precedence
    FROM public.hub_area_members m
    JOIN public.hub_areas a ON a.id = m.area_id
    WHERE m.user_id = auth.uid()
      AND m.is_active = true
      AND a.key = p_area_key

    UNION ALL

    SELECT
      m.area_role,
      COALESCE(m.network_id, public.hub_effective_network_id(m.user_id)) AS effective_network_id,
      2 AS precedence
    FROM public.hub_area_inheritance ai
    JOIN public.hub_areas child ON child.key = ai.child_area_key
    JOIN public.hub_areas parent ON parent.key = ai.parent_area_key
    JOIN public.hub_area_members m ON m.area_id = parent.id
    WHERE m.user_id = auth.uid()
      AND m.is_active = true
      AND child.key = p_area_key
  )
  SELECT effective_network_id
  FROM memberships
  WHERE effective_network_id IS NOT NULL
  ORDER BY precedence,
    CASE area_role
      WHEN 'owner' THEN 1
      WHEN 'operacional' THEN 2
      ELSE 3
    END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.hub_has_area_network_role(
  p_area_key text,
  p_network_id bigint,
  p_roles text[] DEFAULT ARRAY['leitura'::text, 'operacional'::text, 'owner'::text]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH memberships AS (
    SELECT
      m.area_role,
      COALESCE(m.network_id, public.hub_effective_network_id(m.user_id)) AS effective_network_id
    FROM public.hub_area_members m
    JOIN public.hub_areas a ON a.id = m.area_id
    WHERE m.user_id = auth.uid()
      AND m.is_active = true
      AND a.key = p_area_key

    UNION ALL

    SELECT
      m.area_role,
      COALESCE(m.network_id, public.hub_effective_network_id(m.user_id)) AS effective_network_id
    FROM public.hub_area_inheritance ai
    JOIN public.hub_areas child ON child.key = ai.child_area_key
    JOIN public.hub_areas parent ON parent.key = ai.parent_area_key
    JOIN public.hub_area_members m ON m.area_id = parent.id
    WHERE m.user_id = auth.uid()
      AND m.is_active = true
      AND child.key = p_area_key
  )
  SELECT EXISTS (
    SELECT 1
    FROM memberships
    WHERE effective_network_id = p_network_id
      AND area_role = ANY(p_roles)
  );
$$;

-- Backfill existing SSO users and memberships with the effective network.
UPDATE public.profiles p
SET network_id = public.hub_effective_network_id(p.user_id)
WHERE p.network_id IS NULL
  AND public.hub_effective_network_id(p.user_id) IS NOT NULL;

UPDATE public.hub_area_members m
SET network_id = public.hub_effective_network_id(m.user_id)
WHERE m.network_id IS NULL
  AND public.hub_effective_network_id(m.user_id) IS NOT NULL;