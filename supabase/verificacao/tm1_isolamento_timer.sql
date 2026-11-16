-- ============================================================================
-- Verifica????o TM1: quem tem S?? o Timer n??o l?? KPI e n??o se concede nada.
--
-- Roda na bancada (DEV) DEPOIS da migration 20261116130000_tm1_timer_acesso_e_eventos.
-- Tudo acontece num ??nico DO que termina em RAISE: nada fica gravado, nem
-- os usu??rios de teste. O resultado vem na mensagem do erro final:
--   ??? "TM1 OK ??? ..."     ??? todas as asser????es passaram (e nada foi gravado)
--   ??? "TM1 FALHOU: ..."  ??? a asser????o que quebrou
--
-- Fora do escopo: as tabelas que j?? est??o abertas para qualquer logado
-- (fabrica_read_entries, comercial_metas, etc.). Elas s??o da Fase 0 de RLS,
-- noutra sess??o, e valem igual para pendente, com ou sem Timer.
-- ============================================================================
DO $$
DECLARE
  v_timer   uuid := gen_random_uuid();   -- tem s?? o Timer
  v_outro   uuid := gen_random_uuid();   -- outra pessoa com Timer
  v_n       bigint;
  v_tabela  text;
  v_base    text := '';
  v_ok      text := '';
  v_falhou  boolean;
BEGIN
  -- ---- montagem, como postgres ---------------------------------------------
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_timer, 'authenticated', 'authenticated', 'tm1.timer@flag.com.br', now(), '{"provider":"azure","providers":["azure"]}', '{}', now(), now()),
    (v_outro, 'authenticated', 'authenticated', 'tm1.outro@flag.com.br', now(), '{"provider":"azure","providers":["azure"]}', '{}', now(), now());

  INSERT INTO public.timer_access (user_id, email, status, origem)
  VALUES (v_timer, 'tm1.timer@flag.com.br', 'ativo', 'sso_auto'),
         (v_outro, 'tm1.outro@flag.com.br', 'ativo', 'sso_auto');

  INSERT INTO public.timer_eventos (user_id, evento, origem) VALUES (v_outro, 'abriu', 'cliente');

  -- Linhas que existem de verdade na bancada (como postgres): sem elas, "0
  -- linhas como Timer" n??o provaria nada.
  FOREACH v_tabela IN ARRAY ARRAY[
    'devops_work_items', 'devops_time_logs', 'devops_collaborator_map', 'timelog_post_queue',
    'vdesk_clients', 'vdesk_time_logs', 'comercial_vendas', 'hub_audit_logs', 'hub_sync_runs'
  ] LOOP
    IF to_regclass('public.' || v_tabela) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', v_tabela) INTO v_n;
      v_base := v_base || format('%s=%s ', v_tabela, v_n);
    END IF;
  END LOOP;

  -- ---- vira o usu??rio que tem s?? o Timer -----------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_timer, 'role', 'authenticated', 'email', 'tm1.timer@flag.com.br')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  IF auth.uid() IS DISTINCT FROM v_timer THEN RAISE EXCEPTION 'TM1 FALHOU: auth.uid() n??o assumiu o usu??rio de teste'; END IF;
  IF NOT public.hub_has_timer() THEN RAISE EXCEPTION 'TM1 FALHOU: hub_has_timer() deveria ser true'; END IF;
  IF public.hub_is_approved() THEN RAISE EXCEPTION 'TM1 FALHOU: hub_is_approved() deveria ser false para quem tem s?? o Timer'; END IF;
  v_ok := v_ok || 'reguas ';

  -- KPI: zero linha em cada tabela guardada por hub_is_approved()
  FOREACH v_tabela IN ARRAY ARRAY[
    'devops_work_items', 'devops_time_logs', 'devops_collaborator_map', 'timelog_post_queue',
    'vdesk_clients', 'vdesk_time_logs', 'comercial_vendas', 'hub_audit_logs', 'hub_sync_runs'
  ] LOOP
    IF to_regclass('public.' || v_tabela) IS NOT NULL THEN
      BEGIN
        EXECUTE format('SELECT count(*) FROM public.%I', v_tabela) INTO v_n;
      EXCEPTION WHEN insufficient_privilege THEN
        v_n := 0;  -- sem GRANT tamb??m ?? barrado
      END;
      IF v_n <> 0 THEN
        RAISE EXCEPTION 'TM1 FALHOU: quem tem s?? o Timer leu % linha(s) de %', v_n, v_tabela;
      END IF;
    END IF;
  END LOOP;
  v_ok := v_ok || 'kpi=0 ';

  -- timer_access: s?? a pr??pria linha
  SELECT count(*) INTO v_n FROM public.timer_access;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM1 FALHOU: timer_access devolveu % linhas (esperado 1, a pr??pria)', v_n; END IF;

  -- n??o se concede nem se reativa pelo PostgREST
  v_falhou := false;
  BEGIN
    UPDATE public.timer_access SET status = 'ativo', origem = 'admin' WHERE user_id = v_timer;
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM1 FALHOU: UPDATE em timer_access deveria ser negado'; END IF;

  v_falhou := false;
  BEGIN
    INSERT INTO public.timer_access (user_id, email) VALUES (gen_random_uuid(), 'x@flag.com.br');
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM1 FALHOU: INSERT em timer_access deveria ser negado'; END IF;

  v_falhou := false;
  BEGIN
    PERFORM public.timer_revogar_acesso(v_outro, 'teste');
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM1 FALHOU: n??o-admin conseguiu revogar acesso'; END IF;
  v_ok := v_ok || 'timer_access ';

  -- timer_eventos: append-only, s?? via RPC, lista fechada, s?? os pr??prios
  v_falhou := false;
  BEGIN
    INSERT INTO public.timer_eventos (user_id, evento, origem) VALUES (v_timer, 'acesso_concedido', 'servidor');
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM1 FALHOU: INSERT direto em timer_eventos deveria ser negado'; END IF;

  v_falhou := false;
  BEGIN
    PERFORM public.timer_registrar_evento('acesso_concedido');
  EXCEPTION WHEN invalid_parameter_value THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM1 FALHOU: o cliente gravou evento fora da lista'; END IF;

  PERFORM public.timer_registrar_evento('abriu', 'web', 'windows', NULL, '{"teste":true}'::jsonb);
  SELECT count(*) INTO v_n FROM public.timer_eventos;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM1 FALHOU: timer_eventos devolveu % linhas (esperado 1, o pr??prio)', v_n; END IF;

  v_falhou := false;
  BEGIN
    DELETE FROM public.timer_eventos;
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM1 FALHOU: DELETE em timer_eventos deveria ser negado'; END IF;

  -- teto de frequ??ncia: 60 por 10 min, o 61?? ?? descartado sem erro
  FOR v_n IN 1..70 LOOP
    PERFORM public.timer_registrar_evento('janela_visivel');
  END LOOP;
  SELECT count(*) INTO v_n FROM public.timer_eventos WHERE origem = 'cliente';
  IF v_n <> 60 THEN RAISE EXCEPTION 'TM1 FALHOU: teto de eventos deixou % (esperado 60)', v_n; END IF;
  v_ok := v_ok || 'timer_eventos ';

  -- revogado perde a r??gua
  EXECUTE 'RESET ROLE';
  UPDATE public.timer_access SET status = 'revogado', revogado_em = now() WHERE user_id = v_timer;
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF public.hub_has_timer() THEN RAISE EXCEPTION 'TM1 FALHOU: revogado ainda tem hub_has_timer()'; END IF;
  v_falhou := false;
  BEGIN
    PERFORM public.timer_registrar_evento('abriu');
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM1 FALHOU: revogado ainda registra evento'; END IF;
  v_ok := v_ok || 'revogado ';

  EXECUTE 'RESET ROLE';
  RAISE EXCEPTION 'TM1 OK ??? % | linhas na bancada: % | nada foi gravado', v_ok, v_base;
END $$;
