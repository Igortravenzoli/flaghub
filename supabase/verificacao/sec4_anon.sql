-- ============================================================================
-- Verificação SEC4 (20261117110000): a anon sem nada; authenticated e service_role sem perder nada.
--
-- ENSAIO: numa chamada só, (1) o bloco FOTO abaixo, (2) o corpo da migration, (3) o bloco
-- CONFERE — o RAISE do fim desfaz tudo. CONFERÊNCIA pós-aplicação: só o CONFERE (sem a foto,
-- a comparação authenticated/service_role é pulada e o resto vale igual).
-- Só mexe em ACL (catálogo): sem trava longa em tabela.
-- ============================================================================

-- ---- FOTO (só no ensaio) ----------------------------------------------------
-- CREATE TEMP TABLE sec4_antes AS
--   SELECT r.rolname, c.oid AS obj, 'rel' AS tipo, p.priv
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
--     CROSS JOIN (VALUES ('authenticated'), ('service_role')) r(rolname)
--     CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
--    WHERE c.relkind IN ('r','p','v','m') AND has_table_privilege(r.rolname, c.oid, p.priv)
--   UNION ALL
--   SELECT r.rolname, p.oid, 'fn', 'EXECUTE'
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
--     CROSS JOIN (VALUES ('authenticated'), ('service_role')) r(rolname)
--    WHERE has_function_privilege(r.rolname, p.oid, 'EXECUTE');

-- ---- CONFERE ----------------------------------------------------------------
DO $$
DECLARE
  v_n      bigint;
  v_lista  text;
  v_resumo text := '';
BEGIN
  -- A) anon: nenhum privilégio em relação do public
  SELECT count(*), string_agg(c.relname, ',') INTO v_n, v_lista
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE c.relkind IN ('r','p','v','m','f')
     AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'INSERT')
       OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE')
       OR has_table_privilege('anon', c.oid, 'TRUNCATE'));
  IF v_n > 0 THEN RAISE EXCEPTION 'SEC4 FALHOU (A): anon ainda tem privilégio em %', left(v_lista, 300); END IF;
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE CASE WHEN c.relkind = 'S' THEN has_sequence_privilege('anon', c.oid, 'USAGE') OR has_sequence_privilege('anon', c.oid, 'UPDATE') ELSE false END;
  IF v_n > 0 THEN RAISE EXCEPTION 'SEC4 FALHOU (A): anon ainda usa % sequência(s)', v_n; END IF;
  v_resumo := v_resumo || 'A: anon sem tabela/view/sequência; ';

  -- B) anon: nenhuma função do public
  SELECT count(*), string_agg(p.proname, ',') INTO v_n, v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_n > 0 THEN RAISE EXCEPTION 'SEC4 FALHOU (B): anon ainda executa %', left(v_lista, 300); END IF;
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proacl IS NULL OR p.proacl::text ~ '(^|[{,])=X';
  IF v_n > 0 THEN RAISE EXCEPTION 'SEC4 FALHOU (B): % função(ões) ainda abertas a PUBLIC', v_n; END IF;
  v_resumo := v_resumo || 'B: anon sem função, nada aberto a PUBLIC; ';

  -- C) objeto novo não nasce aberto
  SELECT count(*) INTO v_n FROM pg_default_acl d
   WHERE d.defaclrole = 'postgres'::regrole
     AND (d.defaclnamespace = 'public'::regnamespace OR d.defaclnamespace = 0)
     AND d.defaclacl::text ~ '(^|[{,])anon=';
  IF v_n > 0 THEN RAISE EXCEPTION 'SEC4 FALHOU (C): default privilege do postgres ainda dá algo à anon'; END IF;
  SELECT count(*) INTO v_n FROM pg_default_acl d
   WHERE d.defaclrole = 'postgres'::regrole AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f'
     AND d.defaclacl::text ~ '(^|[{,])=X';
  IF v_n > 0 THEN RAISE EXCEPTION 'SEC4 FALHOU (C): função nova ainda nasce aberta a PUBLIC'; END IF;
  v_resumo := v_resumo || 'C: objeto novo do postgres sem anon e sem PUBLIC; ';

  -- D) authenticated e service_role: nada a menos (só se a foto existir)
  IF to_regclass('pg_temp.sec4_antes') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*), string_agg(rolname || ':' || tipo || ':' || priv || ':' || obj::text, ',')
        FROM pg_temp.sec4_antes a
       WHERE NOT CASE a.tipo WHEN 'rel' THEN has_table_privilege(a.rolname, a.obj, a.priv)
                             ELSE has_function_privilege(a.rolname, a.obj, 'EXECUTE') END
    $q$ INTO v_n, v_lista;
    IF v_n > 0 THEN RAISE EXCEPTION 'SEC4 FALHOU (D): authenticated/service_role perderam %: %', v_n, left(v_lista, 300); END IF;
    SELECT count(*) INTO v_n FROM pg_temp.sec4_antes;
    v_resumo := v_resumo || format('D: %s privilégios de authenticated/service_role intactos; ', v_n);
  ELSE
    v_resumo := v_resumo || 'D: pulada (sem foto); ';
  END IF;

  -- E) o que o login usa segue de pé para quem tem login
  IF NOT has_function_privilege('authenticated', 'public.hub_check_my_ip()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SEC4 FALHOU (E): authenticated perdeu hub_check_my_ip'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.hub_is_ip_allowed()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SEC4 FALHOU (E): authenticated perdeu hub_is_ip_allowed'; END IF;
  v_resumo := v_resumo || 'E: funções de IP seguem para authenticated';

  RAISE EXCEPTION 'SEC4 OK — % (nada foi gravado)', v_resumo;
END $$;
