-- ============================================================================
-- Migration: 20260520110000_fix_gerencial_qa_return_counting.sql
-- Correção: Contar retornos QA pela sprint de DETECÇÃO, não sprint final
--
-- PROBLEMA: rpc_gerencial_fabrica_summary contava qa_return_count de 
--           pbi_lifecycle_summary que tem sprint FINAL do item, não a sprint 
--           onde o retorno foi DETECTADO
-- 
-- SOLUÇÃO: Usar devops_qa_return_events que tem sprint_code correto (sprint 
--          onde retorno foi detectado), fazer LEFT JOIN e contar distinct items
-- ============================================================================

-- Versão v2 corrigida da RPC gerencial_fabrica_summary
CREATE OR REPLACE FUNCTION public.rpc_gerencial_fabrica_summary(
  p_sprint_code text DEFAULT NULL,
  p_date_start date DEFAULT NULL,
  p_date_end date DEFAULT NULL,
  p_sector text DEFAULT NULL
)
RETURNS TABLE(
  sprint_code text,
  total_itens bigint,
  done_count bigint,
  in_progress_count bigint,
  transbordo_count bigint,
  despriorizado_count bigint,
  retorno_backlog_count bigint,
  avg_lead_time_days numeric,
  max_lead_time_days numeric,
  gargalo_principal text,
  gargalo_avg_days numeric,
  qa_return_total bigint,
  itens_criticos bigint,
  itens_atencao bigint,
  itens_saudaveis bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  WITH base AS (
    SELECT
      COALESCE(ls.last_committed_sprint, ls.first_committed_sprint, 'Sem Sprint') AS sprint,
      ls.*,
      hs.health_status
    FROM pbi_lifecycle_summary ls
    LEFT JOIN pbi_health_summary hs ON hs.work_item_id = ls.work_item_id
    WHERE (p_sector IS NULL OR ls.sector = p_sector)
      AND (p_sprint_code IS NULL OR ls.last_committed_sprint = p_sprint_code OR ls.first_committed_sprint = p_sprint_code)
      AND (p_date_start IS NULL OR ls.computed_at::date >= p_date_start)
      AND (p_date_end IS NULL OR ls.computed_at::date <= p_date_end)
  ),
  qa_returns_by_sprint AS (
    -- Contar retornos QA pela sprint onde foram DETECTADOS, não sprint final
    SELECT
      COALESCE(dqre.sprint_code, 'Sem Sprint') AS sprint,
      COUNT(DISTINCT dqre.work_item_id) AS unique_items_with_returns,
      COUNT(*) AS total_return_events
    FROM devops_qa_return_events dqre
    WHERE (p_sprint_code IS NULL OR dqre.sprint_code = p_sprint_code)
    GROUP BY COALESCE(dqre.sprint_code, 'Sem Sprint')
  ),
  stage_avg AS (
    SELECT
      b.sprint,
      unnest(ARRAY['backlog','design','fabrica','qualidade','deploy']) AS stage,
      unnest(ARRAY[AVG(b.backlog_days), AVG(b.design_days), AVG(b.fabrica_days), AVG(b.qualidade_days), AVG(b.deploy_days)]) AS avg_d
    FROM base b
    GROUP BY b.sprint
  ),
  top_stage AS (
    SELECT DISTINCT ON (sprint) sprint, stage AS top_stage, avg_d AS top_avg
    FROM stage_avg
    WHERE stage NOT IN ('done')
    ORDER BY sprint, avg_d DESC
  )
  SELECT
    b.sprint AS sprint_code,
    COUNT(*) AS total_itens,
    COUNT(*) FILTER (WHERE b.current_stage = 'done') AS done_count,
    COUNT(*) FILTER (WHERE b.current_stage IN ('fabrica','qualidade','deploy','design')) AS in_progress_count,
    COUNT(*) FILTER (WHERE b.transbordou_sprint = true) AS transbordo_count,
    COUNT(*) FILTER (WHERE b.foi_despriorizada = true) AS despriorizado_count,
    COUNT(*) FILTER (WHERE b.retornou_para_backlog = true) AS retorno_backlog_count,
    ROUND(AVG(b.total_lead_time_days), 1) AS avg_lead_time_days,
    COALESCE(MAX(b.total_lead_time_days), 0) AS max_lead_time_days,
    ts.top_stage AS gargalo_principal,
    ROUND(ts.top_avg, 1) AS gargalo_avg_days,
    COALESCE(qr.unique_items_with_returns, 0) AS qa_return_total,
    COUNT(*) FILTER (WHERE b.health_status = 'vermelho') AS itens_criticos,
    COUNT(*) FILTER (WHERE b.health_status = 'amarelo') AS itens_atencao,
    COUNT(*) FILTER (WHERE b.health_status = 'verde') AS itens_saudaveis
  FROM base b
  LEFT JOIN top_stage ts ON ts.sprint = b.sprint
  LEFT JOIN qa_returns_by_sprint qr ON qr.sprint = b.sprint
  GROUP BY b.sprint, ts.top_stage, ts.top_avg, qr.unique_items_with_returns
  ORDER BY b.sprint DESC;
$$;

-- Validação pós-correção:
-- SELECT sprint_code, qa_return_total FROM rpc_gerencial_fabrica_summary() 
-- ORDER BY sprint_code DESC LIMIT 10;
--
-- Deve mostrar:
-- S9-2026: 13 (não 9)
-- S8-2026: 9 (não 16)
-- S10-2026: 12 (não aparecia antes)
