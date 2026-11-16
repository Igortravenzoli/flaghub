-- ============================================================================
-- Verificação TM7: sinal enxuto. Um DO que termina em RAISE: nada gravado.
-- ============================================================================
DO $$
DECLARE
  v_u   uuid := gen_random_uuid();
  v_e   jsonb;
  v_id  uuid;
  v_ok  text := '';
BEGIN
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_u, 'authenticated', 'authenticated', 'tm7@flag.com.br', now(), '{"provider":"azure"}', '{}', now(), now());
  INSERT INTO public.timer_access (user_id, email, status, origem) VALUES (v_u, 'tm7@flag.com.br', 'ativo', 'sso_auto');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', json_build_object('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_e := public.timer_iniciar(501, 'Item', 'Task');
  v_id := (v_e->'rodando'->>'id')::uuid;

  -- nada mudou: resumo, sem trechos
  v_e := public.timer_sinal(false, true);
  IF NOT coalesce((v_e->>'resumo')::boolean, false) OR v_e ? 'trechos' OR (v_e->'rodando'->>'id')::uuid <> v_id THEN
    RAISE EXCEPTION 'TM7 FALHOU: sinal sem mudança não veio enxuto: %', v_e;
  END IF;
  -- presença também pode vir enxuta e grava a presença
  v_e := public.timer_sinal(true, true);
  IF NOT coalesce((v_e->>'resumo')::boolean, false) THEN RAISE EXCEPTION 'TM7 FALHOU: presença não veio enxuta'; END IF;
  -- sem p_resumo: completo (app antigo)
  v_e := public.timer_sinal(true);
  IF NOT v_e ? 'trechos' THEN RAISE EXCEPTION 'TM7 FALHOU: sem p_resumo não veio completo'; END IF;
  v_ok := v_ok || 'resumo ';

  -- as regras cortaram: completo, mesmo pedindo resumo
  EXECUTE 'RESET ROLE';
  UPDATE public.timer_trechos
     SET iniciado_em = now() - interval '40 min', ultimo_sinal_em = now() - interval '20 min',
         ultima_presenca_em = now() - interval '30 min'
   WHERE id = v_id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_e := public.timer_sinal(false, true);
  IF coalesce((v_e->>'resumo')::boolean, false) OR NOT v_e ? 'trechos' OR jsonb_typeof(v_e->'rodando') <> 'null' THEN
    RAISE EXCEPTION 'TM7 FALHOU: corte das regras não devolveu o estado completo: %', v_e;
  END IF;
  -- nada rodando: completo
  v_e := public.timer_sinal(false, true);
  IF NOT v_e ? 'trechos' THEN RAISE EXCEPTION 'TM7 FALHOU: sem timer rodando não veio completo'; END IF;
  v_ok := v_ok || 'completo_quando_muda ';

  EXECUTE 'RESET ROLE';
  RAISE EXCEPTION 'TM7 OK — % | nada foi gravado', v_ok;
END $$;
