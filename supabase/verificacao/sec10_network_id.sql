-- ============================================================================
-- Verificação SEC10 (20261118120000): profiles.network_id só muda por admin / service_role.
--
-- ENSAIO: numa chamada só, (1) o corpo da migration, (2) o bloco PROVA — o RAISE do fim desfaz
-- tudo (inclusive a migration). CONFERÊNCIA pós-aplicação: só o bloco PROVA.
-- A leitura D é separada e só lê: rodar à parte, fora da chamada da DDL.
-- Usuários e rede de teste são sintéticos e somem no RAISE.
-- ============================================================================

-- ---- PROVA ------------------------------------------------------------------
DO $$
DECLARE
  v_u     uuid := gen_random_uuid();   -- conta comum, sem membership (o atacante do achado)
  v_adm   uuid := gen_random_uuid();   -- admin legado (user_roles), quem a tela /usuarios usa
  v_rede  bigint;
  v_n     bigint;
  v_ok    text := '';
  v_barrou boolean;
BEGIN
  -- A) estrutura
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'protect_profile_network_id_trigger'
                    AND tgrelid = 'public.profiles'::regclass AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'SEC10 FALHOU (A): gatilho ausente ou desligado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
                  WHERE p.proname = 'protect_profile_network_id' AND p.prosecdef
                    AND array_to_string(p.proconfig, ',') LIKE '%search_path=public%') THEN
    RAISE EXCEPTION 'SEC10 FALHOU (A): função sem SECURITY DEFINER/search_path';
  END IF;
  IF has_function_privilege('authenticated', 'public.protect_profile_network_id()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SEC10 FALHOU (A): authenticated executa a função do gatilho';
  END IF;
  v_ok := v_ok || 'A ';

  -- fixtures sintéticas
  INSERT INTO public.networks (name) VALUES ('SEC10 prova (desfeita)') RETURNING id INTO v_rede;
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_u,   'authenticated', 'authenticated', 'sec10.comum@flag.com.br', now(), '{"provider":"azure"}', '{}', now(), now()),
         (v_adm, 'authenticated', 'authenticated', 'sec10.admin@flag.com.br', now(), '{"provider":"azure"}', '{}', now(), now());
  INSERT INTO public.user_roles (user_id, role) VALUES (v_adm, 'admin');
  IF (SELECT network_id FROM public.profiles WHERE user_id = v_u) IS NOT NULL THEN
    RAISE EXCEPTION 'SEC10 FALHOU (fixture): profile novo já nasceu com rede';
  END IF;

  -- B) a conta comum NÃO troca a própria rede (o caminho do achado)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_barrou := false;
  BEGIN
    UPDATE public.profiles SET network_id = v_rede WHERE user_id = v_u;
  EXCEPTION WHEN insufficient_privilege THEN v_barrou := true;
  END;
  IF NOT v_barrou THEN RAISE EXCEPTION 'SEC10 FALHOU (B): conta comum trocou o próprio network_id'; END IF;
  -- ...mas segue editando o que é dela (nome)
  UPDATE public.profiles SET full_name = 'SEC10 Comum' WHERE user_id = v_u;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'SEC10 FALHOU (B): conta comum não conseguiu editar o próprio nome'; END IF;
  -- e continua sem ver tickets da rede de teste
  SELECT count(*) INTO v_n FROM public.tickets WHERE network_id = v_rede;
  IF v_n <> 0 THEN RAISE EXCEPTION 'SEC10 FALHOU (B): conta comum vê tickets da rede de teste'; END IF;
  EXECUTE 'RESET ROLE';
  v_ok := v_ok || 'B ';

  -- C) o admin (tela /usuarios) continua atribuindo a rede
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.profiles SET network_id = v_rede WHERE user_id = v_u;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF v_n <> 1 OR (SELECT network_id FROM public.profiles WHERE user_id = v_u) IS DISTINCT FROM v_rede THEN
    RAISE EXCEPTION 'SEC10 FALHOU (C): admin não conseguiu atribuir a rede';
  END IF;
  -- e a service_role (edges) também
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  UPDATE public.profiles SET network_id = NULL WHERE user_id = v_u;
  IF (SELECT network_id FROM public.profiles WHERE user_id = v_u) IS NOT NULL THEN
    RAISE EXCEPTION 'SEC10 FALHOU (C): service_role não conseguiu mudar a rede';
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  v_ok := v_ok || 'C ';

  RAISE EXCEPTION 'SEC10 OK (desfeito): %', v_ok;
END $$;

-- ---- LEITURA D (só lê; rodar à parte) ---------------------------------------
-- Acesso residual que a SEC10 NÃO remove: perfis com rede e sem nenhuma membership ativa
-- (ex.: os que receberam network_id = 1 em 20260204140830, ou membership revogada). Decisão do Igor.
-- SELECT p.user_id, u.email, p.network_id
--   FROM public.profiles p JOIN auth.users u ON u.id = p.user_id
--  WHERE p.network_id IS NOT NULL
--    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id AND r.role = 'admin')
--    AND NOT EXISTS (SELECT 1 FROM public.hub_user_global_roles g WHERE g.user_id = p.user_id AND g.role = 'admin')
--    AND NOT EXISTS (SELECT 1 FROM public.hub_area_members m WHERE m.user_id = p.user_id AND m.is_active);
