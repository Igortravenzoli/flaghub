-- =============================================================================
-- SEGURANÇA — fecha regressão de RLS no módulo de timelog (USING (true))
--
-- Achado (auditoria 25/07/2026, ao expor a aba de Logs): as três tabelas do
-- módulo de timelog têm policy de SELECT `USING (true)` para `authenticated` —
-- qualquer usuário logado lê a base inteira de horas, INCLUSIVE quem acabou de
-- se cadastrar e ainda está com acesso pendente (sem nenhuma linha ativa em
-- hub_area_members).
--
-- O dado não é trivial: `timelog_post_queue` expõe target_user_email,
-- target_user_display, vdesk_user_name, log_date, time_minutes e notes — quem
-- trabalhou, em que task, quantos minutos, em que dia.
--
-- Isto é REGRESSÃO, não decisão: a migration 20260421180000 existe justamente
-- para eliminar esse padrão (remediação de pentest, ~37 policies `USING (true)`)
-- e já endureceu a tabela-gêmea `devops_time_logs` para `hub_is_approved()`
-- (linhas 120-125). O módulo de timelog nasceu 9 dias DEPOIS (20260430120000) e
-- reintroduziu o padrão; por ser posterior, é a policy vigente.
--
-- Correção: mesmo predicado da gêmea. `hub_is_approved()` = tem alguma
-- membresia ativa de área OU é admin — portanto:
--   • admin, owner e membros de qualquer setor continuam lendo (nada quebra:
--     a aba de Logs, a tela de nivelamento e o painel de reconciliação usam
--     usuários aprovados);
--   • usuário sem aprovação deixa de ler horas de todo mundo.
--
-- O gate do front (`canManageTimelog`) é UX, não segurança: o PostgREST é
-- alcançável direto com a anon key + qualquer JWT.
-- =============================================================================

-- ── vdesk_time_logs ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "vdesk_time_logs_select" ON public.vdesk_time_logs;
CREATE POLICY "vdesk_time_logs_select" ON public.vdesk_time_logs
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- ── timelog_post_queue ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "timelog_post_queue_select" ON public.timelog_post_queue;
CREATE POLICY "timelog_post_queue_select" ON public.timelog_post_queue
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- ── timelog_sync_runs ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "timelog_sync_runs_select" ON public.timelog_sync_runs;
CREATE POLICY "timelog_sync_runs_select" ON public.timelog_sync_runs
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- Escrita permanece exclusiva de service_role (edges) e das RPCs
-- SECURITY DEFINER — nenhuma policy de INSERT/UPDATE/DELETE foi criada aqui.
