-- Sprint Indicator Snapshots — Congelar KPIs ao final de cada sprint
-- Permite consultar: "Como terminou S8-2026?"

-- 1. Tabela para armazenar snapshots congelados
CREATE TABLE IF NOT EXISTS public.sprint_indicator_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificação da sprint
  sprint_id bigint,
  sprint_code text NOT NULL,
  sprint_start_date date,
  sprint_end_date date,
  
  -- Indicadores congelados
  total_demands bigint,
  planned_demands bigint,
  unplanned_demands bigint,
  delivered_demands bigint,
  finalized_demands bigint,
  
  -- Breakdowns (análise)
  delivered_in_dev_count bigint,        -- Que ainda podem voltar
  delivered_in_qa_count bigint,         -- Aguardando deploy
  
  -- Por tipo
  unplanned_bug_count bigint,
  unplanned_retorno_qa_count bigint,
  unplanned_aviao_count bigint,
  
  -- Saúde agregada
  itens_criticos bigint,
  itens_atencao bigint,
  itens_saudaveis bigint,
  
  -- Lead times
  avg_lead_time_days numeric,
  max_lead_time_days numeric,
  
  -- Transbordo
  transbordo_count bigint,
  transbordo_percentage numeric,
  
  -- Auditoria
  source_work_item_ids bigint[],         -- IDs dos itens usados
  work_item_count_in_snapshot bigint,
  inconsistencies_found jsonb,           -- Flags de problemas
  inconsistencies_count int,
  
  -- Metadata
  snapshot_datetime timestamp NOT NULL DEFAULT now(),
  captured_by text DEFAULT 'system',
  notes text,
  
  -- Rastreamento
  created_at timestamp NOT NULL DEFAULT now(),
  reprocessed_at timestamp,
  reprocess_reason text,
  
  UNIQUE(sprint_code, snapshot_datetime)
);

-- 2. Índices para queries rápidas
CREATE INDEX idx_sprint_snapshots_sprint_code ON public.sprint_indicator_snapshots(sprint_code);
CREATE INDEX idx_sprint_snapshots_end_date ON public.sprint_indicator_snapshots(sprint_end_date DESC);
CREATE INDEX idx_sprint_snapshots_datetime ON public.sprint_indicator_snapshots(snapshot_datetime DESC);

-- 3. RLS — Leitura autenticada
ALTER TABLE public.sprint_indicator_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshot_select_authenticated" ON public.sprint_indicator_snapshots
  FOR SELECT TO authenticated USING (true);

-- 4. RPC: Capturar snapshot da sprint atual
CREATE OR REPLACE FUNCTION public.rpc_capture_sprint_snapshot(
  p_sprint_code text,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  snapshot_id uuid,
  sprint_code text,
  total_demands bigint,
  planned_demands bigint,
  unplanned_demands bigint,
  delivered_demands bigint,
  finalized_demands bigint,
  captured_at timestamp
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  v_snapshot_id uuid;
  v_total bigint;
  v_planned bigint;
  v_unplanned bigint;
  v_delivered bigint;
  v_finalized bigint;
  v_criticos bigint;
  v_atencao bigint;
  v_saudaveis bigint;
  v_work_item_ids bigint[];
  v_inconsistencies jsonb;
  v_avg_lead numeric;
  v_max_lead numeric;
  v_transbordo_count bigint;
BEGIN
  -- Calcular indicadores NESTE MOMENTO
  WITH base_items AS (
    SELECT
      ls.work_item_id,
      ls.current_stage,
      ls.total_lead_time_days,
      ls.transbordou_sprint,
      ls.health_status,
      COALESCE(dq.work_item_type, 'Unknown') AS work_item_type,
      COALESCE(dq.tags, ARRAY[]::text[]) AS tags
    FROM pbi_lifecycle_summary ls
    LEFT JOIN devops_query_items_current dq ON dq.id = ls.work_item_id
    WHERE (ls.last_committed_sprint = p_sprint_code OR ls.first_committed_sprint = p_sprint_code)
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM base_items b2 
      WHERE b2.tags @> ARRAY['Retorno de QA']::text[] 
         OR (b2.work_item_type = 'Bug' AND NOT b2.tags @> ARRAY['Retorno de QA']::text[])
         OR (b2.tags @> ARRAY['Avião']::text[] AND NOT b2.tags @> ARRAY['Retorno de QA']::text[])
    ))::bigint,
    COUNT(*) FILTER (WHERE 
      tags @> ARRAY['Retorno de QA']::text[] 
      OR (work_item_type = 'Bug' AND NOT tags @> ARRAY['Retorno de QA']::text[])
      OR (tags @> ARRAY['Avião']::text[] AND NOT tags @> ARRAY['Retorno de QA']::text[])
    )::bigint,
    COUNT(*) FILTER (WHERE current_stage IN ('qualidade', 'deploy'))::bigint,
    COUNT(*) FILTER (WHERE current_stage = 'done')::bigint,
    COUNT(*) FILTER (WHERE health_status = 'vermelho')::bigint,
    COUNT(*) FILTER (WHERE health_status = 'amarelo')::bigint,
    COUNT(*) FILTER (WHERE health_status = 'verde')::bigint,
    ARRAY_AGG(DISTINCT work_item_id)::bigint[],
    ROUND(AVG(total_lead_time_days), 1)::numeric,
    COALESCE(MAX(total_lead_time_days), 0)::numeric,
    COUNT(*) FILTER (WHERE transbordou_sprint = true)::bigint
  INTO v_total, v_planned, v_unplanned, v_delivered, v_finalized,
       v_criticos, v_atencao, v_saudaveis, v_work_item_ids,
       v_avg_lead, v_max_lead, v_transbordo_count
  FROM base_items;

  -- Validar inconsistências
  v_inconsistencies := jsonb_build_object(
    'total_items', v_total,
    'snapshot_time', NOW()::text
  );

  -- Inserir snapshot
  INSERT INTO public.sprint_indicator_snapshots (
    sprint_code,
    total_demands,
    planned_demands,
    unplanned_demands,
    delivered_demands,
    finalized_demands,
    itens_criticos,
    itens_atencao,
    itens_saudaveis,
    source_work_item_ids,
    work_item_count_in_snapshot,
    avg_lead_time_days,
    max_lead_time_days,
    transbordo_count,
    inconsistencies_found,
    notes,
    snapshot_datetime
  )
  VALUES (
    p_sprint_code,
    v_total,
    v_planned,
    v_unplanned,
    v_delivered,
    v_finalized,
    v_criticos,
    v_atencao,
    v_saudaveis,
    v_work_item_ids,
    ARRAY_LENGTH(v_work_item_ids, 1),
    v_avg_lead,
    v_max_lead,
    v_transbordo_count,
    v_inconsistencies,
    p_notes,
    NOW()
  )
  RETURNING id INTO v_snapshot_id;

  -- Retornar resultado
  RETURN QUERY
  SELECT
    v_snapshot_id,
    p_sprint_code,
    v_total,
    v_planned,
    v_unplanned,
    v_delivered,
    v_finalized,
    NOW();
END;
$$;

-- 5. RPC: Consultar sprint histórica (snapshot congelado)
CREATE OR REPLACE FUNCTION public.rpc_get_sprint_historical(
  p_sprint_code text
)
RETURNS TABLE (
  sprint_code text,
  total_demands bigint,
  planned_demands bigint,
  unplanned_demands bigint,
  delivered_demands bigint,
  finalized_demands bigint,
  delivered_in_dev bigint,
  delivered_in_qa bigint,
  unplanned_bug_count bigint,
  unplanned_retorno_qa_count bigint,
  unplanned_aviao_count bigint,
  itens_criticos bigint,
  itens_atencao bigint,
  itens_saudaveis bigint,
  avg_lead_time_days numeric,
  max_lead_time_days numeric,
  transbordo_count bigint,
  work_item_count int,
  source_work_item_ids bigint[],
  snapshot_datetime timestamp,
  captured_by text,
  notes text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    sprint_code,
    total_demands,
    planned_demands,
    unplanned_demands,
    delivered_demands,
    finalized_demands,
    delivered_in_dev_count,
    delivered_in_qa_count,
    unplanned_bug_count,
    unplanned_retorno_qa_count,
    unplanned_aviao_count,
    itens_criticos,
    itens_atencao,
    itens_saudaveis,
    avg_lead_time_days,
    max_lead_time_days,
    transbordo_count,
    work_item_count_in_snapshot,
    source_work_item_ids,
    snapshot_datetime,
    captured_by,
    notes
  FROM public.sprint_indicator_snapshots
  WHERE sprint_code = p_sprint_code
  ORDER BY snapshot_datetime DESC
  LIMIT 1;
$$;

-- 6. RPC: Listar todas as sprints com snapshots
CREATE OR REPLACE FUNCTION public.rpc_list_sprint_snapshots(
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  sprint_code text,
  total_demands bigint,
  planned_demands bigint,
  unplanned_demands bigint,
  delivered_demands bigint,
  finalized_demands bigint,
  snapshot_datetime timestamp,
  snapshot_age_days int,
  itens_criticos bigint,
  avg_lead_time_days numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    sprint_code,
    total_demands,
    planned_demands,
    unplanned_demands,
    delivered_demands,
    finalized_demands,
    snapshot_datetime,
    (EXTRACT(DAY FROM (NOW() - snapshot_datetime)))::int,
    itens_criticos,
    avg_lead_time_days
  FROM public.sprint_indicator_snapshots
  WHERE snapshot_datetime = (
    SELECT MAX(snapshot_datetime) 
    FROM public.sprint_indicator_snapshots s2 
    WHERE s2.sprint_code = sprint_indicator_snapshots.sprint_code
  )
  ORDER BY snapshot_datetime DESC
  LIMIT p_limit;
$$;

-- 7. RPC: Comparar duas sprints
CREATE OR REPLACE FUNCTION public.rpc_compare_sprint_snapshots(
  p_sprint_1 text,
  p_sprint_2 text
)
RETURNS TABLE (
  metric text,
  sprint_1_value text,
  sprint_2_value text,
  difference text,
  direction text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  WITH s1 AS (
    SELECT * FROM public.sprint_indicator_snapshots
    WHERE sprint_code = p_sprint_1
    ORDER BY snapshot_datetime DESC LIMIT 1
  ),
  s2 AS (
    SELECT * FROM public.sprint_indicator_snapshots
    WHERE sprint_code = p_sprint_2
    ORDER BY snapshot_datetime DESC LIMIT 1
  )
  SELECT
    'Total Demandas'::text,
    (SELECT total_demands::text FROM s1),
    (SELECT total_demands::text FROM s2),
    (SELECT (s1.total_demands - s2.total_demands)::text FROM s1, s2),
    CASE WHEN (SELECT s1.total_demands > s2.total_demands FROM s1, s2) THEN '↑' ELSE '↓' END::text
  UNION ALL
  SELECT 'Demandas Planejadas', (SELECT planned_demands::text FROM s1), (SELECT planned_demands::text FROM s2),
    (SELECT (s1.planned_demands - s2.planned_demands)::text FROM s1, s2),
    CASE WHEN (SELECT s1.planned_demands > s2.planned_demands FROM s1, s2) THEN '↑' ELSE '↓' END
  UNION ALL
  SELECT 'Demandas Não Planejadas', (SELECT unplanned_demands::text FROM s1), (SELECT unplanned_demands::text FROM s2),
    (SELECT (s1.unplanned_demands - s2.unplanned_demands)::text FROM s1, s2),
    CASE WHEN (SELECT s1.unplanned_demands > s2.unplanned_demands FROM s1, s2) THEN '↑' ELSE '↓' END
  UNION ALL
  SELECT 'Demandas Entregues', (SELECT delivered_demands::text FROM s1), (SELECT delivered_demands::text FROM s2),
    (SELECT (s1.delivered_demands - s2.delivered_demands)::text FROM s1, s2),
    CASE WHEN (SELECT s1.delivered_demands > s2.delivered_demands FROM s1, s2) THEN '↑' ELSE '↓' END
  UNION ALL
  SELECT 'Demandas Finalizadas', (SELECT finalized_demands::text FROM s1), (SELECT finalized_demands::text FROM s2),
    (SELECT (s1.finalized_demands - s2.finalized_demands)::text FROM s1, s2),
    CASE WHEN (SELECT s1.finalized_demands > s2.finalized_demands FROM s1, s2) THEN '↑' ELSE '↓' END
  UNION ALL
  SELECT 'Lead Time Médio', (SELECT avg_lead_time_days::text FROM s1), (SELECT avg_lead_time_days::text FROM s2),
    (SELECT (s1.avg_lead_time_days - s2.avg_lead_time_days)::text FROM s1, s2),
    CASE WHEN (SELECT s1.avg_lead_time_days > s2.avg_lead_time_days FROM s1, s2) THEN '↑' ELSE '↓' END
  UNION ALL
  SELECT 'Itens Críticos', (SELECT itens_criticos::text FROM s1), (SELECT itens_criticos::text FROM s2),
    (SELECT (s1.itens_criticos - s2.itens_criticos)::text FROM s1, s2),
    CASE WHEN (SELECT s1.itens_criticos > s2.itens_criticos FROM s1, s2) THEN '↑' ELSE '↓' END;
$$;

COMMENT ON TABLE public.sprint_indicator_snapshots IS 'Snapshots congelados dos indicadores de sprint — permite consultar histórico sem alterações retroativas';
COMMENT ON FUNCTION public.rpc_capture_sprint_snapshot IS 'Captura snapshot dos KPIs de uma sprint — executar ao final de cada sprint ou manualmente';
COMMENT ON FUNCTION public.rpc_get_sprint_historical IS 'Consulta dados históricos congelados de uma sprint específica';
COMMENT ON FUNCTION public.rpc_list_sprint_snapshots IS 'Lista últimas N sprints com snapshots capturados';
COMMENT ON FUNCTION public.rpc_compare_sprint_snapshots IS 'Compara indicadores de duas sprints diferentes';
