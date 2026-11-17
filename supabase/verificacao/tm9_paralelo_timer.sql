-- ============================================================================
-- Verificação TM9: atividades em paralelo (troca x paralelo, teto de
-- paralelos, pausar/partir por item ou todos, sinal com a lista, teto do dia
-- somando os paralelos, job com acesso revogado). Um DO que termina em RAISE.
-- ============================================================================
DO $$
DECLARE
  v_a    uuid := gen_random_uuid();
  v_b    uuid := gen_random_uuid();
  v_e    jsonb;
  v_n    bigint;
  v_seg  numeric;
  v_txt  text;
  v_falhou boolean;
  v_ok   text := '';
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ini  timestamptz := (v_hoje::timestamp AT TIME ZONE 'America/Sao_Paulo');
BEGIN
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_a, 'authenticated', 'authenticated', 'tm9.a@flag.com.br', now(), '{"provider":"azure"}', '{}', now(), now()),
         (v_b, 'authenticated', 'authenticated', 'tm9.b@flag.com.br', now(), '{"provider":"azure"}', '{}', now(), now());
  INSERT INTO public.timer_access (user_id, email, status, origem, devops_guid)
  VALUES (v_a, 'tm9.a@flag.com.br', 'ativo', 'sso_auto', 'tm9-guid'), (v_b, 'tm9.b@flag.com.br', 'ativo', 'sso_auto', 'tm9-guid-b');

  -- ==== catálogo ============================================================
  IF to_regclass('public.uq_timer_trechos_rodando') IS NOT NULL THEN RAISE EXCEPTION 'TM9 FALHOU: índice de um-por-vez ainda existe'; END IF;
  IF to_regclass('public.uq_timer_trechos_rodando_item') IS NULL THEN RAISE EXCEPTION 'TM9 FALHOU: índice por item não existe'; END IF;
  IF to_regprocedure('public.timer_pausar(text,timestamptz)') IS NOT NULL
     OR to_regprocedure('public.timer_partir()') IS NOT NULL
     OR to_regprocedure('public.timer_iniciar(integer,text,text,text,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'TM9 FALHOU: assinatura antiga sobrou (chamada ambígua)';
  END IF;
  IF has_function_privilege('anon', 'public.timer_iniciar(integer,text,text,text,text,text,text,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.timer__partir(uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.timer__rodando_no_dia(uuid,date,uuid,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TM9 FALHOU: privilégio a mais';
  END IF;
  v_ok := v_ok || 'catalogo ';

  PERFORM set_config('request.headers', json_build_object('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0')::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- ==== paralelo x troca ====================================================
  v_e := public.timer_iniciar(801, 'Um', 'Task');
  v_e := public.timer_iniciar(802, 'Dois', 'Task', p_paralelo => true);
  IF jsonb_array_length(v_e->'rodando_todos') <> 2 THEN RAISE EXCEPTION 'TM9 FALHOU: paralelo não manteve os dois: %', v_e->'rodando_todos'; END IF;
  -- na transação o now() é fixo (os dois começam no mesmo instante): confere só
  -- que o 'rodando' (compatível) é o primeiro da lista
  IF v_e->'rodando'->>'id' IS DISTINCT FROM v_e->'rodando_todos'->0->>'id' THEN
    RAISE EXCEPTION 'TM9 FALHOU: rodando não é o primeiro de rodando_todos';
  END IF;
  -- sem p_paralelo (o app antigo): troca, fecha os dois
  v_e := public.timer_iniciar(803, 'Três', 'Bug');
  IF jsonb_array_length(v_e->'rodando_todos') <> 1 OR (v_e->'rodando'->>'work_item_id')::int <> 803 THEN
    RAISE EXCEPTION 'TM9 FALHOU: iniciar sem paralelo não trocou: %', v_e->'rodando_todos';
  END IF;
  SELECT count(*) INTO v_n FROM public.timer_trechos WHERE user_id = v_a AND motivo_fim = 'troca_tarefa';
  IF v_n <> 2 THEN RAISE EXCEPTION 'TM9 FALHOU: troca fechou % (esperado 2)', v_n; END IF;
  -- mesmo item de novo: só renova
  v_e := public.timer_iniciar(803, 'Três', 'Bug', p_paralelo => true);
  IF jsonb_array_length(v_e->'rodando_todos') <> 1 THEN RAISE EXCEPTION 'TM9 FALHOU: mesmo item duplicou'; END IF;
  v_ok := v_ok || 'paralelo/troca ';

  -- ==== teto de paralelos ===================================================
  PERFORM public.timer_iniciar(801, 'Um', 'Task', p_paralelo => true);
  v_e := public.timer_iniciar(802, 'Dois', 'Task', p_paralelo => true);
  IF jsonb_array_length(v_e->'rodando_todos') <> 3 THEN RAISE EXCEPTION 'TM9 FALHOU: não chegou a 3'; END IF;
  v_falhou := false;
  BEGIN PERFORM public.timer_iniciar(804, 'Quatro', 'Task', p_paralelo => true);
  EXCEPTION WHEN SQLSTATE '53400' THEN v_falhou := SQLERRM = 'timer_muitos_paralelos'; END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM9 FALHOU: aceitou o 4º paralelo'; END IF;
  v_ok := v_ok || 'teto_paralelos ';

  -- ==== pausar e partir por item; sinal com a lista =========================
  v_e := public.timer_pausar('manual', NULL, 801);
  IF jsonb_array_length(v_e->'rodando_todos') <> 2
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_e->'rodando_todos') x WHERE (x->>'work_item_id')::int = 801) THEN
    RAISE EXCEPTION 'TM9 FALHOU: pausar por item: %', v_e->'rodando_todos';
  END IF;
  v_e := public.timer_partir(802);
  SELECT count(*) INTO v_n FROM public.timer_trechos WHERE user_id = v_a AND motivo_fim = 'parcial';
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM9 FALHOU: partir(802) partiu % trechos', v_n; END IF;
  IF jsonb_array_length(v_e->'rodando_todos') <> 2 THEN RAISE EXCEPTION 'TM9 FALHOU: partir parou o relógio'; END IF;
  v_e := public.timer_sinal(true, true);
  IF NOT coalesce((v_e->>'resumo')::boolean, false) OR jsonb_array_length(v_e->'rodando_todos') <> 2 THEN
    RAISE EXCEPTION 'TM9 FALHOU: sinal resumo sem a lista: %', v_e;
  END IF;
  SELECT count(*) INTO v_n FROM public.timer_eventos WHERE user_id = v_a AND evento = 'confirmou_presenca';
  IF v_n <> 2 THEN RAISE EXCEPTION 'TM9 FALHOU: presença confirmada em % (esperado 2)', v_n; END IF;
  -- partir sem item (app antigo / 23:50): todos
  v_e := public.timer_partir();
  SELECT count(*) INTO v_n FROM public.timer_trechos WHERE user_id = v_a AND motivo_fim = 'parcial';
  IF v_n <> 3 THEN RAISE EXCEPTION 'TM9 FALHOU: partir() partiu % no total (esperado 3)', v_n; END IF;
  -- pausar sem item (app antigo / suspensão): todos
  v_e := public.timer_pausar('suspensao', now());
  IF jsonb_array_length(v_e->'rodando_todos') <> 0 OR jsonb_typeof(v_e->'rodando') <> 'null' THEN
    RAISE EXCEPTION 'TM9 FALHOU: pausar sem item deixou rodando';
  END IF;
  v_ok := v_ok || 'pausar/partir/sinal ';
  EXECUTE 'RESET ROLE';

  -- ==== teto do dia somando os paralelos ====================================
  -- 6 h fechadas + dois rodando há 3h30 = 13 h: um corta 1 h atrás, o outro
  -- agora; total do dia = 12 h. Só depois das 04:00 de São Paulo.
  IF now() - v_ini >= interval '4 hours' THEN
    UPDATE public.timer_trechos SET lancamento_id = NULL WHERE user_id = v_a;
    INSERT INTO public.timer_trechos (user_id, work_item_id, work_item_titulo, work_item_tipo, iniciado_em, encerrado_em, motivo_fim)
    VALUES (v_a, 901, 'Fechado', 'Task', v_ini, v_ini + interval '6 hours', 'manual');
    INSERT INTO public.timer_trechos (user_id, work_item_id, work_item_titulo, work_item_tipo, iniciado_em, ultimo_sinal_em, ultima_presenca_em)
    VALUES (v_a, 902, 'P1', 'Task', now() - interval '3 hours 30 min', now(), now()),
           (v_a, 903, 'P2', 'Task', now() - interval '3 hours 30 min', now(), now());
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_e := public.timer_estado(1);
    IF jsonb_array_length(v_e->'rodando_todos') <> 0 THEN RAISE EXCEPTION 'TM9 FALHOU: teto do dia não cortou os paralelos'; END IF;
    EXECUTE 'RESET ROLE';
    SELECT round(sum(extract(epoch FROM (encerrado_em - iniciado_em)))) INTO v_seg
      FROM public.timer_trechos WHERE user_id = v_a AND NOT descartado AND iniciado_em >= v_ini;
    IF v_seg <> 43200 THEN RAISE EXCEPTION 'TM9 FALHOU: dia somou % s (esperado 43200)', v_seg; END IF;
    SELECT count(*) INTO v_n FROM public.timer_trechos WHERE user_id = v_a AND work_item_id IN (902, 903) AND motivo_fim = 'limite_dia';
    IF v_n <> 2 THEN RAISE EXCEPTION 'TM9 FALHOU: % paralelos cortados por limite_dia (esperado 2)', v_n; END IF;
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_falhou := false;
    BEGIN PERFORM public.timer_iniciar(904, 'Depois do teto', 'Task', p_paralelo => true);
    EXCEPTION WHEN SQLSTATE '53400' THEN v_falhou := SQLERRM = 'timer_limite_dia'; END;
    IF NOT v_falhou THEN RAISE EXCEPTION 'TM9 FALHOU: iniciou depois do teto'; END IF;
    EXECUTE 'RESET ROLE';
    v_ok := v_ok || 'teto_dia ';
  ELSE
    v_ok := v_ok || '(teto_dia pulado antes das 04:00) ';
  END IF;

  -- ==== paralelo abandonado não come o teto de quem trabalha ================
  -- B: 8 h fechadas; 912 começou há 3 h e calou há 2 h (vale 1 h); 913 há
  -- 3h30, com sinal em dia. Certo: 913 corta há 30 min (8 + 1 + 3 = 12 h).
  -- Contando o calado até agora (3 h), o 913 cortaria há 2h30 — errado.
  IF now() - v_ini >= interval '4 hours' THEN
    INSERT INTO public.timer_trechos (user_id, work_item_id, work_item_titulo, work_item_tipo, iniciado_em, encerrado_em, motivo_fim)
    VALUES (v_b, 911, 'Fechado', 'Task', v_ini, v_ini + interval '8 hours', 'manual');
    INSERT INTO public.timer_trechos (user_id, work_item_id, work_item_titulo, work_item_tipo, iniciado_em, ultimo_sinal_em, ultima_presenca_em)
    VALUES (v_b, 912, 'Calado', 'Task', now() - interval '3 hours', now() - interval '2 hours', now() - interval '2 hours'),
           (v_b, 913, 'Ativo', 'Task', now() - interval '3 hours 30 min', now(), now());
    PERFORM public.timer__aplicar(v_b);
    SELECT motivo_fim INTO v_txt FROM public.timer_trechos WHERE user_id = v_b AND work_item_id = 912;
    IF v_txt IS DISTINCT FROM 'sem_sinal' THEN RAISE EXCEPTION 'TM9 FALHOU: o calado fechou com %', v_txt; END IF;
    SELECT motivo_fim || ' ' || round(extract(epoch FROM (now() - encerrado_em)) / 60) INTO v_txt
      FROM public.timer_trechos WHERE user_id = v_b AND work_item_id = 913;
    IF v_txt IS DISTINCT FROM 'limite_dia 30' THEN
      RAISE EXCEPTION 'TM9 FALHOU: quem trabalha cortou em "%" (esperado limite_dia há 30 min)', v_txt;
    END IF;
    v_ok := v_ok || 'abandonado ';
  END IF;

  -- ==== job: acesso revogado fecha todos ====================================
  DELETE FROM public.timer_trechos WHERE user_id = v_b;
  INSERT INTO public.timer_trechos (user_id, work_item_id, work_item_titulo, work_item_tipo, iniciado_em)
  VALUES (v_b, 921, 'X', 'Task', now()), (v_b, 922, 'Y', 'Task', now());
  UPDATE public.timer_access SET status = 'revogado', revogado_em = now() WHERE user_id = v_b;
  PERFORM public.timer_fechar_abandonados();
  SELECT count(*) INTO v_n FROM public.timer_trechos WHERE user_id = v_b AND motivo_fim = 'acesso_revogado';
  IF v_n <> 2 THEN RAISE EXCEPTION 'TM9 FALHOU: revogado fechou % de 2', v_n; END IF;
  v_ok := v_ok || 'job ';

  RAISE EXCEPTION 'TM9 OK — % | nada foi gravado', v_ok;
END $$;
