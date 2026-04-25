-- Remove versão antiga de get_tickets que causa conflito de overload
DROP FUNCTION IF EXISTS public.get_tickets(
  p_network_id integer,
  p_date_from timestamp without time zone,
  p_date_to timestamp without time zone,
  p_internal_status text,
  p_severity text,
  p_has_os boolean,
  p_search_text text,
  p_limit integer,
  p_offset integer,
  p_include_inactive boolean
);

-- Remove também get_dashboard_summary duplicado (int4 vs int8)
DROP FUNCTION IF EXISTS public.get_dashboard_summary(p_network_id integer);