-- ========================================
-- HISTÓRICO RETROSPECTIVO DE SPRINTS
-- Reconstruir estado de qualquer sprint em qualquer data
-- ========================================

-- 1. RPC: RECONSTRUIR HISTÓRICO DE SPRINT EM DATA ESPECÍFICA
-- Permite consultar "como era Sprint S8 em 15-mai-2026?"
-- Funciona mesmo SEM snapshot manual capturado

CREATE OR REPLACE FUNCTION public.rpc_get_sprint_retrospective(
  p_sprint_code text,
  p_date date,
  p_fallback_to_latest boolean DEFAULT true
)
RETURNS TABLE (
  sprint_code text,
  retrospective_date date,
  total_demands bigint,
  planned_demands bigint,
  unplanned_demands bigint,
  delivered_demands bigint,
  finalized_demands bigint,
  in_progress_count bigint,
  transbordo_count bigint,
  avg_lead_time_days numeric,
  max_lead_time_days numeric,
  itens_criticos bigint,
  itens_atencao bigint,
  itens_saudaveis bigint,
  snapshot_found boolean,
  reconstructed boolean,
  data_source text,
  calculated_at timestamp
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  WITH snapshot_check AS (
    -- 1. Tentar encontrar snapshot capturado exatamente naquele período
    SELECT
      sprint_code,
      total_demands,
      planned_demands,
      unplanned_demands,
      delivered_demands,
      finalized_demands,
      transbordo_count,
      itens_criticos,
      itens_atencao,
      itens_saudaveis,
      avg_lead_time_days,
      max_lead_time_days,
      snapshot_datetime,
      true AS found_snapshot,
      'sprint_indicator_snapshots'::text AS source
    FROM public.sprint_indicator_snapshots
    WHERE sprint_code = p_sprint_code
      AND DATE(snapshot_datetime) = p_date
    ORDER BY snapshot_datetime DESC
    LIMIT 1
  ),
  -- 2. Se não houver snapshot exato, reconstruir do histórico contínuo
  reconstructed_data AS (
    SELECT
      ls.work_item_id,
      ls.current_stage,
      ls.total_lead_time_days,
      (COALESCE(ls.overflow_count, 0) > 0) AS transbordou_sprint,
      hs.health_status,
      dw.work_item_type,
      COALESCE(dw.tags, '') AS tags,
      dw.changed_date,
      ls.computed_at
    FROM pbi_lifecycle_summary ls
    LEFT JOIN pbi_health_summary hs ON hs.work_item_id = ls.work_item_id
    LEFT JOIN devops_work_items dw ON dw.id = ls.work_item_id
    WHERE (ls.last_committed_sprint = p_sprint_code OR ls.first_committed_sprint = p_sprint_code)
      AND ls.computed_at::date <= p_date  -- Estado até aquela data
    ORDER BY ls.computed_at DESC
  ),
  reconstructed_agg AS (
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE 
        tags ~* 'retorno\s*de\s*qa'
        OR (work_item_type = 'Bug' AND NOT (tags ~* 'retorno\s*de\s*qa'))
        OR ((tags ~* 'avi[aã]o') AND NOT (tags ~* 'retorno\s*de\s*qa'))
      )::bigint AS unplanned,
      COUNT(*) FILTER (WHERE current_stage IN ('qualidade', 'deploy'))::bigint AS delivered,
      COUNT(*) FILTER (WHERE current_stage = 'done')::bigint AS finalized,
      COUNT(*) FILTER (WHERE current_stage IN ('design', 'fabrica', 'qualidade', 'deploy'))::bigint AS in_progress,
      COUNT(*) FILTER (WHERE transbordou_sprint = true)::bigint AS transbordos,
      COUNT(*) FILTER (WHERE health_status = 'vermelho')::bigint AS criticos,
      COUNT(*) FILTER (WHERE health_status = 'amarelo')::bigint AS atencao,
      COUNT(*) FILTER (WHERE health_status = 'verde')::bigint AS saudaveis,
      ROUND(AVG(total_lead_time_days), 1)::numeric AS avg_lead,
      COALESCE(MAX(total_lead_time_days), 0)::numeric AS max_lead,
      COUNT(DISTINCT work_item_id)::bigint AS distinct_items
    FROM reconstructed_data
  )
  -- 3. Priorizar: snapshot real > reconstruído
  SELECT
    COALESCE(sc.sprint_code, p_sprint_code),
    p_date,
    COALESCE(sc.total_demands, ra.total),
    COALESCE(sc.planned_demands, ra.total - ra.unplanned),
    COALESCE(sc.unplanned_demands, ra.unplanned),
    COALESCE(sc.delivered_demands, ra.delivered),
    COALESCE(sc.finalized_demands, ra.finalized),
    COALESCE(ra.in_progress, 0::bigint),
    COALESCE(sc.transbordo_count, ra.transbordos),
    COALESCE(sc.avg_lead_time_days, ra.avg_lead),
    COALESCE(sc.max_lead_time_days, ra.max_lead),
    COALESCE(sc.itens_criticos, ra.criticos),
    COALESCE(sc.itens_atencao, ra.atencao),
    COALESCE(sc.itens_saudaveis, ra.saudaveis),
    sc.found_snapshot IS NOT NULL,
    sc.found_snapshot IS NULL,
    COALESCE(sc.source, 'pbi_lifecycle_summary_reconstructed'),
    NOW()
  FROM snapshot_check sc
  FULL OUTER JOIN reconstructed_agg ra ON true
  LIMIT 1;
$$;

-- 2. RPC: LISTAR TODAS AS SPRINTS DE 2026 COM HISTÓRICO
-- Mostra sprints com snapshots capturados E sprints sem snapshot

CREATE OR REPLACE FUNCTION public.rpc_list_all_sprints_2026()
RETURNS TABLE (
  sprint_code text,
  sprints_count bigint,
  has_snapshot boolean,
  latest_snapshot_date timestamp,
  total_demands bigint,
  finalized_demands bigint,
  conclusion_percentage numeric,
  itens_criticos bigint,
  data_source text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  WITH all_sprints AS (
    SELECT
      COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) AS sprint_code,
      COUNT(*)::bigint AS item_count
    FROM pbi_lifecycle_summary ls
    WHERE EXTRACT(YEAR FROM ls.computed_at::date) = 2026
      AND COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) IS NOT NULL
      AND COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) <> 'Sem Sprint'
    GROUP BY COALESCE(ls.last_committed_sprint, ls.first_committed_sprint)
  ),
  latest_snapshots AS (
    SELECT DISTINCT ON (sis.sprint_code)
      sis.sprint_code,
      sis.snapshot_datetime,
      sis.total_demands,
      sis.finalized_demands,
      sis.itens_criticos
    FROM public.sprint_indicator_snapshots sis
    ORDER BY sis.sprint_code, sis.snapshot_datetime DESC
  )
  SELECT
    s.sprint_code,
    s.item_count AS sprints_count,
    ls.sprint_code IS NOT NULL AS has_snapshot,
    ls.snapshot_datetime AS latest_snapshot_date,
    COALESCE(ls.total_demands, 0)::bigint AS total_demands,
    COALESCE(ls.finalized_demands, 0)::bigint AS finalized_demands,
    CASE
      WHEN COALESCE(ls.total_demands, 0) > 0
        THEN ROUND((ls.finalized_demands::numeric / ls.total_demands::numeric) * 100, 1)
      ELSE 0
    END AS conclusion_percentage,
    COALESCE(ls.itens_criticos, 0)::bigint AS itens_criticos,
    CASE WHEN ls.sprint_code IS NOT NULL THEN 'snapshot' ELSE 'reconstructed' END::text AS data_source
  FROM all_sprints s
  LEFT JOIN latest_snapshots ls ON ls.sprint_code = s.sprint_code
  ORDER BY s.sprint_code DESC;
$$;

-- 3. RPC: COMPARAR MÚLTIPLAS SPRINTS DE 2026
-- Mostrar tendência ao longo do ano

CREATE OR REPLACE FUNCTION public.rpc_compare_multiple_sprints_2026(
  p_limit int DEFAULT 12
)
RETURNS TABLE (
  ranking int,
  sprint_code text,
  total_demands bigint,
  finalized_demands bigint,
  conclusao_pct numeric,
  transbordo_count bigint,
  itens_criticos bigint,
  avg_lead_time_days numeric,
  data_type text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  WITH latest_snapshots AS (
    SELECT
      ROW_NUMBER() OVER (PARTITION BY sprint_code ORDER BY snapshot_datetime DESC) AS rn,
      sprint_code,
      total_demands,
      finalized_demands,
      transbordo_count,
      itens_criticos,
      avg_lead_time_days,
      'snapshot' AS data_type
    FROM public.sprint_indicator_snapshots
    WHERE EXTRACT(YEAR FROM snapshot_datetime) = 2026
  ),
  retrospective_data AS (
    SELECT
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(ls.last_committed_sprint, ls.first_committed_sprint)
        ORDER BY ls.computed_at DESC
      ) AS rn,
      COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) AS sprint_code,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE ls.current_stage = 'done')::bigint AS finalized,
      COUNT(*) FILTER (WHERE COALESCE(ls.overflow_count, 0) > 0)::bigint AS transbordo,
      COUNT(*) FILTER (WHERE hs.health_status = 'vermelho')::bigint AS criticos,
      ROUND(AVG(ls.total_lead_time_days), 1)::numeric AS avg_lead,
      'reconstructed' AS data_type
    FROM pbi_lifecycle_summary ls
    LEFT JOIN pbi_health_summary hs ON hs.work_item_id = ls.work_item_id
    WHERE EXTRACT(YEAR FROM ls.computed_at::date) = 2026
      AND COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) IS NOT NULL
    GROUP BY COALESCE(ls.last_committed_sprint, ls.first_committed_sprint), ls.computed_at
  ),
  combined AS (
    SELECT
      sprint_code,
      total_demands,
      finalized_demands,
      transbordo_count,
      itens_criticos,
      avg_lead_time_days,
      data_type
    FROM latest_snapshots
    WHERE rn = 1
    UNION ALL
    SELECT
      sprint_code,
      total,
      finalized,
      transbordo,
      criticos,
      avg_lead,
      data_type
    FROM retrospective_data
    WHERE rn = 1
      AND NOT EXISTS (
        SELECT 1 FROM latest_snapshots s
        WHERE s.sprint_code = retrospective_data.sprint_code
      )
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY sprint_code DESC)::int,
    sprint_code,
    total_demands,
    finalized_demands,
    CASE WHEN total_demands > 0 
      THEN ROUND((finalized_demands::numeric / total_demands) * 100, 1)
      ELSE 0 END AS conclusao_pct,
    transbordo_count,
    itens_criticos,
    avg_lead_time_days,
    data_type
  FROM combined
  ORDER BY sprint_code DESC
  LIMIT p_limit;
$$;

-- 4. RPC: TIMELINE ANUAL — EVOLUÇÃO DE 2026
-- Mostrar evolução mês a mês

CREATE OR REPLACE FUNCTION public.rpc_sprint_annual_timeline()
RETURNS TABLE (
  sprint_code text,
  sprint_month text,
  total_demands bigint,
  finalized_demands bigint,
  trend text,
  health_status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  WITH monthly_data AS (
    SELECT
      COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) AS sprint_code,
      TO_CHAR(ls.computed_at::date, 'YYYY-MM') AS month,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE ls.current_stage = 'done')::bigint AS finalized,
      COUNT(*) FILTER (WHERE hs.health_status = 'verde')::bigint +
      COUNT(*) FILTER (WHERE hs.health_status = 'amarelo')::bigint AS healthy,
      COUNT(*) FILTER (WHERE hs.health_status = 'vermelho')::bigint AS critical
    FROM pbi_lifecycle_summary ls
    LEFT JOIN pbi_health_summary hs ON hs.work_item_id = ls.work_item_id
    WHERE EXTRACT(YEAR FROM ls.computed_at::date) = 2026
    GROUP BY COALESCE(ls.last_committed_sprint, ls.first_committed_sprint), month
  ),
  with_trend AS (
    SELECT
      sprint_code,
      month,
      total,
      finalized,
      LAG(finalized) OVER (PARTITION BY sprint_code ORDER BY month) AS prev_finalized,
      CASE
        WHEN finalized > LAG(finalized) OVER (PARTITION BY sprint_code ORDER BY month) THEN '📈 Melhorando'
        WHEN finalized < LAG(finalized) OVER (PARTITION BY sprint_code ORDER BY month) THEN '📉 Piorando'
        ELSE '➡️ Estável'
      END AS trend,
      CASE
        WHEN critical > healthy * 2 THEN '🔴 Crítico'
        WHEN critical > healthy THEN '🟠 Atenção'
        ELSE '🟢 Saudável'
      END AS status
    FROM monthly_data
  )
  SELECT
    sprint_code,
    month,
    total,
    finalized,
    trend,
    status
  FROM with_trend
  ORDER BY sprint_code DESC, month DESC;
$$;

-- 5. VIEW: Todas as sprints 2026 com histórico disponível
CREATE OR REPLACE VIEW public.vw_sprints_2026_historical AS
SELECT
  COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) AS sprint_code,
  COUNT(*)::bigint AS total_items,
  COUNT(*) FILTER (WHERE ls.current_stage = 'done')::bigint AS completed_items,
  COUNT(*) FILTER (WHERE COALESCE(ls.overflow_count, 0) > 0)::bigint AS overflow_items,
  ROUND(AVG(ls.total_lead_time_days), 1)::numeric AS avg_lead_time,
  COUNT(DISTINCT sis.id) > 0 AS has_snapshot,
  MAX(sis.snapshot_datetime)::date AS last_snapshot_date,
  MAX(ls.computed_at)::date AS last_updated_date
FROM pbi_lifecycle_summary ls
LEFT JOIN public.sprint_indicator_snapshots sis 
  ON sis.sprint_code = COALESCE(ls.last_committed_sprint, ls.first_committed_sprint)
WHERE EXTRACT(YEAR FROM ls.computed_at::date) = 2026
GROUP BY COALESCE(ls.last_committed_sprint, ls.first_committed_sprint)
ORDER BY sprint_code DESC;

COMMENT ON FUNCTION public.rpc_get_sprint_retrospective IS 'Reconstruir estado de sprint em data específica — consulta snapshot ou reconstrói do histórico';
COMMENT ON FUNCTION public.rpc_list_all_sprints_2026 IS 'Listar TODAS as sprints de 2026 com dados históricos disponíveis';
COMMENT ON FUNCTION public.rpc_compare_multiple_sprints_2026 IS 'Comparar múltiplas sprints de 2026 — mostrar tendência';
COMMENT ON FUNCTION public.rpc_sprint_annual_timeline IS 'Timeline anual — evolução mês a mês';
COMMENT ON VIEW public.vw_sprints_2026_historical IS 'View consolidada de todas as sprints 2026 com histórico';
