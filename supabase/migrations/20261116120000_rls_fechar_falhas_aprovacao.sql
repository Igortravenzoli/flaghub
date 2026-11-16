-- =============================================================================
-- RLS-A — Fechar as falhas de aprovação anteriores ao Timer (16/11/2026)
--
-- Achado ao mapear o isolamento do Timer Flag: qualquer conta do SSO, inclusive
-- a PENDENTE (autenticada, sem membership ativa), e em alguns casos o anon,
-- alcança dado de KPI por políticas abertas e por RPCs SECURITY DEFINER sem
-- guard. A regra do HUB desde o pentest #3 (20260421180000) é
-- `public.hub_is_approved()` = membership ativa em hub_area_members OU admin.
-- Esta migration NÃO altera hub_is_approved() (o Timer depende dela como está).
--
--   1. Políticas abertas (anon ou USING (true)) → exigem hub_is_approved().
--      Quem lê essas tabelas: só telas atrás do ProtectedRoute (sessão logada,
--      aprovada) e edges com service_role (ignora RLS). O telão/kiosk entra como
--      monitor@flag.com.br, que tem 7 memberships `leitura` → é aprovado. Nenhuma
--      rota pública (/, /login, /mfa, /auth/callback, /pending-approval) lê
--      estas tabelas. As políticas de ESCRITA já existentes não mudam.
--   2. RPCs SECURITY DEFINER sem guard (as 8 do mapeamento + as da auditoria
--      dos GRANT ... TO authenticated) → o guard é injetado como 1º comando do
--      corpo VIVO de cada uma (erro 42501 para pendente/anon):
--      leitura → hub_assert_approved(); escrita comercial →
--      hub_assert_area_writer('comercial'); recálculo em massa →
--      hub_assert_admin(); provision_user → hub_assert_self_or_admin().
--      service_role e sessão sem JWT (pg_cron, SQL Editor) seguem passando.
--      Mais higiene de ACL (PUBLIC/anon) em funções que já tinham guard.
--   3. rpc_timelog_queue_post → admin OU owner ATIVO da Fábrica (antes bastava
--      estar logado: qualquer um enfileirava horas para qualquer e-mail).
--   4. rpc_timelog_set_status → o ramo "owner da Fábrica" exige is_active.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE, CREATE OR REPLACE FUNCTION,
-- REVOKE/GRANT. Tabelas que não existirem no ambiente são puladas com NOTICE.
-- =============================================================================

-- ── 0. Guard reutilizável ────────────────────────────────────────────────────
-- auth.role() é NULL fora do PostgREST (pg_cron, SQL Editor, psql) e
-- 'service_role' nas edges/scripts de servidor — ambos são chamadas de
-- servidor, sem usuário, e continuam liberadas como hoje. anon e authenticated
-- sempre chegam com o claim de papel preenchido pelo PostgREST.
CREATE OR REPLACE FUNCTION public.hub_assert_approved()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := auth.role();
BEGIN
  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN;
  END IF;
  IF NOT public.hub_is_approved() THEN
    RAISE EXCEPTION 'permission denied: acesso ao FlagHub ainda não aprovado'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.hub_assert_approved() IS
  'RLS-A: erro 42501 se o chamador (anon/authenticated) não passa em hub_is_approved(). '
  'service_role e sessões sem JWT (pg_cron) passam. Chamar como 1º comando de RPC SECURITY DEFINER de leitura.';

-- Só é chamada de dentro de funções SECURITY DEFINER (roda como o dono).
REVOKE ALL ON FUNCTION public.hub_assert_approved() FROM PUBLIC, anon, authenticated;

-- ── 1. Políticas abertas → hub_is_approved() ─────────────────────────────────
DO $pol$
DECLARE
  v_pol name;
BEGIN
  -- fabrica_read_entries: lido/escrito por qualquer um, anon inclusive
  -- (SELECT/INSERT/UPDATE USING (true) e GRANT para anon). Estado de "lido" da
  -- tela da Fábrica — só para aprovados.
  -- Em produção (16/11/2026) a tabela tinha, além do "Allow public read", as
  -- políticas `authenticated_insert`/`authenticated_update` com
  -- `auth.uid() IS NOT NULL` — criadas fora das migrations. Por isso aqui caem
  -- TODAS as políticas da tabela, seja qual for o nome, e entram as três abaixo.
  IF to_regclass('public.fabrica_read_entries') IS NOT NULL THEN
    FOR v_pol IN SELECT policyname FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'fabrica_read_entries'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.fabrica_read_entries', v_pol);
    END LOOP;
    CREATE POLICY "fabrica_read_entries_select" ON public.fabrica_read_entries
      FOR SELECT TO authenticated USING (public.hub_is_approved());
    CREATE POLICY "fabrica_read_entries_insert" ON public.fabrica_read_entries
      FOR INSERT TO authenticated WITH CHECK (public.hub_is_approved());
    CREATE POLICY "fabrica_read_entries_update" ON public.fabrica_read_entries
      FOR UPDATE TO authenticated
      USING (public.hub_is_approved()) WITH CHECK (public.hub_is_approved());
    REVOKE ALL ON public.fabrica_read_entries FROM anon;
  ELSE
    RAISE NOTICE 'RLS-A: fabrica_read_entries não existe neste ambiente — pulada';
  END IF;

  -- comercial_metas: SELECT para anon e para qualquer logado.
  IF to_regclass('public.comercial_metas') IS NOT NULL THEN
    DROP POLICY IF EXISTS "comercial_metas_select_anon"          ON public.comercial_metas;
    DROP POLICY IF EXISTS "comercial_metas_select_authenticated" ON public.comercial_metas;
    DROP POLICY IF EXISTS "comercial_metas_select"               ON public.comercial_metas;
    CREATE POLICY "comercial_metas_select" ON public.comercial_metas
      FOR SELECT TO authenticated USING (public.hub_is_approved());
    REVOKE ALL ON public.comercial_metas FROM anon;
  ELSE
    RAISE NOTICE 'RLS-A: comercial_metas não existe neste ambiente — pulada';
  END IF;

  IF to_regclass('public.sprint_indicator_snapshots') IS NOT NULL THEN
    DROP POLICY IF EXISTS "snapshot_select_authenticated" ON public.sprint_indicator_snapshots;
    DROP POLICY IF EXISTS "snapshot_select_approved"      ON public.sprint_indicator_snapshots;
    CREATE POLICY "snapshot_select_approved" ON public.sprint_indicator_snapshots
      FOR SELECT TO authenticated USING (public.hub_is_approved());
  ELSE
    RAISE NOTICE 'RLS-A: sprint_indicator_snapshots não existe neste ambiente — pulada';
  END IF;

  IF to_regclass('public.devops_projects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "devops_projects_select" ON public.devops_projects;
    CREATE POLICY "devops_projects_select" ON public.devops_projects
      FOR SELECT TO authenticated USING (public.hub_is_approved());
  ELSE
    RAISE NOTICE 'RLS-A: devops_projects não existe neste ambiente — pulada';
  END IF;

  IF to_regclass('public.devops_repos') IS NOT NULL THEN
    DROP POLICY IF EXISTS "devops_repos_select" ON public.devops_repos;
    CREATE POLICY "devops_repos_select" ON public.devops_repos
      FOR SELECT TO authenticated USING (public.hub_is_approved());
  ELSE
    RAISE NOTICE 'RLS-A: devops_repos não existe neste ambiente — pulada';
  END IF;

  IF to_regclass('public.comercial_funil') IS NOT NULL THEN
    DROP POLICY IF EXISTS "comercial_funil_select" ON public.comercial_funil;
    CREATE POLICY "comercial_funil_select" ON public.comercial_funil
      FOR SELECT TO authenticated USING (public.hub_is_approved());
  ELSE
    RAISE NOTICE 'RLS-A: comercial_funil não existe neste ambiente — pulada';
  END IF;

  IF to_regclass('public.comercial_funil_lancamentos') IS NOT NULL THEN
    DROP POLICY IF EXISTS "comercial_funil_lanc_select" ON public.comercial_funil_lancamentos;
    CREATE POLICY "comercial_funil_lanc_select" ON public.comercial_funil_lancamentos
      FOR SELECT TO authenticated USING (public.hub_is_approved());
  ELSE
    RAISE NOTICE 'RLS-A: comercial_funil_lancamentos não existe neste ambiente — pulada';
  END IF;

  IF to_regclass('public.comercial_produtos') IS NOT NULL THEN
    DROP POLICY IF EXISTS "comercial_produtos_select" ON public.comercial_produtos;
    CREATE POLICY "comercial_produtos_select" ON public.comercial_produtos
      FOR SELECT TO authenticated USING (public.hub_is_approved());
  ELSE
    RAISE NOTICE 'RLS-A: comercial_produtos não existe neste ambiente — pulada';
  END IF;

  -- Mesma classe, achadas na auditoria (USING (true) para qualquer logado):
  -- organograma/squads da Fábrica (20260714120000) e dicionário de tags
  -- cliente/produto (20260812210000). Lidos só por telas protegidas.
  IF to_regclass('public.fabrica_squad_membership') IS NOT NULL THEN
    DROP POLICY IF EXISTS "fabrica_squad_membership_select" ON public.fabrica_squad_membership;
    CREATE POLICY "fabrica_squad_membership_select" ON public.fabrica_squad_membership
      FOR SELECT TO authenticated USING (public.hub_is_approved());
  ELSE
    RAISE NOTICE 'RLS-A: fabrica_squad_membership não existe neste ambiente — pulada';
  END IF;

  IF to_regclass('public.devops_tag_dicionario') IS NOT NULL THEN
    DROP POLICY IF EXISTS "tag_dicionario_leitura_autenticada" ON public.devops_tag_dicionario;
    CREATE POLICY "tag_dicionario_leitura_autenticada" ON public.devops_tag_dicionario
      FOR SELECT TO authenticated USING (public.hub_is_approved());
  ELSE
    RAISE NOTICE 'RLS-A: devops_tag_dicionario não existe neste ambiente — pulada';
  END IF;
END
$pol$;

-- ── 2. RPCs SECURITY DEFINER sem guard → guard injetado no corpo VIVO ────────
-- Por que injetar em vez de recopiar o corpo do repo: produção recebeu
-- migrations à mão (agosto a outubro sem registro em schema_migrations) e um
-- CREATE OR REPLACE com o corpo do arquivo poderia desfazer um ajuste feito lá.
-- O injetor lê pg_get_functiondef() de CADA sobrecarga com o nome dado, põe o
-- guard como 1º comando e recria — o resto do corpo, a assinatura, o
-- search_path, o dono e o ACL ficam como estão:
--   • LANGUAGE sql     → `SELECT <guard>;` antes do 1º comando (função SQL
--                        executa todos os comandos em ordem e devolve o último);
--   • LANGUAGE plpgsql → `PERFORM <guard>;` logo depois do 1º BEGIN.
-- Idempotente: a marca `-- RLS-A guard` no corpo pula a função na 2ª execução.
-- Corpo BEGIN ATOMIC ou outra linguagem → erro (não adivinha).
-- Grants: tira PUBLIC/anon (o default do Supabase dá EXECUTE a PUBLIC e anon)
-- e garante authenticated + service_role — o guard interno decide.

-- Demais guards (mesma regra de passagem do hub_assert_approved: service_role
-- e sessão sem JWT passam).
CREATE OR REPLACE FUNCTION public.hub_assert_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := auth.role();
BEGIN
  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN;
  END IF;
  IF NOT public.hub_is_admin() THEN
    RAISE EXCEPTION 'permission denied: apenas administradores'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Escrita de área: admin OU owner/operacional ATIVO da área (o mesmo predicado
-- de insert/update/delete_meta_comercial e das políticas de comercial_vendas).
CREATE OR REPLACE FUNCTION public.hub_assert_area_writer(p_area_key text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := auth.role();
BEGIN
  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN;
  END IF;
  IF NOT (
    public.hub_is_admin() OR EXISTS (
      SELECT 1 FROM public.hub_area_members m
      JOIN public.hub_areas a ON a.id = m.area_id
      WHERE m.user_id = auth.uid() AND m.is_active = true
        AND a.key = p_area_key AND m.area_role IN ('owner', 'operacional')
    )
  ) THEN
    RAISE EXCEPTION 'permission denied: admin ou gestor da área %', p_area_key
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- O próprio usuário ou admin. Para provision_user, que o usuário PENDENTE
-- chama sobre si mesmo no 1º login (AuthContext) — não pode exigir aprovação.
CREATE OR REPLACE FUNCTION public.hub_assert_self_or_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := auth.role();
BEGIN
  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN;
  END IF;
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT public.hub_is_admin() THEN
    RAISE EXCEPTION 'permission denied: só o próprio usuário ou um administrador'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.hub_assert_admin()               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hub_assert_area_writer(text)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hub_assert_self_or_admin(uuid)   FROM PUBLIC, anon, authenticated;

-- Injetor (temporário: some no fim da sessão, não fica no schema).
CREATE OR REPLACE FUNCTION pg_temp.rls_a_injeta(p_nome text, p_guard text)
RETURNS integer
LANGUAGE plpgsql
AS $inj$
DECLARE
  r        record;
  v_def    text;
  v_src    text;
  v_pos    integer;
  v_n      integer := 0;
  v_marca  constant text := '-- RLS-A guard';
BEGIN
  FOR r IN
    SELECT p.oid, p.prosrc, l.lanname, (p.prosqlbody IS NOT NULL) AS atomico
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language  l ON l.oid = p.prolang
     WHERE n.nspname = 'public' AND p.proname = p_nome AND p.prokind = 'f'
  LOOP
    v_n := v_n + 1;
    IF position(v_marca IN r.prosrc) = 0 THEN
      IF r.atomico THEN
        RAISE EXCEPTION 'RLS-A: % tem corpo BEGIN ATOMIC — injeção não suportada', r.oid::regprocedure;
      END IF;
      IF r.lanname = 'sql' THEN
        v_src := E'\n  SELECT ' || p_guard || '; ' || v_marca || E'\n' || r.prosrc;
      ELSIF r.lanname = 'plpgsql' THEN
        v_pos := regexp_instr(r.prosrc, '\mbegin\M', 1, 1, 1, 'i');  -- posição logo após o 1º BEGIN
        IF v_pos = 0 THEN
          RAISE EXCEPTION 'RLS-A: BEGIN não encontrado em %', r.oid::regprocedure;
        END IF;
        v_src := left(r.prosrc, v_pos - 1)
              || E'\n  PERFORM ' || p_guard || '; ' || v_marca || E'\n'
              || substr(r.prosrc, v_pos);
      ELSE
        RAISE EXCEPTION 'RLS-A: linguagem % não suportada em %', r.lanname, r.oid::regprocedure;
      END IF;

      v_def := pg_get_functiondef(r.oid);
      v_pos := position(r.prosrc IN v_def);
      IF v_pos = 0 THEN
        RAISE EXCEPTION 'RLS-A: corpo de % não localizado na definição', r.oid::regprocedure;
      END IF;
      EXECUTE overlay(v_def PLACING v_src FROM v_pos FOR length(r.prosrc));
      RAISE NOTICE 'RLS-A: guard % injetado em %', p_guard, r.oid::regprocedure;
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.oid::regprocedure);
  END LOOP;

  IF v_n = 0 THEN
    RAISE NOTICE 'RLS-A: função % não existe neste ambiente — pulada', p_nome;
  END IF;
  RETURN v_n;
END;
$inj$;

DO $guard$
DECLARE
  v_nome text;
  -- 2.1 Leitura de KPI/DevOps/QA → aprovação. Os 8 primeiros são os do
  -- mapeamento do Timer; o resto veio da auditoria dos GRANT ... TO
  -- authenticated (todos SECURITY DEFINER, sem guard, chamados só de telas
  -- protegidas, do telão — monitor é aprovado — ou de edges com service_role).
  v_leitura text[] := ARRAY[
    'rpc_qa_atemporal_summary',
    'rpc_qa_encerramentos_por_usuario',
    'rpc_qa_closed_por_sprint_periodo',
    'rpc_qa_items_atemporal',
    'rpc_qa_handoff_histogram',
    'rpc_get_sprint_historical_v2',
    'rpc_qa_historical_series',
    'rpc_get_sprint_daily_progress',
    -- auditoria: alcançáveis até por anon (PUBLIC/anon nunca revogados)
    'rpc_transbordo_elegiveis',
    'rpc_transbordo_historico',
    'rpc_transbordo_contexto',
    'rpc_qa_return_open_items',
    'rpc_qa_exec_fila_aging',
    'rpc_qa_exec_retornos_distribuicao',
    'rpc_gerencial_qa_items',
    'rpc_gerencial_qa_summary',
    'rpc_get_sprint_historical',
    'rpc_list_sprint_snapshots',
    'rpc_compare_sprint_snapshots',
    'rpc_get_sprint_retrospective',
    'rpc_list_all_sprints_2026',
    'rpc_compare_multiple_sprints_2026',
    'rpc_sprint_annual_timeline',
    -- auditoria: só authenticated (o pendente alcança)
    'rpc_devops_timelog_agg',
    'rpc_feature_pbi_summary',
    'rpc_pbi_health_overview',
    'rpc_pbi_bottleneck_summary',
    'rpc_gerencial_fabrica_summary',
    'rpc_qa_desempenho_responsavel',
    'rpc_qa_return_by_assignee',
    'rpc_qa_return_by_sprint',
    'rpc_qa_return_summary',
    'get_recent_batches',
    'get_batch_statistics',
    -- escrita em devops_repos com só `auth.uid() IS NULL` de checagem
    'rpc_devops_repo_classificar'
  ];
BEGIN
  FOREACH v_nome IN ARRAY v_leitura LOOP
    PERFORM pg_temp.rls_a_injeta(v_nome, 'public.hub_assert_approved()');
  END LOOP;

  -- 2.2 Escrita de movimentação comercial (anon alcançava via PUBLIC).
  PERFORM pg_temp.rls_a_injeta('insert_movimentacao_comercial', 'public.hub_assert_area_writer(''comercial'')');
  PERFORM pg_temp.rls_a_injeta('update_movimentacao_comercial', 'public.hub_assert_area_writer(''comercial'')');
  PERFORM pg_temp.rls_a_injeta('delete_movimentacao_comercial', 'public.hub_assert_area_writer(''comercial'')');

  -- 2.3 Recálculos em massa (UPDATE em pbi_lifecycle_summary): só admin,
  -- service_role ou pg_cron. Nenhuma tela os chama.
  PERFORM pg_temp.rls_a_injeta('sync_qa_return_count_from_events', 'public.hub_assert_admin()');
  PERFORM pg_temp.rls_a_injeta('compute_pbi_health_all',           'public.hub_assert_admin()');

  -- 2.4 provision_user: só sobre si mesmo (ou admin). Antes upsertava o perfil
  -- de QUALQUER uid e devolvia o e-mail dele.
  PERFORM pg_temp.rls_a_injeta('provision_user', 'public.hub_assert_self_or_admin(p_user_id)');
END
$guard$;

DROP FUNCTION IF EXISTS pg_temp.rls_a_injeta(text, text);

-- 2.5 Higiene de grants (sem mudar corpo):
DO $grants$
DECLARE
  r record;
BEGIN
  -- Fila do lifecycle: só a edge devops-sync-all (service_role) chama.
  -- 20260816130000 revogou anon e authenticated, mas não PUBLIC.
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'rpc_lifecycle_refresh_candidates'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.oid::regprocedure);
  END LOOP;

  -- Já têm guard de admin no corpo; só tiram PUBLIC/anon do ACL.
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN (
              'rpc_backfill_closed_sprint_snapshots',
              'rpc_backfill_reconstruct_closed_sprints',
              'rpc_capture_sprint_daily_progress',
              'rpc_capture_sprint_daily_progress_at',
              'rpc_capture_sprint_snapshot',
              'rpc_reconstruct_sprint_snapshot')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.oid::regprocedure);
  END LOOP;
END
$grants$;


-- ── 3. rpc_timelog_queue_post: admin OU owner ATIVO da Fábrica ───────────────
-- Corpo idêntico ao vigente (20260725140000) exceto a checagem de permissão.
-- Mesmo predicado de rpc_timelog_set_status e das edges devops-post-timelog /
-- devops-transbordo; a UI (Nivelamento, FabricaDashboard) já só aparece para
-- quem passa nele (canManageTimelog).
CREATE OR REPLACE FUNCTION public.rpc_timelog_queue_post(
    p_vdesk_log_id      uuid,
    p_target_user_email text DEFAULT NULL,
    p_dry_run           boolean DEFAULT true,
    p_notes_override    text DEFAULT NULL
)
RETURNS public.timelog_post_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_log    public.vdesk_time_logs%ROWTYPE;
    v_map    public.devops_collaborator_map%ROWTYPE;
    v_minutes integer;
    v_email   text;
    v_display text;
    v_notes   text;
    v_caller  uuid := auth.uid();
    v_row     public.timelog_post_queue%ROWTYPE;
    v_can     boolean;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Autenticação obrigatória.' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.hub_user_global_roles
         WHERE user_id = v_caller AND role = 'admin'
        UNION ALL
        SELECT 1 FROM public.user_roles
         WHERE user_id = v_caller AND role = 'admin'
        UNION ALL
        SELECT 1
          FROM public.hub_area_members m
          JOIN public.hub_areas a ON a.id = m.area_id
         WHERE m.user_id = v_caller
           AND m.is_active = true
           AND m.area_role = 'owner'
           AND a.key = 'fabrica'
    ) INTO v_can;

    IF NOT v_can THEN
        RAISE EXCEPTION 'Apenas admins ou owner da Fábrica podem enfileirar lançamentos.' USING ERRCODE = '42501';
    END IF;

    -- Idempotência: UMA linha por apontamento, qualquer status. Se já existe
    -- (inclusive 'posted' ou 'rejected'), devolve a existente em vez de criar
    -- outra — reenfileirar um item já lançado duplicaria a hora no DevOps.
    -- Para reprocessar, usar rpc_timelog_set_status(..., 'reset').
    SELECT * INTO v_row
      FROM public.timelog_post_queue
     WHERE vdesk_log_id = p_vdesk_log_id;
    IF FOUND THEN
        RETURN v_row;
    END IF;

    SELECT * INTO v_log FROM public.vdesk_time_logs WHERE id = p_vdesk_log_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'vdesk_time_logs id=% não encontrado.', p_vdesk_log_id USING ERRCODE = 'P0002';
    END IF;

    -- Resolução do destinatário (1 linha garantida pelo índice do TL-5)
    SELECT * INTO v_map
      FROM public.devops_collaborator_map
     WHERE lower(vdesk_user_name) = lower(v_log.usuario_vdesk)
       AND coalesce(is_active, true)
     LIMIT 1;

    v_email   := coalesce(p_target_user_email, v_map.devops_email);
    v_display := coalesce(v_map.canonical_name, v_log.usuario_vdesk);

    v_minutes := round(v_log.tempo_segundos / 60.0)::int;
    IF v_minutes <= 0 THEN
        RAISE EXCEPTION 'Apontamento com tempo zerado (%s).', v_log.tempo_segundos USING ERRCODE = '22023';
    END IF;

    v_notes := coalesce(
        p_notes_override,
        format('VDESK OS %s — %s — Lançamento automatizado FlagHub',
               v_log.num_os, coalesce(v_log.usuario_vdesk, '?'))
    );

    INSERT INTO public.timelog_post_queue (
        vdesk_log_id, task_devops, log_date, time_minutes,
        target_user_email, target_user_display, vdesk_user_name,
        notes, dry_run, status, selected_by, selected_at
    )
    VALUES (
        v_log.id, v_log.task_devops, v_log.log_date, v_minutes,
        v_email, v_display, v_log.usuario_vdesk,
        v_notes, p_dry_run, 'pending', v_caller, now()
    )
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_timelog_queue_post(uuid, text, boolean, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_timelog_queue_post(uuid, text, boolean, text) TO authenticated;

-- ── 4. rpc_timelog_set_status: owner da Fábrica precisa estar ATIVO ─────────
-- Corpo idêntico ao vigente (20260514160000) exceto `m.is_active = true`.
CREATE OR REPLACE FUNCTION public.rpc_timelog_set_status(
    p_queue_id  uuid,
    p_action    text,
    p_reason    text DEFAULT NULL
)
RETURNS public.timelog_post_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_caller uuid := auth.uid();
    v_is_admin boolean;
    v_row public.timelog_post_queue%ROWTYPE;
    v_new_status text;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Autenticação obrigatória.' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.hub_user_global_roles
         WHERE user_id = v_caller AND role = 'admin'
        UNION ALL
        SELECT 1 FROM public.user_roles
         WHERE user_id = v_caller AND role = 'admin'
        UNION ALL
        SELECT 1
          FROM public.hub_area_members m
          JOIN public.hub_areas a ON a.id = m.area_id
         WHERE m.user_id = v_caller
           AND m.is_active = true
           AND m.area_role = 'owner'
           AND a.key = 'fabrica'
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Apenas admins ou owner da Fábrica podem aprovar/rejeitar lançamentos.' USING ERRCODE = '42501';
    END IF;

    v_new_status := CASE p_action
        WHEN 'approve' THEN 'approved'
        WHEN 'reject'  THEN 'rejected'
        WHEN 'reset'   THEN 'pending'
        ELSE NULL
    END;

    IF v_new_status IS NULL THEN
        RAISE EXCEPTION 'Ação inválida: %.', p_action USING ERRCODE = '22023';
    END IF;

    UPDATE public.timelog_post_queue
       SET status         = v_new_status,
           approved_by    = CASE WHEN v_new_status = 'approved' THEN v_caller ELSE approved_by END,
           approved_at    = CASE WHEN v_new_status = 'approved' THEN now()    ELSE approved_at END,
           error_message  = coalesce(p_reason, error_message)
     WHERE id = p_queue_id
     RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item de fila não encontrado: %.', p_queue_id USING ERRCODE = 'P0002';
    END IF;

    RETURN v_row;
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_timelog_set_status(uuid, text, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_timelog_set_status(uuid, text, text) TO authenticated;
