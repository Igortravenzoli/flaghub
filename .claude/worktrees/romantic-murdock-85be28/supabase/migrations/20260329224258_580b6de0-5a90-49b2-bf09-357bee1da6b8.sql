
-- ===== SURVEY IMPORTS =====
CREATE TABLE public.survey_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_name text NOT NULL,
  file_name text NOT NULL,
  file_hash text,
  status text NOT NULL DEFAULT 'pending',
  schema_version text NOT NULL DEFAULT '1.0',
  taxonomy_version text NOT NULL DEFAULT 'v1',
  rows_received int NOT NULL DEFAULT 0,
  rows_valid int NOT NULL DEFAULT 0,
  rows_invalid int NOT NULL DEFAULT 0,
  aggregate_id uuid,
  imported_by uuid NOT NULL,
  error_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.survey_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "survey_imports_admin_all" ON public.survey_imports
  FOR ALL TO authenticated
  USING (hub_is_admin())
  WITH CHECK (hub_is_admin());

CREATE POLICY "survey_imports_select_area" ON public.survey_imports
  FOR SELECT TO authenticated
  USING (
    hub_is_admin()
    OR imported_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM hub_area_members m
      JOIN hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key = 'comercial'
    )
  );

CREATE POLICY "survey_imports_insert_auth" ON public.survey_imports
  FOR INSERT TO authenticated
  WITH CHECK (
    imported_by = (SELECT auth.uid())
    AND (
      hub_is_admin()
      OR EXISTS (
        SELECT 1 FROM hub_area_members m
        JOIN hub_areas a ON a.id = m.area_id
        WHERE m.user_id = (SELECT auth.uid())
          AND m.is_active = true
          AND a.key = 'comercial'
      )
    )
  );

-- ===== SURVEY RESPONSES =====
CREATE TABLE public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.survey_imports(id) ON DELETE CASCADE,
  client_code text,
  client_name text,
  bandeira text,
  survey_date date,
  payload jsonb NOT NULL,
  derived jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_survey_responses_import_id ON public.survey_responses(import_id);
CREATE INDEX idx_survey_responses_payload_gin ON public.survey_responses USING gin (payload);

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "survey_responses_admin_all" ON public.survey_responses
  FOR ALL TO authenticated
  USING (hub_is_admin())
  WITH CHECK (hub_is_admin());

CREATE POLICY "survey_responses_select_area" ON public.survey_responses
  FOR SELECT TO authenticated
  USING (
    hub_is_admin()
    OR EXISTS (
      SELECT 1 FROM hub_area_members m
      JOIN hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key = 'comercial'
    )
  );

-- ===== SURVEY AGGREGATES =====
CREATE TABLE public.survey_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.survey_imports(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_survey_aggregates_import_id ON public.survey_aggregates(import_id);

ALTER TABLE public.survey_aggregates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "survey_aggregates_admin_all" ON public.survey_aggregates
  FOR ALL TO authenticated
  USING (hub_is_admin())
  WITH CHECK (hub_is_admin());

CREATE POLICY "survey_aggregates_select_area" ON public.survey_aggregates
  FOR SELECT TO authenticated
  USING (
    hub_is_admin()
    OR EXISTS (
      SELECT 1 FROM hub_area_members m
      JOIN hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key = 'comercial'
    )
  );

-- ===== SURVEY AI RUNS =====
CREATE TABLE public.survey_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.survey_imports(id) ON DELETE CASCADE,
  aggregate_id uuid NOT NULL REFERENCES public.survey_aggregates(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  mode text NOT NULL,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb,
  error_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.survey_ai_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "survey_ai_runs_admin_all" ON public.survey_ai_runs
  FOR ALL TO authenticated
  USING (hub_is_admin())
  WITH CHECK (hub_is_admin());

CREATE POLICY "survey_ai_runs_select_area" ON public.survey_ai_runs
  FOR SELECT TO authenticated
  USING (
    hub_is_admin()
    OR EXISTS (
      SELECT 1 FROM hub_area_members m
      JOIN hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key = 'comercial'
    )
  );
