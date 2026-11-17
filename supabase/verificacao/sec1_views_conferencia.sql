-- ============================================================================
-- Verificação SEC1 (20261117090000), parte 2 de 2: a CONFERÊNCIA pós-aplicação.
-- Só leitura (sem DDL, sem trava), ~15 s. Termina em RAISE com o resultado.
--   B) o monitor do telão lê > 0 em cada uma das quatro views;
--   C) um pendente (uuid que não existe) lê 0 em cada uma;
--   D) a anon não tem privilégio em view nenhuma do public;
--   E) nenhuma view do public sem security_invoker;
--   F) a migration está registrada.
-- ============================================================================
BEGIN READ ONLY;
SET LOCAL statement_timeout = '90s';
DO $$
DECLARE
  v_views   text[] := ARRAY['v_timelog_unified', 'v_colaborador_ausencias', 'vw_infraestrutura_kpis', 'v_horas_negocio'];
  v_view    text;
  v_monitor uuid;
  v_n       bigint;
  v_quebra  text;
  v_resumo  text := '';
BEGIN
  SELECT id INTO v_monitor FROM auth.users WHERE lower(email) = 'monitor@flag.com.br';
  IF v_monitor IS NULL THEN RAISE EXCEPTION 'SEC1 FALHOU: monitor@flag.com.br não encontrado'; END IF;

  SELECT string_agg(c.relname, ',') INTO v_quebra
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
     AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'INSERT')
          OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE'));
  IF v_quebra IS NOT NULL THEN RAISE EXCEPTION 'SEC1 FALHOU (D): a anon ainda tem privilégio em %', v_quebra; END IF;

  SELECT string_agg(c.relname, ',') INTO v_quebra
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND NOT coalesce(c.reloptions::text ~* 'security_invoker=(true|on)', false);
  IF v_quebra IS NOT NULL THEN RAISE EXCEPTION 'SEC1 FALHOU (E): sem security_invoker: %', v_quebra; END IF;

  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261117090000') THEN
    RAISE EXCEPTION 'SEC1 FALHOU (F): 20261117090000 não registrada';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_monitor, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  FOREACH v_view IN ARRAY v_views LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_view) INTO v_n;
    IF v_n = 0 THEN RAISE EXCEPTION 'SEC1 FALHOU (B): o monitor lê 0 em %', v_view; END IF;
    v_resumo := v_resumo || format('%s=%s ', v_view, v_n);
  END LOOP;

  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000beef","role":"authenticated","aud":"authenticated"}', true);
  FOREACH v_view IN ARRAY v_views LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_view) INTO v_n;
    IF v_n <> 0 THEN RAISE EXCEPTION 'SEC1 FALHOU (C): o pendente lê % linhas em %', v_n, v_view; END IF;
  END LOOP;

  RAISE EXCEPTION 'SEC1 CONFERIDA — B: monitor % | C: pendente 0 | D: anon sem views | E: todas invoker | F: registrada', v_resumo;
END $$;
