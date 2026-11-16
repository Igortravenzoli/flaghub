-- =============================================================================
-- RLS-A — ROLLBACK de emergência da migration 20261116120000.
-- REABRE as falhas de segurança. Use só se uma tela que deveria funcionar
-- ficar vazia/quebrada para quem é aprovado (ex.: telão zerado) e não houver
-- conserto rápido. Rodar numa transação (o scripts/rls-a-prod.mjs faz isso).
--
-- O que volta: as políticas abertas originais e o corpo das RPCs sem a linha do
-- guard (a linha marcada com `-- RLS-A guard` é retirada do corpo vivo).
-- O que NÃO volta, de propósito:
--   • os REVOKE de PUBLIC/anon nas funções (nenhuma tela anônima as usa);
--   • rpc_timelog_queue_post / rpc_timelog_set_status (a UI já só mostra o
--     Nivelamento para admin/owner; voltar seria reabrir "qualquer logado
--     enfileira horas para qualquer e-mail");
--   • as funções hub_assert_* (ficam órfãs e inofensivas).
-- =============================================================================

DO $rb$
DECLARE
  r     record;
  v_src text;
  v_def text;
  v_pos int;
BEGIN
  FOR r IN
    SELECT p.oid, p.prosrc
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND position('-- RLS-A guard' IN p.prosrc) > 0
  LOOP
    v_src := regexp_replace(r.prosrc,
      '\n  (SELECT|PERFORM) public\.hub_assert_[a-z_]+\([^)]*\); -- RLS-A guard\n', '', 'g');
    IF position('-- RLS-A guard' IN v_src) > 0 THEN
      RAISE EXCEPTION 'RLS-A rollback: não consegui retirar o guard de %', r.oid::regprocedure;
    END IF;
    v_def := pg_get_functiondef(r.oid);
    v_pos := position(r.prosrc IN v_def);
    EXECUTE overlay(v_def PLACING v_src FROM v_pos FOR length(r.prosrc));
    RAISE NOTICE 'RLS-A rollback: guard retirado de %', r.oid::regprocedure;
  END LOOP;

  IF to_regclass('public.fabrica_read_entries') IS NOT NULL THEN
    DROP POLICY IF EXISTS "fabrica_read_entries_select" ON public.fabrica_read_entries;
    DROP POLICY IF EXISTS "fabrica_read_entries_insert" ON public.fabrica_read_entries;
    DROP POLICY IF EXISTS "fabrica_read_entries_update" ON public.fabrica_read_entries;
    DROP POLICY IF EXISTS "Allow public read"          ON public.fabrica_read_entries;
    DROP POLICY IF EXISTS "Allow public insert update" ON public.fabrica_read_entries;
    DROP POLICY IF EXISTS "Allow public update"        ON public.fabrica_read_entries;
    DROP POLICY IF EXISTS "authenticated_insert"       ON public.fabrica_read_entries;
    DROP POLICY IF EXISTS "authenticated_update"       ON public.fabrica_read_entries;
    -- Estado de produção lido em 16/11/2026 (não o do arquivo 20260520150000).
    CREATE POLICY "Allow public read" ON public.fabrica_read_entries FOR SELECT USING (true);
    CREATE POLICY "authenticated_insert" ON public.fabrica_read_entries
      FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
    CREATE POLICY "authenticated_update" ON public.fabrica_read_entries
      FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
    GRANT SELECT, INSERT, UPDATE ON public.fabrica_read_entries TO anon;
  END IF;

  IF to_regclass('public.comercial_metas') IS NOT NULL THEN
    DROP POLICY IF EXISTS "comercial_metas_select" ON public.comercial_metas;
    DROP POLICY IF EXISTS "comercial_metas_select_anon" ON public.comercial_metas;
    DROP POLICY IF EXISTS "comercial_metas_select_authenticated" ON public.comercial_metas;
    CREATE POLICY "comercial_metas_select_anon" ON public.comercial_metas FOR SELECT TO anon USING (true);
    CREATE POLICY "comercial_metas_select_authenticated" ON public.comercial_metas FOR SELECT TO authenticated USING (true);
    GRANT SELECT ON public.comercial_metas TO anon;
  END IF;

  IF to_regclass('public.sprint_indicator_snapshots') IS NOT NULL THEN
    DROP POLICY IF EXISTS "snapshot_select_approved" ON public.sprint_indicator_snapshots;
    DROP POLICY IF EXISTS "snapshot_select_authenticated" ON public.sprint_indicator_snapshots;
    CREATE POLICY "snapshot_select_authenticated" ON public.sprint_indicator_snapshots
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF to_regclass('public.devops_projects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "devops_projects_select" ON public.devops_projects;
    CREATE POLICY "devops_projects_select" ON public.devops_projects FOR SELECT TO authenticated USING (true);
  END IF;
  IF to_regclass('public.devops_repos') IS NOT NULL THEN
    DROP POLICY IF EXISTS "devops_repos_select" ON public.devops_repos;
    CREATE POLICY "devops_repos_select" ON public.devops_repos FOR SELECT TO authenticated USING (true);
  END IF;
  IF to_regclass('public.comercial_funil') IS NOT NULL THEN
    DROP POLICY IF EXISTS "comercial_funil_select" ON public.comercial_funil;
    CREATE POLICY "comercial_funil_select" ON public.comercial_funil FOR SELECT TO authenticated USING (true);
  END IF;
  IF to_regclass('public.comercial_funil_lancamentos') IS NOT NULL THEN
    DROP POLICY IF EXISTS "comercial_funil_lanc_select" ON public.comercial_funil_lancamentos;
    CREATE POLICY "comercial_funil_lanc_select" ON public.comercial_funil_lancamentos FOR SELECT TO authenticated USING (true);
  END IF;
  IF to_regclass('public.comercial_produtos') IS NOT NULL THEN
    DROP POLICY IF EXISTS "comercial_produtos_select" ON public.comercial_produtos;
    CREATE POLICY "comercial_produtos_select" ON public.comercial_produtos FOR SELECT TO authenticated USING (true);
  END IF;
  IF to_regclass('public.fabrica_squad_membership') IS NOT NULL THEN
    DROP POLICY IF EXISTS "fabrica_squad_membership_select" ON public.fabrica_squad_membership;
    CREATE POLICY "fabrica_squad_membership_select" ON public.fabrica_squad_membership FOR SELECT TO authenticated USING (true);
  END IF;
  IF to_regclass('public.devops_tag_dicionario') IS NOT NULL THEN
    DROP POLICY IF EXISTS "tag_dicionario_leitura_autenticada" ON public.devops_tag_dicionario;
    CREATE POLICY "tag_dicionario_leitura_autenticada" ON public.devops_tag_dicionario FOR SELECT TO authenticated USING (true);
  END IF;
END
$rb$;
