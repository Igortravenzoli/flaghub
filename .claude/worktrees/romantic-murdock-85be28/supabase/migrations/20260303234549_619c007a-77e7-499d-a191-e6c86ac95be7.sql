
-- ============================================================
-- FlagHub Phase 1: Governance + Integration + DevOps tables
-- ============================================================

-- 1. Hub Areas
CREATE TABLE IF NOT EXISTS public.hub_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Hub Dashboards
CREATE TABLE IF NOT EXISTS public.hub_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES public.hub_areas(id) ON DELETE CASCADE,
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  is_confidential boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Hub Metrics Registry
CREATE TABLE IF NOT EXISTS public.hub_metrics_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES public.hub_dashboards(id) ON DELETE CASCADE,
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  formula_description text,
  source_system text NOT NULL DEFAULT 'other',
  return_type text NOT NULL DEFAULT 'number',
  is_confidential boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Hub User Global Roles
CREATE TABLE IF NOT EXISTS public.hub_user_global_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  is_local_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Hub Area Members
CREATE TABLE IF NOT EXISTS public.hub_area_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.hub_areas(id) ON DELETE CASCADE,
  area_role text NOT NULL DEFAULT 'viewer' CHECK (area_role IN ('viewer','owner')),
  can_view_confidential boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  network_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, area_id)
);

-- 6. Hub Access Requests
CREATE TABLE IF NOT EXISTS public.hub_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.hub_areas(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id),
  UNIQUE (user_id, area_id, status)
);

-- 7. Hub IP Allowlist
CREATE TABLE IF NOT EXISTS public.hub_ip_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidr inet NOT NULL,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Hub Audit Logs
CREATE TABLE IF NOT EXISTS public.hub_audit_logs (
  id bigserial PRIMARY KEY,
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Hub Manual Uploads
CREATE TABLE IF NOT EXISTS public.hub_manual_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES public.hub_areas(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('csv','xlsx','json')),
  storage_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
  error text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Hub Integrations
CREATE TABLE IF NOT EXISTS public.hub_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  type text,
  base_url text,
  auth_type text DEFAULT 'none',
  is_active boolean NOT NULL DEFAULT true,
  config jsonb,
  last_health_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. Hub Integration Endpoints
CREATE TABLE IF NOT EXISTS public.hub_integration_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.hub_integrations(id) ON DELETE CASCADE,
  key text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  path text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 12. Hub Sync Jobs
CREATE TABLE IF NOT EXISTS public.hub_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.hub_integrations(id) ON DELETE CASCADE,
  area_id uuid REFERENCES public.hub_areas(id),
  job_key text UNIQUE NOT NULL,
  schedule_minutes int,
  schedule_cron text,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  config jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 13. Hub Sync Runs
CREATE TABLE IF NOT EXISTS public.hub_sync_runs (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.hub_sync_jobs(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('ok','error','running')),
  items_found int DEFAULT 0,
  items_upserted int DEFAULT 0,
  duration_ms int,
  error text,
  meta jsonb
);

-- 14. DevOps Queries
CREATE TABLE IF NOT EXISTS public.devops_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  wiql_id text,
  is_active boolean NOT NULL DEFAULT true,
  config jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 15. DevOps Work Items
CREATE TABLE IF NOT EXISTS public.devops_work_items (
  id int PRIMARY KEY,
  rev int NOT NULL DEFAULT 0,
  work_item_type text,
  title text,
  state text,
  assigned_to text,
  area_path text,
  iteration_path text,
  tags text,
  parent_id int,
  web_url text,
  custom_fields jsonb DEFAULT '{}'::jsonb,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 16. DevOps Query Items Current
CREATE TABLE IF NOT EXISTS public.devops_query_items_current (
  query_id uuid NOT NULL REFERENCES public.devops_queries(id) ON DELETE CASCADE,
  work_item_id int NOT NULL REFERENCES public.devops_work_items(id) ON DELETE CASCADE,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (query_id, work_item_id)
);

-- 17. DevOps Time Logs
CREATE TABLE IF NOT EXISTS public.devops_time_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text,
  user_id_ext text,
  work_item_id int,
  log_date date NOT NULL,
  start_time text,
  time_minutes int NOT NULL DEFAULT 0,
  notes text,
  etag text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id)
);

-- ============================================================
-- Utility Functions (SECURITY DEFINER, no recursive RLS)
-- ============================================================

-- hub_is_admin: checks hub_user_global_roles
CREATE OR REPLACE FUNCTION public.hub_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hub_user_global_roles
    WHERE user_id = (SELECT auth.uid())
      AND role = 'admin'
  );
$$;

-- hub_user_has_area: checks active membership
CREATE OR REPLACE FUNCTION public.hub_user_has_area(p_area_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hub_area_members
    WHERE user_id = (SELECT auth.uid())
      AND area_id = p_area_id
      AND is_active = true
  );
$$;

-- hub_request_ip: read IP from request headers
CREATE OR REPLACE FUNCTION public.hub_request_ip()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    current_setting('request.headers', true)::json->>'cf-connecting-ip',
    current_setting('request.headers', true)::json->>'x-forwarded-for',
    'unknown'
  );
$$;

-- hub_is_ip_allowed: validate IP against allowlist
CREATE OR REPLACE FUNCTION public.hub_is_ip_allowed()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hub_ip_allowlist
    WHERE is_active = true
      AND (public.hub_request_ip())::inet <<= cidr
  )
  -- If no active entries, allow all (avoid lockout)
  OR NOT EXISTS (
    SELECT 1 FROM public.hub_ip_allowlist WHERE is_active = true
  );
$$;

-- hub_can_view_confidential: membership + IP
CREATE OR REPLACE FUNCTION public.hub_can_view_confidential(p_area_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hub_area_members
    WHERE user_id = (SELECT auth.uid())
      AND area_id = p_area_id
      AND is_active = true
      AND can_view_confidential = true
  ) AND public.hub_is_ip_allowed();
$$;

-- hub_audit_log: RPC to insert audit log
CREATE OR REPLACE FUNCTION public.hub_audit_log(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.hub_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES ((SELECT auth.uid()), p_action, p_entity_type, p_entity_id, p_metadata);
END;
$$;

-- ============================================================
-- RLS Policies
-- ============================================================

-- hub_areas
ALTER TABLE public.hub_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_areas_select" ON public.hub_areas FOR SELECT TO authenticated
  USING (public.hub_is_admin() OR EXISTS (
    SELECT 1 FROM public.hub_area_members
    WHERE hub_area_members.user_id = (SELECT auth.uid())
      AND hub_area_members.area_id = hub_areas.id
      AND hub_area_members.is_active = true
  ));
CREATE POLICY "hub_areas_admin_all" ON public.hub_areas FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

-- hub_dashboards
ALTER TABLE public.hub_dashboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_dashboards_select" ON public.hub_dashboards FOR SELECT TO authenticated
  USING (public.hub_is_admin() OR public.hub_user_has_area(area_id));
CREATE POLICY "hub_dashboards_admin_all" ON public.hub_dashboards FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

-- hub_metrics_registry
ALTER TABLE public.hub_metrics_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_metrics_select" ON public.hub_metrics_registry FOR SELECT TO authenticated
  USING (public.hub_is_admin() OR EXISTS (
    SELECT 1 FROM public.hub_dashboards d
    WHERE d.id = hub_metrics_registry.dashboard_id
      AND public.hub_user_has_area(d.area_id)
  ));
CREATE POLICY "hub_metrics_admin_all" ON public.hub_metrics_registry FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

-- hub_user_global_roles
ALTER TABLE public.hub_user_global_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_global_roles_select_own" ON public.hub_user_global_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.hub_is_admin());
CREATE POLICY "hub_global_roles_admin_all" ON public.hub_user_global_roles FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

-- hub_area_members
ALTER TABLE public.hub_area_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_members_select" ON public.hub_area_members FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.hub_is_admin());
CREATE POLICY "hub_members_admin_all" ON public.hub_area_members FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

-- hub_access_requests
ALTER TABLE public.hub_access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_requests_insert_own" ON public.hub_access_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "hub_requests_select" ON public.hub_access_requests FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.hub_is_admin());
CREATE POLICY "hub_requests_admin_update" ON public.hub_access_requests FOR UPDATE TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

-- hub_ip_allowlist
ALTER TABLE public.hub_ip_allowlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_ip_admin_all" ON public.hub_ip_allowlist FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

-- hub_audit_logs
ALTER TABLE public.hub_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_audit_select_admin" ON public.hub_audit_logs FOR SELECT TO authenticated
  USING (public.hub_is_admin());
-- INSERT handled via hub_audit_log RPC (security definer)

-- hub_manual_uploads
ALTER TABLE public.hub_manual_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_uploads_select" ON public.hub_manual_uploads FOR SELECT TO authenticated
  USING (public.hub_is_admin() OR public.hub_user_has_area(area_id));
CREATE POLICY "hub_uploads_insert" ON public.hub_manual_uploads FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid()) AND (
      public.hub_is_admin() OR EXISTS (
        SELECT 1 FROM public.hub_area_members
        WHERE user_id = (SELECT auth.uid())
          AND area_id = hub_manual_uploads.area_id
          AND area_role = 'owner'
          AND is_active = true
      )
    )
  );
CREATE POLICY "hub_uploads_admin_update" ON public.hub_manual_uploads FOR UPDATE TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

-- hub_integrations
ALTER TABLE public.hub_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_integrations_select" ON public.hub_integrations FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "hub_integrations_admin_all" ON public.hub_integrations FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

-- hub_integration_endpoints
ALTER TABLE public.hub_integration_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_endpoints_select" ON public.hub_integration_endpoints FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "hub_endpoints_admin_all" ON public.hub_integration_endpoints FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

-- hub_sync_jobs
ALTER TABLE public.hub_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_sync_jobs_select" ON public.hub_sync_jobs FOR SELECT TO authenticated
  USING (public.hub_is_admin() OR (
    area_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.hub_area_members
      WHERE user_id = (SELECT auth.uid())
        AND area_id = hub_sync_jobs.area_id
        AND area_role = 'owner'
        AND is_active = true
    )
  ));
CREATE POLICY "hub_sync_jobs_admin_all" ON public.hub_sync_jobs FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

-- hub_sync_runs
ALTER TABLE public.hub_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_sync_runs_select" ON public.hub_sync_runs FOR SELECT TO authenticated
  USING (public.hub_is_admin() OR EXISTS (
    SELECT 1 FROM public.hub_sync_jobs j
    JOIN public.hub_area_members m ON m.area_id = j.area_id
    WHERE j.id = hub_sync_runs.job_id
      AND m.user_id = (SELECT auth.uid())
      AND m.area_role = 'owner'
      AND m.is_active = true
  ));
CREATE POLICY "hub_sync_runs_admin_all" ON public.hub_sync_runs FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

-- devops tables: admin-only for now
ALTER TABLE public.devops_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devops_queries_admin" ON public.devops_queries FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

ALTER TABLE public.devops_work_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devops_work_items_select" ON public.devops_work_items FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "devops_work_items_admin_mut" ON public.devops_work_items FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

ALTER TABLE public.devops_query_items_current ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devops_query_items_select" ON public.devops_query_items_current FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "devops_query_items_admin_mut" ON public.devops_query_items_current FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

ALTER TABLE public.devops_time_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devops_time_logs_select" ON public.devops_time_logs FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "devops_time_logs_admin_mut" ON public.devops_time_logs FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());
