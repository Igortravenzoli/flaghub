-- ============================================================================
-- Verificação TM10 (20261125163000): o vínculo cifrado do Timer com o Azure
-- DevOps só existe para quem tem o Timer ativo, só o service_role o alcança,
-- token em claro não entra e revogar o acesso apaga o vínculo.
--
-- ENSAIO (antes de aplicar): mandar NUMA chamada só o corpo da migration
-- seguido deste arquivo — o RAISE do fim desfaz a migration junto. Ela cria
-- objetos novos e um gatilho em public.timer_access (o CREATE TRIGGER pede
-- trava curta na tabela: rodar com `SET LOCAL lock_timeout = '3s'` na frente
-- e fora do pico). CONFERÊNCIA (depois de aplicar): este arquivo sozinho.
--   • "TM10 OK — ..."     → passou (e nada foi gravado)
--   • "TM10 FALHOU: ..."  → a asserção que quebrou
-- ============================================================================
DO $$
DECLARE
  v_a   uuid := gen_random_uuid();
  v_b   uuid := gen_random_uuid();
  v_c   uuid := gen_random_uuid();
  v_j   jsonb;
  v_n   bigint;
  v_falhou boolean;
  v_ok  text := '';
  -- cifras de mentira no formato da edge (v1.<iv 16>.<cifra 22+>)
  C1 constant text := 'v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
  C2 constant text := 'v1.CCCCCCCCCCCCCCCC.DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD';
  LER    constant text := 'public.timer_devops_token_ler(uuid)';
  GRAVAR constant text := 'public.timer_devops_token_gravar(uuid,text,text)';
  APAGAR constant text := 'public.timer_devops_token_apagar(uuid)';
BEGIN
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_a, 'authenticated', 'authenticated', 'tm10.a@flag.com.br', now(), '{"provider":"azure"}', '{}', now(), now()),
         (v_b, 'authenticated', 'authenticated', 'tm10.b@flag.com.br', now(), '{"provider":"azure"}', '{}', now(), now()),
         (v_c, 'authenticated', 'authenticated', 'tm10.c@flag.com.br', now(), '{"provider":"azure"}', '{}', now(), now());
  -- A e B com o Timer ativo; C sem linha em timer_access
  INSERT INTO public.timer_access (user_id, email, status, origem)
  VALUES (v_a, 'tm10.a@flag.com.br', 'ativo', 'sso_auto'), (v_b, 'tm10.b@flag.com.br', 'ativo', 'sso_auto');

  -- ==== quem alcança =========================================================
  IF has_table_privilege('anon', 'privado.timer_devops_token', 'SELECT')
     OR has_table_privilege('authenticated', 'privado.timer_devops_token', 'SELECT')
     OR has_table_privilege('authenticated', 'privado.timer_devops_token', 'INSERT')
     OR has_table_privilege('service_role', 'privado.timer_devops_token', 'SELECT') THEN
    RAISE EXCEPTION 'TM10 FALHOU: a API alcança a tabela direto';
  END IF;
  IF has_schema_privilege('anon', 'privado', 'USAGE') OR has_schema_privilege('authenticated', 'privado', 'USAGE') THEN
    RAISE EXCEPTION 'TM10 FALHOU: a API usa o schema privado';
  END IF;
  IF has_function_privilege('anon', LER, 'EXECUTE') OR has_function_privilege('authenticated', LER, 'EXECUTE')
     OR has_function_privilege('anon', GRAVAR, 'EXECUTE') OR has_function_privilege('authenticated', GRAVAR, 'EXECUTE')
     OR has_function_privilege('anon', APAGAR, 'EXECUTE') OR has_function_privilege('authenticated', APAGAR, 'EXECUTE') THEN
    RAISE EXCEPTION 'TM10 FALHOU: anon ou authenticated executa as funções do vínculo';
  END IF;
  IF NOT (has_function_privilege('service_role', LER, 'EXECUTE')
          AND has_function_privilege('service_role', GRAVAR, 'EXECUTE')
          AND has_function_privilege('service_role', APAGAR, 'EXECUTE')) THEN
    RAISE EXCEPTION 'TM10 FALHOU: o service_role não executa as funções do vínculo';
  END IF;
  IF has_function_privilege('authenticated', 'privado.timer_devops_token_ao_revogar()', 'EXECUTE') THEN
    RAISE EXCEPTION 'TM10 FALHOU: authenticated executa a função do gatilho';
  END IF;
  v_ok := v_ok || 'privilegios ';

  -- ==== gravar, ler, regravar (como o service_role, que é quem a edge é) =====
  EXECUTE 'SET LOCAL ROLE service_role';

  IF public.timer_devops_token_ler(v_a) IS NOT NULL THEN RAISE EXCEPTION 'TM10 FALHOU: ler sem vínculo devolveu algo'; END IF;

  PERFORM public.timer_devops_token_gravar(v_a, C1, 'sub-da-a');
  v_j := public.timer_devops_token_ler(v_a);
  IF v_j ->> 'refresh_cifrado' IS DISTINCT FROM C1 OR v_j ->> 'entra_sub' IS DISTINCT FROM 'sub-da-a' OR v_j ->> 'renovado_em' IS NULL THEN
    RAISE EXCEPTION 'TM10 FALHOU: ler não devolveu o que foi gravado: %', v_j;
  END IF;
  -- uma pessoa não lê o vínculo da outra
  IF public.timer_devops_token_ler(v_b) IS NOT NULL THEN RAISE EXCEPTION 'TM10 FALHOU: B leu vínculo sem ter'; END IF;

  -- regravação (sem sub): troca a cifra e mantém o sujeito
  PERFORM public.timer_devops_token_gravar(v_a, C2);
  v_j := public.timer_devops_token_ler(v_a);
  IF v_j ->> 'refresh_cifrado' IS DISTINCT FROM C2 OR v_j ->> 'entra_sub' IS DISTINCT FROM 'sub-da-a' THEN
    RAISE EXCEPTION 'TM10 FALHOU: regravação mexeu no que não devia: %', v_j;
  END IF;
  -- regravar sem vínculo: recusa
  v_falhou := false;
  BEGIN PERFORM public.timer_devops_token_gravar(v_b, C1);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN v_falhou := SQLERRM = 'timer_vinculo_inexistente'; END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM10 FALHOU: regravou vínculo que não existia'; END IF;
  -- vínculo novo por cima do antigo: uma linha só
  PERFORM public.timer_devops_token_gravar(v_a, C1, 'sub-da-a');
  v_ok := v_ok || 'gravar/ler/regravar ';

  -- ==== token em claro não entra ============================================
  v_falhou := false;
  BEGIN PERFORM public.timer_devops_token_gravar(v_b, '0.AXoA-token-em-claro.de-mentira-para-o-teste', 'sub-da-b');
  EXCEPTION WHEN check_violation THEN v_falhou := true; END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM10 FALHOU: aceitou token fora do formato cifrado'; END IF;
  v_falhou := false;
  BEGIN PERFORM public.timer_devops_token_gravar(v_b, C1, '   ');
  EXCEPTION WHEN check_violation THEN v_falhou := true; END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM10 FALHOU: aceitou sujeito vazio'; END IF;
  v_ok := v_ok || 'so_cifrado ';

  -- ==== sem Timer ativo, sem vínculo ========================================
  v_falhou := false;
  BEGIN PERFORM public.timer_devops_token_gravar(v_c, C1, 'sub-da-c');
  EXCEPTION WHEN SQLSTATE '42501' THEN v_falhou := SQLERRM = 'timer_sem_acesso'; END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'TM10 FALHOU: gravou vínculo de quem não tem o Timer'; END IF;
  v_ok := v_ok || 'so_com_timer ';

  -- ==== revogar apaga; apagar devolve se havia ==============================
  PERFORM public.timer_devops_token_gravar(v_b, C2, 'sub-da-b');
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_n FROM privado.timer_devops_token WHERE user_id IN (v_a, v_b);
  IF v_n <> 2 THEN RAISE EXCEPTION 'TM10 FALHOU: % vínculos (esperado 2)', v_n; END IF;

  UPDATE public.timer_access SET status = 'revogado', revogado_em = now() WHERE user_id = v_b;
  SELECT count(*) INTO v_n FROM privado.timer_devops_token WHERE user_id = v_b;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TM10 FALHOU: revogar não apagou o vínculo'; END IF;
  SELECT count(*) INTO v_n FROM privado.timer_devops_token WHERE user_id = v_a;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM10 FALHOU: revogar B mexeu no vínculo de A'; END IF;
  -- mudança que não é revogação (updated_at, e-mail) não apaga nada
  UPDATE public.timer_access SET devops_display = 'A' WHERE user_id = v_a;
  SELECT count(*) INTO v_n FROM privado.timer_devops_token WHERE user_id = v_a;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TM10 FALHOU: update comum apagou o vínculo'; END IF;

  EXECUTE 'SET LOCAL ROLE service_role';
  IF NOT public.timer_devops_token_apagar(v_a) THEN RAISE EXCEPTION 'TM10 FALHOU: apagar não achou o vínculo de A'; END IF;
  IF public.timer_devops_token_apagar(v_a) THEN RAISE EXCEPTION 'TM10 FALHOU: apagar disse que havia o que já saiu'; END IF;
  IF public.timer_devops_token_ler(v_a) IS NOT NULL THEN RAISE EXCEPTION 'TM10 FALHOU: ler depois de apagar devolveu algo'; END IF;
  EXECUTE 'RESET ROLE';
  v_ok := v_ok || 'revogar/apagar ';

  -- ==== usuário apagado leva o vínculo junto ================================
  UPDATE public.timer_access SET status = 'ativo', revogado_em = NULL WHERE user_id = v_b;
  INSERT INTO privado.timer_devops_token (user_id, refresh_cifrado, entra_sub) VALUES (v_b, C1, 'sub-da-b');
  DELETE FROM auth.users WHERE id = v_b;
  SELECT count(*) INTO v_n FROM privado.timer_devops_token WHERE user_id = v_b;
  IF v_n <> 0 THEN RAISE EXCEPTION 'TM10 FALHOU: usuário apagado deixou vínculo'; END IF;
  v_ok := v_ok || 'cascade ';

  RAISE EXCEPTION 'TM10 OK — % | nada foi gravado', v_ok;
END $$;
