-- ============================================================================
-- Verificação TM5: anotações do Timer. Um DO que termina em RAISE: nada
-- fica gravado.
--   • "TM5 OK — ..."     → todas as asserções passaram
--   • "TM5 FALHOU: ..."  → a asserção que quebrou
-- ============================================================================
DO $$
DECLARE
  v_a  uuid := gen_random_uuid();
  v_b  uuid := gen_random_uuid();
  v_c  uuid := gen_random_uuid();   -- sem o Timer
  v_l  jsonb;
  v_id uuid;
  v_n  bigint;
  v_txt text;
  v_falhou boolean;
  v_ok text := '';
BEGIN
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_a, 'authenticated', 'authenticated', 'tm5.a@flag.com.br', now(), '{"provider":"azure"}', '{}', now(), now()),
    (v_b, 'authenticated', 'authenticated', 'tm5.b@flag.com.br', now(), '{"provider":"azure"}', '{}', now(), now()),
    (v_c, 'authenticated', 'authenticated', 'tm5.c@flag.com.br', now(), '{"provider":"azure"}', '{}', now(), now());
  INSERT INTO public.timer_access (user_id, email, status, origem)
  VALUES (v_a, 'tm5.a@flag.com.br', 'ativo', 'sso_auto'), (v_b, 'tm5.b@flag.com.br', 'ativo', 'sso_auto');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- anotar, limpar e ordenar
  v_l := public.timer_anotar(E'  Preparar estudo\x01HNK  ');
  v_l := public.timer_anotar('Leitura RoadMAP');
  IF jsonb_array_length(v_l) <> 2 OR v_l->0->>'texto' <> 'Preparar estudo HNK' THEN
    RAISE EXCEPTION 'TM5 FALHOU: anotações %', v_l;
  END IF;
  v_id := (v_l->0->>'id')::uuid;

  v_falhou := false;
  BEGIN PERFORM public.timer_anotar('   '); EXCEPTION WHEN invalid_parameter_value THEN v_falhou := true; END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM5 FALHOU: aceitou anotação vazia'; END IF;

  v_l := public.timer_anotar(repeat('x', 300));
  IF length(v_l->2->>'texto') <> 200 THEN RAISE EXCEPTION 'TM5 FALHOU: não cortou em 200'; END IF;
  v_ok := v_ok || 'anotar ';

  -- teto de 50 abertas
  FOR i IN 1..47 LOOP PERFORM public.timer_anotar('n' || i); END LOOP;
  v_falhou := false;
  BEGIN PERFORM public.timer_anotar('51ª'); EXCEPTION WHEN configuration_limit_exceeded THEN v_falhou := true; END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM5 FALHOU: passou de 50 abertas'; END IF;
  v_ok := v_ok || 'teto ';

  -- virar item fecha e registra; apagar some
  v_l := public.timer_anotacao_fechar(v_id, 19100);
  IF jsonb_array_length(v_l) <> 49 THEN RAISE EXCEPTION 'TM5 FALHOU: fechar não tirou da lista'; END IF;
  SELECT count(*) INTO v_n FROM public.timer_eventos WHERE evento = 'anotacao_virou_item' AND work_item_id = 19100;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM5 FALHOU: virar item não foi para a trilha'; END IF;
  v_falhou := false;
  BEGIN PERFORM public.timer_anotacao_fechar(v_id); EXCEPTION WHEN no_data_found THEN v_falhou := true; END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM5 FALHOU: fechou duas vezes'; END IF;
  v_id := (v_l->0->>'id')::uuid;
  v_l := public.timer_anotacao_apagar(v_id);
  IF jsonb_array_length(v_l) <> 48 THEN RAISE EXCEPTION 'TM5 FALHOU: apagar não tirou da lista'; END IF;
  v_ok := v_ok || 'fechar/apagar ';

  -- escrita direta negada
  v_falhou := false;
  BEGIN
    INSERT INTO public.timer_anotacoes (user_id, texto) VALUES (v_a, 'x');
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM5 FALHOU: INSERT direto deveria ser negado'; END IF;

  -- B não vê nem mexe nas de A
  v_id := (v_l->0->>'id')::uuid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM public.timer_anotacoes WHERE user_id = v_a;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TM5 FALHOU: B leu % anotação(ões) de A', v_n; END IF;
  IF jsonb_array_length(public.timer_anotacoes()) <> 0 THEN RAISE EXCEPTION 'TM5 FALHOU: B listou anotações de A'; END IF;
  v_falhou := false;
  BEGIN PERFORM public.timer_anotacao_apagar(v_id); EXCEPTION WHEN no_data_found THEN v_falhou := true; END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM5 FALHOU: B apagou anotação de A'; END IF;

  -- C não tem o Timer
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  v_falhou := false;
  BEGIN PERFORM public.timer_anotar('x'); EXCEPTION WHEN insufficient_privilege THEN v_falhou := true; END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM5 FALHOU: quem não tem o Timer anotou'; END IF;

  -- interna fora do alcance
  v_falhou := false;
  BEGIN EXECUTE format('SELECT public.timer__anotacoes(%L::uuid)', v_a); EXCEPTION WHEN insufficient_privilege THEN v_falhou := true; END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM5 FALHOU: o app chamou timer__anotacoes'; END IF;
  v_ok := v_ok || 'isolamento ';

  EXECUTE 'RESET ROLE';
  RAISE EXCEPTION 'TM5 OK — % | nada foi gravado', v_ok;
END $$;
