
-- Fix views to use SECURITY INVOKER (respects RLS of querying user)
ALTER VIEW public.vw_devops_queue_items SET (security_invoker = on);
ALTER VIEW public.vw_devops_work_items_hierarchy SET (security_invoker = on);
ALTER VIEW public.vw_comercial_clientes_ativos SET (security_invoker = on);
ALTER VIEW public.vw_helpdesk_kpis SET (security_invoker = on);
ALTER VIEW public.vw_customer_service_kpis SET (security_invoker = on);
ALTER VIEW public.vw_fabrica_kpis SET (security_invoker = on);
ALTER VIEW public.vw_qualidade_kpis SET (security_invoker = on);
ALTER VIEW public.vw_infraestrutura_kpis SET (security_invoker = on);
