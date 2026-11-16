-- ============================================================================
-- Verificação TM3: o relógio do Timer e as regras anti-boicote.
--
-- Roda DEPOIS da migration 20261116170000_tm3_timer_relogio (ou junto, no
-- mesmo envio, para testar sem gravar). Tudo acontece num único DO que
-- termina em RAISE: nada fica gravado, nem os usuários de teste.
--   • "TM3 OK — ..."     → todas as asserções passaram (e nada foi gravado)
--   • "TM3 FALHOU: ..."  → a asserção que quebrou
--
-- As regras puras são testadas com horários FIXOS (timer__corte recebe o
-- "agora"). O fluxo pelas RPCs usa o now() da transação e trechos
-- retroagidos; por isso só roda depois das 06:00 de São Paulo (antes disso,
-- "30 min atrás" pode cair no dia anterior e mudar o motivo esperado).
-- ============================================================================
DO $$
DECLARE
  v_a      uuid := gen_random_uuid();   -- tem o Timer
  v_b      uuid := gen_random_uuid();   -- outra pessoa com o Timer
  v_c      uuid := gen_random_uuid();   -- sem o Timer
  v_hoje0  timestamptz := (((now() AT TIME ZONE 'America/Sao_Paulo')::date)::timestamp AT TIME ZONE 'America/Sao_Paulo');
  t        public.timer_trechos;
  v_e      jsonb;
  v_id     uuid;
  v_id2    uuid;
  v_corte  timestamptz;
  v_motivo text;
  v_n      bigint;
  v_txt    text;
  v_falhou boolean;
  v_ok     text := '';
BEGIN
  IF extract(hour FROM (now() AT TIME ZONE 'America/Sao_Paulo')) < 6 THEN
    RAISE EXCEPTION 'TM3 NÃO RODOU: rode depois das 06:00 de São Paulo';
  END IF;

  -- ---- montagem, como postgres ---------------------------------------------
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_a, 'authenticated', 'authenticated', 'tm3.a@flag.com.br', now(), '{"provider":"azure","providers":["azure"]}', '{}', now(), now()),
    (v_b, 'authenticated', 'authenticated', 'tm3.b@flag.com.br', now(), '{"provider":"azure","providers":["azure"]}', '{}', now(), now()),
    (v_c, 'authenticated', 'authenticated', 'tm3.c@flag.com.br', now(), '{"provider":"azure","providers":["azure"]}', '{}', now(), now());
  INSERT INTO public.timer_access (user_id, email, status, origem)
  VALUES (v_a, 'tm3.a@flag.com.br', 'ativo', 'sso_auto'),
         (v_b, 'tm3.b@flag.com.br', 'ativo', 'sso_auto');

  -- ==== 1. regras puras, horários fixos (trecho de B em 10/11/2026) =========
  INSERT INTO public.timer_trechos (user_id, work_item_id, work_item_titulo, work_item_tipo,
                                    iniciado_em, ultimo_sinal_em, ultima_presenca_em)
  VALUES (v_b, 900, 'regra', 'Task', '2026-11-10 10:00-03', '2026-11-10 10:50-03', '2026-11-10 10:30-03')
  RETURNING id INTO v_id;

  SELECT * INTO t FROM public.timer_trechos WHERE id = v_id;
  SELECT c.corte, c.motivo INTO v_corte, v_motivo FROM public.timer__corte(t, '2026-11-10 10:55-03') c;
  IF v_corte IS NOT NULL THEN RAISE EXCEPTION 'TM3 FALHOU: trecho em dia cortou (% %)', v_corte, v_motivo; END IF;

  -- sem sinal por 15 min → fecha no último sinal
  SELECT c.corte, c.motivo INTO v_corte, v_motivo FROM public.timer__corte(t, '2026-11-10 11:06-03') c;
  IF v_motivo IS DISTINCT FROM 'sem_sinal' OR v_corte <> '2026-11-10 10:50-03' THEN
    RAISE EXCEPTION 'TM3 FALHOU: sem_sinal deu % %', v_corte, v_motivo;
  END IF;

  -- presença: dentro da tolerância segue; fora, fecha nos 60 min
  UPDATE public.timer_trechos SET ultimo_sinal_em = '2026-11-10 11:38-03' WHERE id = v_id;
  SELECT * INTO t FROM public.timer_trechos WHERE id = v_id;
  SELECT c.corte, c.motivo INTO v_corte, v_motivo FROM public.timer__corte(t, '2026-11-10 11:39-03') c;
  IF v_corte IS NOT NULL THEN RAISE EXCEPTION 'TM3 FALHOU: cortou dentro da tolerância de presença (% %)', v_corte, v_motivo; END IF;
  UPDATE public.timer_trechos SET ultimo_sinal_em = '2026-11-10 11:40-03' WHERE id = v_id;
  SELECT * INTO t FROM public.timer_trechos WHERE id = v_id;
  SELECT c.corte, c.motivo INTO v_corte, v_motivo FROM public.timer__corte(t, '2026-11-10 11:41-03') c;
  IF v_motivo IS DISTINCT FROM 'sem_confirmacao' OR v_corte <> '2026-11-10 11:30-03' THEN
    RAISE EXCEPTION 'TM3 FALHOU: sem_confirmacao deu % %', v_corte, v_motivo;
  END IF;

  -- 4 h por trecho
  UPDATE public.timer_trechos SET ultimo_sinal_em = '2026-11-10 14:05-03', ultima_presenca_em = '2026-11-10 13:50-03' WHERE id = v_id;
  SELECT * INTO t FROM public.timer_trechos WHERE id = v_id;
  SELECT c.corte, c.motivo INTO v_corte, v_motivo FROM public.timer__corte(t, '2026-11-10 14:06-03') c;
  IF v_motivo IS DISTINCT FROM 'limite_trecho' OR v_corte <> '2026-11-10 14:00-03' THEN
    RAISE EXCEPTION 'TM3 FALHOU: limite_trecho deu % %', v_corte, v_motivo;
  END IF;

  -- 12 h no dia: com 9 h já fechadas, o trecho das 10:00 corta às 13:00
  INSERT INTO public.timer_trechos (user_id, work_item_id, work_item_titulo, work_item_tipo,
                                    iniciado_em, ultimo_sinal_em, ultima_presenca_em, encerrado_em, motivo_fim)
  VALUES (v_b, 901, 'cedo', 'Task', '2026-11-10 00:30-03', '2026-11-10 09:30-03', '2026-11-10 09:30-03',
          '2026-11-10 09:30-03', 'manual')
  RETURNING id INTO v_id2;
  UPDATE public.timer_trechos SET ultimo_sinal_em = '2026-11-10 13:00-03', ultima_presenca_em = '2026-11-10 12:30-03' WHERE id = v_id;
  SELECT * INTO t FROM public.timer_trechos WHERE id = v_id;
  SELECT c.corte, c.motivo INTO v_corte, v_motivo FROM public.timer__corte(t, '2026-11-10 13:01-03') c;
  IF v_motivo IS DISTINCT FROM 'limite_dia' OR v_corte <> '2026-11-10 13:00-03' THEN
    RAISE EXCEPTION 'TM3 FALHOU: limite_dia deu % %', v_corte, v_motivo;
  END IF;
  DELETE FROM public.timer_trechos WHERE id = v_id2;

  -- virada do dia
  UPDATE public.timer_trechos
     SET iniciado_em = '2026-11-10 22:30-03', ultimo_sinal_em = '2026-11-11 00:04-03', ultima_presenca_em = '2026-11-10 23:45-03'
   WHERE id = v_id;
  SELECT * INTO t FROM public.timer_trechos WHERE id = v_id;
  SELECT c.corte, c.motivo INTO v_corte, v_motivo FROM public.timer__corte(t, '2026-11-11 00:05-03') c;
  IF v_motivo IS DISTINCT FROM 'meia_noite' OR v_corte <> '2026-11-11 00:00-03' THEN
    RAISE EXCEPTION 'TM3 FALHOU: meia_noite deu % %', v_corte, v_motivo;
  END IF;

  -- vale o corte MAIS CEDO: calado desde 23:40, o corte é 23:40, não a meia-noite
  UPDATE public.timer_trechos SET ultimo_sinal_em = '2026-11-10 23:40-03', ultima_presenca_em = '2026-11-10 23:30-03' WHERE id = v_id;
  SELECT * INTO t FROM public.timer_trechos WHERE id = v_id;
  SELECT c.corte, c.motivo INTO v_corte, v_motivo FROM public.timer__corte(t, '2026-11-11 00:10-03') c;
  IF v_motivo IS DISTINCT FROM 'sem_sinal' OR v_corte <> '2026-11-10 23:40-03' THEN
    RAISE EXCEPTION 'TM3 FALHOU: o corte mais cedo deveria ser sem_sinal 23:40, deu % %', v_corte, v_motivo;
  END IF;

  -- um rodando por pessoa
  v_falhou := false;
  BEGIN
    INSERT INTO public.timer_trechos (user_id, work_item_id, work_item_titulo, work_item_tipo)
    VALUES (v_b, 902, 'segundo', 'Task');
  EXCEPTION WHEN unique_violation THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: deixou dois timers rodando para a mesma pessoa'; END IF;
  DELETE FROM public.timer_trechos WHERE id = v_id;
  v_ok := v_ok || 'regras ';

  -- ==== 2. fluxo pelas RPCs, como A =========================================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated', 'email', 'tm3.a@flag.com.br')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_e := public.timer_estado();
  IF jsonb_typeof(v_e->'rodando') <> 'null' THEN RAISE EXCEPTION 'TM3 FALHOU: estado inicial já rodando'; END IF;
  IF (v_e->'regras'->>'sinal_seg')::int <> 300 THEN RAISE EXCEPTION 'TM3 FALHOU: regras não vieram no estado'; END IF;

  v_e := public.timer_iniciar(101, 'Tarefa A', 'Task', 'Projeto X', 'web', 'windows', NULL);
  v_id := (v_e->'rodando'->>'id')::uuid;
  IF (v_e->'rodando'->>'work_item_id')::int <> 101 THEN RAISE EXCEPTION 'TM3 FALHOU: iniciar não pôs 101 rodando'; END IF;

  v_e := public.timer_iniciar(101, 'Tarefa A', 'Task');
  IF (v_e->'rodando'->>'id')::uuid <> v_id THEN RAISE EXCEPTION 'TM3 FALHOU: iniciar o mesmo item abriu outro trecho'; END IF;

  v_e := public.timer_iniciar(102, 'Outra', 'Bug');
  IF (v_e->'rodando'->>'work_item_id')::int <> 102 THEN RAISE EXCEPTION 'TM3 FALHOU: troca não pôs 102 rodando'; END IF;
  SELECT motivo_fim INTO v_txt FROM public.timer_trechos WHERE id = v_id;
  IF v_txt IS DISTINCT FROM 'troca_tarefa' THEN RAISE EXCEPTION 'TM3 FALHOU: trecho trocado fechou com %', v_txt; END IF;
  SELECT count(*) INTO v_n FROM public.timer_trechos WHERE encerrado_em IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM3 FALHOU: % trechos rodando depois da troca', v_n; END IF;

  v_falhou := false;
  BEGIN
    PERFORM public.timer_iniciar(103, 'Épico', 'Epic');
  EXCEPTION WHEN invalid_parameter_value THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: aceitou timer num Epic'; END IF;
  v_ok := v_ok || 'iniciar/trocar ';

  -- sem sinal: retroage o trecho rodando e pede o estado
  v_id := (v_e->'rodando'->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  UPDATE public.timer_trechos
     SET iniciado_em = now() - interval '30 min', ultimo_sinal_em = now() - interval '20 min',
         ultima_presenca_em = now() - interval '25 min'
   WHERE id = v_id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_e := public.timer_estado();
  SELECT * INTO t FROM public.timer_trechos WHERE id = v_id;
  IF jsonb_typeof(v_e->'rodando') <> 'null' OR t.motivo_fim IS DISTINCT FROM 'sem_sinal'
     OR t.encerrado_em <> now() - interval '20 min' THEN
    RAISE EXCEPTION 'TM3 FALHOU: sem sinal fechou com % em %', t.motivo_fim, t.encerrado_em;
  END IF;
  v_ok := v_ok || 'sem_sinal ';

  -- presença vencida não ressuscita com o sinal
  v_e := public.timer_iniciar(103, 'Terceira', 'Task');
  v_id := (v_e->'rodando'->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  UPDATE public.timer_trechos
     SET iniciado_em = now() - interval '80 min', ultimo_sinal_em = now() - interval '1 min',
         ultima_presenca_em = now() - interval '75 min'
   WHERE id = v_id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_e := public.timer_sinal(true);
  SELECT * INTO t FROM public.timer_trechos WHERE id = v_id;
  IF jsonb_typeof(v_e->'rodando') <> 'null' OR t.motivo_fim IS DISTINCT FROM 'sem_confirmacao'
     OR t.encerrado_em <> now() - interval '15 min' THEN
    RAISE EXCEPTION 'TM3 FALHOU: presença vencida fechou com % em % (rodando=%)', t.motivo_fim, t.encerrado_em, v_e->'rodando';
  END IF;
  v_ok := v_ok || 'presenca ';

  -- pausa relatada: só para trás
  v_e := public.timer_iniciar(104, 'Quarta', 'Product Backlog Item');
  v_id := (v_e->'rodando'->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  UPDATE public.timer_trechos SET iniciado_em = now() - interval '30 min' WHERE id = v_id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_e := public.timer_pausar('ocioso', now() - interval '10 min');
  SELECT * INTO t FROM public.timer_trechos WHERE id = v_id;
  IF t.motivo_fim IS DISTINCT FROM 'ocioso' OR t.encerrado_em <> now() - interval '10 min' THEN
    RAISE EXCEPTION 'TM3 FALHOU: pausa relatada fechou com % em %', t.motivo_fim, t.encerrado_em;
  END IF;

  v_e := public.timer_iniciar(105, 'Quinta', 'Task');
  v_id2 := (v_e->'rodando'->>'id')::uuid;
  v_e := public.timer_pausar('manual', now() + interval '2 hours');
  SELECT * INTO t FROM public.timer_trechos WHERE id = v_id2;
  IF t.encerrado_em > now() THEN RAISE EXCEPTION 'TM3 FALHOU: pausa com fim no futuro acrescentou tempo'; END IF;

  v_falhou := false;
  BEGIN
    PERFORM public.timer_pausar('qualquer');
  EXCEPTION WHEN invalid_parameter_value THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: aceitou motivo de pausa fora da lista'; END IF;
  v_ok := v_ok || 'pausa ';

  -- correção: só encurta
  v_falhou := false;
  BEGIN
    PERFORM public.timer_corrigir(v_id, now() - interval '5 min');
  EXCEPTION WHEN invalid_parameter_value THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: correção aumentou o trecho'; END IF;

  v_e := public.timer_corrigir(v_id, now() - interval '20 min');
  SELECT * INTO t FROM public.timer_trechos WHERE id = v_id;
  IF t.encerrado_em <> now() - interval '20 min' OR t.encerrado_original_em <> now() - interval '10 min' THEN
    RAISE EXCEPTION 'TM3 FALHOU: correção gravou fim % (original %)', t.encerrado_em, t.encerrado_original_em;
  END IF;

  v_e := public.timer_descartar(v_id);
  SELECT descartado INTO v_falhou FROM public.timer_trechos WHERE id = v_id;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: descarte não marcou o trecho'; END IF;
  v_ok := v_ok || 'correcao/descarte ';

  -- teto do dia
  EXECUTE 'RESET ROLE';
  INSERT INTO public.timer_trechos (user_id, work_item_id, work_item_titulo, work_item_tipo,
                                    iniciado_em, ultimo_sinal_em, ultima_presenca_em, encerrado_em, motivo_fim)
  VALUES (v_a, 990, 'dia cheio', 'Task', v_hoje0, v_hoje0, v_hoje0, v_hoje0 + interval '12 hours', 'manual')
  RETURNING id INTO v_id2;
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_falhou := false;
  BEGIN
    PERFORM public.timer_iniciar(106, 'Sexta', 'Task');
  EXCEPTION WHEN configuration_limit_exceeded THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: iniciou com 12 h já no dia'; END IF;
  EXECUTE 'RESET ROLE';
  DELETE FROM public.timer_trechos WHERE id = v_id2;
  v_ok := v_ok || 'limite_dia ';

  -- virada do dia com a pessoa ativa: parte e continua
  INSERT INTO public.timer_trechos (user_id, work_item_id, work_item_titulo, work_item_tipo,
                                    iniciado_em, ultimo_sinal_em, ultima_presenca_em)
  VALUES (v_a, 107, 'Atravessa', 'Task', v_hoje0 - interval '30 min', now() - interval '1 min', now() - interval '5 min')
  RETURNING id INTO v_id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_e := public.timer_estado();
  SELECT * INTO t FROM public.timer_trechos WHERE id = v_id;
  IF t.motivo_fim IS DISTINCT FROM 'meia_noite' OR t.encerrado_em <> v_hoje0 THEN
    RAISE EXCEPTION 'TM3 FALHOU: a virada fechou com % em %', t.motivo_fim, t.encerrado_em;
  END IF;
  SELECT * INTO t FROM public.timer_trechos WHERE continuacao_de = v_id;
  IF t.id IS NULL OR t.iniciado_em <> v_hoje0 THEN RAISE EXCEPTION 'TM3 FALHOU: a virada não abriu a continuação'; END IF;
  -- depois das 06:00 a continuação já passou de 4 h (desde 00:00)
  IF t.motivo_fim IS DISTINCT FROM 'limite_trecho' THEN
    RAISE EXCEPTION 'TM3 FALHOU: a continuação deveria fechar em limite_trecho, ficou %', coalesce(t.motivo_fim, 'rodando');
  END IF;
  v_ok := v_ok || 'meia_noite ';

  -- trilha do servidor
  SELECT string_agg(DISTINCT evento, ',' ORDER BY evento) INTO v_txt
    FROM public.timer_eventos WHERE origem = 'servidor';
  IF v_txt NOT LIKE '%auto_pausa%' OR v_txt NOT LIKE '%corrigiu%' OR v_txt NOT LIKE '%descartou%'
     OR v_txt NOT LIKE '%iniciou%' OR v_txt NOT LIKE '%pausou%' OR v_txt NOT LIKE '%pausou_relato%'
     OR v_txt NOT LIKE '%trocou_tarefa%' THEN
    RAISE EXCEPTION 'TM3 FALHOU: trilha incompleta: %', v_txt;
  END IF;
  v_ok := v_ok || 'trilha ';

  -- ==== 3. isolamento ========================================================
  -- escrita direta negada para o próprio dono
  v_falhou := false;
  BEGIN
    UPDATE public.timer_trechos SET encerrado_em = now() + interval '5 hours' WHERE user_id = v_a;
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: UPDATE direto em timer_trechos deveria ser negado'; END IF;
  v_falhou := false;
  BEGIN
    INSERT INTO public.timer_trechos (user_id, work_item_id, work_item_titulo, work_item_tipo) VALUES (v_a, 1, 'x', 'Task');
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: INSERT direto em timer_trechos deveria ser negado'; END IF;
  v_falhou := false;
  BEGIN
    DELETE FROM public.timer_trechos;
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: DELETE direto em timer_trechos deveria ser negado'; END IF;

  -- funções internas e o job: fora do alcance do app
  FOREACH v_txt IN ARRAY ARRAY[
    'SELECT public.timer_fechar_abandonados()',
    format('SELECT public.timer__aplicar(%L::uuid)', v_a),
    format('SELECT public.timer__fechar(%L::uuid, now(), %L, %L::jsonb)', v_id, 'manual', '{}'),
    format('SELECT public.timer__estado(%L::uuid, 1)', v_b)
  ] LOOP
    v_falhou := false;
    BEGIN
      EXECUTE v_txt;
    EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
    END;
    IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: o app executou %', v_txt; END IF;
  END LOOP;

  v_falhou := false;
  BEGIN
    PERFORM public.timer_admin_resumo(14);
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: não-admin leu o resumo do admin'; END IF;

  -- B não vê nem mexe no que é de A
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_b, 'role', 'authenticated', 'email', 'tm3.b@flag.com.br')::text, true);
  SELECT count(*) INTO v_n FROM public.timer_trechos WHERE user_id = v_a;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TM3 FALHOU: B leu % trecho(s) de A', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.timer_eventos WHERE user_id = v_a;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TM3 FALHOU: B leu % evento(s) de A', v_n; END IF;
  v_falhou := false;
  BEGIN
    PERFORM public.timer_corrigir(v_id, now() - interval '1 day');
  EXCEPTION WHEN no_data_found THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: B corrigiu trecho de A'; END IF;
  v_falhou := false;
  BEGIN
    PERFORM public.timer_descartar(v_id);
  EXCEPTION WHEN no_data_found THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: B descartou trecho de A'; END IF;

  -- C não tem o Timer
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_c, 'role', 'authenticated', 'email', 'tm3.c@flag.com.br')::text, true);
  v_falhou := false;
  BEGIN
    PERFORM public.timer_estado();
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: quem não tem o Timer leu o estado'; END IF;
  v_falhou := false;
  BEGIN
    PERFORM public.timer_iniciar(1, 'x', 'Task');
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM3 FALHOU: quem não tem o Timer iniciou'; END IF;
  v_ok := v_ok || 'isolamento ';

  -- ==== 4. revogado: o job fecha o timer na hora ===========================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated', 'email', 'tm3.a@flag.com.br')::text, true);
  v_e := public.timer_iniciar(108, 'Revogada', 'Task');
  v_id := (v_e->'rodando'->>'id')::uuid;
  EXECUTE 'RESET ROLE';
  UPDATE public.timer_access SET status = 'revogado', revogado_em = now() WHERE user_id = v_a;
  v_n := public.timer_fechar_abandonados();
  SELECT * INTO t FROM public.timer_trechos WHERE id = v_id;
  IF t.motivo_fim IS DISTINCT FROM 'acesso_revogado' THEN
    RAISE EXCEPTION 'TM3 FALHOU: o job não fechou o timer do revogado (%)', coalesce(t.motivo_fim, 'rodando');
  END IF;
  v_ok := v_ok || 'revogado ';

  -- o job está agendado
  SELECT count(*) INTO v_n FROM cron.job WHERE jobname = 'timer-fecha-abandonados' AND active;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM3 FALHOU: job timer-fecha-abandonados não está agendado'; END IF;
  v_ok := v_ok || 'cron ';

  RAISE EXCEPTION 'TM3 OK — % | nada foi gravado', v_ok;
END $$;
