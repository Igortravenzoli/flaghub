-- ============================================================================
-- RLS-B — fecha as 9 políticas de leitura que ficaram abertas em produção
--
-- Achado em 16/11/2026 pela verificação de isolamento do Timer
-- (supabase/verificacao/tm1_isolamento_timer.sql): em produção estas tabelas
-- tinham SELECT `USING (true)` para qualquer conta logada, inclusive as
-- PENDENTES (SSO sem área nenhuma). A 20260421180000 (pentest) deveria ter
-- trocado essas políticas por hub_is_approved(), mas nelas a troca nunca
-- aconteceu; e a RLS-A (20261116120000, PR #96) não as listava.
--
-- O que faz: em cada tabela, derruba a(s) política(s) de leitura aberta(s) e
-- cria uma de leitura para aprovado (`hub_is_approved()` = membro ativo de
-- alguma área OU admin), a mesma régua das outras tabelas de KPI.
--
-- Quem continua lendo: todo usuário com área (o monitor do telão incluso) e
-- admin. As edges de sync usam service role (ignora RLS). Quem perde: só quem
-- não tem área nenhuma — o pendente e quem tem só o Timer Flag.
--
-- Não mexe nas políticas de escrita. Fica registrado, sem mudar aqui:
-- `collab_map_admin_mut` deixa o OWNER de QUALQUER área escrever em
-- devops_collaborator_map.
-- ============================================================================

-- devops_work_items
DROP POLICY IF EXISTS devops_work_items_select_auth ON public.devops_work_items;
DROP POLICY IF EXISTS devops_work_items_select_aprovado ON public.devops_work_items;
CREATE POLICY devops_work_items_select_aprovado ON public.devops_work_items
  FOR SELECT TO authenticated USING (public.hub_is_approved());

-- devops_query_items_current
DROP POLICY IF EXISTS devops_query_items_select_auth ON public.devops_query_items_current;
DROP POLICY IF EXISTS devops_query_items_select_aprovado ON public.devops_query_items_current;
CREATE POLICY devops_query_items_select_aprovado ON public.devops_query_items_current
  FOR SELECT TO authenticated USING (public.hub_is_approved());

-- devops_collaborator_map
DROP POLICY IF EXISTS collab_map_select_auth ON public.devops_collaborator_map;
DROP POLICY IF EXISTS collab_map_select_aprovado ON public.devops_collaborator_map;
CREATE POLICY collab_map_select_aprovado ON public.devops_collaborator_map
  FOR SELECT TO authenticated USING (public.hub_is_approved());

-- vdesk_clients (tinha DUAS abertas)
DROP POLICY IF EXISTS "Authenticated users can read vdesk clients" ON public.vdesk_clients;
DROP POLICY IF EXISTS vdesk_clients_select ON public.vdesk_clients;
DROP POLICY IF EXISTS vdesk_clients_select_aprovado ON public.vdesk_clients;
CREATE POLICY vdesk_clients_select_aprovado ON public.vdesk_clients
  FOR SELECT TO authenticated USING (public.hub_is_approved());

-- hub_area_inheritance
DROP POLICY IF EXISTS hub_area_inheritance_select_auth ON public.hub_area_inheritance;
DROP POLICY IF EXISTS hub_area_inheritance_select_aprovado ON public.hub_area_inheritance;
CREATE POLICY hub_area_inheritance_select_aprovado ON public.hub_area_inheritance
  FOR SELECT TO authenticated USING (public.hub_is_approved());

-- manual_import_templates
DROP POLICY IF EXISTS templates_select ON public.manual_import_templates;
DROP POLICY IF EXISTS templates_select_aprovado ON public.manual_import_templates;
CREATE POLICY templates_select_aprovado ON public.manual_import_templates
  FOR SELECT TO authenticated USING (public.hub_is_approved());

-- pbi_health_thresholds
DROP POLICY IF EXISTS "Authenticated users can read pbi health thresholds" ON public.pbi_health_thresholds;
DROP POLICY IF EXISTS pbi_health_thresholds_select_aprovado ON public.pbi_health_thresholds;
CREATE POLICY pbi_health_thresholds_select_aprovado ON public.pbi_health_thresholds
  FOR SELECT TO authenticated USING (public.hub_is_approved());

-- pbi_stage_config
DROP POLICY IF EXISTS "Authenticated users can read pbi stage config" ON public.pbi_stage_config;
DROP POLICY IF EXISTS pbi_stage_config_select_aprovado ON public.pbi_stage_config;
CREATE POLICY pbi_stage_config_select_aprovado ON public.pbi_stage_config
  FOR SELECT TO authenticated USING (public.hub_is_approved());

-- sector_health
DROP POLICY IF EXISTS sector_health_select_auth ON public.sector_health;
DROP POLICY IF EXISTS sector_health_select_aprovado ON public.sector_health;
CREATE POLICY sector_health_select_aprovado ON public.sector_health
  FOR SELECT TO authenticated USING (public.hub_is_approved());
