-- SSO Helpdesk access helpers: resolve effective network from area membership/profile
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
      COALESCE(m.network_id, p.network_id) AS effective_network_id,
      1 AS precedence
    FROM public.hub_area_members m
    JOIN public.hub_areas a ON a.id = m.area_id
    LEFT JOIN public.profiles p ON p.user_id = m.user_id
    WHERE m.user_id = auth.uid()
      AND m.is_active = true
      AND a.key = p_area_key

    UNION ALL

    SELECT
      m.area_role,
      COALESCE(m.network_id, p.network_id) AS effective_network_id,
      2 AS precedence
    FROM public.hub_area_inheritance ai
    JOIN public.hub_areas child ON child.key = ai.child_area_key
    JOIN public.hub_areas parent ON parent.key = ai.parent_area_key
    JOIN public.hub_area_members m ON m.area_id = parent.id
    LEFT JOIN public.profiles p ON p.user_id = m.user_id
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
  p_roles text[] DEFAULT ARRAY['leitura','operacional','owner']::text[]
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
      COALESCE(m.network_id, p.network_id) AS effective_network_id
    FROM public.hub_area_members m
    JOIN public.hub_areas a ON a.id = m.area_id
    LEFT JOIN public.profiles p ON p.user_id = m.user_id
    WHERE m.user_id = auth.uid()
      AND m.is_active = true
      AND a.key = p_area_key

    UNION ALL

    SELECT
      m.area_role,
      COALESCE(m.network_id, p.network_id) AS effective_network_id
    FROM public.hub_area_inheritance ai
    JOIN public.hub_areas child ON child.key = ai.child_area_key
    JOIN public.hub_areas parent ON parent.key = ai.parent_area_key
    JOIN public.hub_area_members m ON m.area_id = parent.id
    LEFT JOIN public.profiles p ON p.user_id = m.user_id
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

-- Auto-fill membership.network_id from profile on new approvals/edits
CREATE OR REPLACE FUNCTION public.hub_fill_member_network_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.network_id IS NULL THEN
    SELECT network_id INTO NEW.network_id
    FROM public.profiles
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hub_fill_member_network_id_tg ON public.hub_area_members;
CREATE TRIGGER hub_fill_member_network_id_tg
BEFORE INSERT OR UPDATE OF user_id, network_id
ON public.hub_area_members
FOR EACH ROW
EXECUTE FUNCTION public.hub_fill_member_network_id();

UPDATE public.hub_area_members ham
SET network_id = p.network_id
FROM public.profiles p
WHERE ham.user_id = p.user_id
  AND ham.network_id IS NULL
  AND p.network_id IS NOT NULL;

-- Tickets RLS: viewer can read Helpdesk data; owner can mutate/correlate/import
DROP POLICY IF EXISTS "Users can view tickets of their network" ON public.tickets;
CREATE POLICY "Users can view tickets by network or helpdesk area"
ON public.tickets
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR network_id = public.auth_network_id()
  OR public.hub_has_area_network_role('tickets_os', network_id, ARRAY['leitura','operacional','owner'])
);

DROP POLICY IF EXISTS "Users can insert tickets in their network" ON public.tickets;
CREATE POLICY "Users can insert tickets by network or helpdesk owner"
ON public.tickets
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR network_id = public.auth_network_id()
  OR public.hub_has_area_network_role('tickets_os', network_id, ARRAY['owner'])
);

DROP POLICY IF EXISTS "Users can update tickets in their network" ON public.tickets;
CREATE POLICY "Users can update tickets by network or helpdesk owner"
ON public.tickets
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR network_id = public.auth_network_id()
  OR public.hub_has_area_network_role('tickets_os', network_id, ARRAY['owner'])
)
WITH CHECK (
  public.is_admin()
  OR network_id = public.auth_network_id()
  OR public.hub_has_area_network_role('tickets_os', network_id, ARRAY['owner'])
);

-- Helpdesk summary view must respect area-based access too
CREATE OR REPLACE VIEW public.v_dashboard_summary
WITH (security_invoker=on) AS
SELECT
  t.network_id,
  COUNT(*) AS total_tickets,
  COUNT(*) FILTER (WHERE t.severity = 'critico'::ticket_severity) AS tickets_criticos,
  COUNT(*) FILTER (WHERE t.severity = 'atencao'::ticket_severity) AS tickets_atencao,
  COUNT(*) FILTER (WHERE (t.has_os = false OR t.has_os IS NULL)) AS tickets_sem_os,
  COUNT(*) FILTER (WHERE t.severity = 'info'::ticket_severity) AS tickets_ok,
  MAX(t.updated_at) AS last_updated
FROM public.tickets t
WHERE t.is_active = true
  AND (
    public.is_admin()
    OR t.network_id = public.auth_network_id()
    OR public.hub_has_area_network_role('tickets_os', t.network_id, ARRAY['leitura','operacional','owner'])
  )
GROUP BY t.network_id;

-- RPCs used by Painel Tickets need the same SSO-aware network resolution
CREATE OR REPLACE FUNCTION public.get_tickets(
  p_network_id bigint DEFAULT NULL::bigint,
  p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_internal_status internal_status DEFAULT NULL::internal_status,
  p_severity ticket_severity DEFAULT NULL::ticket_severity,
  p_has_os boolean DEFAULT NULL::boolean,
  p_search_text text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id bigint,
  network_id bigint,
  ticket_external_id text,
  ticket_type text,
  opened_at timestamp with time zone,
  external_status text,
  internal_status internal_status,
  assigned_to text,
  os_number text,
  has_os boolean,
  inconsistency_code text,
  severity ticket_severity,
  last_import_id bigint,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_network_id bigint;
  v_can_access boolean := false;
BEGIN
  v_network_id := COALESCE(
    p_network_id,
    public.auth_network_id(),
    public.hub_resolve_area_network_id('tickets_os')
  );

  IF v_network_id IS NULL THEN
    RETURN;
  END IF;

  v_can_access := public.is_admin()
    OR v_network_id = public.auth_network_id()
    OR public.hub_has_area_network_role('tickets_os', v_network_id, ARRAY['leitura','operacional','owner']);

  IF NOT v_can_access THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.network_id,
    t.ticket_external_id,
    t.ticket_type,
    t.opened_at,
    t.external_status,
    t.internal_status,
    t.assigned_to,
    t.os_number,
    t.has_os,
    t.inconsistency_code,
    t.severity,
    t.last_import_id,
    t.created_at,
    t.updated_at
  FROM public.tickets t
  WHERE t.network_id = v_network_id
    AND t.is_active = true
    AND (p_date_from IS NULL OR t.opened_at >= p_date_from)
    AND (p_date_to IS NULL OR t.opened_at <= p_date_to)
    AND (p_internal_status IS NULL OR t.internal_status = p_internal_status)
    AND (p_severity IS NULL OR t.severity = p_severity)
    AND (p_has_os IS NULL OR t.has_os = p_has_os)
    AND (
      p_search_text IS NULL
      OR t.ticket_external_id ILIKE '%' || p_search_text || '%'
      OR t.assigned_to ILIKE '%' || p_search_text || '%'
    )
  ORDER BY
    CASE t.severity
      WHEN 'critico' THEN 1
      WHEN 'atencao' THEN 2
      ELSE 3
    END,
    t.opened_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ticket_detail(p_ticket_external_id text)
RETURNS TABLE(
  id bigint,
  network_id bigint,
  ticket_external_id text,
  ticket_type text,
  opened_at timestamp with time zone,
  external_status text,
  internal_status internal_status,
  assigned_to text,
  os_number text,
  has_os boolean,
  os_found_in_vdesk boolean,
  inconsistency_code text,
  severity ticket_severity,
  raw_payload jsonb,
  vdesk_payload jsonb,
  last_os_event_at timestamp with time zone,
  last_os_event_desc text,
  last_import_id bigint,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.network_id,
    t.ticket_external_id,
    t.ticket_type,
    t.opened_at,
    t.external_status,
    t.internal_status,
    t.assigned_to,
    t.os_number,
    t.has_os,
    t.os_found_in_vdesk,
    t.inconsistency_code,
    t.severity,
    t.raw_payload,
    t.vdesk_payload,
    t.last_os_event_at,
    t.last_os_event_desc,
    t.last_import_id,
    t.created_at,
    t.updated_at
  FROM public.tickets t
  WHERE t.ticket_external_id = p_ticket_external_id
    AND (
      public.is_admin()
      OR t.network_id = public.auth_network_id()
      OR public.hub_has_area_network_role('tickets_os', t.network_id, ARRAY['leitura','operacional','owner'])
    );
END;
$$;