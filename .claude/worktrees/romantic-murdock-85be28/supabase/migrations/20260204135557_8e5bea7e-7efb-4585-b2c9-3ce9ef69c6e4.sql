-- SECURITY FIX: Add RLS policy to v_dashboard_summary view
-- The view uses security_invoker=on but direct queries without filtering could expose aggregated statistics

-- Note: PostgreSQL views don't support RLS policies directly.
-- The view already uses security_invoker = on, which means it inherits RLS from the underlying tickets table.
-- However, we can make the view more secure by adding a WHERE clause that filters by network_id.

-- Drop and recreate the view with built-in network filtering
DROP VIEW IF EXISTS public.v_dashboard_summary;

CREATE OR REPLACE VIEW public.v_dashboard_summary
WITH (security_invoker = on, security_barrier = true)
AS
SELECT
  t.network_id,
  count(*) AS total_tickets,
  count(*) FILTER (WHERE t.severity = 'critico') AS tickets_criticos,
  count(*) FILTER (WHERE t.severity = 'atencao') AS tickets_atencao,
  count(*) FILTER (WHERE t.has_os = false OR t.has_os IS NULL) AS tickets_sem_os,
  count(*) FILTER (WHERE t.severity = 'info') AS tickets_ok,
  max(t.updated_at) AS last_updated
FROM public.tickets t
WHERE t.is_active = true
  -- Enforce network filtering at the view level
  AND (
    public.is_admin() 
    OR t.network_id = public.auth_network_id()
  )
GROUP BY t.network_id;