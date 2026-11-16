-- ============================================================================
-- Verificação TM4: lançamento na TechsBCN — o que o banco garante.
--
-- Roda DEPOIS da 20261116180000_tm4_timer_lancamento (ou junto, no mesmo
-- envio, para testar sem gravar). Um único DO que termina em RAISE: nada fica
-- gravado — nem usuários, nem trechos, nem as linhas de teste em
-- devops_time_logs.
--   • "TM4 OK — ..."     → todas as asserções passaram
--   • "TM4 FALHOU: ..."  → a asserção que quebrou
--
-- As RPCs timer_lancamento_* são da edge (service role); aqui são chamadas
-- como postgres, que é o que a edge faz por elas.
-- ============================================================================
DO $$
DECLARE
  v_a     uuid := gen_random_uuid();   -- tem Timer e conta no DevOps
  v_b     uuid := gen_random_uuid();   -- tem Timer, SEM conta no DevOps
  v_guid  text := 'tm4-guid-' || gen_random_uuid()::text;
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_h0    timestamptz := (((now() AT TIME ZONE 'America/Sao_Paulo')::date)::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_t1    uuid;
  v_t2    uuid;
  v_t3    uuid;
  v_l     jsonb;
  v_l1    uuid;
  v_l2    uuid;
  v_l3    uuid;
  v_e     jsonb;
  v_n     bigint;
  v_txt   text;
  v_falhou boolean;
  v_ok    text := '';
BEGIN
  IF extract(hour FROM (now() AT TIME ZONE 'America/Sao_Paulo')) < 2 THEN
    RAISE EXCEPTION 'TM4 NÃO RODOU: rode depois das 02:00 de São Paulo';
  END IF;

  -- ---- montagem -------------------------------------------------------------
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_a, 'authenticated', 'authenticated', 'tm4.a@flag.com.br', now(), '{"provider":"azure","providers":["azure"]}', '{}', now(), now()),
    (v_b, 'authenticated', 'authenticated', 'tm4.b@flag.com.br', now(), '{"provider":"azure","providers":["azure"]}', '{}', now(), now());
  INSERT INTO public.timer_access (user_id, email, status, origem, devops_guid, devops_display)
  VALUES (v_a, 'tm4.a@flag.com.br', 'ativo', 'sso_auto', v_guid, 'Pessoa A'),
         (v_b, 'tm4.b@flag.com.br', 'ativo', 'sso_auto', NULL, NULL);

  -- hoje: item 201 = 30 + 15 min (+ 1 descartado de 40 que não conta); item 202 = 10 min
  INSERT INTO public.timer_trechos (user_id, work_item_id, work_item_titulo, work_item_tipo,
                                    iniciado_em, ultimo_sinal_em, ultima_presenca_em, encerrado_em, motivo_fim, descartado)
  VALUES
    (v_a, 201, 'Item 201', 'Task', v_h0 + interval '60 min', v_h0, v_h0, v_h0 + interval '90 min', 'manual', false),
    (v_a, 201, 'Item 201', 'Task', v_h0 + interval '95 min', v_h0, v_h0, v_h0 + interval '110 min', 'manual', false),
    (v_a, 201, 'Item 201', 'Task', v_h0 + interval '20 min', v_h0, v_h0, v_h0 + interval '60 min', 'manual', true),
    (v_a, 202, 'Item 202', 'Bug',  v_h0 + interval '115 min', v_h0, v_h0, v_h0 + interval '125 min', 'manual', false),
    -- ontem: item 201 = 20 min
    (v_a, 201, 'Item 201', 'Task', v_h0 - interval '5 hours', v_h0, v_h0, v_h0 - interval '280 min', 'manual', false);
  SELECT id INTO v_t1 FROM public.timer_trechos WHERE user_id = v_a AND iniciado_em = v_h0 + interval '60 min';
  SELECT id INTO v_t2 FROM public.timer_trechos WHERE user_id = v_a AND work_item_id = 202;

  -- ==== 1. preparar soma só o elegível ======================================
  v_l := public.timer_lancamento_preparar(v_a, v_hoje, 201, E'notas\x01do dia');
  v_l1 := (v_l->>'id')::uuid;
  IF (v_l->>'minutos')::int <> 45 THEN RAISE EXCEPTION 'TM4 FALHOU: somou % min (esperado 45)', v_l->>'minutos'; END IF;
  IF v_l->>'inicio' <> '01:00' THEN RAISE EXCEPTION 'TM4 FALHOU: início % (esperado 01:00)', v_l->>'inicio'; END IF;
  IF v_l->>'devops_user_id' <> v_guid THEN RAISE EXCEPTION 'TM4 FALHOU: userId não veio do timer_access'; END IF;
  IF v_l->>'notas' <> 'notas do dia' THEN RAISE EXCEPTION 'TM4 FALHOU: notas não foram limpas (%)', v_l->>'notas'; END IF;
  SELECT count(*) INTO v_n FROM public.timer_trechos WHERE lancamento_id = v_l1;
  IF v_n <> 2 THEN RAISE EXCEPTION 'TM4 FALHOU: % trechos presos ao lançamento (esperado 2)', v_n; END IF;

  v_falhou := false;
  BEGIN
    PERFORM public.timer_lancamento_preparar(v_a, v_hoje, 201, NULL);
  EXCEPTION WHEN invalid_parameter_value THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM4 FALHOU: lançou de novo o que já estava lançado'; END IF;
  v_ok := v_ok || 'soma ';

  -- ==== 2. trecho lançado fica travado ======================================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated', 'email', 'tm4.a@flag.com.br')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_falhou := false;
  BEGIN
    PERFORM public.timer_corrigir(v_t1, v_h0 + interval '70 min');
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    v_falhou := v_txt = 'timer_trecho_lancado';
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM4 FALHOU: encurtou trecho já lançado'; END IF;
  v_falhou := false;
  BEGIN
    PERFORM public.timer_descartar(v_t1);
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    v_falhou := v_txt = 'timer_trecho_lancado';
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM4 FALHOU: descartou trecho já lançado'; END IF;

  -- o app não chama as RPCs da edge
  FOREACH v_txt IN ARRAY ARRAY[
    format('SELECT public.timer_lancamento_preparar(%L::uuid, %L::date, 202, NULL)', v_a, v_hoje),
    format('SELECT public.timer_lancamento_resultado(%L::uuid, %L)', v_l1, 'lancado'),
    format('SELECT public.timer_lancamento_reenviar(%L::uuid, %L::uuid)', v_a, v_l1)
  ] LOOP
    v_falhou := false;
    BEGIN
      EXECUTE v_txt;
    EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
    END;
    IF NOT v_falhou THEN RAISE EXCEPTION 'TM4 FALHOU: o app executou %', v_txt; END IF;
  END LOOP;

  -- nem escreve na tabela
  v_falhou := false;
  BEGIN
    UPDATE public.timer_lancamentos SET minutos = 600 WHERE id = v_l1;
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM4 FALHOU: UPDATE direto em timer_lancamentos deveria ser negado'; END IF;
  EXECUTE 'RESET ROLE';
  v_ok := v_ok || 'trava ';

  -- ==== 3. resultado e conciliação ==========================================
  PERFORM public.timer_lancamento_resultado(v_l1, 'lancado', 'Título do DevOps');
  SELECT status INTO v_txt FROM public.timer_lancamentos WHERE id = v_l1;
  IF v_txt <> 'lancado' THEN RAISE EXCEPTION 'TM4 FALHOU: status % depois do lançamento', v_txt; END IF;

  v_falhou := false;
  BEGIN
    PERFORM public.timer_lancamento_resultado(v_l1, 'erro', NULL, 'x');
  EXCEPTION WHEN invalid_parameter_value THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM4 FALHOU: mudou o resultado de um lançamento já fechado'; END IF;

  -- o sync trouxe o documento: conferido
  INSERT INTO public.devops_time_logs (user_name, user_id_ext, work_item_id, log_date, time_minutes, ext_entry_id)
  VALUES ('Pessoa A', v_guid, 201, v_hoje, 45, v_l1::text);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated', 'email', 'tm4.a@flag.com.br')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_e := public.timer_estado();
  EXECUTE 'RESET ROLE';
  SELECT x.value INTO v_l FROM jsonb_array_elements(v_e->'lancamentos') AS x WHERE (x.value->>'id')::uuid = v_l1;
  IF v_l IS NULL OR NOT (v_l->>'conferido')::boolean OR (v_l->>'minutos_timelog')::int <> 45 THEN
    RAISE EXCEPTION 'TM4 FALHOU: estado não mostrou o lançamento conferido: %', v_l;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_e->'trechos') AS x WHERE (x.value->>'lancamento_id')::uuid = v_l1) THEN
    RAISE EXCEPTION 'TM4 FALHOU: trechos do estado sem lancamento_id';
  END IF;
  v_ok := v_ok || 'conciliacao ';

  -- ==== 4. teto do dia contando o TimeLog ===================================
  -- 45 já conciliados (não contam em dobro) + 10 novos: passa
  -- com mais 670 lançados à mão na extensão: 45 + 670 + 10 > 720 → recusa
  INSERT INTO public.devops_time_logs (user_name, user_id_ext, work_item_id, log_date, time_minutes, ext_entry_id)
  VALUES ('Pessoa A', v_guid, 999, v_hoje, 670, 'tm4-manual-' || gen_random_uuid()::text);
  v_falhou := false;
  BEGIN
    PERFORM public.timer_lancamento_preparar(v_a, v_hoje, 202, NULL);
  EXCEPTION WHEN configuration_limit_exceeded THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    v_falhou := v_txt = 'timer_teto_dia_timelog';
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM4 FALHOU: passou do teto do dia contando o TimeLog'; END IF;
  SELECT lancamento_id::text INTO v_txt FROM public.timer_trechos WHERE id = v_t2;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'TM4 FALHOU: recusa deixou trecho preso'; END IF;
  DELETE FROM public.devops_time_logs WHERE user_id_ext = v_guid AND work_item_id = 999;

  v_l := public.timer_lancamento_preparar(v_a, v_hoje, 202, NULL);
  v_l2 := (v_l->>'id')::uuid;
  IF (v_l->>'minutos')::int <> 10 THEN RAISE EXCEPTION 'TM4 FALHOU: item 202 somou %', v_l->>'minutos'; END IF;
  v_ok := v_ok || 'teto ';

  -- ==== 5. cancelado solta os trechos =======================================
  PERFORM public.timer_lancamento_resultado(v_l2, 'cancelado', NULL, 'Item removido no DevOps');
  SELECT lancamento_id::text INTO v_txt FROM public.timer_trechos WHERE id = v_t2;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'TM4 FALHOU: cancelamento não soltou o trecho'; END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated', 'email', 'tm4.a@flag.com.br')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.timer_corrigir(v_t2, v_h0 + interval '120 min');   -- volta a ser editável
  EXECUTE 'RESET ROLE';
  v_ok := v_ok || 'cancelado ';

  -- ==== 6. erro → reenvio → lançado; envio preso destrava ===================
  v_l := public.timer_lancamento_preparar(v_a, v_hoje - 1, 201, NULL);
  v_l3 := (v_l->>'id')::uuid;
  IF (v_l->>'minutos')::int <> 20 THEN RAISE EXCEPTION 'TM4 FALHOU: ontem somou %', v_l->>'minutos'; END IF;
  PERFORM public.timer_lancamento_resultado(v_l3, 'erro', NULL, 'DevOps 503');
  v_l := public.timer_lancamento_reenviar(v_a, v_l3);
  IF (v_l->>'id')::uuid <> v_l3 THEN RAISE EXCEPTION 'TM4 FALHOU: reenvio trocou o id do documento'; END IF;
  PERFORM public.timer_lancamento_resultado(v_l3, 'lancado');
  SELECT tentativas INTO v_n FROM public.timer_lancamentos WHERE id = v_l3;
  IF v_n <> 2 THEN RAISE EXCEPTION 'TM4 FALHOU: % tentativas (esperado 2)', v_n; END IF;

  v_falhou := false;
  BEGIN
    PERFORM public.timer_lancamento_reenviar(v_a, v_l3);
  EXCEPTION WHEN invalid_parameter_value THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM4 FALHOU: reenviou lançamento já lançado'; END IF;

  v_l := public.timer_lancamento_preparar(v_a, v_hoje, 202, NULL);
  v_l2 := (v_l->>'id')::uuid;
  UPDATE public.timer_lancamentos SET atualizado_em = now() - interval '20 min' WHERE id = v_l2;
  PERFORM public.timer_fechar_abandonados();
  SELECT status INTO v_txt FROM public.timer_lancamentos WHERE id = v_l2;
  IF v_txt <> 'erro' THEN RAISE EXCEPTION 'TM4 FALHOU: envio preso ficou %', v_txt; END IF;
  v_ok := v_ok || 'reenvio ';

  -- ==== 7. janela, conta e isolamento =======================================
  FOREACH v_txt IN ARRAY ARRAY[(v_hoje - 8)::text, (v_hoje + 1)::text] LOOP
    v_falhou := false;
    BEGIN
      PERFORM public.timer_lancamento_preparar(v_a, v_txt::date, 201, NULL);
    EXCEPTION WHEN invalid_parameter_value THEN v_falhou := true;
    END;
    IF NOT v_falhou THEN RAISE EXCEPTION 'TM4 FALHOU: aceitou o dia %', v_txt; END IF;
  END LOOP;

  v_falhou := false;
  BEGIN
    PERFORM public.timer_lancamento_preparar(v_b, v_hoje, 201, NULL);
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
    v_falhou := v_txt = 'timer_sem_conta_devops';
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM4 FALHOU: lançou para quem não tem conta no DevOps'; END IF;

  v_falhou := false;
  BEGIN
    PERFORM public.timer_lancamento_reenviar(v_b, v_l2);
  EXCEPTION WHEN no_data_found THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM4 FALHOU: B reenviou lançamento de A'; END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_b, 'role', 'authenticated', 'email', 'tm4.b@flag.com.br')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.timer_lancamentos WHERE user_id = v_a;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TM4 FALHOU: B leu % lançamento(s) de A', v_n; END IF;
  EXECUTE 'RESET ROLE';
  v_ok := v_ok || 'janela/isolamento ';

  -- ==== 8. trilha ===========================================================
  SELECT string_agg(DISTINCT evento, ',' ORDER BY evento) INTO v_txt
    FROM public.timer_eventos WHERE user_id = v_a AND origem = 'servidor';
  IF v_txt NOT LIKE '%lancamento_preparado%' OR v_txt NOT LIKE '%lancou%'
     OR v_txt NOT LIKE '%lancamento_erro%' OR v_txt NOT LIKE '%lancamento_cancelado%' THEN
    RAISE EXCEPTION 'TM4 FALHOU: trilha incompleta: %', v_txt;
  END IF;
  v_ok := v_ok || 'trilha ';

  RAISE EXCEPTION 'TM4 OK — % | nada foi gravado', v_ok;
END $$;
