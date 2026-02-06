
-- Drop e recriar get_ticket_detail com vdesk_payload
DROP FUNCTION IF EXISTS public.get_ticket_detail(text);

CREATE FUNCTION public.get_ticket_detail(p_ticket_external_id text)
 RETURNS TABLE(id bigint, network_id bigint, ticket_external_id text, ticket_type text, opened_at timestamp with time zone, external_status text, internal_status internal_status, assigned_to text, os_number text, has_os boolean, os_found_in_vdesk boolean, inconsistency_code text, severity ticket_severity, raw_payload jsonb, vdesk_payload jsonb, last_os_event_at timestamp with time zone, last_os_event_desc text, last_import_id bigint, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND (public.is_admin() OR t.network_id = public.auth_network_id());
END;
$function$;
