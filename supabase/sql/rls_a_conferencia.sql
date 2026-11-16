-- =============================================================================
-- RLS-A — conferência estrutural (só leitura; sem dados sintéticos).
-- Serve para PRODUÇÃO depois da migration 20261116120000 e também roda dentro
-- da mesma transação do apply (scripts/rls-a-prod.mjs): se algo não bate,
-- RAISE EXCEPTION e a transação inteira volta.
--
-- Confere: 1) nenhuma política das tabelas do RLS-A continua aberta (anon,
-- PUBLIC ou USING/CHECK true) para SELECT/INSERT/UPDATE; 2) cada função da
-- lista tem a marca do guard exatamente 1 vez, anon sem EXECUTE e
-- authenticated com EXECUTE; 3) rpc_timelog_queue_post / set_status exigem
-- is_active; 4) rpc_lifecycle_refresh_candidates fora de PUBLIC/anon/
-- authenticated; 5) hub_is_approved() existe (não é alterada aqui).
-- =============================================================================
DO $conf$
DECLARE
  c_marca constant text := '-- RLS-A guard';
  v_falhas text[] := '{}';
  v_funcoes int := 0;
  r record;
  v_n int;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd, roles, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('fabrica_read_entries', 'comercial_metas', 'sprint_indicator_snapshots',
                         'devops_projects', 'devops_repos', 'comercial_funil',
                         'comercial_funil_lancamentos', 'comercial_produtos',
                         'fabrica_squad_membership', 'devops_tag_dicionario')
  LOOP
    -- "aberta" = anon/PUBLIC, `true`, ou só `auth.uid() IS NOT NULL` (vale
    -- para o pendente).
    IF r.roles && ARRAY['anon', 'public']::name[]
       OR coalesce(r.qual, '') IN ('true', '(auth.uid() IS NOT NULL)')
       OR coalesce(r.with_check, '') IN ('true', '(auth.uid() IS NOT NULL)') THEN
      v_falhas := v_falhas || format('política aberta: %s.%s (%s, %s, using=%s, check=%s)',
        r.tablename, r.policyname, r.cmd, r.roles, r.qual, r.with_check);
    END IF;
  END LOOP;

  FOR r IN
    SELECT p.oid, p.prosrc
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN (
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
       'get_recent_batches', 'get_batch_statistics', 'rpc_devops_repo_classificar',
       'insert_movimentacao_comercial', 'update_movimentacao_comercial',
       'delete_movimentacao_comercial', 'sync_qa_return_count_from_events',
       'compute_pbi_health_all', 'provision_user')
  LOOP
    v_funcoes := v_funcoes + 1;
    v_n := (length(r.prosrc) - length(replace(r.prosrc, c_marca, ''))) / length(c_marca);
    IF v_n <> 1 THEN
      v_falhas := v_falhas || format('%s: marca do guard %s vez(es)', r.oid::regprocedure, v_n);
    END IF;
    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      v_falhas := v_falhas || format('%s: anon tem EXECUTE', r.oid::regprocedure);
    END IF;
    IF NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      v_falhas := v_falhas || format('%s: authenticated sem EXECUTE', r.oid::regprocedure);
    END IF;
  END LOOP;

  FOR r IN SELECT p.oid, p.prosrc FROM pg_proc p
            WHERE p.oid IN (to_regprocedure('public.rpc_timelog_queue_post(uuid, text, boolean, text)'),
                            to_regprocedure('public.rpc_timelog_set_status(uuid, text, text)'))
  LOOP
    IF position('m.is_active = true' IN r.prosrc) = 0 THEN
      v_falhas := v_falhas || format('%s: owner da Fábrica sem is_active', r.oid::regprocedure);
    END IF;
  END LOOP;
  IF position('enfileirar' IN coalesce((SELECT prosrc FROM pg_proc
       WHERE oid = to_regprocedure('public.rpc_timelog_queue_post(uuid, text, boolean, text)')), '')) = 0 THEN
    v_falhas := v_falhas || 'rpc_timelog_queue_post: sem a checagem de admin/owner';
  END IF;

  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'rpc_lifecycle_refresh_candidates'
  LOOP
    IF has_function_privilege('anon', r.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      v_falhas := v_falhas || format('%s: alcançável por anon/authenticated', r.oid::regprocedure);
    END IF;
  END LOOP;

  IF to_regprocedure('public.hub_is_approved()') IS NULL
     OR to_regprocedure('public.hub_assert_approved()') IS NULL THEN
    v_falhas := v_falhas || 'hub_is_approved()/hub_assert_approved() ausente';
  END IF;

  IF cardinality(v_falhas) > 0 THEN
    RAISE EXCEPTION 'RLS-A CONFERÊNCIA FALHOU (% funções vistas): %', v_funcoes, array_to_string(v_falhas, ' | ');
  END IF;
  RAISE NOTICE 'RLS-A conferência OK: % funções com guard, políticas fechadas.', v_funcoes;
END
$conf$;
