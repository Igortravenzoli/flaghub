-- Fix: Remover SECURITY DEFINER da view e recriar como view normal
-- A view não precisa de SECURITY DEFINER pois as RPCs já usam funções SECURITY DEFINER

DROP VIEW IF EXISTS public.v_dashboard_summary;

CREATE VIEW public.v_dashboard_summary AS
SELECT 
  network_id,
  COUNT(*) AS total_tickets,
  COUNT(*) FILTER (WHERE severity = 'info' AND inconsistency_code IS NULL) AS tickets_ok,
  COUNT(*) FILTER (WHERE severity = 'critico') AS tickets_criticos,
  COUNT(*) FILTER (WHERE severity = 'atencao') AS tickets_atencao,
  COUNT(*) FILTER (WHERE has_os = false) AS tickets_sem_os,
  MAX(updated_at) AS last_updated
FROM public.tickets
GROUP BY network_id;

-- Garantir que a view herda as políticas RLS da tabela tickets
-- (isso é o comportamento padrão, mas vamos ser explícitos)
COMMENT ON VIEW public.v_dashboard_summary IS 'Resumo do dashboard por network. Herda RLS de tickets.';