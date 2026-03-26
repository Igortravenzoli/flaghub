
-- ========================================
-- Sector Health: status de saúde por setor/dependência
-- ========================================
CREATE TABLE public.sector_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector text NOT NULL,
  dependency_name text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  details jsonb DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sector, dependency_name)
);

ALTER TABLE public.sector_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sector_health_select_auth" ON public.sector_health
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sector_health_admin_all" ON public.sector_health
  FOR ALL TO authenticated
  USING (public.hub_is_admin())
  WITH CHECK (public.hub_is_admin());

-- ========================================
-- Alert Channels: canais de alerta (email, telegram, teams)
-- ========================================
CREATE TABLE public.alert_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type text NOT NULL CHECK (channel_type IN ('email', 'telegram', 'teams')),
  label text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.alert_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_channels_select_auth" ON public.alert_channels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "alert_channels_admin_all" ON public.alert_channels
  FOR ALL TO authenticated
  USING (public.hub_is_admin())
  WITH CHECK (public.hub_is_admin());

-- ========================================
-- Alert Rules: regras de alerta por setor/KPI
-- ========================================
CREATE TABLE public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector text NOT NULL,
  metric_key text NOT NULL,
  condition_type text NOT NULL DEFAULT 'threshold',
  threshold numeric,
  channel_id uuid REFERENCES public.alert_channels(id) ON DELETE SET NULL,
  recipients uuid[] DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_rules_select_auth" ON public.alert_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "alert_rules_admin_all" ON public.alert_rules
  FOR ALL TO authenticated
  USING (public.hub_is_admin())
  WITH CHECK (public.hub_is_admin());

-- ========================================
-- Alert Deliveries: log de envios de alertas
-- ========================================
CREATE TABLE public.alert_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.alert_rules(id) ON DELETE CASCADE NOT NULL,
  channel_id uuid REFERENCES public.alert_channels(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb DEFAULT '{}'::jsonb,
  error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.alert_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_deliveries_select_auth" ON public.alert_deliveries
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "alert_deliveries_admin_all" ON public.alert_deliveries
  FOR ALL TO authenticated
  USING (public.hub_is_admin())
  WITH CHECK (public.hub_is_admin());
