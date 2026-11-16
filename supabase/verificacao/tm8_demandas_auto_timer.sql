-- ============================================================================
-- Verificação TM8: demandas abertas, partir (lançar sem encerrar), encerrar,
-- editar anotação e as pendências das 23:50. Um DO que termina em RAISE.
-- ============================================================================
DO $$
DECLARE
  v_a   uuid := gen_random_uuid();   -- com conta no DevOps
  v_b   uuid := gen_random_uuid();   -- sem conta no DevOps
  v_e   jsonb;
  v_id  uuid;
  v_id2 uuid;
  v_n   bigint;
  v_txt text;
  v_falhou boolean;
  v_ok  text := '';
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_a, 'authenticated', 'authenticated', 'tm8.a@flag.com.br', now(), '{"provider":"azure"}', '{}', now(), now()),
         (v_b, 'authenticated', 'authenticated', 'tm8.b@flag.com.br', now(), '{"provider":"azure"}', '{}', now(), now());
  INSERT INTO public.timer_access (user_id, email, status, origem, devops_guid)
  VALUES (v_a, 'tm8.a@flag.com.br', 'ativo', 'sso_auto', 'tm8-guid'), (v_b, 'tm8.b@flag.com.br', 'ativo', 'sso_auto', NULL);

  PERFORM set_config('request.headers', json_build_object('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0')::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- ==== demandas ============================================================
  v_e := public.timer_iniciar(601, 'Primeira', 'Task');
  v_e := public.timer_iniciar(601, 'Primeira', 'Task');
  v_e := public.timer_iniciar(602, 'Segunda', 'Bug');
  IF jsonb_array_length(v_e->'demandas') <> 2 THEN RAISE EXCEPTION 'TM8 FALHOU: % demandas abertas (esperado 2)', jsonb_array_length(v_e->'demandas'); END IF;
  SELECT count(*) INTO v_n FROM public.timer_demandas WHERE user_id = v_a AND work_item_id = 601;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM8 FALHOU: iniciar de novo duplicou a demanda'; END IF;
  v_ok := v_ok || 'demandas ';

  -- ==== partir: lança sem encerrar, relógio segue ===========================
  v_id := (v_e->'rodando'->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  UPDATE public.timer_trechos SET iniciado_em = now() - interval '25 min' WHERE id = v_id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_e := public.timer_partir();
  v_id2 := (v_e->'rodando'->>'id')::uuid;
  IF v_id2 IS NULL OR v_id2 = v_id OR (v_e->'rodando'->>'work_item_id')::int <> 602 THEN
    RAISE EXCEPTION 'TM8 FALHOU: partir não abriu a continuação no mesmo item: %', v_e->'rodando';
  END IF;
  SELECT motivo_fim INTO v_txt FROM public.timer_trechos WHERE id = v_id;
  IF v_txt IS DISTINCT FROM 'parcial' THEN RAISE EXCEPTION 'TM8 FALHOU: trecho partido fechou com %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM public.timer_eventos WHERE user_id = v_a AND evento = 'partiu';
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM8 FALHOU: partir não foi para a trilha'; END IF;
  SELECT count(*) INTO v_n FROM public.timer_demandas WHERE user_id = v_a AND encerrada_em IS NULL;
  IF v_n <> 2 THEN RAISE EXCEPTION 'TM8 FALHOU: partir encerrou demanda'; END IF;
  v_ok := v_ok || 'partir ';

  -- ==== encerrar: pausa o que roda e fecha a demanda ========================
  v_e := public.timer_demanda_encerrar(602);
  IF jsonb_typeof(v_e->'rodando') <> 'null' THEN RAISE EXCEPTION 'TM8 FALHOU: encerrar não pausou o item rodando'; END IF;
  IF jsonb_array_length(v_e->'demandas') <> 1 OR (v_e->'demandas'->0->>'work_item_id')::int <> 601 THEN
    RAISE EXCEPTION 'TM8 FALHOU: demandas depois de encerrar: %', v_e->'demandas';
  END IF;
  -- reiniciar um item encerrado abre demanda nova
  v_e := public.timer_iniciar(602, 'Segunda', 'Bug');
  SELECT count(*) INTO v_n FROM public.timer_demandas WHERE user_id = v_a AND work_item_id = 602;
  IF v_n <> 2 THEN RAISE EXCEPTION 'TM8 FALHOU: item encerrado não abriu demanda nova (% linhas)', v_n; END IF;
  v_ok := v_ok || 'encerrar ';

  -- ==== editar anotação =====================================================
  v_e := public.timer_anotar('texto antigo');
  v_id := (v_e->0->>'id')::uuid;
  v_e := public.timer_anotacao_editar(v_id, E'  texto\x01novo  ');
  IF v_e->0->>'texto' <> 'texto novo' THEN RAISE EXCEPTION 'TM8 FALHOU: edição gravou %', v_e->0->>'texto'; END IF;
  v_falhou := false;
  BEGIN PERFORM public.timer_anotacao_editar(v_id, '  '); EXCEPTION WHEN invalid_parameter_value THEN v_falhou := true; END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM8 FALHOU: aceitou texto vazio'; END IF;
  -- B não edita a de A
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  v_falhou := false;
  BEGIN PERFORM public.timer_anotacao_editar(v_id, 'invasão'); EXCEPTION WHEN no_data_found THEN v_falhou := true; END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM8 FALHOU: B editou anotação de A'; END IF;
  SELECT count(*) INTO v_n FROM public.timer_demandas WHERE user_id = v_a;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TM8 FALHOU: B leu demandas de A'; END IF;
  -- funções da edge fora do alcance do app
  v_falhou := false;
  BEGIN EXECUTE format('SELECT * FROM public.timer_auto_pendencias(%L::date)', v_hoje); EXCEPTION WHEN insufficient_privilege THEN v_falhou := true; END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM8 FALHOU: o app chamou timer_auto_pendencias'; END IF;
  EXECUTE 'RESET ROLE';
  v_ok := v_ok || 'anotacao/isolamento ';

  -- ==== 23:50: parte quem roda e lista o pendente ===========================
  -- B (sem conta no DevOps) com timer rodando: fica de fora
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.timer_iniciar(701, 'De B', 'Task');
  EXECUTE 'RESET ROLE';
  UPDATE public.timer_trechos SET iniciado_em = now() - interval '10 min' WHERE user_id = v_b AND encerrado_em IS NULL;
  UPDATE public.timer_trechos SET iniciado_em = now() - interval '10 min' WHERE user_id = v_a AND encerrado_em IS NULL;

  SELECT count(*) INTO v_n FROM public.timer_auto_pendencias(v_hoje) p WHERE p.user_id = v_a;
  IF v_n < 1 THEN RAISE EXCEPTION 'TM8 FALHOU: 23:50 não listou o pendente de A'; END IF;
  SELECT count(*) INTO v_n FROM public.timer_auto_pendencias(v_hoje) p WHERE p.user_id = v_b;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TM8 FALHOU: 23:50 listou quem não tem conta no DevOps'; END IF;
  SELECT count(*) INTO v_n FROM public.timer_trechos WHERE user_id = v_a AND motivo_fim = 'parcial';
  IF v_n < 2 THEN RAISE EXCEPTION 'TM8 FALHOU: 23:50 não partiu o timer rodando de A'; END IF;
  SELECT count(*) INTO v_n FROM public.timer_trechos WHERE user_id = v_a AND encerrado_em IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM8 FALHOU: depois do 23:50 o timer de A não seguiu rodando'; END IF;

  SELECT count(*) INTO v_n FROM cron.job WHERE jobname = 'timer-lanca-23h50' AND schedule = '50 2 * * *' AND active;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM8 FALHOU: job das 23:50 não agendado'; END IF;
  v_ok := v_ok || 'auto_23h50 ';

  RAISE EXCEPTION 'TM8 OK — % | nada foi gravado', v_ok;
END $$;
