-- ============================================================================
-- Migration: 20260520120000_fix_rpc_gerencial_fabrica_qa_return.sql
-- FIX DEFINITIVO: Usar sprint de DETECÇÃO em devops_qa_return_events
-- ============================================================================

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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  _result RECORD;
BEGIN
  FOR _result IN
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
      -- CORREÇÃO: Contar retornos QA pela sprint onde foram DETECTADOS (devops_qa_return_events.sprint_code)
      -- NÃO pela sprint final do item (pbi_lifecycle_summary.last_committed_sprint)
      SELECT
        COALESCE(dqre.sprint_code, 'Sem Sprint') AS sprint,
        COUNT(DISTINCT dqre.work_item_id) AS unique_items_with_returns
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
      b.sprint::text AS sprint_code,
      COUNT(*)::bigint AS total_itens,
      COUNT(*) FILTER (WHERE b.current_stage = 'done')::bigint AS done_count,
      COUNT(*) FILTER (WHERE b.current_stage IN ('fabrica','qualidade','deploy','design'))::bigint AS in_progress_count,
      COUNT(*) FILTER (WHERE b.transbordou_sprint = true)::bigint AS transbordo_count,
      COUNT(*) FILTER (WHERE b.foi_despriorizada = true)::bigint AS despriorizado_count,
      COUNT(*) FILTER (WHERE b.retornou_para_backlog = true)::bigint AS retorno_backlog_count,
      ROUND(AVG(b.total_lead_time_days), 1)::numeric AS avg_lead_time_days,
      COALESCE(MAX(b.total_lead_time_days), 0)::numeric AS max_lead_time_days,
      ts.top_stage::text AS gargalo_principal,
      ROUND(ts.top_avg, 1)::numeric AS gargalo_avg_days,
      COALESCE(qr.unique_items_with_returns, 0)::bigint AS qa_return_total,
      COUNT(*) FILTER (WHERE b.health_status = 'vermelho')::bigint AS itens_criticos,
      COUNT(*) FILTER (WHERE b.health_status = 'amarelo')::bigint AS itens_atencao,
      COUNT(*) FILTER (WHERE b.health_status = 'verde')::bigint AS itens_saudaveis
    FROM base b
    LEFT JOIN top_stage ts ON ts.sprint = b.sprint
    LEFT JOIN qa_returns_by_sprint qr ON qr.sprint = b.sprint
    GROUP BY b.sprint, ts.top_stage, ts.top_avg, qr.unique_items_with_returns
    ORDER BY b.sprint DESC
  LOOP
    sprint_code := _result.sprint_code;
    total_itens := _result.total_itens;
    done_count := _result.done_count;
    in_progress_count := _result.in_progress_count;
    transbordo_count := _result.transbordo_count;
    despriorizado_count := _result.despriorizado_count;
    retorno_backlog_count := _result.retorno_backlog_count;
    avg_lead_time_days := _result.avg_lead_time_days;
    max_lead_time_days := _result.max_lead_time_days;
    gargalo_principal := _result.gargalo_principal;
    gargalo_avg_days := _result.gargalo_avg_days;
    qa_return_total := _result.qa_return_total;
    itens_criticos := _result.itens_criticos;
    itens_atencao := _result.itens_atencao;
    itens_saudaveis := _result.itens_saudaveis;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.rpc_gerencial_fabrica_summary IS
  'v2 Corrigida: Retorna KPIs gerenciais da Fábrica com contagem correta de retornos QA 
  usando a sprint de DETECÇÃO (devops_qa_return_events.sprint_code), não a sprint final do item.
  Isso garante consistência com a "Aba Retorno" que mostra 13 itens para S9-2026.';
