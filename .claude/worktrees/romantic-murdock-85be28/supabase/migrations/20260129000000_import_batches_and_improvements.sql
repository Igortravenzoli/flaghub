-- Migration: Sistema de Lotes e Melhorias de Importação
-- Data: 2026-01-29
-- Descrição: Adiciona suporte para importação em lote, expurgo automático e rastreamento de atividade

-- =====================================================
-- 1. Criar tabela de lotes de importação
-- =====================================================

CREATE TABLE IF NOT EXISTS public.import_batches (
  id SERIAL PRIMARY KEY,
  network_id INTEGER NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  imported_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_name VARCHAR(255),
  status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'success', 'partial_success', 'error')),
  total_files INTEGER DEFAULT 0,
  total_records INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  warnings_count INTEGER DEFAULT 0,
  clear_before_import BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

-- Índices para performance
CREATE INDEX idx_import_batches_network_id ON public.import_batches(network_id);
CREATE INDEX idx_import_batches_status ON public.import_batches(status);
CREATE INDEX idx_import_batches_created_at ON public.import_batches(created_at DESC);

-- =====================================================
-- 2. Adicionar coluna batch_id na tabela imports
-- =====================================================

ALTER TABLE public.imports 
ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES public.import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_imports_batch_id ON public.imports(batch_id);

-- =====================================================
-- 3. Remover constraint UNIQUE de file_hash (permitir reimportar)
-- =====================================================

ALTER TABLE public.imports 
DROP CONSTRAINT IF EXISTS imports_file_hash_key;

-- Criar índice não-único para referência
CREATE INDEX IF NOT EXISTS idx_imports_file_hash ON public.imports(file_hash);

-- =====================================================
-- 4. Adicionar colunas de rastreamento na tabela tickets
-- =====================================================

ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Índices para performance em queries com filtro de ativos
CREATE INDEX IF NOT EXISTS idx_tickets_is_active ON public.tickets(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_tickets_last_seen_at ON public.tickets(last_seen_at DESC);

-- =====================================================
-- 5. RPC Function: Marcar todos tickets como inativos antes de importação
-- =====================================================

CREATE OR REPLACE FUNCTION mark_tickets_inactive(p_network_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.tickets
  SET is_active = FALSE
  WHERE network_id = p_network_id 
    AND is_active = TRUE;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN v_count;
END;
$$;

-- =====================================================
-- 6. RPC Function: Expurgar tickets antigos e inativos
-- =====================================================

CREATE OR REPLACE FUNCTION purge_old_inactive_tickets(
  p_network_id INTEGER,
  p_days_threshold INTEGER DEFAULT 7
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.tickets
  WHERE network_id = p_network_id 
    AND is_active = FALSE
    AND last_seen_at < NOW() - (p_days_threshold || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN v_count;
END;
$$;

-- =====================================================
-- 7. RPC Function: Obter estatísticas de lote
-- =====================================================

CREATE OR REPLACE FUNCTION get_batch_statistics(p_batch_id INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'batch_id', b.id,
    'batch_name', b.batch_name,
    'status', b.status,
    'total_files', b.total_files,
    'total_records', b.total_records,
    'errors_count', b.errors_count,
    'warnings_count', b.warnings_count,
    'created_at', b.created_at,
    'completed_at', b.completed_at,
    'files', (
      SELECT json_agg(json_build_object(
        'file_name', i.file_name,
        'file_type', i.file_type,
        'status', i.status,
        'total_records', i.total_records,
        'errors_count', i.errors_count,
        'created_at', i.created_at
      ))
      FROM public.imports i
      WHERE i.batch_id = b.id
      ORDER BY i.created_at
    )
  ) INTO v_result
  FROM public.import_batches b
  WHERE b.id = p_batch_id;
  
  RETURN v_result;
END;
$$;

-- =====================================================
-- 8. RPC Function: Listar lotes recentes
-- =====================================================

CREATE OR REPLACE FUNCTION get_recent_batches(
  p_network_id INTEGER,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id INTEGER,
  batch_name VARCHAR(255),
  status VARCHAR(20),
  total_files INTEGER,
  total_records INTEGER,
  errors_count INTEGER,
  warnings_count INTEGER,
  clear_before_import BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  imported_by_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.batch_name,
    b.status,
    b.total_files,
    b.total_records,
    b.errors_count,
    b.warnings_count,
    b.clear_before_import,
    b.created_at,
    b.completed_at,
    u.email as imported_by_email
  FROM public.import_batches b
  LEFT JOIN auth.users u ON b.imported_by = u.id
  WHERE b.network_id = p_network_id
  ORDER BY b.created_at DESC
  LIMIT p_limit;
END;
$$;

-- =====================================================
-- 9. Atualizar função get_tickets para considerar is_active
-- =====================================================

CREATE OR REPLACE FUNCTION get_tickets(
  p_network_id INTEGER DEFAULT NULL,
  p_date_from TIMESTAMP DEFAULT NULL,
  p_date_to TIMESTAMP DEFAULT NULL,
  p_internal_status TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_has_os BOOLEAN DEFAULT NULL,
  p_search_text TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS SETOF public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT t.*
  FROM public.tickets t
  WHERE 
    (p_network_id IS NULL OR t.network_id = p_network_id)
    AND (p_date_from IS NULL OR t.opened_at >= p_date_from)
    AND (p_date_to IS NULL OR t.opened_at <= p_date_to)
    AND (p_internal_status IS NULL OR t.internal_status = p_internal_status::TEXT)
    AND (p_severity IS NULL OR t.severity = p_severity::TEXT)
    AND (p_has_os IS NULL OR t.has_os = p_has_os)
    AND (p_include_inactive OR t.is_active = TRUE)
    AND (
      p_search_text IS NULL 
      OR t.ticket_external_id ILIKE '%' || p_search_text || '%'
      OR t.os_number ILIKE '%' || p_search_text || '%'
      OR t.assigned_to ILIKE '%' || p_search_text || '%'
    )
  ORDER BY t.opened_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- =====================================================
-- 10. Atualizar dashboard summary para considerar is_active
-- =====================================================

CREATE OR REPLACE FUNCTION get_dashboard_summary(p_network_id INTEGER DEFAULT NULL)
RETURNS TABLE (
  network_id INTEGER,
  total_tickets BIGINT,
  tickets_ok BIGINT,
  tickets_criticos BIGINT,
  tickets_atencao BIGINT,
  tickets_sem_os BIGINT,
  tickets_os_nao_encontrada BIGINT,
  tickets_novos BIGINT,
  tickets_em_atendimento BIGINT,
  avg_hours_no_os NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(p_network_id, t.network_id) as network_id,
    COUNT(*) as total_tickets,
    COUNT(*) FILTER (WHERE t.severity = 'info' AND t.is_active = TRUE) as tickets_ok,
    COUNT(*) FILTER (WHERE t.severity = 'critico' AND t.is_active = TRUE) as tickets_criticos,
    COUNT(*) FILTER (WHERE t.severity = 'atencao' AND t.is_active = TRUE) as tickets_atencao,
    COUNT(*) FILTER (WHERE t.has_os = FALSE AND t.is_active = TRUE) as tickets_sem_os,
    COUNT(*) FILTER (WHERE t.has_os = TRUE AND t.os_found_in_vdesk = FALSE AND t.is_active = TRUE) as tickets_os_nao_encontrada,
    COUNT(*) FILTER (WHERE t.internal_status = 'novo' AND t.is_active = TRUE) as tickets_novos,
    COUNT(*) FILTER (WHERE t.internal_status = 'em_atendimento' AND t.is_active = TRUE) as tickets_em_atendimento,
    AVG(
      EXTRACT(EPOCH FROM (NOW() - t.opened_at)) / 3600
    ) FILTER (WHERE t.has_os = FALSE AND t.opened_at IS NOT NULL AND t.is_active = TRUE) as avg_hours_no_os
  FROM public.tickets t
  WHERE 
    (p_network_id IS NULL OR t.network_id = p_network_id)
    AND t.is_active = TRUE
  GROUP BY COALESCE(p_network_id, t.network_id);
END;
$$;

-- =====================================================
-- 11. Row Level Security para import_batches
-- =====================================================

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

-- Política de leitura
CREATE POLICY "Users can view batches from their network"
  ON public.import_batches FOR SELECT
  USING (
    network_id IN (
      SELECT network_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Política de inserção
CREATE POLICY "Users can create batches for their network"
  ON public.import_batches FOR INSERT
  WITH CHECK (
    imported_by = auth.uid() AND
    network_id IN (
      SELECT network_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Política de atualização
CREATE POLICY "Users can update their own batches"
  ON public.import_batches FOR UPDATE
  USING (imported_by = auth.uid());

-- =====================================================
-- 12. Comentários nas tabelas e colunas
-- =====================================================

COMMENT ON TABLE public.import_batches IS 'Agrupa múltiplos arquivos importados em um único lote';
COMMENT ON COLUMN public.import_batches.clear_before_import IS 'Se TRUE, todos os tickets foram marcados como inativos antes desta importação';
COMMENT ON COLUMN public.tickets.is_active IS 'Indica se o ticket foi visto na última importação (usado para expurgo)';
COMMENT ON COLUMN public.tickets.last_seen_at IS 'Data/hora da última vez que este ticket foi importado';

-- =====================================================
-- 13. Grant de permissões
-- =====================================================

GRANT SELECT, INSERT, UPDATE ON public.import_batches TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE import_batches_id_seq TO authenticated;

GRANT EXECUTE ON FUNCTION mark_tickets_inactive(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION purge_old_inactive_tickets(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_batch_statistics(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_batches(INTEGER, INTEGER) TO authenticated;
