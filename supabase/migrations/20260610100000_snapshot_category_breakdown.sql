-- ============================================================================
-- Migration: 20260610100000_snapshot_category_breakdown.sql
-- Visão histórica completa para o gerencial da Fábrica:
--   1. fn_classifica_demanda — classificação única por tags (mesmas regras do
--      GerenciaTab): retorno_qa > avião (sprint/transbordado) > priorização
--      (pura/transbordo, inclui bugs priorizados) > bug > priorização.
--   2. sprint_indicator_snapshots.category_breakdown (jsonb) — subindicadores
--      gerais e por fábrica (Epic raiz) congelados na fotografia da sprint:
--      { "geral": {...}, "fabricas": { "FLEXX": {...}, ... } }
--      Cada escopo: total, cats{...}, entregue{...}, done{...},
--      priorizado_done, priorizado_em_dev.
--   3. rpc_reconstruct_sprint_snapshot passa a calcular e gravar o breakdown
--      no estado de 23:59 do fim da sprint (via state_history).
-- ============================================================================

-- ── 1. Classificador único ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_classifica_demanda(p_type text, p_tags text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_tags,'') ~* '(^|;)\s*retorno\s*(de\s*)?qa\s*(;|$)' THEN 'retorno_qa'
    WHEN COALESCE(p_tags,'') ~* '(^|;)\s*avi[aã]o\M' THEN
      CASE WHEN COALESCE(p_tags,'') ~* '(^|;)\s*transbord(o|ad[oa])\s*(;|$)'
             OR COALESCE(p_tags,'') ~* '(^|;)\s*avi[aã]o\s+(antigo|transbordad[oa])\s*(;|$)'
        THEN 'aviao_transbordado' ELSE 'aviao_sprint' END
    WHEN COALESCE(p_tags,'') ~* '(^|;)\s*prioriza[cç][aã]o\s*(;|$)' THEN
      CASE WHEN COALESCE(p_tags,'') ~* '(^|;)\s*transbord(o|ad[oa])\s*(;|$)'
        THEN 'priorizacao_transbordo' ELSE 'priorizacao' END
    WHEN COALESCE(p_type,'') = 'Bug' OR COALESCE(p_tags,'') ~* '(^|;)\s*bug\s*(;|$)' THEN 'bug'
    ELSE 'priorizacao'
  END;
$$;

COMMENT ON FUNCTION public.fn_classifica_demanda(text, text) IS
  'Classificação gerencial por tags (mesmas regras do GerenciaTab): retorno_qa, aviao_sprint, aviao_transbordado, priorizacao, priorizacao_transbordo, bug.';

-- ── 2. Coluna de breakdown ───────────────────────────────────────────────────
ALTER TABLE public.sprint_indicator_snapshots
  ADD COLUMN IF NOT EXISTS category_breakdown jsonb;

COMMENT ON COLUMN public.sprint_indicator_snapshots.category_breakdown IS
  'Subindicadores congelados da sprint: {"geral": escopo, "fabricas": {nome: escopo}}. '
  'Escopo = {total, cats{priorizacao, priorizacao_transbordo, bug, retorno_qa, aviao_sprint, aviao_transbordado}, '
  'entregue{total,bug,retorno_qa,priorizacao,aviao}, done{...}, priorizado_done, priorizado_em_dev}.';

-- ── 3. Reconstrução com breakdown ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_reconstruct_sprint_snapshot(
  p_sprint_code text,
  p_as_of timestamptz DEFAULT NULL
)
RETURNS TABLE(
  sprint_code text,
  as_of_datetime timestamptz,
  total bigint,
  qa_done bigint,
  qa_concluidos bigint,
  itens_exatos bigint,
  itens_aprox bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_as_of timestamptz;
  v_sprint_start date; v_sprint_end date;
  v_total bigint; v_planned bigint; v_unplanned bigint; v_delivered bigint; v_finalized bigint;
  v_criticos bigint; v_atencao bigint; v_saudaveis bigint;
  v_avg_lead numeric; v_max_lead numeric; v_transbordo bigint;
  v_qa_done bigint; v_qa_with_return bigint; v_qa_cycles bigint;
  v_qa_concluidos bigint; v_qa_concluidos_sr bigint; v_qa_concluidos_cr bigint;
  v_exatos bigint; v_aprox bigint;
  v_work_item_ids bigint[];
  v_rate numeric; v_avg_cycles numeric;
  v_breakdown jsonb;
  v_snapshot_id uuid;
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

  SELECT r.sprint_start, r.sprint_end INTO v_sprint_start, v_sprint_end
  FROM public.fn_sprint_official_range(p_sprint_code) r LIMIT 1;

  v_as_of := COALESCE(
    p_as_of,
    (((v_sprint_end + 1)::timestamp - interval '1 second') AT TIME ZONE 'America/Sao_Paulo')
  );

  WITH items AS (
    SELECT
      ls.work_item_id, w.state AS cur_state, w.changed_date, w.state_history,
      w.closed_by, w.closed_by_email, w.closed_date,
      COALESCE(ls.qa_return_count,0) AS qrc_now,
      ls.total_lead_time_days, ls.transbordou_sprint,
      hs.health_status,
      COALESCE(w.work_item_type,'Unknown') AS wtype,
      COALESCE(w.tags,'') AS tags_text
    FROM pbi_lifecycle_summary ls
    LEFT JOIN devops_work_items w ON w.id = ls.work_item_id
    LEFT JOIN pbi_health_summary hs ON hs.work_item_id = ls.work_item_id
    WHERE ls.last_committed_sprint = p_sprint_code OR ls.first_committed_sprint = p_sprint_code
  ),
  asof AS (
    SELECT i.*,
      CASE WHEN i.changed_date <= v_as_of THEN i.cur_state
           ELSE COALESCE(
             (SELECT e->>'newValue' FROM jsonb_array_elements(i.state_history) e
               WHERE (e->>'revisedDate')::timestamptz <= v_as_of
               ORDER BY (e->>'revisedDate')::timestamptz DESC LIMIT 1),
             (SELECT e->>'oldValue' FROM jsonb_array_elements(i.state_history) e
               ORDER BY (e->>'revisedDate')::timestamptz ASC LIMIT 1),
             i.cur_state  -- sem histórico: estado atual como melhor estimativa (item marcado como aproximado)
           ) END AS state_at,
      COALESCE(
        (SELECT e->>'revisedBy' FROM jsonb_array_elements(i.state_history) e
          WHERE lower(trim(e->>'newValue')) IN ('done','closed','resolved')
            AND (e->>'revisedDate')::timestamptz <= v_as_of
          ORDER BY (e->>'revisedDate')::timestamptz DESC LIMIT 1),
        CASE WHEN i.changed_date <= v_as_of THEN i.closed_by ELSE NULL END
      ) AS closer_at,
      CASE WHEN i.state_history IS NULL THEN i.qrc_now
           ELSE GREATEST(0, (SELECT COUNT(*) FROM jsonb_array_elements(i.state_history) e
             WHERE lower(trim(e->>'newValue')) = 'em teste'
               AND (e->>'revisedDate')::timestamptz <= v_as_of) - 1) END AS qrc_at,
      -- exato quando não mudou após o corte OU temos histórico p/ reverter
      (i.changed_date <= v_as_of OR i.state_history IS NOT NULL) AS is_exato
    FROM items i
  ),
  fin AS (
    SELECT a.*,
      (lower(trim(a.state_at)) IN ('done','closed','resolved')) AS done_at,
      EXISTS (
        SELECT 1 FROM qa_authorized_closers c WHERE c.is_active AND (
          lower(c.display_name) = lower(a.closer_at)
          OR (a.closed_date IS NOT NULL AND a.closed_date <= v_as_of
              AND lower(c.email) = lower(a.closed_by_email))
        )
      ) AS qa_closed_at
    FROM asof a
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE NOT public.fn_demanda_nao_planejada(wtype, tags_text)),
    COUNT(*) FILTER (WHERE public.fn_demanda_nao_planejada(wtype, tags_text)),
    COUNT(*) FILTER (WHERE lower(trim(state_at)) IN ('em teste','aguardando deploy','deploy','homologação','homologacao')),
    COUNT(*) FILTER (WHERE done_at),
    COUNT(*) FILTER (WHERE health_status='vermelho'),
    COUNT(*) FILTER (WHERE health_status='amarelo'),
    COUNT(*) FILTER (WHERE health_status='verde'),
    ROUND(AVG(total_lead_time_days),1), COALESCE(MAX(total_lead_time_days),0),
    COUNT(*) FILTER (WHERE transbordou_sprint),
    COUNT(*) FILTER (WHERE done_at),
    COUNT(*) FILTER (WHERE done_at AND qrc_at > 0),
    COALESCE(SUM(qrc_at) FILTER (WHERE done_at),0),
    COUNT(*) FILTER (WHERE done_at AND qa_closed_at),
    COUNT(*) FILTER (WHERE done_at AND qa_closed_at AND qrc_at = 0),
    COUNT(*) FILTER (WHERE done_at AND qa_closed_at AND qrc_at > 0),
    COUNT(*) FILTER (WHERE is_exato),
    COUNT(*) FILTER (WHERE NOT is_exato),
    ARRAY_AGG(DISTINCT work_item_id)
  INTO
    v_total, v_planned, v_unplanned, v_delivered, v_finalized,
    v_criticos, v_atencao, v_saudaveis, v_avg_lead, v_max_lead, v_transbordo,
    v_qa_done, v_qa_with_return, v_qa_cycles,
    v_qa_concluidos, v_qa_concluidos_sr, v_qa_concluidos_cr,
    v_exatos, v_aprox, v_work_item_ids
  FROM fin;

  -- ── Breakdown por categoria e por fábrica (Epic raiz) no estado as-of ──────
  WITH RECURSIVE base AS (
    SELECT
      ls.work_item_id, w.state AS cur_state, w.changed_date, w.state_history, w.parent_id,
      COALESCE(w.work_item_type,'Unknown') AS wtype,
      COALESCE(w.tags,'') AS tags_text
    FROM pbi_lifecycle_summary ls
    LEFT JOIN devops_work_items w ON w.id = ls.work_item_id
    WHERE ls.last_committed_sprint = p_sprint_code OR ls.first_committed_sprint = p_sprint_code
  ),
  anc AS (
    SELECT b.work_item_id AS start_id, w2.id, w2.parent_id, w2.work_item_type, w2.title, 1 AS depth
    FROM base b JOIN devops_work_items w2 ON w2.id = b.parent_id
    UNION ALL
    SELECT a.start_id, p.id, p.parent_id, p.work_item_type, p.title, a.depth + 1
    FROM anc a JOIN devops_work_items p ON p.id = a.parent_id
    WHERE a.depth < 10
  ),
  fab AS (
    -- mesma regra do front (findEpic): primeiro Epic na subida; senão, ancestral mais alto
    SELECT start_id,
      COALESCE(
        (array_agg(title ORDER BY depth) FILTER (WHERE work_item_type = 'Epic'))[1],
        (array_agg(title ORDER BY depth DESC))[1]
      ) AS fabrica
    FROM anc GROUP BY start_id
  ),
  asof2 AS (
    SELECT b.*,
      CASE WHEN b.changed_date <= v_as_of THEN b.cur_state
           ELSE COALESCE(
             (SELECT e->>'newValue' FROM jsonb_array_elements(b.state_history) e
               WHERE (e->>'revisedDate')::timestamptz <= v_as_of
               ORDER BY (e->>'revisedDate')::timestamptz DESC LIMIT 1),
             (SELECT e->>'oldValue' FROM jsonb_array_elements(b.state_history) e
               ORDER BY (e->>'revisedDate')::timestamptz ASC LIMIT 1),
             b.cur_state
           ) END AS state_at
    FROM base b
  ),
  cls AS (
    SELECT
      a.work_item_id,
      public.fn_classifica_demanda(a.wtype, a.tags_text) AS cat,
      COALESCE(f.fabrica, 'Sem fábrica') AS fabrica,
      (lower(trim(a.state_at)) IN ('done','closed','resolved')) AS done_at,
      (lower(trim(a.state_at)) IN ('aguardando teste','em teste','aguardando deploy')) AS entregue_at
    FROM asof2 a
    LEFT JOIN fab f ON f.start_id = a.work_item_id
  ),
  scoped AS (
    SELECT '__geral__' AS escopo, c.cat, c.done_at, c.entregue_at FROM cls c
    UNION ALL
    SELECT c.fabrica, c.cat, c.done_at, c.entregue_at FROM cls c
  ),
  agg AS (
    SELECT escopo, jsonb_build_object(
      'total', COUNT(*),
      'cats', jsonb_build_object(
        'priorizacao',            COUNT(*) FILTER (WHERE cat = 'priorizacao'),
        'priorizacao_transbordo', COUNT(*) FILTER (WHERE cat = 'priorizacao_transbordo'),
        'bug',                    COUNT(*) FILTER (WHERE cat = 'bug'),
        'retorno_qa',             COUNT(*) FILTER (WHERE cat = 'retorno_qa'),
        'aviao_sprint',           COUNT(*) FILTER (WHERE cat = 'aviao_sprint'),
        'aviao_transbordado',     COUNT(*) FILTER (WHERE cat = 'aviao_transbordado')
      ),
      'entregue', jsonb_build_object(
        'total',       COUNT(*) FILTER (WHERE entregue_at),
        'bug',         COUNT(*) FILTER (WHERE entregue_at AND cat = 'bug'),
        'retorno_qa',  COUNT(*) FILTER (WHERE entregue_at AND cat = 'retorno_qa'),
        'priorizacao', COUNT(*) FILTER (WHERE entregue_at AND cat IN ('priorizacao','priorizacao_transbordo')),
        'aviao',       COUNT(*) FILTER (WHERE entregue_at AND cat IN ('aviao_sprint','aviao_transbordado'))
      ),
      'done', jsonb_build_object(
        'total',       COUNT(*) FILTER (WHERE done_at),
        'bug',         COUNT(*) FILTER (WHERE done_at AND cat = 'bug'),
        'retorno_qa',  COUNT(*) FILTER (WHERE done_at AND cat = 'retorno_qa'),
        'priorizacao', COUNT(*) FILTER (WHERE done_at AND cat IN ('priorizacao','priorizacao_transbordo')),
        'aviao',       COUNT(*) FILTER (WHERE done_at AND cat IN ('aviao_sprint','aviao_transbordado'))
      ),
      'priorizado_done',   COUNT(*) FILTER (WHERE done_at AND cat IN ('priorizacao','priorizacao_transbordo')),
      'priorizado_em_dev', COUNT(*) FILTER (WHERE NOT done_at AND cat IN ('priorizacao','priorizacao_transbordo'))
    ) AS payload
    FROM scoped
    GROUP BY escopo
  )
  SELECT jsonb_build_object(
    'geral',    (SELECT payload FROM agg WHERE escopo = '__geral__'),
    'fabricas', COALESCE((SELECT jsonb_object_agg(escopo, payload) FROM agg WHERE escopo <> '__geral__'), '{}'::jsonb)
  )
  INTO v_breakdown;

  v_rate := CASE WHEN COALESCE(v_qa_done,0) > 0
    THEN ROUND((COALESCE(v_qa_with_return,0)::numeric / v_qa_done::numeric) * 100, 1) ELSE 0 END;
  v_avg_cycles := CASE WHEN COALESCE(v_qa_with_return,0) > 0
    THEN ROUND((COALESCE(v_qa_cycles,0)::numeric / v_qa_with_return::numeric), 2) ELSE 0 END;

  -- Substitui snapshots anteriores desta sprint pela versão fim-de-sprint
  DELETE FROM public.sprint_indicator_snapshots WHERE sprint_indicator_snapshots.sprint_code = p_sprint_code;

  INSERT INTO public.sprint_indicator_snapshots (
    sprint_code, sprint_start_date, sprint_end_date,
    total_demands, planned_demands, unplanned_demands, delivered_demands, finalized_demands,
    itens_criticos, itens_atencao, itens_saudaveis,
    source_work_item_ids, work_item_count_in_snapshot,
    avg_lead_time_days, max_lead_time_days, transbordo_count,
    notes, snapshot_datetime, as_of_datetime, snapshot_source,
    qa_done_items, qa_items_with_return, qa_return_cycles_total,
    qa_return_rate_pct, qa_avg_return_cycles,
    qa_concluidos, qa_concluidos_sem_retorno, qa_concluidos_com_retorno,
    category_breakdown
  ) VALUES (
    p_sprint_code, v_sprint_start, v_sprint_end,
    COALESCE(v_total,0), COALESCE(v_planned,0), COALESCE(v_unplanned,0),
    COALESCE(v_delivered,0), COALESCE(v_finalized,0),
    COALESCE(v_criticos,0), COALESCE(v_atencao,0), COALESCE(v_saudaveis,0),
    v_work_item_ids, COALESCE(array_length(v_work_item_ids,1),0),
    v_avg_lead, v_max_lead, COALESCE(v_transbordo,0),
    format('reconstrucao_fim_sprint %s @%s (state_history): %s itens = %s exatos + %s aproximados. health/lead-time do estado atual.',
           p_sprint_code, v_as_of::text, COALESCE(v_total,0), COALESCE(v_exatos,0), COALESCE(v_aprox,0)),
    NOW(), v_as_of, 'fim_sprint_reconstruido',
    COALESCE(v_qa_done,0), COALESCE(v_qa_with_return,0), COALESCE(v_qa_cycles,0),
    COALESCE(v_rate,0), COALESCE(v_avg_cycles,0),
    COALESCE(v_qa_concluidos,0), COALESCE(v_qa_concluidos_sr,0), COALESCE(v_qa_concluidos_cr,0),
    v_breakdown
  ) RETURNING id INTO v_snapshot_id;

  RETURN QUERY SELECT p_sprint_code, v_as_of, COALESCE(v_total,0), COALESCE(v_qa_done,0),
    COALESCE(v_qa_concluidos,0), COALESCE(v_exatos,0), COALESCE(v_aprox,0);
END;
$function$;
