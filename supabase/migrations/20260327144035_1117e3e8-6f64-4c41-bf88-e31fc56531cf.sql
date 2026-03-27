-- Fix v_dashboard_summary: tickets_ok should count tickets with OS validated OR severity = info
CREATE OR REPLACE VIEW public.v_dashboard_summary AS
SELECT 
  network_id,
  count(*) AS total_tickets,
  count(*) FILTER (WHERE severity = 'critico'::ticket_severity) AS tickets_criticos,
  count(*) FILTER (WHERE severity = 'atencao'::ticket_severity) AS tickets_atencao,
  count(*) FILTER (WHERE has_os = false OR has_os IS NULL) AS tickets_sem_os,
  count(*) FILTER (WHERE severity = 'info'::ticket_severity OR (has_os = true AND os_found_in_vdesk = true)) AS tickets_ok,
  max(updated_at) AS last_updated
FROM tickets t
WHERE is_active = true
  AND (is_admin() OR network_id = auth_network_id() OR hub_has_area_network_role('tickets_os', network_id, ARRAY['leitura','operacional','owner']))
GROUP BY network_id;

-- Fix the 86 tickets that have OS validated but wrong severity
UPDATE public.tickets
SET severity = 'info'::ticket_severity,
    inconsistency_code = NULL,
    updated_at = now()
WHERE is_active = true
  AND has_os = true
  AND os_found_in_vdesk = true
  AND severity != 'info'::ticket_severity;