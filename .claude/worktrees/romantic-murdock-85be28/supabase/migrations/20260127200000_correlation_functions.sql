-- =====================================================
-- MIGRATION: Funcionalidades de Correlação Ticket-OS
-- Data: 27/01/2026
-- Descrição: Adiciona RPCs e funções para correlação avançada
-- =====================================================

-- 1. Função helper para mesclar JSONB (se não existir)
CREATE OR REPLACE FUNCTION public.jsonb_merge(current JSONB, new_data JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT current || new_data;
$$;

-- 2. RPC: Buscar tickets com OS não validadas
CREATE OR REPLACE FUNCTION public.get_tickets_needing_os_validation(
  p_network_id BIGINT DEFAULT NULL,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id BIGINT,
  ticket_external_id TEXT,
  os_number TEXT,
  opened_at TIMESTAMPTZ,
  severity public.ticket_severity
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
    t.ticket_external_id,
    t.os_number,
    t.opened_at,
    t.severity
  FROM public.tickets t
  WHERE t.network_id = v_network_id
    AND t.has_os = true
    AND (t.os_found_in_vdesk IS NULL OR t.os_found_in_vdesk = false)
  ORDER BY t.severity DESC, t.opened_at DESC
  LIMIT p_limit;
END;
$$;

-- 3. RPC: Buscar estatísticas de correlação
CREATE OR REPLACE FUNCTION public.get_correlation_stats(p_network_id BIGINT DEFAULT NULL)
RETURNS TABLE (
  total_tickets BIGINT,
  tickets_com_os BIGINT,
  tickets_sem_os BIGINT,
  os_validadas BIGINT,
  os_nao_validadas BIGINT,
  os_nao_encontradas BIGINT,
  taxa_correlacao NUMERIC
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
    COUNT(*) AS total_tickets,
    COUNT(*) FILTER (WHERE has_os = true) AS tickets_com_os,
    COUNT(*) FILTER (WHERE has_os = false) AS tickets_sem_os,
    COUNT(*) FILTER (WHERE os_found_in_vdesk = true) AS os_validadas,
    COUNT(*) FILTER (WHERE has_os = true AND (os_found_in_vdesk IS NULL OR os_found_in_vdesk = false)) AS os_nao_validadas,
    COUNT(*) FILTER (WHERE os_found_in_vdesk = false) AS os_nao_encontradas,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        ROUND((COUNT(*) FILTER (WHERE os_found_in_vdesk = true)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
      ELSE 0
    END AS taxa_correlacao
  FROM public.tickets
  WHERE network_id = v_network_id;
END;
$$;

-- 4. RPC: Validar OS em lote (atualizar múltiplos tickets)
CREATE OR REPLACE FUNCTION public.batch_validate_os(
  p_validations JSONB -- Array de {ticket_external_id, os_found, event_at, event_desc}
)
RETURNS TABLE (
  ticket_external_id TEXT,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_validation JSONB;
  v_ticket_id TEXT;
  v_os_found BOOLEAN;
  v_event_at TIMESTAMPTZ;
  v_event_desc TEXT;
  v_network_id BIGINT;
BEGIN
  v_network_id := public.auth_network_id();
  
  IF NOT public.is_admin_or_gestao() THEN
    RAISE EXCEPTION 'Apenas admin ou gestão podem validar OS';
  END IF;

  FOR v_validation IN SELECT * FROM jsonb_array_elements(p_validations)
  LOOP
    v_ticket_id := v_validation->>'ticket_external_id';
    v_os_found := (v_validation->>'os_found')::BOOLEAN;
    v_event_at := (v_validation->>'event_at')::TIMESTAMPTZ;
    v_event_desc := v_validation->>'event_desc';

    BEGIN
      UPDATE public.tickets
      SET 
        os_found_in_vdesk = v_os_found,
        last_os_event_at = COALESCE(v_event_at, now()),
        last_os_event_desc = v_event_desc,
        severity = CASE 
          WHEN v_os_found THEN 'info'::public.ticket_severity
          ELSE 'critico'::public.ticket_severity
        END,
        inconsistency_code = CASE 
          WHEN v_os_found THEN NULL
          ELSE 'OS_NOT_FOUND'
        END,
        updated_at = now()
      WHERE ticket_external_id = v_ticket_id
        AND network_id = v_network_id;

      IF FOUND THEN
        RETURN QUERY SELECT v_ticket_id, true, 'OS validada com sucesso';
      ELSE
        RETURN QUERY SELECT v_ticket_id, false, 'Ticket não encontrado ou sem permissão';
      END IF;

    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_ticket_id, false, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- 5. RPC: Recalcular severidade de todos os tickets
CREATE OR REPLACE FUNCTION public.recalculate_ticket_severities(
  p_network_id BIGINT DEFAULT NULL,
  p_grace_hours INT DEFAULT NULL
)
RETURNS TABLE (
  updated_count INT,
  critical_count INT,
  warning_count INT,
  info_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_network_id BIGINT;
  v_grace_hours INT;
  v_updated INT;
  v_critical INT;
  v_warning INT;
  v_info INT;
BEGIN
  IF NOT public.is_admin_or_gestao() THEN
    RAISE EXCEPTION 'Apenas admin ou gestão podem recalcular severidades';
  END IF;

  v_network_id := COALESCE(p_network_id, public.auth_network_id());
  
  -- Buscar grace_hours das configurações
  SELECT no_os_grace_hours INTO v_grace_hours
  FROM public.settings
  WHERE network_id = v_network_id;
  
  v_grace_hours := COALESCE(p_grace_hours, v_grace_hours, 24);

  -- Atualizar severidades
  WITH updated AS (
    UPDATE public.tickets
    SET 
      severity = CASE
        -- Crítico: sem OS e passou do prazo
        WHEN has_os = false 
          AND opened_at IS NOT NULL 
          AND EXTRACT(EPOCH FROM (now() - opened_at))/3600 > v_grace_hours
          THEN 'critico'::public.ticket_severity
        
        -- Atenção: sem OS mas dentro do prazo
        WHEN has_os = false 
          AND opened_at IS NOT NULL 
          AND EXTRACT(EPOCH FROM (now() - opened_at))/3600 <= v_grace_hours
          THEN 'atencao'::public.ticket_severity
        
        -- Crítico: OS não encontrada no VDESK
        WHEN os_found_in_vdesk = false
          THEN 'critico'::public.ticket_severity
        
        -- Info: tudo ok
        ELSE 'info'::public.ticket_severity
      END,
      
      inconsistency_code = CASE
        WHEN has_os = false 
          AND opened_at IS NOT NULL 
          AND EXTRACT(EPOCH FROM (now() - opened_at))/3600 > v_grace_hours
          THEN 'NO_OS_OVERDUE'
        
        WHEN has_os = false 
          AND opened_at IS NOT NULL 
          AND EXTRACT(EPOCH FROM (now() - opened_at))/3600 <= v_grace_hours
          THEN 'NO_OS_WITHIN_GRACE'
        
        WHEN os_found_in_vdesk = false
          THEN 'OS_NOT_FOUND'
        
        WHEN opened_at IS NULL
          THEN 'NO_OPENED_AT'
        
        ELSE NULL
      END,
      
      updated_at = now()
    WHERE network_id = v_network_id
    RETURNING severity
  )
  SELECT 
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE severity = 'critico')::INT,
    COUNT(*) FILTER (WHERE severity = 'atencao')::INT,
    COUNT(*) FILTER (WHERE severity = 'info')::INT
  INTO v_updated, v_critical, v_warning, v_info
  FROM updated;

  RETURN QUERY SELECT v_updated, v_critical, v_warning, v_info;
END;
$$;

-- 6. RPC: Buscar timeline de um ticket (histórico de importações)
CREATE OR REPLACE FUNCTION public.get_ticket_timeline(p_ticket_external_id TEXT)
RETURNS TABLE (
  import_id BIGINT,
  import_date TIMESTAMPTZ,
  file_name TEXT,
  status_snapshot TEXT,
  os_snapshot TEXT,
  severity_snapshot TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verificar permissão
  IF NOT EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.ticket_external_id = p_ticket_external_id
      AND (public.is_admin() OR t.network_id = public.auth_network_id())
  ) THEN
    RAISE EXCEPTION 'Ticket não encontrado ou sem permissão';
  END IF;

  -- Retornar timeline (simplificado - pode ser expandido com auditoria)
  RETURN QUERY
  SELECT 
    i.id,
    i.created_at,
    i.file_name,
    t.external_status,
    t.os_number,
    t.severity::TEXT
  FROM public.imports i
  CROSS JOIN LATERAL (
    SELECT 
      ticket_external_id,
      external_status,
      os_number,
      severity
    FROM public.tickets
    WHERE ticket_external_id = p_ticket_external_id
  ) t
  WHERE i.id = (SELECT last_import_id FROM public.tickets WHERE ticket_external_id = p_ticket_external_id)
  ORDER BY i.created_at DESC
  LIMIT 10;
END;
$$;

-- 7. RPC: Relatório de inconsistências detalhado
CREATE OR REPLACE FUNCTION public.get_inconsistency_report(
  p_network_id BIGINT DEFAULT NULL,
  p_severity public.ticket_severity DEFAULT NULL
)
RETURNS TABLE (
  ticket_external_id TEXT,
  ticket_type TEXT,
  opened_at TIMESTAMPTZ,
  external_status TEXT,
  internal_status public.internal_status,
  os_number TEXT,
  os_found_in_vdesk BOOLEAN,
  inconsistency_code TEXT,
  severity public.ticket_severity,
  hours_without_os NUMERIC,
  assigned_to TEXT
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
    t.ticket_external_id,
    t.ticket_type,
    t.opened_at,
    t.external_status,
    t.internal_status,
    t.os_number,
    t.os_found_in_vdesk,
    t.inconsistency_code,
    t.severity,
    CASE 
      WHEN t.opened_at IS NOT NULL AND t.has_os = false
        THEN ROUND(EXTRACT(EPOCH FROM (now() - t.opened_at))/3600, 1)
      ELSE NULL
    END AS hours_without_os,
    t.assigned_to
  FROM public.tickets t
  WHERE t.network_id = v_network_id
    AND t.inconsistency_code IS NOT NULL
    AND (p_severity IS NULL OR t.severity = p_severity)
  ORDER BY 
    t.severity DESC,
    t.opened_at DESC NULLS LAST;
END;
$$;

-- =====================================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON FUNCTION public.get_tickets_needing_os_validation IS 
'Retorna tickets que possuem OS informada mas ainda não foram validadas no VDESK';

COMMENT ON FUNCTION public.get_correlation_stats IS 
'Retorna estatísticas de correlação entre tickets e OS para uma network';

COMMENT ON FUNCTION public.batch_validate_os IS 
'Valida múltiplas OS em lote, atualizando status de validação e severidade';

COMMENT ON FUNCTION public.recalculate_ticket_severities IS 
'Recalcula severidade de todos os tickets baseado em regras de negócio';

COMMENT ON FUNCTION public.get_ticket_timeline IS 
'Retorna timeline/histórico de importações de um ticket específico';

COMMENT ON FUNCTION public.get_inconsistency_report IS 
'Gera relatório detalhado de inconsistências encontradas nos tickets';
