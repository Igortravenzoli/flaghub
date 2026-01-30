-- Security linter remediation (focus: issues we can fix via SQL)

-- 1) Remove overly-permissive test policies on tickets (INSERT/UPDATE always true)
DROP POLICY IF EXISTS "Allow anonymous insert for testing" ON public.tickets;
DROP POLICY IF EXISTS "Allow anonymous update for testing" ON public.tickets;

-- 2) Make dashboard view use invoker privileges (prevents SECURITY DEFINER view warning)
CREATE OR REPLACE VIEW public.v_dashboard_summary
WITH (security_invoker = on)
AS
SELECT
  network_id,
  count(*) AS total_tickets,
  count(*) FILTER (WHERE severity = 'info'::ticket_severity AND inconsistency_code IS NULL) AS tickets_ok,
  count(*) FILTER (WHERE severity = 'critico'::ticket_severity) AS tickets_criticos,
  count(*) FILTER (WHERE severity = 'atencao'::ticket_severity) AS tickets_atencao,
  count(*) FILTER (WHERE has_os = false) AS tickets_sem_os,
  max(updated_at) AS last_updated
FROM public.tickets
GROUP BY network_id;

-- 3) Lock down function search_path for security definer functions flagged by the linter
ALTER FUNCTION public.get_batch_statistics(p_batch_id integer)
  SET search_path = public;

ALTER FUNCTION public.get_dashboard_summary(p_network_id integer)
  SET search_path = public;

ALTER FUNCTION public.get_recent_batches(p_network_id integer, p_limit integer)
  SET search_path = public;

ALTER FUNCTION public.get_tickets(
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
)
  SET search_path = public;

ALTER FUNCTION public.mark_tickets_inactive(p_network_id integer)
  SET search_path = public;

ALTER FUNCTION public.purge_old_inactive_tickets(p_network_id integer, p_days_threshold integer)
  SET search_path = public;
