-- ============================================================================
-- Verificação TM6: celular só consulta; rastro do dia para o admin.
-- Um DO que termina em RAISE: nada fica gravado.
--   • "TM6 OK — ..."     → todas as asserções passaram
--   • "TM6 FALHOU: ..."  → a asserção que quebrou
-- O User-Agent é simulado em request.headers, como o PostgREST faz.
-- ============================================================================
DO $$
DECLARE
  v_dev   uuid := gen_random_uuid();   -- tem o Timer
  v_adm   uuid := gen_random_uuid();   -- admin
  v_mail  text := 'tm6.dev.' || substr(gen_random_uuid()::text, 1, 8) || '@flag.com.br';
  v_h0    timestamptz := (((now() AT TIME ZONE 'America/Sao_Paulo')::date)::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_ontem date := (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1;
  v_e     jsonb;
  v_id    uuid;
  v_t     public.timer_trechos;
  v_n     bigint;
  v_txt   text;
  v_falhou boolean;
  v_ok    text := '';
  c_pc    constant text := 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';
  c_cel   constant text := 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36';
  c_ios   constant text := 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1';
BEGIN
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_dev, 'authenticated', 'authenticated', v_mail, now(), '{"provider":"azure"}', '{}', now(), now()),
    (v_adm, 'authenticated', 'authenticated', 'tm6.adm@flag.com.br', now(), '{"provider":"azure"}', '{}', now(), now());
  INSERT INTO public.timer_access (user_id, email, status, origem, devops_guid, devops_display, devops_email)
  VALUES (v_dev, v_mail, 'ativo', 'sso_auto', 'tm6-guid', 'Pessoa TM6', v_mail),
         (v_adm, 'tm6.adm@flag.com.br', 'ativo', 'sso_auto', NULL, NULL, NULL);
  INSERT INTO public.hub_user_global_roles (user_id, role) VALUES (v_adm, 'admin');

  -- ==== 1. celular não inicia ===============================================
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dev, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  FOREACH v_txt IN ARRAY ARRAY[c_cel, c_ios] LOOP
    PERFORM set_config('request.headers', json_build_object('user-agent', v_txt)::text, true);
    v_falhou := false;
    BEGIN
      PERFORM public.timer_iniciar(301, 'Item', 'Task');
    EXCEPTION WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT;
      v_falhou := v_txt = 'timer_celular';
    END;
    IF NOT v_falhou THEN RAISE EXCEPTION 'TM6 FALHOU: o celular iniciou o timer'; END IF;
  END LOOP;
  v_ok := v_ok || 'celular_nao_inicia ';

  -- ==== 2. computador inicia; celular não estende ===========================
  PERFORM set_config('request.headers', json_build_object('user-agent', c_pc)::text, true);
  v_e := public.timer_iniciar(301, 'Item', 'Task');
  v_id := (v_e->'rodando'->>'id')::uuid;
  IF v_id IS NULL THEN RAISE EXCEPTION 'TM6 FALHOU: o computador não iniciou'; END IF;
  SELECT detalhe->>'aparelho' INTO v_txt FROM public.timer_eventos WHERE entry_id = v_id AND evento = 'iniciou';
  IF v_txt IS DISTINCT FROM 'computador' THEN RAISE EXCEPTION 'TM6 FALHOU: início sem aparelho (%)', v_txt; END IF;

  EXECUTE 'RESET ROLE';
  UPDATE public.timer_trechos
     SET iniciado_em = now() - interval '50 min', ultimo_sinal_em = now() - interval '6 min',
         ultima_presenca_em = now() - interval '50 min'
   WHERE id = v_id;
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM set_config('request.headers', json_build_object('user-agent', c_cel)::text, true);
  v_e := public.timer_sinal(true);
  IF NOT coalesce((v_e->>'somente_consulta')::boolean, false) THEN
    RAISE EXCEPTION 'TM6 FALHOU: sinal do celular não veio marcado como somente consulta';
  END IF;
  SELECT * INTO v_t FROM public.timer_trechos WHERE id = v_id;
  IF v_t.ultimo_sinal_em <> now() - interval '6 min' OR v_t.ultima_presenca_em <> now() - interval '50 min' THEN
    RAISE EXCEPTION 'TM6 FALHOU: o celular estendeu o timer (sinal %, presença %)', v_t.ultimo_sinal_em, v_t.ultima_presenca_em;
  END IF;
  SELECT count(*) INTO v_n FROM public.timer_eventos WHERE user_id = v_dev AND evento = 'sinal_celular_recusado';
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM6 FALHOU: % tentativa(s) registrada(s) (esperado 1)', v_n; END IF;
  PERFORM public.timer_sinal(false);   -- sinal comum do celular em seguida: não duplica a trilha
  SELECT count(*) INTO v_n FROM public.timer_eventos WHERE user_id = v_dev AND evento = 'sinal_celular_recusado';
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM6 FALHOU: sinal comum do celular duplicou a trilha (%)', v_n; END IF;

  -- o computador estende normalmente
  PERFORM set_config('request.headers', json_build_object('user-agent', c_pc)::text, true);
  v_e := public.timer_sinal(true);
  SELECT * INTO v_t FROM public.timer_trechos WHERE id = v_id;
  IF v_t.ultima_presenca_em <> now() THEN RAISE EXCEPTION 'TM6 FALHOU: o computador não confirmou a presença'; END IF;
  SELECT detalhe->>'aparelho' INTO v_txt FROM public.timer_eventos WHERE entry_id = v_id AND evento = 'confirmou_presenca';
  IF v_txt IS DISTINCT FROM 'computador' THEN RAISE EXCEPTION 'TM6 FALHOU: presença sem aparelho'; END IF;

  -- pausar pelo celular é livre (só reduz)
  PERFORM set_config('request.headers', json_build_object('user-agent', c_cel)::text, true);
  v_e := public.timer_pausar('manual');
  IF jsonb_typeof(v_e->'rodando') <> 'null' THEN RAISE EXCEPTION 'TM6 FALHOU: o celular não conseguiu pausar'; END IF;
  v_ok := v_ok || 'celular_so_consulta ';

  -- sem User-Agent (chamada sem cabeçalho): trata como computador
  PERFORM set_config('request.headers', '', true);
  v_e := public.timer_iniciar(302, 'Outro', 'Task');
  IF v_e->'rodando' IS NULL OR jsonb_typeof(v_e->'rodando') = 'null' THEN
    RAISE EXCEPTION 'TM6 FALHOU: sem cabeçalho não iniciou';
  END IF;
  PERFORM public.timer_pausar('manual');
  EXECUTE 'RESET ROLE';

  -- ==== 3. rastro do dia ====================================================
  -- ontem: 7 h no Timer e nada no DevOps → para conferir
  INSERT INTO public.timer_trechos (user_id, work_item_id, work_item_titulo, work_item_tipo,
                                    iniciado_em, ultimo_sinal_em, ultima_presenca_em, encerrado_em, motivo_fim)
  VALUES (v_dev, 401, 'Longo', 'Task', v_h0 - interval '20 hours', v_h0, v_h0, v_h0 - interval '16 hours', 'manual'),
         (v_dev, 401, 'Longo', 'Task', v_h0 - interval '15 hours', v_h0, v_h0, v_h0 - interval '12 hours', 'manual');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.timer_admin_rastro_conferir(7) r
   WHERE r.user_id = v_dev AND r.dia = v_ontem AND r.para_conferir AND r.horas = 7;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM6 FALHOU: dia de 7 h sem rastro não ficou para conferir'; END IF;
  EXECUTE 'RESET ROLE';

  -- um commit do dia tira o destaque (o rastro conta, não o tipo)
  INSERT INTO public.devops_git_commits (repo_id, commit_id, project_name, repo_name, author_email, author_date)
  SELECT id, 'tm6' || md5(random()::text), 'tm6', 'tm6', upper(v_mail), v_h0 - interval '14 hours'
    FROM public.devops_repos LIMIT 1;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 1 THEN
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM public.timer_admin_rastro_conferir(7) r
     WHERE r.user_id = v_dev AND r.dia = v_ontem AND NOT r.para_conferir AND r.commits = 1;
    IF v_n <> 1 THEN RAISE EXCEPTION 'TM6 FALHOU: commit do dia não entrou no rastro'; END IF;
    EXECUTE 'RESET ROLE';
    v_ok := v_ok || 'rastro_commit ';
  END IF;

  -- resumo do admin traz as colunas novas
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT r.tentativas_celular INTO v_n FROM public.timer_admin_resumo(14) r WHERE r.user_id = v_dev;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM6 FALHOU: resumo com % tentativa(s) pelo celular (esperado 1)', v_n; END IF;

  -- quem não é admin não lê o rastro
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_dev, 'role', 'authenticated')::text, true);
  v_falhou := false;
  BEGIN
    PERFORM public.timer_admin_rastro_conferir(7);
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM6 FALHOU: não-admin leu o rastro'; END IF;
  v_falhou := false;
  BEGIN
    PERFORM public.timer__eh_celular('x');
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM6 FALHOU: o app chamou timer__eh_celular'; END IF;
  EXECUTE 'RESET ROLE';
  v_ok := v_ok || 'rastro/admin ';

  RAISE EXCEPTION 'TM6 OK — % | nada foi gravado', v_ok;
END $$;
