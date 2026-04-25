-- ============================================================================
-- Migration: 20260428100000_devops_qa_return_module.sql
-- Módulo de Controle de Retorno QA — FlagHub
--
-- Detecta itens que saíram de "Em Teste" de volta para "Em desenvolvimento",
-- registra eventos, permite envio de alertas nominais via Teams e expõe
-- KPIs no painel FlagHub.
--
-- Tabelas criadas:
--   devops_qa_return_events   — eventos de retorno detectados
--   devops_lead_mapping       — mapeamento DevOps → Teams user ID
--
-- RPCs criadas:
--   rpc_qa_return_summary     — totais agregados
--   rpc_qa_return_by_sprint   — breakdown por sprint
--   rpc_qa_return_by_assignee — breakdown por responsável
--   rpc_qa_return_open_items  — itens ainda em desenvolvimento
-- ============================================================================

-- ── 1. devops_lead_mapping ────────────────────────────────────────────────────
-- Tabela auxiliar para mapear nomes do Azure DevOps para Teams user IDs.
-- Permite envio de mensagens 1:1 via Microsoft Graph API.
-- Gerenciada por admins via UI; independente do devops_lead_area_map existente.

CREATE TABLE IF NOT EXISTS public.devops_lead_mapping (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  devops_display_name text NOT NULL,       -- Nome exibido no Azure DevOps (assigned_to_display)
  devops_unique_name  text,                -- E-mail do DevOps (assigned_to_unique) — único
  teams_user_id       text,                -- Microsoft Graph user ID (para mensagem 1:1)
  teams_email         text,                -- E-mail M365/Teams (pode diferir do DevOps)
  canonical_name      text,                -- Nome canônico legível
  is_active           boolean NOT NULL DEFAULT true,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (devops_unique_name)
);

-- Seed com os leads já conhecidos (Teams user ID a ser preenchido pelo admin)
INSERT INTO public.devops_lead_mapping (devops_display_name, devops_unique_name, canonical_name)
SELECT canonical_name, lead_email, canonical_name
FROM   public.devops_lead_area_map
WHERE  is_active = true
ON CONFLICT (devops_unique_name) DO NOTHING;

COMMENT ON TABLE public.devops_lead_mapping IS
  'Mapeamento de responsáveis do Azure DevOps para Teams user ID (Graph API). '
  'Preencha teams_user_id para habilitar mensagens 1:1. '
  'Sem teams_user_id, o alerta usa fallback via webhook do canal Teams.';

-- ── 2. devops_qa_return_events ────────────────────────────────────────────────
-- Registra cada evento de retorno de QA detectado.
-- Um "retorno QA" é quando um work item transita de "Em Teste" → "Em desenvolvimento".
-- Permite rastrear: quantos retornos, quem é responsável, por sprint, tempo parado.

CREATE TABLE IF NOT EXISTS public.devops_qa_return_events (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Work item (snapshot no momento da detecção)
  work_item_id            integer NOT NULL,
  work_item_title         text,
  work_item_type          text,                  -- Task, Bug, PBI, User Story
  area_path               text,
  iteration_path          text,
  sprint_code             text,                  -- Ex: S45-2026
  web_url                 text,

  -- Transição detectada
  detected_state          text NOT NULL DEFAULT 'Em desenvolvimento',
  detected_tags           text,                  -- Tags no momento da detecção
  transition_from_state   text DEFAULT 'Em Teste',
  transition_to_state     text DEFAULT 'Em desenvolvimento',
  transition_date         timestamptz,           -- Data real da transição (state_history)

  -- Responsável
  assigned_to_display     text,
  assigned_to_email       text,                  -- devops_work_items.assigned_to_unique
  lead_email              text,                  -- de devops_lead_mapping ou lead_area_map
  lead_teams_user_id      text,                  -- cache do teams_user_id no momento do alerta

  -- Método de detecção
  detected_at             timestamptz NOT NULL DEFAULT now(),
  detection_method        text,                  -- 'tag', 'history', 'tag+history'

  -- Status do alerta
  alert_status            text NOT NULL DEFAULT 'pending'
                            CHECK (alert_status IN ('pending','sent','failed','fallback_sent','skipped')),
  alert_sent_at           timestamptz,
  alert_channel_type      text                   -- 'teams_1on1' | 'teams_webhook' | 'none'
                            CHECK (alert_channel_type IN ('teams_1on1','teams_webhook','none', NULL)),
  alert_channel_id        uuid REFERENCES public.alert_channels(id) ON DELETE SET NULL,
  alert_error             text,

  -- Controle de duplicidade: não re-alertar enquanto is_open = true
  is_open                 boolean NOT NULL DEFAULT true,
  resolved_at             timestamptz,           -- quando saiu de "Em desenvolvimento"

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Índices para as queries mais comuns
CREATE INDEX IF NOT EXISTS idx_qa_events_work_item  ON public.devops_qa_return_events (work_item_id);
CREATE INDEX IF NOT EXISTS idx_qa_events_sprint      ON public.devops_qa_return_events (sprint_code);
CREATE INDEX IF NOT EXISTS idx_qa_events_assignee    ON public.devops_qa_return_events (assigned_to_email);
CREATE INDEX IF NOT EXISTS idx_qa_events_open        ON public.devops_qa_return_events (is_open) WHERE is_open = true;
CREATE INDEX IF NOT EXISTS idx_qa_events_status      ON public.devops_qa_return_events (alert_status);
CREATE INDEX IF NOT EXISTS idx_qa_events_detected    ON public.devops_qa_return_events (detected_at DESC);

COMMENT ON TABLE public.devops_qa_return_events IS
  'Eventos de retorno de QA para desenvolvimento. '
  'Registrado quando um work item transita de "Em Teste" → "Em desenvolvimento". '
  'is_open=true enquanto o item ainda está em desenvolvimento (alerta não re-enviado). '
  'is_open=false quando o item avança (resolvido, deployed, etc).';

-- ── 3. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.devops_qa_return_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devops_lead_mapping     ENABLE ROW LEVEL SECURITY;

-- devops_qa_return_events: leitura para aprovados, escrita apenas server-side/admin
CREATE POLICY "qa_events_select" ON public.devops_qa_return_events
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

CREATE POLICY "qa_events_admin_all" ON public.devops_qa_return_events
  FOR ALL TO authenticated
  USING (public.hub_is_admin())
  WITH CHECK (public.hub_is_admin());

-- devops_lead_mapping: leitura para aprovados, escrita só admin
CREATE POLICY "lead_mapping_select" ON public.devops_lead_mapping
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

CREATE POLICY "lead_mapping_admin_all" ON public.devops_lead_mapping
  FOR ALL TO authenticated
  USING (public.hub_is_admin())
  WITH CHECK (public.hub_is_admin());

-- ── 4. updated_at trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_qa_events_updated_at'
      AND tgrelid = 'public.devops_qa_return_events'::regclass
  ) THEN
    CREATE TRIGGER trg_qa_events_updated_at
      BEFORE UPDATE ON public.devops_qa_return_events
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_lead_mapping_updated_at'
      AND tgrelid = 'public.devops_lead_mapping'::regclass
  ) THEN
    CREATE TRIGGER trg_lead_mapping_updated_at
      BEFORE UPDATE ON public.devops_lead_mapping
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── 5. RPC: rpc_qa_return_summary ────────────────────────────────────────────
-- Retorna totais agregados para os KPI cards do dashboard.

CREATE OR REPLACE FUNCTION public.rpc_qa_return_summary(
  p_sprint_code text DEFAULT NULL,
  p_area_path   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_events',         COUNT(*),
    'open_events',          COUNT(*) FILTER (WHERE is_open = true),
    'distinct_items',       COUNT(DISTINCT work_item_id),
    'distinct_items_open',  COUNT(DISTINCT work_item_id) FILTER (WHERE is_open = true),
    'avg_days_open',
      ROUND(
        AVG(
          EXTRACT(EPOCH FROM (COALESCE(resolved_at, now()) - detected_at)) / 86400.0
        ) FILTER (WHERE is_open = true),
        1
      ),
    'max_days_open',
      ROUND(
        MAX(
          EXTRACT(EPOCH FROM (now() - detected_at)) / 86400.0
        ) FILTER (WHERE is_open = true),
        1
      )
  )
  FROM public.devops_qa_return_events
  WHERE (p_sprint_code IS NULL OR sprint_code = p_sprint_code)
    AND (p_area_path   IS NULL OR area_path ILIKE '%' || p_area_path || '%');
$$;

-- ── 6. RPC: rpc_qa_return_by_sprint ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_qa_return_by_sprint()
RETURNS TABLE (
  sprint_code      text,
  total_returns    bigint,
  open_returns     bigint,
  distinct_items   bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(sprint_code, 'Sem sprint')  AS sprint_code,
    COUNT(*)                             AS total_returns,
    COUNT(*) FILTER (WHERE is_open = true) AS open_returns,
    COUNT(DISTINCT work_item_id)         AS distinct_items
  FROM public.devops_qa_return_events
  GROUP BY sprint_code
  ORDER BY sprint_code DESC NULLS LAST;
$$;

-- ── 7. RPC: rpc_qa_return_by_assignee ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_qa_return_by_assignee()
RETURNS TABLE (
  assigned_to_display  text,
  assigned_to_email    text,
  total_returns        bigint,
  open_returns         bigint,
  last_return_at       timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(assigned_to_display, 'Não atribuído') AS assigned_to_display,
    assigned_to_email,
    COUNT(*)                                       AS total_returns,
    COUNT(*) FILTER (WHERE is_open = true)         AS open_returns,
    MAX(detected_at)                               AS last_return_at
  FROM public.devops_qa_return_events
  GROUP BY assigned_to_display, assigned_to_email
  ORDER BY total_returns DESC;
$$;

-- ── 8. RPC: rpc_qa_return_open_items ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_qa_return_open_items()
RETURNS TABLE (
  id                   bigint,
  work_item_id         integer,
  work_item_title      text,
  work_item_type       text,
  sprint_code          text,
  assigned_to_display  text,
  assigned_to_email    text,
  detected_at          timestamptz,
  transition_date      timestamptz,
  days_since_return    numeric,
  alert_status         text,
  web_url              text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    e.id,
    e.work_item_id,
    e.work_item_title,
    e.work_item_type,
    e.sprint_code,
    e.assigned_to_display,
    e.assigned_to_email,
    e.detected_at,
    e.transition_date,
    ROUND(
      EXTRACT(EPOCH FROM (now() - e.detected_at)) / 86400.0,
      1
    )::numeric AS days_since_return,
    e.alert_status,
    e.web_url
  FROM public.devops_qa_return_events e
  WHERE e.is_open = true
  ORDER BY e.detected_at DESC;
$$;

-- Grant execute to authenticated (RLS on underlying tables is still enforced)
GRANT EXECUTE ON FUNCTION public.rpc_qa_return_summary(text, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_qa_return_by_sprint()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_qa_return_by_assignee()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_qa_return_open_items()          TO authenticated;
