-- =====================================================
-- MIGRATION: Backend Completo - Painel Tickets ↔ OS
-- =====================================================

-- 1. ENUM para roles de usuário
CREATE TYPE public.app_role AS ENUM ('operacional', 'gestao', 'qualidade', 'admin');

-- 2. ENUM para status interno normalizado
CREATE TYPE public.internal_status AS ENUM ('novo', 'em_atendimento', 'em_analise', 'finalizado', 'cancelado');

-- 3. ENUM para severidade
CREATE TYPE public.ticket_severity AS ENUM ('critico', 'atencao', 'info');

-- =====================================================
-- TABELAS
-- =====================================================

-- 4. networks (redes/clientes)
CREATE TABLE public.networks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. user_roles (separado de profiles conforme boas práticas)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- 6. profiles
CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  network_id BIGINT REFERENCES public.networks(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. status_mapping (mapeamento status externo -> interno)
CREATE TABLE public.status_mapping (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  network_id BIGINT NOT NULL REFERENCES public.networks(id),
  external_status TEXT NOT NULL,
  internal_status public.internal_status NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (network_id, external_status)
);

-- 8. imports (histórico de importações)
CREATE TABLE public.imports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  network_id BIGINT NOT NULL REFERENCES public.networks(id),
  imported_by UUID NOT NULL REFERENCES auth.users(id),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('json', 'csv')),
  file_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'success', 'error')),
  total_records INT NOT NULL DEFAULT 0,
  errors_count INT NOT NULL DEFAULT 0,
  warnings_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (network_id, file_hash)
);

-- 9. import_events (log detalhado de cada importação)
CREATE TABLE public.import_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id BIGINT NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
  message TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. tickets (estado atual dos tickets)
CREATE TABLE public.tickets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  network_id BIGINT NOT NULL REFERENCES public.networks(id),
  ticket_external_id TEXT NOT NULL,
  ticket_type TEXT,
  opened_at TIMESTAMPTZ,
  external_status TEXT,
  internal_status public.internal_status,
  assigned_to TEXT,
  os_number TEXT,
  has_os BOOLEAN GENERATED ALWAYS AS (os_number IS NOT NULL AND os_number <> '') STORED,
  os_found_in_vdesk BOOLEAN DEFAULT NULL,
  inconsistency_code TEXT,
  severity public.ticket_severity NOT NULL DEFAULT 'info',
  raw_payload JSONB NOT NULL,
  last_os_event_at TIMESTAMPTZ,
  last_os_event_desc TEXT,
  last_import_id BIGINT REFERENCES public.imports(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (network_id, ticket_external_id)
);

-- 11. settings (configurações por rede)
CREATE TABLE public.settings (
  network_id BIGINT PRIMARY KEY REFERENCES public.networks(id),
  no_os_grace_hours INT NOT NULL DEFAULT 24,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================

CREATE INDEX idx_tickets_network_severity_opened ON public.tickets (network_id, severity, opened_at DESC);
CREATE INDEX idx_tickets_network_status ON public.tickets (network_id, internal_status);
CREATE INDEX idx_tickets_network_external_id ON public.tickets (network_id, ticket_external_id);
CREATE INDEX idx_imports_network_created ON public.imports (network_id, created_at DESC);
CREATE INDEX idx_status_mapping_network_external ON public.status_mapping (network_id, external_status);
CREATE INDEX idx_import_events_import_id ON public.import_events (import_id);

-- =====================================================
-- FUNÇÕES HELPER (SECURITY DEFINER)
-- =====================================================

-- Função para obter o role do usuário
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = p_user_id LIMIT 1;
$$;

-- Função para verificar se usuário tem um role específico
CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = p_role
  );
$$;

-- Função para obter network_id do usuário
CREATE OR REPLACE FUNCTION public.get_user_network_id(p_user_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT network_id FROM public.profiles WHERE user_id = p_user_id;
$$;

-- Função de atalho para auth.uid()
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.auth_network_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_network_id(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_gestao()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestao');
$$;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Função genérica para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger em tickets
CREATE TRIGGER trigger_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger em settings
CREATE TRIGGER trigger_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para criar profile automaticamente quando usuário é criado
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Habilitar RLS
ALTER TABLE public.networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- NETWORKS: usuários autenticados podem ver sua própria network, admin vê todas
CREATE POLICY "Users can view their network" ON public.networks
  FOR SELECT TO authenticated
  USING (public.is_admin() OR id = public.auth_network_id());

-- USER_ROLES: apenas admin pode gerenciar
CREATE POLICY "Admin can manage user roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Users can view their own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- PROFILES: usuário vê seu próprio, admin vê da sua network ou todas
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- STATUS_MAPPING: leitura para todos da network, escrita apenas admin
CREATE POLICY "Users can view status mapping of their network" ON public.status_mapping
  FOR SELECT TO authenticated
  USING (public.is_admin() OR network_id = public.auth_network_id());

CREATE POLICY "Admin can manage status mapping" ON public.status_mapping
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- IMPORTS: leitura para sua network, escrita para admin/gestao
CREATE POLICY "Users can view imports of their network" ON public.imports
  FOR SELECT TO authenticated
  USING (public.is_admin() OR network_id = public.auth_network_id());

CREATE POLICY "Admin and Gestao can create imports" ON public.imports
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_gestao());

CREATE POLICY "Admin can update imports" ON public.imports
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- IMPORT_EVENTS: apenas leitura
CREATE POLICY "Users can view import events of their network" ON public.import_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.imports i 
      WHERE i.id = import_id 
      AND (public.is_admin() OR i.network_id = public.auth_network_id())
    )
  );

-- TICKETS: apenas leitura para sua network, admin vê tudo
CREATE POLICY "Users can view tickets of their network" ON public.tickets
  FOR SELECT TO authenticated
  USING (public.is_admin() OR network_id = public.auth_network_id());

-- SETTINGS: leitura para sua network, escrita apenas admin
CREATE POLICY "Users can view settings of their network" ON public.settings
  FOR SELECT TO authenticated
  USING (public.is_admin() OR network_id = public.auth_network_id());

CREATE POLICY "Admin can manage settings" ON public.settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =====================================================
-- VIEW: Dashboard Summary
-- =====================================================

CREATE OR REPLACE VIEW public.v_dashboard_summary AS
SELECT 
  network_id,
  COUNT(*) AS total_tickets,
  COUNT(*) FILTER (WHERE severity = 'info' AND inconsistency_code IS NULL) AS tickets_ok,
  COUNT(*) FILTER (WHERE severity = 'critico') AS tickets_criticos,
  COUNT(*) FILTER (WHERE severity = 'atencao') AS tickets_atencao,
  COUNT(*) FILTER (WHERE has_os = false) AS tickets_sem_os,
  MAX(updated_at) AS last_updated
FROM public.tickets
GROUP BY network_id;

-- =====================================================
-- RPCs para o Frontend
-- =====================================================

-- RPC: Buscar tickets com filtros e paginação
CREATE OR REPLACE FUNCTION public.get_tickets(
  p_network_id BIGINT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_internal_status public.internal_status DEFAULT NULL,
  p_severity public.ticket_severity DEFAULT NULL,
  p_has_os BOOLEAN DEFAULT NULL,
  p_search_text TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id BIGINT,
  network_id BIGINT,
  ticket_external_id TEXT,
  ticket_type TEXT,
  opened_at TIMESTAMPTZ,
  external_status TEXT,
  internal_status public.internal_status,
  assigned_to TEXT,
  os_number TEXT,
  has_os BOOLEAN,
  inconsistency_code TEXT,
  severity public.ticket_severity,
  last_import_id BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_network_id BIGINT;
BEGIN
  -- Determinar network_id baseado em permissões
  IF public.is_admin() THEN
    v_network_id := COALESCE(p_network_id, public.auth_network_id());
  ELSE
    v_network_id := public.auth_network_id();
  END IF;

  RETURN QUERY
  SELECT 
    t.id,
    t.network_id,
    t.ticket_external_id,
    t.ticket_type,
    t.opened_at,
    t.external_status,
    t.internal_status,
    t.assigned_to,
    t.os_number,
    t.has_os,
    t.inconsistency_code,
    t.severity,
    t.last_import_id,
    t.created_at,
    t.updated_at
  FROM public.tickets t
  WHERE t.network_id = v_network_id
    AND (p_date_from IS NULL OR t.opened_at >= p_date_from)
    AND (p_date_to IS NULL OR t.opened_at <= p_date_to)
    AND (p_internal_status IS NULL OR t.internal_status = p_internal_status)
    AND (p_severity IS NULL OR t.severity = p_severity)
    AND (p_has_os IS NULL OR t.has_os = p_has_os)
    AND (p_search_text IS NULL OR t.ticket_external_id ILIKE '%' || p_search_text || '%' OR t.assigned_to ILIKE '%' || p_search_text || '%')
  ORDER BY 
    CASE t.severity 
      WHEN 'critico' THEN 1 
      WHEN 'atencao' THEN 2 
      ELSE 3 
    END,
    t.opened_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- RPC: Detalhe de um ticket
CREATE OR REPLACE FUNCTION public.get_ticket_detail(p_ticket_external_id TEXT)
RETURNS TABLE (
  id BIGINT,
  network_id BIGINT,
  ticket_external_id TEXT,
  ticket_type TEXT,
  opened_at TIMESTAMPTZ,
  external_status TEXT,
  internal_status public.internal_status,
  assigned_to TEXT,
  os_number TEXT,
  has_os BOOLEAN,
  os_found_in_vdesk BOOLEAN,
  inconsistency_code TEXT,
  severity public.ticket_severity,
  raw_payload JSONB,
  last_os_event_at TIMESTAMPTZ,
  last_os_event_desc TEXT,
  last_import_id BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.network_id,
    t.ticket_external_id,
    t.ticket_type,
    t.opened_at,
    t.external_status,
    t.internal_status,
    t.assigned_to,
    t.os_number,
    t.has_os,
    t.os_found_in_vdesk,
    t.inconsistency_code,
    t.severity,
    t.raw_payload,
    t.last_os_event_at,
    t.last_os_event_desc,
    t.last_import_id,
    t.created_at,
    t.updated_at
  FROM public.tickets t
  WHERE t.ticket_external_id = p_ticket_external_id
    AND (public.is_admin() OR t.network_id = public.auth_network_id());
END;
$$;

-- RPC: Histórico de importações
CREATE OR REPLACE FUNCTION public.get_imports_history(
  p_network_id BIGINT DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id BIGINT,
  network_id BIGINT,
  imported_by UUID,
  file_name TEXT,
  file_type TEXT,
  status TEXT,
  total_records INT,
  errors_count INT,
  warnings_count INT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_network_id BIGINT;
BEGIN
  IF public.is_admin() THEN
    v_network_id := COALESCE(p_network_id, public.auth_network_id());
  ELSE
    v_network_id := public.auth_network_id();
  END IF;

  RETURN QUERY
  SELECT 
    i.id,
    i.network_id,
    i.imported_by,
    i.file_name,
    i.file_type,
    i.status,
    i.total_records,
    i.errors_count,
    i.warnings_count,
    i.created_at
  FROM public.imports i
  WHERE i.network_id = v_network_id
  ORDER BY i.created_at DESC
  LIMIT p_limit;
END;
$$;

-- RPC: Dashboard summary para uma network
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_network_id BIGINT DEFAULT NULL)
RETURNS TABLE (
  network_id BIGINT,
  total_tickets BIGINT,
  tickets_ok BIGINT,
  tickets_criticos BIGINT,
  tickets_atencao BIGINT,
  tickets_sem_os BIGINT,
  last_updated TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_network_id BIGINT;
BEGIN
  IF public.is_admin() THEN
    v_network_id := COALESCE(p_network_id, public.auth_network_id());
  ELSE
    v_network_id := public.auth_network_id();
  END IF;

  RETURN QUERY
  SELECT 
    v.network_id,
    v.total_tickets,
    v.tickets_ok,
    v.tickets_criticos,
    v.tickets_atencao,
    v.tickets_sem_os,
    v.last_updated
  FROM public.v_dashboard_summary v
  WHERE v.network_id = v_network_id;
END;
$$;

-- =====================================================
-- DADOS INICIAIS
-- =====================================================

-- Inserir network Nestlé como padrão
INSERT INTO public.networks (name) VALUES ('Nestlé');

-- Inserir mapeamentos de status padrão para Nestlé
INSERT INTO public.status_mapping (network_id, external_status, internal_status) VALUES
  (1, 'New', 'novo'),
  (1, 'In Progress', 'em_atendimento'),
  (1, 'On Hold', 'em_analise'),
  (1, 'Fulfilled', 'finalizado'),
  (1, 'Fulfillment', 'em_atendimento'),
  (1, 'Resolved', 'finalizado'),
  (1, 'Closed', 'finalizado'),
  (1, 'Cancelled', 'cancelado');

-- Inserir settings padrão para Nestlé
INSERT INTO public.settings (network_id, no_os_grace_hours) VALUES (1, 24);