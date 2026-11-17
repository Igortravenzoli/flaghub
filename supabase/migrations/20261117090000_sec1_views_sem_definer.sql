-- ============================================================================
-- SEC1 — nenhuma view do public lê como o dono, e nenhuma é da anon.
--
-- Achado da revisão de 16/11/2026: três views sem security_invoker (dono
-- postgres) furavam o RLS das tabelas de base, e a anon (só a chave pública,
-- sem login) lia todas elas:
--   v_timelog_unified        horas DevOps × VDESK (1620 linhas)
--   v_colaborador_ausencias  ausências do espelho SGSI (27 linhas)
--   vw_infraestrutura_kpis   fila da Infra
-- e, por cima da primeira, v_horas_negocio (invoker, mas lê a v_timelog_unified).
--
-- Causa: CREATE OR REPLACE VIEW sem WITH (security_invoker = true) volta a
-- view para "dono" (20260612130000 fez isso com a vw_infraestrutura_kpis); a
-- correção 20260515120000 da v_timelog_unified não vale em produção; a
-- v_colaborador_ausencias não está em migration nenhuma. E o default privilege
-- da Supabase dá ALL à anon em todo objeto novo do public.
--
-- Esta migration:
--   1) liga security_invoker nas três (o RLS das bases passa a valer para quem lê);
--   2) tira da anon TODO privilégio em TODAS as views do public (nenhuma tela lê
--      view antes do login).
-- Não mexe em tabela, função nem policy.
--
-- Prova: supabase/verificacao/sec1_views.sql (ensaio = roda o mesmo bloco e
-- desfaz no RAISE; conferência pós-aplicação = o mesmo arquivo de novo).
-- Volta: supabase/verificacao/sec1_views_volta.sql.
-- ============================================================================

ALTER VIEW public.v_timelog_unified       SET (security_invoker = true);
ALTER VIEW public.v_colaborador_ausencias SET (security_invoker = true);
ALTER VIEW public.vw_infraestrutura_kpis  SET (security_invoker = true);

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
  END LOOP;
END $$;
