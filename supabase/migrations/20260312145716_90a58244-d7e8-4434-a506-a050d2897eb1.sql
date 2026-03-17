
-- ============================================================
-- PHASE 2 MIGRATION — DELTA (incremental, sem quebra)
-- ============================================================

-- 5.1 Expandir devops_work_items
ALTER TABLE public.devops_work_items ADD COLUMN IF NOT EXISTS team_project text;
ALTER TABLE public.devops_work_items ADD COLUMN IF NOT EXISTS assigned_to_display text;
ALTER TABLE public.devops_work_items ADD COLUMN IF NOT EXISTS assigned_to_unique text;
ALTER TABLE public.devops_work_items ADD COLUMN IF NOT EXISTS assigned_to_id text;
ALTER TABLE public.devops_work_items ADD COLUMN IF NOT EXISTS priority integer;
ALTER TABLE public.devops_work_items ADD COLUMN IF NOT EXISTS effort numeric;
ALTER TABLE public.devops_work_items ADD COLUMN IF NOT EXISTS api_url text;
ALTER TABLE public.devops_work_items ADD COLUMN IF NOT EXISTS created_date timestamptz;
ALTER TABLE public.devops_work_items ADD COLUMN IF NOT EXISTS changed_date timestamptz;

-- 5.2 Expandir devops_queries
ALTER TABLE public.devops_queries ADD COLUMN IF NOT EXISTS sector text;
ALTER TABLE public.devops_queries ADD COLUMN IF NOT EXISTS refresh_minutes integer;
ALTER TABLE public.devops_queries ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE public.devops_queries ADD COLUMN IF NOT EXISTS source_mode text DEFAULT 'saved_query';
ALTER TABLE public.devops_queries ADD COLUMN IF NOT EXISTS wiql_text text;

-- 5.3 Expandir hub_metrics_registry
ALTER TABLE public.hub_metrics_registry ADD COLUMN IF NOT EXISTS source_reference text;
ALTER TABLE public.hub_metrics_registry ADD COLUMN IF NOT EXISTS calc_type text;
ALTER TABLE public.hub_metrics_registry ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE public.hub_metrics_registry ADD COLUMN IF NOT EXISTS notes text;

-- 5.4 hub_raw_ingestions
CREATE TABLE IF NOT EXISTS public.hub_raw_ingestions (
  id bigserial PRIMARY KEY,
  integration_id uuid REFERENCES public.hub_integrations(id),
  endpoint_id uuid REFERENCES public.hub_integration_endpoints(id),
  source_type text NOT NULL CHECK (source_type IN ('devops','api_gateway','vdesk','manual_file')),
  source_key text,
  external_id text,
  payload jsonb NOT NULL,
  payload_hash text,
  collected_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','ignored','error')),
  error text
);
ALTER TABLE public.hub_raw_ingestions ENABLE ROW LEVEL SECURITY;

-- 5.5 vdesk_clients
CREATE TABLE IF NOT EXISTS public.vdesk_clients (
  id bigserial PRIMARY KEY,
  nome text NOT NULL,
  apelido text,
  status text,
  bandeira text,
  sistemas jsonb DEFAULT '[]'::jsonb,
  sistemas_label text,
  source_hash text,
  synced_at timestamptz DEFAULT now(),
  raw jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.vdesk_clients ENABLE ROW LEVEL SECURITY;

-- 5.6 helpdesk_dashboard_snapshots
CREATE TABLE IF NOT EXISTS public.helpdesk_dashboard_snapshots (
  id bigserial PRIMARY KEY,
  periodo_tipo text,
  data_inicio date,
  data_fim date,
  consultor text,
  total_registros integer,
  total_minutos integer,
  raw jsonb NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.helpdesk_dashboard_snapshots ENABLE ROW LEVEL SECURITY;

-- 5.7A manual_import_templates
CREATE TABLE IF NOT EXISTS public.manual_import_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  area_id uuid REFERENCES public.hub_areas(id),
  version integer NOT NULL DEFAULT 1,
  allowed_file_types text[] NOT NULL DEFAULT '{csv,xlsx,json}',
  required_columns jsonb,
  optional_columns jsonb,
  column_mapping jsonb,
  validation_rules jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.manual_import_templates ENABLE ROW LEVEL SECURITY;

-- 5.7B manual_import_batches
CREATE TABLE IF NOT EXISTS public.manual_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid REFERENCES public.hub_manual_uploads(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.manual_import_templates(id),
  area_id uuid REFERENCES public.hub_areas(id),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','parsed','validated','rejected','published','error')),
  total_rows integer DEFAULT 0,
  valid_rows integer DEFAULT 0,
  invalid_rows integer DEFAULT 0,
  file_hash text,
  imported_by uuid,
  imported_at timestamptz DEFAULT now(),
  published_at timestamptz,
  published_by uuid,
  error text,
  meta jsonb
);
ALTER TABLE public.manual_import_batches ENABLE ROW LEVEL SECURITY;

-- 5.7C manual_import_rows
CREATE TABLE IF NOT EXISTS public.manual_import_rows (
  id bigserial PRIMARY KEY,
  batch_id uuid REFERENCES public.manual_import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  raw jsonb NOT NULL,
  normalized jsonb,
  validation_errors jsonb,
  is_valid boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.manual_import_rows ENABLE ROW LEVEL SECURITY;

-- 5.8A cs_implantacoes_records
CREATE TABLE IF NOT EXISTS public.cs_implantacoes_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.manual_import_batches(id),
  data_referencia date,
  cliente text,
  consultor text,
  solucao text,
  status_implantacao text,
  data_inicio date,
  data_fim date,
  horas_totais numeric,
  observacoes text,
  raw jsonb DEFAULT '{}'::jsonb,
  published_at timestamptz DEFAULT now()
);
ALTER TABLE public.cs_implantacoes_records ENABLE ROW LEVEL SECURITY;

-- 5.8B cs_fila_manual_records
CREATE TABLE IF NOT EXISTS public.cs_fila_manual_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.manual_import_batches(id),
  data_referencia date,
  id_origem text,
  cliente text,
  responsavel text,
  status text,
  data_entrada timestamptz,
  data_saida timestamptz,
  prioridade text,
  observacoes text,
  raw jsonb DEFAULT '{}'::jsonb,
  published_at timestamptz DEFAULT now()
);
ALTER TABLE public.cs_fila_manual_records ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5.9 ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_devops_wi_changed_date ON public.devops_work_items (changed_date DESC);
CREATE INDEX IF NOT EXISTS idx_devops_wi_parent_id ON public.devops_work_items (parent_id);
CREATE INDEX IF NOT EXISTS idx_devops_wi_type_state ON public.devops_work_items (work_item_type, state);
CREATE INDEX IF NOT EXISTS idx_devops_wi_iteration ON public.devops_work_items (iteration_path);
CREATE INDEX IF NOT EXISTS idx_devops_wi_assigned ON public.devops_work_items (assigned_to_unique);
CREATE INDEX IF NOT EXISTS idx_devops_wi_custom_gin ON public.devops_work_items USING gin (custom_fields);

CREATE INDEX IF NOT EXISTS idx_raw_ingestions_source ON public.hub_raw_ingestions (source_type, source_key, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_ingestions_ext_id ON public.hub_raw_ingestions (external_id);

CREATE INDEX IF NOT EXISTS idx_manual_batches_status ON public.manual_import_batches (status);
CREATE INDEX IF NOT EXISTS idx_manual_batches_imported ON public.manual_import_batches (imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_manual_rows_batch ON public.manual_import_rows (batch_id);
CREATE INDEX IF NOT EXISTS idx_manual_rows_valid ON public.manual_import_rows (is_valid);

CREATE INDEX IF NOT EXISTS idx_vdesk_clients_status ON public.vdesk_clients (status);
CREATE INDEX IF NOT EXISTS idx_vdesk_clients_bandeira ON public.vdesk_clients (bandeira);

CREATE INDEX IF NOT EXISTS idx_helpdesk_snap_collected ON public.helpdesk_dashboard_snapshots (collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_helpdesk_snap_periodo ON public.helpdesk_dashboard_snapshots (periodo_tipo, data_inicio, data_fim);

-- ============================================================
-- 6) RLS POLICIES
-- ============================================================

-- hub_raw_ingestions: admin only
CREATE POLICY "hub_raw_admin_all" ON public.hub_raw_ingestions FOR ALL TO authenticated USING (hub_is_admin()) WITH CHECK (hub_is_admin());

-- vdesk_clients: admin mutate, authenticated read
CREATE POLICY "vdesk_clients_admin_mut" ON public.vdesk_clients FOR ALL TO authenticated USING (hub_is_admin()) WITH CHECK (hub_is_admin());
CREATE POLICY "vdesk_clients_select" ON public.vdesk_clients FOR SELECT TO authenticated USING (true);

-- helpdesk_dashboard_snapshots: admin mutate, authenticated read
CREATE POLICY "helpdesk_snap_admin_mut" ON public.helpdesk_dashboard_snapshots FOR ALL TO authenticated USING (hub_is_admin()) WITH CHECK (hub_is_admin());
CREATE POLICY "helpdesk_snap_select" ON public.helpdesk_dashboard_snapshots FOR SELECT TO authenticated USING (true);

-- manual_import_templates: admin mutate, authenticated read
CREATE POLICY "templates_admin_mut" ON public.manual_import_templates FOR ALL TO authenticated USING (hub_is_admin()) WITH CHECK (hub_is_admin());
CREATE POLICY "templates_select" ON public.manual_import_templates FOR SELECT TO authenticated USING (true);

-- manual_import_batches: admin all + area owner insert + area member select
CREATE POLICY "manual_batches_admin_all" ON public.manual_import_batches FOR ALL TO authenticated USING (hub_is_admin()) WITH CHECK (hub_is_admin());
CREATE POLICY "manual_batches_select" ON public.manual_import_batches FOR SELECT TO authenticated
  USING (hub_is_admin() OR hub_user_has_area(area_id));

-- manual_import_rows: admin all + batch area select
CREATE POLICY "manual_rows_admin_all" ON public.manual_import_rows FOR ALL TO authenticated USING (hub_is_admin()) WITH CHECK (hub_is_admin());
CREATE POLICY "manual_rows_select" ON public.manual_import_rows FOR SELECT TO authenticated
  USING (hub_is_admin() OR EXISTS (
    SELECT 1 FROM manual_import_batches b WHERE b.id = manual_import_rows.batch_id AND hub_user_has_area(b.area_id)
  ));

-- cs_implantacoes_records
CREATE POLICY "cs_impl_admin_all" ON public.cs_implantacoes_records FOR ALL TO authenticated USING (hub_is_admin()) WITH CHECK (hub_is_admin());
CREATE POLICY "cs_impl_select" ON public.cs_implantacoes_records FOR SELECT TO authenticated
  USING (hub_is_admin() OR EXISTS (
    SELECT 1 FROM manual_import_batches b WHERE b.id = cs_implantacoes_records.batch_id AND hub_user_has_area(b.area_id)
  ));

-- cs_fila_manual_records
CREATE POLICY "cs_fila_admin_all" ON public.cs_fila_manual_records FOR ALL TO authenticated USING (hub_is_admin()) WITH CHECK (hub_is_admin());
CREATE POLICY "cs_fila_select" ON public.cs_fila_manual_records FOR SELECT TO authenticated
  USING (hub_is_admin() OR EXISTS (
    SELECT 1 FROM manual_import_batches b WHERE b.id = cs_fila_manual_records.batch_id AND hub_user_has_area(b.area_id)
  ));

-- ============================================================
-- 9) VIEWS DE CONSUMO
-- ============================================================

-- A) vw_devops_queue_items
CREATE OR REPLACE VIEW public.vw_devops_queue_items AS
SELECT
  q.id AS query_id,
  q.name AS query_name,
  q.sector,
  wi.id AS work_item_id,
  wi.title,
  wi.work_item_type,
  wi.state,
  wi.assigned_to_display,
  wi.assigned_to_unique,
  wi.priority,
  wi.effort,
  wi.area_path,
  wi.iteration_path,
  wi.tags,
  wi.parent_id,
  wi.web_url,
  wi.created_date,
  wi.changed_date,
  wi.synced_at,
  qic.synced_at AS snapshot_at
FROM public.devops_queries q
JOIN public.devops_query_items_current qic ON qic.query_id = q.id
JOIN public.devops_work_items wi ON wi.id = qic.work_item_id
WHERE q.is_active = true;

-- B) vw_devops_work_items_hierarchy
CREATE OR REPLACE VIEW public.vw_devops_work_items_hierarchy AS
SELECT
  wi.id,
  wi.title,
  wi.work_item_type,
  wi.state,
  wi.assigned_to_display,
  wi.assigned_to_unique,
  wi.priority,
  wi.effort,
  wi.area_path,
  wi.iteration_path,
  wi.tags,
  wi.parent_id,
  wi.web_url,
  wi.created_date,
  wi.changed_date,
  p.title AS parent_title,
  p.work_item_type AS parent_type,
  p.state AS parent_state
FROM public.devops_work_items wi
LEFT JOIN public.devops_work_items p ON p.id = wi.parent_id;

-- C) vw_comercial_clientes_ativos
CREATE OR REPLACE VIEW public.vw_comercial_clientes_ativos AS
SELECT
  id, nome, apelido, status, bandeira, sistemas_label, sistemas, synced_at
FROM public.vdesk_clients
WHERE status = 'ativo' OR status IS NULL;

-- D) vw_helpdesk_kpis
CREATE OR REPLACE VIEW public.vw_helpdesk_kpis AS
SELECT
  id, periodo_tipo, data_inicio, data_fim, consultor,
  total_registros, total_minutos, raw, collected_at
FROM public.helpdesk_dashboard_snapshots;

-- E) vw_customer_service_kpis
CREATE OR REPLACE VIEW public.vw_customer_service_kpis AS
SELECT
  'devops_queue' AS source,
  query_name,
  dq.work_item_id,
  dq.title,
  dq.work_item_type,
  dq.state,
  dq.assigned_to_display,
  dq.priority,
  dq.created_date,
  dq.changed_date,
  NULL::date AS data_referencia,
  NULL::text AS consultor_impl,
  NULL::text AS solucao,
  NULL::text AS status_implantacao
FROM public.vw_devops_queue_items dq
WHERE dq.sector = 'customer_service'

UNION ALL

SELECT
  'manual_implantacao' AS source,
  NULL AS query_name,
  NULL::integer AS work_item_id,
  cr.cliente AS title,
  'Implantação' AS work_item_type,
  cr.status_implantacao AS state,
  cr.consultor AS assigned_to_display,
  NULL::integer AS priority,
  cr.data_inicio::timestamptz AS created_date,
  cr.data_fim::timestamptz AS changed_date,
  cr.data_referencia,
  cr.consultor AS consultor_impl,
  cr.solucao,
  cr.status_implantacao
FROM public.cs_implantacoes_records cr;

-- F) vw_fabrica_kpis
CREATE OR REPLACE VIEW public.vw_fabrica_kpis AS
SELECT
  wi.id,
  wi.title,
  wi.work_item_type,
  wi.state,
  wi.assigned_to_display,
  wi.priority,
  wi.effort,
  wi.iteration_path,
  wi.created_date,
  wi.changed_date,
  wi.parent_id,
  wi.parent_title,
  wi.parent_type
FROM public.vw_devops_work_items_hierarchy wi
WHERE wi.area_path LIKE '%Fábrica%' OR wi.area_path LIKE '%Fabrica%'
   OR wi.area_path LIKE '%Programação%' OR wi.area_path LIKE '%Programacao%';

-- G) vw_qualidade_kpis
CREATE OR REPLACE VIEW public.vw_qualidade_kpis AS
SELECT
  dq.work_item_id AS id,
  dq.title,
  dq.work_item_type,
  dq.state,
  dq.assigned_to_display,
  dq.priority,
  dq.created_date,
  dq.changed_date
FROM public.vw_devops_queue_items dq
WHERE dq.sector = 'qualidade';

-- H) vw_infraestrutura_kpis
CREATE OR REPLACE VIEW public.vw_infraestrutura_kpis AS
SELECT
  dq.work_item_id AS id,
  dq.title,
  dq.work_item_type,
  dq.state,
  dq.assigned_to_display,
  dq.priority,
  dq.effort,
  dq.tags,
  dq.created_date,
  dq.changed_date
FROM public.vw_devops_queue_items dq
WHERE dq.sector = 'infraestrutura';
