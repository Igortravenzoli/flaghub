-- Volta da SEC1 (20261117090000): devolve as três views ao modo "dono" e o
-- SELECT da anon nelas — exatamente o estado de 16/11/2026, que É a falha.
-- Só para destravar uma tela quebrada enquanto se corrige a policy da base.
-- Melhor volta parcial: só o RESET da view afetada, sem devolver nada à anon.
ALTER VIEW public.v_timelog_unified       RESET (security_invoker);
ALTER VIEW public.v_colaborador_ausencias RESET (security_invoker);
ALTER VIEW public.vw_infraestrutura_kpis  RESET (security_invoker);
-- Só se alguma coisa sem login depender delas (nada no front hoje):
-- GRANT SELECT ON public.v_timelog_unified, public.v_colaborador_ausencias,
--                 public.vw_infraestrutura_kpis, public.v_horas_negocio TO anon;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261117090000';
