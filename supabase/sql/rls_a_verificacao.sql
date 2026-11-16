-- =============================================================================
-- RLS-A — verificação em bancada (transação SEMPRE desfeita pelo RAISE final).
-- Em 16/11/2026 o DEV (onpdhywrzjtwxaxuvijw) estava pausado e, com o "pode"
-- do Igor, a bancada rodou em PRODUÇÃO dentro da transação desfeita: 41
-- funções, 10 tabelas, 0 falha. Nada fica — a chamada termina em erro.
--
-- Roda numa ÚNICA chamada de `database/query`, que é uma transação implícita:
--   1. supabase/sql/rls_a_bancada_preparo.sql  (pessoas sintéticas)
--   2. a migration 20261116120000_rls_fechar_falhas_aprovacao.sql — DUAS vezes
--      (a 2ª prova a idempotência)
--   3. este arquivo
-- e termina em RAISE EXCEPTION 'RESULTADO {json}': tudo é desfeito e o
-- resultado chega na mensagem de erro. Sem o RAISE final nada fica — mas
-- confira depois com to_regprocedure('public.hub_assert_approved()') IS NULL.
--
-- Pessoas sintéticas (criadas pelo preparo, somem no rollback):
--   pendente   — logado, sem membership ativa (o caso do SSO recém-chegado)
--   aprovado   — membership ativa `leitura` na Qualidade
--   comercial  — owner ativo do Comercial
--   ex_owner   — owner da Fábrica com a membership DESATIVADA
--   owner_fab  — owner ativo da Fábrica
--   anon       — papel anon, sem usuário
-- =============================================================================

DO $verif$
DECLARE
  c_pendente  constant uuid := '00000000-0000-4000-a000-00000000a001';
  c_aprovado  constant uuid := '00000000-0000-4000-a000-00000000a002';
  c_comercial constant uuid := '00000000-0000-4000-a000-00000000a003';
  c_ex_owner  constant uuid := '00000000-0000-4000-a000-00000000a004';
  c_owner_fab constant uuid := '00000000-0000-4000-a000-00000000a005';
  c_marca     constant text := '-- RLS-A guard';

  v_tabelas text[] := ARRAY[
    'fabrica_read_entries', 'comercial_metas', 'sprint_indicator_snapshots',
    'devops_projects', 'devops_repos', 'comercial_funil',
    'comercial_funil_lancamentos', 'comercial_produtos',
    'fabrica_squad_membership', 'devops_tag_dicionario'];

  v_leitura text[] := ARRAY[
    'rpc_qa_atemporal_summary', 'rpc_qa_encerramentos_por_usuario',
    'rpc_qa_closed_por_sprint_periodo', 'rpc_qa_items_atemporal',
    'rpc_qa_handoff_histogram', 'rpc_get_sprint_historical_v2',
    'rpc_qa_historical_series', 'rpc_get_sprint_daily_progress',
    'rpc_transbordo_elegiveis', 'rpc_transbordo_historico', 'rpc_transbordo_contexto',
    'rpc_qa_return_open_items', 'rpc_qa_exec_fila_aging',
    'rpc_qa_exec_retornos_distribuicao', 'rpc_gerencial_qa_items',
    'rpc_gerencial_qa_summary', 'rpc_get_sprint_historical',
    'rpc_list_sprint_snapshots', 'rpc_compare_sprint_snapshots',
    'rpc_get_sprint_retrospective', 'rpc_list_all_sprints_2026',
    'rpc_compare_multiple_sprints_2026', 'rpc_sprint_annual_timeline',
    'rpc_devops_timelog_agg', 'rpc_feature_pbi_summary', 'rpc_pbi_health_overview',
    'rpc_pbi_bottleneck_summary', 'rpc_gerencial_fabrica_summary',
    'rpc_qa_desempenho_responsavel', 'rpc_qa_return_by_assignee',
    'rpc_qa_return_by_sprint', 'rpc_qa_return_summary',
    'get_recent_batches', 'get_batch_statistics', 'rpc_devops_repo_classificar'];
  v_comercial text[] := ARRAY[
    'insert_movimentacao_comercial', 'update_movimentacao_comercial', 'delete_movimentacao_comercial'];
  v_admin text[] := ARRAY['sync_qa_return_count_from_events', 'compute_pbi_health_all'];

  r          record;
  v_t        text;
  v_n        bigint;
  v_estado   text;
  v_falhas   text[] := '{}';
  v_tab_json jsonb := '{}';
  v_rpc_json jsonb := '{}';
  v_extra    jsonb := '{}';
  v_injetadas int := 0;
  v_ausentes text[] := '{}';
BEGIN
  -- ── Helpers locais ─────────────────────────────────────────────────────────
  -- Entra como `quem` (uuid ou NULL=anon) com os claims que o PostgREST poria.
  CREATE OR REPLACE FUNCTION pg_temp.como(p_quem uuid, p_papel text DEFAULT NULL)
  RETURNS void LANGUAGE plpgsql AS $f$
  DECLARE v_role text := coalesce(p_papel, CASE WHEN p_quem IS NULL THEN 'anon' ELSE 'authenticated' END);
  BEGIN
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('role', v_role, 'sub', p_quem)::text, true);
    PERFORM set_config('request.jwt.claim.role', '', true);
    PERFORM set_config('request.jwt.claim.sub', coalesce(p_quem::text, ''), true);
    EXECUTE format('SET LOCAL ROLE %I', CASE WHEN v_role = 'service_role' THEN 'service_role' ELSE v_role END);
  END $f$;

  CREATE OR REPLACE FUNCTION pg_temp.sai() RETURNS void LANGUAGE plpgsql AS $f$
  BEGIN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
  END $f$;

  -- Chama a função com NULL em todo argumento; devolve 'ok' ou o SQLSTATE.
  CREATE OR REPLACE FUNCTION pg_temp.chama(p_oid oid, p_args text DEFAULT NULL)
  RETURNS text LANGUAGE plpgsql AS $f$
  DECLARE v_args text;
  BEGIN
    SELECT coalesce(p_args, string_agg(format('NULL::%s', format_type(t, NULL)), ', ' ORDER BY i))
      INTO v_args
      FROM pg_proc p, unnest(p.proargtypes::oid[]) WITH ORDINALITY AS a(t, i)
     WHERE p.oid = p_oid;
    -- A coluna precisa ser referenciada: sem isso o planejador descarta a
    -- chamada de função escalar (count(*) não lê a coluna) e nada executa.
    EXECUTE format('SELECT count(*) FROM (SELECT %s(%s) AS x OFFSET 0) s WHERE (s.x IS NULL) IS NOT NULL',
                   p_oid::regproc, coalesce(v_args, ''));
    RETURN 'ok';
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLSTATE || ': ' || left(SQLERRM, 160);
  END $f$;

  -- ── 1. Tabelas: pendente e anon veem 0; aprovado vê tudo ───────────────────
  FOREACH v_t IN ARRAY v_tabelas LOOP
    IF to_regclass('public.' || v_t) IS NULL THEN
      v_ausentes := v_ausentes || v_t;
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
    v_tab_json := v_tab_json || jsonb_build_object(v_t, jsonb_build_object('total', v_n));

    FOR r IN SELECT * FROM (VALUES ('pendente', c_pendente), ('anon', NULL::uuid), ('aprovado', c_aprovado)) x(rotulo, uid) LOOP
      PERFORM pg_temp.como(r.uid);
      BEGIN
        EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
        v_estado := v_n::text;
      EXCEPTION WHEN insufficient_privilege THEN
        v_estado := '42501';
      END;
      PERFORM pg_temp.sai();
      v_tab_json := jsonb_set(v_tab_json, ARRAY[v_t, r.rotulo], to_jsonb(v_estado));
      IF r.rotulo IN ('pendente', 'anon') AND v_estado NOT IN ('0', '42501') THEN
        v_falhas := v_falhas || format('%s: %s viu %s linha(s)', v_t, r.rotulo, v_estado);
      END IF;
      IF r.rotulo = 'aprovado' AND v_estado <> (v_tab_json -> v_t ->> 'total') THEN
        v_falhas := v_falhas || format('%s: aprovado viu %s de %s', v_t, v_estado, v_tab_json -> v_t ->> 'total');
      END IF;
    END LOOP;

    -- Sem linha na tabela o 0 do pendente não prova nada: registra.
    IF (v_tab_json -> v_t ->> 'total')::bigint = 0 THEN
      v_falhas := v_falhas || format('%s: tabela vazia na bancada (teste inconclusivo)', v_t);
    END IF;
  END LOOP;

  -- Escrita aberta que existia: pendente e anon gravando em fabrica_read_entries.
  IF to_regclass('public.fabrica_read_entries') IS NOT NULL THEN
    FOR r IN SELECT * FROM (VALUES ('pendente', c_pendente), ('anon', NULL::uuid)) x(rotulo, uid) LOOP
      PERFORM pg_temp.como(r.uid);
      BEGIN
        EXECUTE 'INSERT INTO public.fabrica_read_entries (work_item_id, is_read) VALUES (-424242, true)';
        v_estado := 'gravou';
      EXCEPTION WHEN OTHERS THEN
        v_estado := SQLSTATE;
      END;
      PERFORM pg_temp.sai();
      v_extra := v_extra || jsonb_build_object('fabrica_read_entries_insert_' || r.rotulo, v_estado);
      IF v_estado = 'gravou' THEN
        v_falhas := v_falhas || format('fabrica_read_entries: %s conseguiu INSERT', r.rotulo);
      END IF;
    END LOOP;
  END IF;

  -- ── 2. RPCs: guard injetado uma vez só, 42501 para pendente e anon ─────────
  FOR r IN
    SELECT p.oid, p.proname, p.prosrc,
           CASE WHEN p.proname = ANY (v_leitura)   THEN 'leitura'
                WHEN p.proname = ANY (v_comercial) THEN 'comercial'
                WHEN p.proname = ANY (v_admin)     THEN 'admin'
                ELSE 'proprio' END AS classe
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (v_leitura || v_comercial || v_admin || ARRAY['provision_user'])
  LOOP
    v_injetadas := v_injetadas + 1;
    v_n := (length(r.prosrc) - length(replace(r.prosrc, c_marca, ''))) / length(c_marca);
    IF v_n <> 1 THEN
      v_falhas := v_falhas || format('%s: marca do guard aparece %s vez(es)', r.oid::regprocedure, v_n);
    END IF;
    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      v_falhas := v_falhas || format('%s: anon ainda tem EXECUTE', r.oid::regprocedure);
    END IF;
    IF NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      v_falhas := v_falhas || format('%s: authenticated perdeu EXECUTE', r.oid::regprocedure);
    END IF;

    -- pendente
    PERFORM pg_temp.como(c_pendente);
    v_estado := CASE WHEN r.classe = 'proprio'
                     THEN pg_temp.chama(r.oid, quote_literal(c_aprovado) || '::uuid')  -- perfil de OUTRO
                     ELSE pg_temp.chama(r.oid) END;
    PERFORM pg_temp.sai();
    v_rpc_json := v_rpc_json || jsonb_build_object(r.oid::regprocedure::text, jsonb_build_object('pendente', v_estado));
    IF left(v_estado, 5) <> '42501' THEN
      v_falhas := v_falhas || format('%s: pendente obteve %s', r.oid::regprocedure, v_estado);
    END IF;

    -- anon
    PERFORM pg_temp.como(NULL);
    v_estado := pg_temp.chama(r.oid);
    PERFORM pg_temp.sai();
    v_rpc_json := jsonb_set(v_rpc_json, ARRAY[r.oid::regprocedure::text, 'anon'], to_jsonb(v_estado));
    IF left(v_estado, 5) <> '42501' THEN
      v_falhas := v_falhas || format('%s: anon obteve %s', r.oid::regprocedure, v_estado);
    END IF;

    -- aprovado (não admin): leitura passa do guard; escrita comercial, recálculo
    -- e o perfil de outro param no guard. Só leitura é executada de fato.
    PERFORM pg_temp.como(c_aprovado);
    v_estado := CASE r.classe
                  WHEN 'proprio' THEN pg_temp.chama(r.oid, quote_literal(c_pendente) || '::uuid')
                  ELSE pg_temp.chama(r.oid) END;
    PERFORM pg_temp.sai();
    v_rpc_json := jsonb_set(v_rpc_json, ARRAY[r.oid::regprocedure::text, 'aprovado'], to_jsonb(v_estado));
    IF r.classe = 'leitura' AND left(v_estado, 5) = '42501' THEN
      v_falhas := v_falhas || format('%s: aprovado barrado', r.oid::regprocedure);
    ELSIF r.classe <> 'leitura' AND left(v_estado, 5) <> '42501' THEN
      v_falhas := v_falhas || format('%s: aprovado sem papel passou (%s)', r.oid::regprocedure, v_estado);
    END IF;
  END LOOP;

  -- provision_user sobre si mesmo continua liberado para o pendente (1º login).
  IF to_regprocedure('public.provision_user(uuid)') IS NOT NULL THEN
    PERFORM pg_temp.como(c_pendente);
    v_estado := pg_temp.chama('public.provision_user(uuid)'::regprocedure, quote_literal(c_pendente) || '::uuid');
    PERFORM pg_temp.sai();
    v_extra := v_extra || jsonb_build_object('provision_user_si_mesmo_pendente', v_estado);
    IF left(v_estado, 5) = '42501' THEN
      v_falhas := v_falhas || 'provision_user: pendente barrado sobre si mesmo';
    END IF;
  END IF;

  -- Owner do Comercial passa do guard de escrita (id inexistente: nada muda).
  IF to_regprocedure('public.delete_movimentacao_comercial(uuid)') IS NOT NULL THEN
    PERFORM pg_temp.como(c_comercial);
    v_estado := pg_temp.chama('public.delete_movimentacao_comercial(uuid)'::regprocedure,
                              quote_literal(gen_random_uuid()) || '::uuid');
    PERFORM pg_temp.sai();
    v_extra := v_extra || jsonb_build_object('delete_movimentacao_owner_comercial', v_estado);
    IF left(v_estado, 5) = '42501' THEN
      v_falhas := v_falhas || 'delete_movimentacao_comercial: owner do Comercial barrado';
    END IF;
  END IF;

  -- service_role e sessão sem JWT (pg_cron) seguem passando.
  IF to_regprocedure('public.rpc_qa_atemporal_summary(date, date)') IS NOT NULL THEN
    PERFORM pg_temp.como(NULL, 'service_role');
    v_estado := pg_temp.chama('public.rpc_qa_atemporal_summary(date, date)'::regprocedure);
    PERFORM pg_temp.sai();
    v_extra := v_extra || jsonb_build_object('qa_summary_service_role', v_estado);
    IF v_estado <> 'ok' THEN v_falhas := v_falhas || ('service_role barrado: ' || v_estado); END IF;

    v_estado := pg_temp.chama('public.rpc_qa_atemporal_summary(date, date)'::regprocedure);
    v_extra := v_extra || jsonb_build_object('qa_summary_sem_jwt', v_estado);
    IF v_estado <> 'ok' THEN v_falhas := v_falhas || ('sessão sem JWT barrada: ' || v_estado); END IF;
  END IF;

  -- ── 3. Fila de timelog ─────────────────────────────────────────────────────
  FOR r IN SELECT * FROM (VALUES
      ('pendente',  c_pendente,  '42501'),
      ('aprovado',  c_aprovado,  '42501'),
      ('ex_owner',  c_ex_owner,  '42501'),
      ('owner_fab', c_owner_fab, 'P0002')) x(rotulo, uid, esperado)
  LOOP
    PERFORM pg_temp.como(r.uid);
    v_estado := pg_temp.chama('public.rpc_timelog_queue_post(uuid, text, boolean, text)'::regprocedure,
                              quote_literal(gen_random_uuid()) || '::uuid, ''alguem@flag.com.br'', true, NULL');
    PERFORM pg_temp.sai();
    v_extra := v_extra || jsonb_build_object('queue_post_' || r.rotulo, v_estado);
    IF left(v_estado, 5) <> r.esperado THEN
      v_falhas := v_falhas || format('rpc_timelog_queue_post: %s obteve %s (esperado %s)', r.rotulo, v_estado, r.esperado);
    END IF;

    PERFORM pg_temp.como(r.uid);
    v_estado := pg_temp.chama('public.rpc_timelog_set_status(uuid, text, text)'::regprocedure,
                              quote_literal(gen_random_uuid()) || '::uuid, ''approve'', NULL');
    PERFORM pg_temp.sai();
    v_extra := v_extra || jsonb_build_object('set_status_' || r.rotulo, v_estado);
    IF left(v_estado, 5) <> r.esperado THEN
      v_falhas := v_falhas || format('rpc_timelog_set_status: %s obteve %s (esperado %s)', r.rotulo, v_estado, r.esperado);
    END IF;
  END LOOP;

  -- hub_is_approved() intocada (o Timer depende dela).
  v_extra := v_extra || jsonb_build_object('hub_is_approved_src_md5',
    (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.hub_is_approved()'::regprocedure));

  RAISE EXCEPTION 'RESULTADO %', jsonb_pretty(jsonb_build_object(
    'ok', cardinality(v_falhas) = 0,
    'falhas', to_jsonb(v_falhas),
    'funcoes_verificadas', v_injetadas,
    'tabelas_ausentes', to_jsonb(v_ausentes),
    'tabelas', v_tab_json,
    'rpcs', v_rpc_json,
    'extra', v_extra));
END
$verif$;
