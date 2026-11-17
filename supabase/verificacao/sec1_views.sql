-- ============================================================================
-- Verificação SEC1: as views param de furar o RLS sem tirar nada de quem lê.
--
-- Roda em PRODUÇÃO como ensaio, ANTES da migration 20261117090000: um único DO
-- que mede, aplica a migration por dentro, mede de novo e termina em RAISE —
-- nada fica gravado. Depois de aplicada, o mesmo arquivo é a conferência
-- (o "antes" e o "depois" saem iguais e as asserções valem do mesmo jeito).
--   • "SEC1 OK — ..."     → todas as asserções passaram (e nada foi gravado)
--   • "SEC1 FALHOU: ..."  → a asserção que quebrou
--
-- Asserções:
--   A) cada usuário aprovado (membro ativo de área ou com papel) lê, nas quatro
--      views, EXATAMENTE as mesmas linhas antes e depois (contagem exata);
--      quem perder linha aparece na mensagem — é a tela que a correção quebraria;
--   B) o monitor do telão (monitor@flag.com.br) segue lendo > 0 em cada uma;
--   C) um pendente (uuid que não existe) lê 0 em cada uma depois;
--   D) a anon não tem privilégio em view nenhuma do public;
--   E) nenhuma view do public fica sem security_invoker.
-- ============================================================================
DO $$
DECLARE
  v_views   text[] := ARRAY['v_timelog_unified', 'v_colaborador_ausencias', 'vw_infraestrutura_kpis', 'v_horas_negocio'];
  v_view    text;
  v_uid     uuid;
  v_monitor uuid;
  v_pend    uuid := '00000000-0000-4000-8000-00000000beef';
  v_n       bigint;
  v_antes   jsonb := '{}';
  v_quebra  text := '';
  v_resumo  text := '';
  v_usuarios uuid[];
  v_r       record;
BEGIN
  SELECT id INTO v_monitor FROM auth.users WHERE lower(email) = 'monitor@flag.com.br';
  IF v_monitor IS NULL THEN RAISE EXCEPTION 'SEC1 FALHOU: monitor@flag.com.br não encontrado'; END IF;

  SELECT array_agg(DISTINCT x.user_id) INTO v_usuarios
    FROM (SELECT user_id FROM public.hub_area_members WHERE is_active
          UNION SELECT user_id FROM public.user_roles) x;

  -- ---- antes: o que cada usuário lê hoje -------------------------------------
  FOREACH v_uid IN ARRAY v_usuarios LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    FOREACH v_view IN ARRAY v_views LOOP
      EXECUTE format('SELECT count(*) FROM public.%I', v_view) INTO v_n;
      v_antes := v_antes || jsonb_build_object(v_uid::text || '/' || v_view, v_n);
    END LOOP;
    EXECUTE 'RESET ROLE';
  END LOOP;

  -- ---- a migration, por dentro ------------------------------------------------
  EXECUTE 'ALTER VIEW public.v_timelog_unified       SET (security_invoker = true)';
  EXECUTE 'ALTER VIEW public.v_colaborador_ausencias SET (security_invoker = true)';
  EXECUTE 'ALTER VIEW public.vw_infraestrutura_kpis  SET (security_invoker = true)';
  FOR v_r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm') LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_r.relname);
  END LOOP;

  -- ---- A) depois: ninguém aprovado perde (nem ganha) linha --------------------
  FOREACH v_uid IN ARRAY v_usuarios LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    FOREACH v_view IN ARRAY v_views LOOP
      EXECUTE format('SELECT count(*) FROM public.%I', v_view) INTO v_n;
      IF v_n <> (v_antes ->> (v_uid::text || '/' || v_view))::bigint THEN
        v_quebra := v_quebra || format('%s/%s %s→%s; ', left(v_uid::text, 8), v_view, v_antes ->> (v_uid::text || '/' || v_view), v_n);
      END IF;
    END LOOP;
    EXECUTE 'RESET ROLE';
  END LOOP;
  IF v_quebra <> '' THEN RAISE EXCEPTION 'SEC1 FALHOU (A, usuário/view antes→depois): %', v_quebra; END IF;
  v_resumo := v_resumo || format('A: %s usuários iguais; ', array_length(v_usuarios, 1));

  -- ---- B) o telão --------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_monitor, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  FOREACH v_view IN ARRAY v_views LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_view) INTO v_n;
    IF v_n = 0 THEN RAISE EXCEPTION 'SEC1 FALHOU (B): o monitor lê 0 em %', v_view; END IF;
    v_resumo := v_resumo || format('monitor %s=%s ', v_view, v_n);
  END LOOP;
  EXECUTE 'RESET ROLE';

  -- ---- C) o pendente -------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pend, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  FOREACH v_view IN ARRAY v_views LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_view) INTO v_n;
    IF v_n <> 0 THEN RAISE EXCEPTION 'SEC1 FALHOU (C): o pendente lê % linhas em %', v_n, v_view; END IF;
  END LOOP;
  EXECUTE 'RESET ROLE';
  v_resumo := v_resumo || '; C: pendente 0; ';

  -- ---- D) a anon ------------------------------------------------------------------
  SELECT string_agg(c.relname, ',') INTO v_quebra
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
     AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'INSERT')
          OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE'));
  IF v_quebra IS NOT NULL THEN RAISE EXCEPTION 'SEC1 FALHOU (D): a anon ainda tem privilégio em %', v_quebra; END IF;

  -- ---- E) security_invoker em todas -------------------------------------------------
  SELECT string_agg(c.relname, ',') INTO v_quebra
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'v'
     AND NOT coalesce(c.reloptions::text ~* 'security_invoker=(true|on)', false);
  IF v_quebra IS NOT NULL THEN RAISE EXCEPTION 'SEC1 FALHOU (E): sem security_invoker: %', v_quebra; END IF;

  RAISE EXCEPTION 'SEC1 OK — % D: anon sem views; E: todas invoker (nada foi gravado)', v_resumo;
END $$;
