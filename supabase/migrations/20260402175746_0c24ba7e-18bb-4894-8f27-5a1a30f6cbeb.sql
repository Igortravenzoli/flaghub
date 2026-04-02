
-- 1) Add derived columns to pbi_lifecycle_summary
ALTER TABLE public.pbi_lifecycle_summary
  ADD COLUMN IF NOT EXISTS foi_despriorizada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retornou_para_backlog boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transbordou_sprint boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_transbordo text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS dias_sem_atualizacao integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tempo_retrabalho_dias numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_motivo_retorno text DEFAULT NULL;

-- 2) RPC: Gerencial Fábrica Summary (por sprint)
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
    COALESCE(SUM(b.qa_return_count), 0) AS qa_return_total,
    COUNT(*) FILTER (WHERE b.health_status = 'vermelho') AS itens_criticos,
    COUNT(*) FILTER (WHERE b.health_status = 'amarelo') AS itens_atencao,
    COUNT(*) FILTER (WHERE b.health_status = 'verde') AS itens_saudaveis
  FROM base b
  LEFT JOIN top_stage ts ON ts.sprint = b.sprint
  GROUP BY b.sprint, ts.top_stage, ts.top_avg
  ORDER BY b.sprint DESC;
$$;

-- 3) RPC: Gerencial QA Summary (por sprint)
CREATE OR REPLACE FUNCTION public.rpc_gerencial_qa_summary(
  p_sprint_code text DEFAULT NULL,
  p_date_start date DEFAULT NULL,
  p_date_end date DEFAULT NULL
)
RETURNS TABLE(
  sprint_code text,
  total_itens bigint,
  testadas bigint,
  aprovadas bigint,
  reprovadas bigint,
  retornadas bigint,
  avg_qualidade_days numeric,
  max_qualidade_days numeric,
  taxa_aprovacao numeric,
  taxa_retrabalho numeric,
  retrabalho_baixo bigint,
  retrabalho_alto bigint,
  retrabalho_critico bigint,
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
    WHERE (p_sprint_code IS NULL OR ls.last_committed_sprint = p_sprint_code OR ls.first_committed_sprint = p_sprint_code)
      AND (p_date_start IS NULL OR ls.computed_at::date >= p_date_start)
      AND (p_date_end IS NULL OR ls.computed_at::date <= p_date_end)
  )
  SELECT
    b.sprint AS sprint_code,
    COUNT(*) AS total_itens,
    COUNT(*) FILTER (WHERE b.qualidade_days > 0 OR b.current_stage = 'qualidade' OR b.current_stage = 'done') AS testadas,
    COUNT(*) FILTER (WHERE b.current_stage = 'done' AND b.qa_return_count = 0) AS aprovadas,
    COUNT(*) FILTER (WHERE b.qa_return_count > 0) AS reprovadas,
    COUNT(*) FILTER (WHERE b.qa_return_count > 0 AND b.current_stage IN ('fabrica','design','backlog')) AS retornadas,
    ROUND(AVG(CASE WHEN b.qualidade_days > 0 THEN b.qualidade_days END), 1) AS avg_qualidade_days,
    COALESCE(MAX(CASE WHEN b.qualidade_days > 0 THEN b.qualidade_days END), 0) AS max_qualidade_days,
    CASE WHEN COUNT(*) FILTER (WHERE b.qualidade_days > 0 OR b.current_stage IN ('qualidade','done')) > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE b.current_stage = 'done' AND b.qa_return_count = 0)::numeric /
        NULLIF(COUNT(*) FILTER (WHERE b.qualidade_days > 0 OR b.current_stage IN ('qualidade','done')), 0) * 100, 1)
      ELSE 0 END AS taxa_aprovacao,
    CASE WHEN COUNT(*) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE b.qa_return_count > 0)::numeric / COUNT(*)::numeric * 100, 1)
      ELSE 0 END AS taxa_retrabalho,
    COUNT(*) FILTER (WHERE b.qa_return_count = 1) AS retrabalho_baixo,
    COUNT(*) FILTER (WHERE b.qa_return_count = 2) AS retrabalho_alto,
    COUNT(*) FILTER (WHERE b.qa_return_count >= 3) AS retrabalho_critico,
    COUNT(*) FILTER (WHERE b.health_status = 'vermelho') AS itens_criticos,
    COUNT(*) FILTER (WHERE b.health_status = 'amarelo') AS itens_atencao,
    COUNT(*) FILTER (WHERE b.health_status = 'verde') AS itens_saudaveis
  FROM base b
  GROUP BY b.sprint
  ORDER BY b.sprint DESC;
$$;

-- 4) RPC: QA Desempenho por Responsável
CREATE OR REPLACE FUNCTION public.rpc_qa_desempenho_responsavel(
  p_sprint_code text DEFAULT NULL,
  p_date_start date DEFAULT NULL,
  p_date_end date DEFAULT NULL
)
RETURNS TABLE(
  responsavel text,
  tasks_testadas bigint,
  avg_qualidade_days numeric,
  reprovacoes bigint,
  taxa_aprovacao numeric,
  retornos_gerados bigint,
  itens_criticos bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    COALESCE(w.assigned_to_display, 'Não atribuído') AS responsavel,
    COUNT(*) AS tasks_testadas,
    ROUND(AVG(ls.qualidade_days), 1) AS avg_qualidade_days,
    COUNT(*) FILTER (WHERE ls.qa_return_count > 0) AS reprovacoes,
    CASE WHEN COUNT(*) > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE ls.qa_return_count = 0 AND ls.current_stage = 'done')::numeric /
        NULLIF(COUNT(*), 0) * 100, 1)
      ELSE 0 END AS taxa_aprovacao,
    COALESCE(SUM(ls.qa_return_count), 0) AS retornos_gerados,
    COUNT(*) FILTER (WHERE ls.qa_return_count >= 3) AS itens_criticos
  FROM pbi_lifecycle_summary ls
  JOIN devops_work_items w ON w.id = ls.work_item_id
  WHERE ls.qualidade_days > 0
    AND (p_sprint_code IS NULL OR ls.last_committed_sprint = p_sprint_code OR ls.first_committed_sprint = p_sprint_code)
    AND (p_date_start IS NULL OR ls.computed_at::date >= p_date_start)
    AND (p_date_end IS NULL OR ls.computed_at::date <= p_date_end)
  GROUP BY w.assigned_to_display
  ORDER BY COUNT(*) DESC;
$$;
