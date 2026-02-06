
CREATE OR REPLACE FUNCTION public.get_tickets(p_network_id bigint DEFAULT NULL::bigint, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_internal_status internal_status DEFAULT NULL::internal_status, p_severity ticket_severity DEFAULT NULL::ticket_severity, p_has_os boolean DEFAULT NULL::boolean, p_search_text text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id bigint, network_id bigint, ticket_external_id text, ticket_type text, opened_at timestamp with time zone, external_status text, internal_status internal_status, assigned_to text, os_number text, has_os boolean, inconsistency_code text, severity ticket_severity, last_import_id bigint, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_network_id BIGINT;
BEGIN
  IF public.is_admin() THEN
    v_network_id := COALESCE(p_network_id, public.auth_network_id());
  ELSE
    v_network_id := public.auth_network_id();
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
    AND (p_search_text IS NULL OR t.ticket_external_id ILIKE '%' || p_search_text || '%' OR t.assigned_to ILIKE '%' || p_search_text || '%')
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
