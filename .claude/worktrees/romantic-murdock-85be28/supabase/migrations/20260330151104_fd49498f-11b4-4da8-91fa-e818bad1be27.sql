
DROP FUNCTION IF EXISTS public.get_tickets(bigint, timestamp with time zone, timestamp with time zone, internal_status, ticket_severity, boolean, text, integer, integer);

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
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;
