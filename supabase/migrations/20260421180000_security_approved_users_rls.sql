-- =============================================================================
-- SECURITY: Require approved status for all authenticated data access
-- =============================================================================
-- Pentest Report #3 (2026-04-21) — CRÍTICO-2 / ALTO-1 / ALTO-2 remediation
-- Findings: authenticated-but-unapproved users can read all business data
-- Root cause: ~37 RLS policies use USING (true) for any authenticated role
--
-- This migration:
--   1. Creates hub_is_approved() — checks hub_area_members.is_active = true OR is admin
--   2. Replaces all USING (true) authenticated SELECT policies with hub_is_approved()
--   3. Fixes hub_access_requests INSERT to prevent self-approval (status = 'approved')
--   4. Adds admin-only DELETE on hub_access_requests
--   5. Adds trigger to protect profiles.mfa_exempt from non-admin modification
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. hub_is_approved() — reusable approval gate for RLS policies
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hub_is_approved()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hub_area_members
    WHERE user_id = auth.uid()
      AND is_active = true
  ) OR public.hub_is_admin();
$$;

-- ---------------------------------------------------------------------------
-- 2. Fix hub_access_requests INSERT — prevent self-approval attack
-- Ronald's finding: INSERT with status='approved' succeeded, bypassing workflow
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "hub_requests_insert_own" ON public.hub_access_requests;
CREATE POLICY "hub_requests_insert_own" ON public.hub_access_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status = 'pending'
  );

-- 3. Restrict DELETE on hub_access_requests to admins only
DROP POLICY IF EXISTS "hub_requests_delete_admin" ON public.hub_access_requests;
CREATE POLICY "hub_requests_delete_admin" ON public.hub_access_requests
  FOR DELETE TO authenticated
  USING (public.hub_is_admin());

-- ---------------------------------------------------------------------------
-- 4. Replace USING (true) policies — hub governance tables
-- ---------------------------------------------------------------------------

-- hub_integrations
DROP POLICY IF EXISTS "hub_integrations_select" ON public.hub_integrations;
DROP POLICY IF EXISTS "Authenticated users can read integrations" ON public.hub_integrations;
DROP POLICY IF EXISTS "hub_integrations_select_safe" ON public.hub_integrations;
CREATE POLICY "hub_integrations_select" ON public.hub_integrations
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- hub_integration_endpoints
DROP POLICY IF EXISTS "hub_endpoints_select" ON public.hub_integration_endpoints;
CREATE POLICY "hub_endpoints_select" ON public.hub_integration_endpoints
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- hub_sync_jobs
DROP POLICY IF EXISTS "Authenticated users can read sync jobs" ON public.hub_sync_jobs;
CREATE POLICY "hub_sync_jobs_select" ON public.hub_sync_jobs
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- hub_sync_runs
DROP POLICY IF EXISTS "Authenticated users can read sync runs" ON public.hub_sync_runs;
CREATE POLICY "hub_sync_runs_select" ON public.hub_sync_runs
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- hub_raw_ingestions
DROP POLICY IF EXISTS "Authenticated users can read raw ingestions" ON public.hub_raw_ingestions;
CREATE POLICY "hub_raw_ingestions_select" ON public.hub_raw_ingestions
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- hub_audit_logs
DROP POLICY IF EXISTS "hub_audit_logs_select" ON public.hub_audit_logs;
DROP POLICY IF EXISTS "Authenticated users can read audit logs" ON public.hub_audit_logs;
CREATE POLICY "hub_audit_logs_select" ON public.hub_audit_logs
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- hub_area_inheritance
DROP POLICY IF EXISTS "hub_area_inheritance_select_auth" ON public.hub_area_inheritance;
CREATE POLICY "hub_area_inheritance_select_auth" ON public.hub_area_inheritance
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- ---------------------------------------------------------------------------
-- 5. Replace USING (true) policies — DevOps tables
-- ---------------------------------------------------------------------------

-- devops_work_items (multiple duplicate policies from different migrations)
DROP POLICY IF EXISTS "devops_work_items_select" ON public.devops_work_items;
DROP POLICY IF EXISTS "Authenticated users can read work items" ON public.devops_work_items;
DROP POLICY IF EXISTS "devops_work_items_select_auth" ON public.devops_work_items;
CREATE POLICY "devops_work_items_select" ON public.devops_work_items
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- devops_query_items_current
DROP POLICY IF EXISTS "devops_query_items_select" ON public.devops_query_items_current;
DROP POLICY IF EXISTS "Authenticated users can read query items" ON public.devops_query_items_current;
DROP POLICY IF EXISTS "devops_query_items_select_auth" ON public.devops_query_items_current;
CREATE POLICY "devops_query_items_select" ON public.devops_query_items_current
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- devops_time_logs
DROP POLICY IF EXISTS "devops_time_logs_select" ON public.devops_time_logs;
DROP POLICY IF EXISTS "devops_time_logs_select_auth" ON public.devops_time_logs;
CREATE POLICY "devops_time_logs_select" ON public.devops_time_logs
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- devops_queries
DROP POLICY IF EXISTS "Authenticated users can read active devops queries" ON public.devops_queries;
DROP POLICY IF EXISTS "devops_queries_select" ON public.devops_queries;
CREATE POLICY "devops_queries_select" ON public.devops_queries
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- devops_collaborator_map
DROP POLICY IF EXISTS "collab_map_select_auth" ON public.devops_collaborator_map;
CREATE POLICY "collab_map_select_auth" ON public.devops_collaborator_map
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- ---------------------------------------------------------------------------
-- 6. Replace USING (true) policies — VDesk / Helpdesk tables
-- Nestlé PII (20,000+ client records) exposed — Ronald's critical finding
-- ---------------------------------------------------------------------------

-- vdesk_clients
DROP POLICY IF EXISTS "vdesk_clients_select" ON public.vdesk_clients;
DROP POLICY IF EXISTS "Authenticated users can read vdesk clients" ON public.vdesk_clients;
CREATE POLICY "vdesk_clients_select" ON public.vdesk_clients
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- helpdesk_dashboard_snapshots
DROP POLICY IF EXISTS "helpdesk_snap_select" ON public.helpdesk_dashboard_snapshots;
DROP POLICY IF EXISTS "Authenticated users can read helpdesk snapshots" ON public.helpdesk_dashboard_snapshots;
DROP POLICY IF EXISTS "helpdesk_snap_select_auth" ON public.helpdesk_dashboard_snapshots;
CREATE POLICY "helpdesk_snap_select" ON public.helpdesk_dashboard_snapshots
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- manual_import_templates
DROP POLICY IF EXISTS "templates_select" ON public.manual_import_templates;
CREATE POLICY "templates_select" ON public.manual_import_templates
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- ---------------------------------------------------------------------------
-- 7. Replace USING (true) policies — Alert / Monitoring tables
-- ---------------------------------------------------------------------------

-- sector_health
DROP POLICY IF EXISTS "sector_health_select_auth" ON public.sector_health;
CREATE POLICY "sector_health_select_auth" ON public.sector_health
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- alert_channels
DROP POLICY IF EXISTS "alert_channels_select_auth" ON public.alert_channels;
CREATE POLICY "alert_channels_select_auth" ON public.alert_channels
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- alert_rules
DROP POLICY IF EXISTS "alert_rules_select_auth" ON public.alert_rules;
CREATE POLICY "alert_rules_select_auth" ON public.alert_rules
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- alert_deliveries
DROP POLICY IF EXISTS "alert_deliveries_select_auth" ON public.alert_deliveries;
CREATE POLICY "alert_deliveries_select_auth" ON public.alert_deliveries
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- ---------------------------------------------------------------------------
-- 8. Replace USING (true) policies — Comercial tables (LGPD-sensitive)
-- ---------------------------------------------------------------------------

-- comercial_pesquisa_satisfacao
DROP POLICY IF EXISTS "Authenticated users can read comercial_pesquisa_satisfacao" ON public.comercial_pesquisa_satisfacao;
DROP POLICY IF EXISTS "comercial_pesquisa_satisfacao_select" ON public.comercial_pesquisa_satisfacao;
CREATE POLICY "comercial_pesquisa_satisfacao_select" ON public.comercial_pesquisa_satisfacao
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- comercial_movimentacao_clientes
DROP POLICY IF EXISTS "Authenticated users can read comercial_movimentacao_clientes" ON public.comercial_movimentacao_clientes;
DROP POLICY IF EXISTS "comercial_movimentacao_clientes_select" ON public.comercial_movimentacao_clientes;
CREATE POLICY "comercial_movimentacao_clientes_select" ON public.comercial_movimentacao_clientes
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- comercial_vendas
DROP POLICY IF EXISTS "Authenticated users can read comercial_vendas" ON public.comercial_vendas;
DROP POLICY IF EXISTS "comercial_vendas_select" ON public.comercial_vendas;
CREATE POLICY "comercial_vendas_select" ON public.comercial_vendas
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- ---------------------------------------------------------------------------
-- 9. Protect profiles.mfa_exempt from self-update by non-admins
-- CRÍTICO-1: authenticated users could set mfa_exempt=true to bypass MFA
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_mfa_exempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.mfa_exempt IS DISTINCT FROM OLD.mfa_exempt THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'permission denied: only administrators can modify mfa_exempt'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_mfa_exempt_trigger ON public.profiles;
CREATE TRIGGER protect_mfa_exempt_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_mfa_exempt();
