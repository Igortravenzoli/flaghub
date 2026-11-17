-- ============================================================================
-- SEC4 — a anon (só a chave pública, sem login) não tem privilégio em nada do public.
--
-- Revisão de 16/11/2026: o RLS segurava sozinho 79 tabelas em que a anon podia
-- INSERT/UPDATE/DELETE por grant, 14 funções executáveis pela anon (3 SECURITY
-- DEFINER: as de IP) e o default privilege da Supabase dava ALL à anon em todo
-- objeto novo. Nenhuma tela lê ou escreve antes do login: Login e AuthCallback só
-- falam com o Auth; a edge auth-rate-limit usa a service role; useIpCheck só roda
-- com usuário (enabled: !!user).
--
-- Esta migration:
--   1) tira da anon TODO privilégio em tabelas, views e sequências do public;
--   2) nas 14 funções que estavam abertas a PUBLIC: concede explicitamente a
--      authenticated e service_role (o que elas já tinham por PUBLIC) e tira de
--      PUBLIC — e tira a anon de todas as funções do public;
--   3) objeto NOVO criado pelo postgres deixa de nascer aberto: default privileges
--      sem a anon no public e sem EXECUTE para PUBLIC em função nova.
-- authenticated e service_role não perdem nada (a verificação compara).
--
-- Prova: supabase/verificacao/sec4_anon.sql. Volta: supabase/verificacao/sec4_anon_volta.sql
-- (gerada das ACLs de 17/11 antes da aplicação).
-- ============================================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proacl IS NULL OR p.proacl::text ~ '(^|[{,])=X')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.fn);
  END LOOP;
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
