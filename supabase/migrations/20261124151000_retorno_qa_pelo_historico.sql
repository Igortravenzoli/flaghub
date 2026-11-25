-- Retorno QA = tag OU volta do teste pelo histórico (24/11/2026, regra do Igor).
--
-- "Conta como Retorno QA tudo aquilo que foi para Em Teste e teve retorno para
-- status anterior", além da tag. A régua da volta é `fn_retorno_qa_hist`
-- (20261124150000), a mesma do módulo da Qualidade, e inclui a volta para "New".
--
-- 1. `fn_classifica_demanda(tipo, tags, state_history, ate)`: retorno pelo
--    histórico até `ate` vem antes de tudo (como a tag); senão, a régua antiga.
-- 2. A foto (`rpc_reconstruct_sprint_snapshot`) e a série diária
--    (`rpc_capture_sprint_daily_progress_at`) passam a usar a versão nova, com o
--    corte de cada uma. O corpo é o de produção em 24/11; só a chamada mudou.
-- 3. Campo calculado `retorno_qa_hist` (PostgREST) em `devops_work_items` e em
--    `vw_fabrica_kpis`, para o front classificar a sprint em andamento igual à
--    foto (`src/lib/fabricaClassificacao.ts`). Sem corte: a sprint é a de hoje.
--
-- As fotos já gravadas são acertadas por `rpc_retorno_qa_na_foto(sprint, true)`,
-- fora desta migration (sem refazer a foto, que releria as tags de hoje).

CREATE OR REPLACE FUNCTION public.fn_classifica_demanda(p_type text, p_tags text, p_hist jsonb, p_ate timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE WHEN public.fn_retorno_qa_hist(p_hist, p_ate) THEN 'retorno_qa'
              ELSE public.fn_classifica_demanda(p_type, p_tags) END;
$function$;

COMMENT ON FUNCTION public.fn_classifica_demanda(text, text, jsonb, timestamptz) IS
  'Régua da demanda com o Retorno QA pelo histórico (saiu de Em Teste para estado anterior até p_ate) além da tag.';

CREATE OR REPLACE FUNCTION public.rpc_reconstruct_sprint_snapshot(p_sprint_code text, p_as_of timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(sprint_code text, as_of_datetime timestamp with time zone, total bigint, qa_done bigint, qa_concluidos bigint, itens_exatos bigint, itens_aprox bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

  SELECT r.sprint_start, r.sprint_end INTO v_sprint_start, v_sprint_end
  FROM public.fn_sprint_official_range(p_sprint_code) r LIMIT 1;

  -- Corte padrão: SÁBADO 13:00 BRT (SN-9). Refazer foto antiga exige p_as_of
  -- explícito com o corte da época — ver runbook.
  v_as_of := COALESCE(p_as_of, public.fn_corte_foto_sprint(v_sprint_end));

  -- O driver chama esta função várias vezes na MESMA transação (uma por
  -- sprint); ON COMMIT DROP só limparia no fim de tudo.
  DROP TABLE IF EXISTS tmp_snap_itens;

  CREATE TEMP TABLE tmp_snap_itens ON COMMIT DROP AS
  WITH cand AS (
    -- Poda barata antes do trabalho de jsonb: só quem está na sprint hoje ou
    -- cita a sprint em algum ponto do histórico de iteração.
    SELECT w.id, w.work_item_type, w.state AS cur_state, w.changed_date, w.state_history,
           w.iteration_path, w.iteration_history, w.parent_id,
           w.closed_by, w.closed_by_email, w.closed_date,
           COALESCE(w.tags,'') AS tags_text
    FROM public.devops_work_items w
    WHERE w.work_item_type IN ('Product Backlog Item','User Story','Bug')
      AND (regexp_replace(w.iteration_path, '^.*\\', '') = p_sprint_code
           OR w.iteration_history::text LIKE '%' || p_sprint_code || '%')
  ),
  quadro AS (
    SELECT c.*
    FROM cand c
    WHERE public.fn_iteration_as_of(c.iteration_path, c.iteration_history, v_as_of) = p_sprint_code
  ),
  asof AS (
    SELECT q.*,
      CASE WHEN q.changed_date <= v_as_of THEN q.cur_state
           ELSE COALESCE(
             (SELECT e->>'newValue' FROM jsonb_array_elements(q.state_history) e
               WHERE (e->>'revisedDate')::timestamptz <= v_as_of
               ORDER BY (e->>'revisedDate')::timestamptz DESC LIMIT 1),
             (SELECT e->>'oldValue' FROM jsonb_array_elements(q.state_history) e
               ORDER BY (e->>'revisedDate')::timestamptz ASC LIMIT 1),
             q.cur_state
           ) END AS state_at,
      COALESCE(
        (SELECT e->>'revisedBy' FROM jsonb_array_elements(q.state_history) e
          WHERE lower(trim(e->>'newValue')) IN ('done','closed','resolved')
            AND (e->>'revisedDate')::timestamptz <= v_as_of
          ORDER BY (e->>'revisedDate')::timestamptz DESC LIMIT 1),
        CASE WHEN q.changed_date <= v_as_of THEN q.closed_by ELSE NULL END
      ) AS closer_at,
      CASE WHEN q.state_history IS NULL THEN 0
           ELSE GREATEST(0, (SELECT COUNT(*) FROM jsonb_array_elements(q.state_history) e
             WHERE lower(trim(e->>'newValue')) = 'em teste'
               AND (e->>'revisedDate')::timestamptz <= v_as_of) - 1) END AS qrc_at,
      (q.changed_date <= v_as_of OR q.state_history IS NOT NULL) AS is_exato
    FROM quadro q
  )
  SELECT
    a.id AS work_item_id, a.work_item_type, a.tags_text, a.parent_id,
    a.state_at, a.qrc_at, a.is_exato,
    public.fn_estado_done(a.state_at) AS done_at,
    public.fn_estado_entregue(a.state_at) AS entregue_at,
    public.fn_classifica_demanda(COALESCE(a.work_item_type,'Unknown'), a.tags_text, a.state_history, v_as_of) AS cat,
    EXISTS (
      SELECT 1 FROM public.qa_authorized_closers c WHERE c.is_active AND (
        lower(c.display_name) = lower(a.closer_at)
        OR (a.closed_date IS NOT NULL AND a.closed_date <= v_as_of
            AND lower(c.email) = lower(a.closed_by_email))
      )
    ) AS qa_closed_at,
    ls.total_lead_time_days,
    hs.health_status
  FROM asof a
  LEFT JOIN public.pbi_lifecycle_summary ls ON ls.work_item_id = a.id
  LEFT JOIN public.pbi_health_summary hs ON hs.work_item_id = a.id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE NOT public.fn_demanda_nao_planejada(work_item_type, tags_text)),
    COUNT(*) FILTER (WHERE public.fn_demanda_nao_planejada(work_item_type, tags_text)),
    COUNT(*) FILTER (WHERE entregue_at),
    COUNT(*) FILTER (WHERE done_at),
    COUNT(*) FILTER (WHERE health_status='vermelho'),
    COUNT(*) FILTER (WHERE health_status='amarelo'),
    COUNT(*) FILTER (WHERE health_status='verde'),
    ROUND(AVG(total_lead_time_days),1), COALESCE(MAX(total_lead_time_days),0),
    COUNT(*) FILTER (WHERE public.fn_tem_tag_transbordo(tags_text)),
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
  FROM tmp_snap_itens;

  IF COALESCE(v_total,0) = 0 THEN
    RAISE EXCEPTION 'sprint % sem itens no quadro em % — nada a fotografar', p_sprint_code, v_as_of;
  END IF;

  -- ── Breakdown por categoria e por fábrica (Epic raiz) ──────────────────────
  WITH RECURSIVE anc AS (
    SELECT t.work_item_id AS start_id, w2.id, w2.parent_id, w2.work_item_type, w2.title, 1 AS depth
    FROM tmp_snap_itens t JOIN public.devops_work_items w2 ON w2.id = t.parent_id
    UNION ALL
    SELECT a.start_id, p.id, p.parent_id, p.work_item_type, p.title, a.depth + 1
    FROM anc a JOIN public.devops_work_items p ON p.id = a.parent_id
    WHERE a.depth < 10
  ),
  fab AS (
    SELECT start_id,
      COALESCE(
        (array_agg(title ORDER BY depth) FILTER (WHERE work_item_type = 'Epic'))[1],
        (array_agg(title ORDER BY depth DESC))[1]
      ) AS fabrica
    FROM anc GROUP BY start_id
  ),
  cls AS (
    SELECT t.work_item_id, t.cat, t.done_at, t.entregue_at,
           COALESCE(f.fabrica, 'Sem fábrica') AS fabrica
    FROM tmp_snap_itens t LEFT JOIN fab f ON f.start_id = t.work_item_id
  ),
  scoped AS (
    SELECT '__geral__' AS escopo, c.* FROM cls c
    UNION ALL
    SELECT c.fabrica AS escopo, c.* FROM cls c
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
      'ids', jsonb_build_object(
        'entregue',   COALESCE(jsonb_agg(work_item_id) FILTER (WHERE entregue_at), '[]'::jsonb),
        'done',       COALESCE(jsonb_agg(work_item_id) FILTER (WHERE done_at), '[]'::jsonb),
        'bug',        COALESCE(jsonb_agg(work_item_id) FILTER (WHERE cat = 'bug'), '[]'::jsonb),
        'retorno_qa', COALESCE(jsonb_agg(work_item_id) FILTER (WHERE cat = 'retorno_qa'), '[]'::jsonb)
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

  -- F2 (23/11/2026): fábrica do ITEM pela pessoa (`fabricas_org`), ao lado da
  -- chave antiga por Épico. Falha aqui não pode derrubar a foto/série.
  BEGIN
    v_breakdown := v_breakdown || public.fn_breakdown_fabricas_org(
      (SELECT jsonb_agg(jsonb_build_object('work_item_id', t.work_item_id, 'cat', t.cat,
                                           'done_at', t.done_at, 'entregue_at', t.entregue_at))
         FROM tmp_snap_itens t),
      LEAST(v_sprint_end, (v_as_of AT TIME ZONE 'America/Sao_Paulo')::date));
  EXCEPTION WHEN OTHERS THEN
    v_breakdown := v_breakdown || jsonb_build_object('fabricas_org_erro', left(SQLERRM, 200));
  END;

  v_rate := CASE WHEN COALESCE(v_qa_done,0) > 0
    THEN ROUND((COALESCE(v_qa_with_return,0)::numeric / v_qa_done::numeric) * 100, 1) ELSE 0 END;
  v_avg_cycles := CASE WHEN COALESCE(v_qa_with_return,0) > 0
    THEN ROUND((COALESCE(v_qa_cycles,0)::numeric / v_qa_with_return::numeric), 2) ELSE 0 END;

  DELETE FROM public.sprint_indicator_snapshots s WHERE s.sprint_code = p_sprint_code;

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
    format('quadro_fim_sprint %s @%s (iteration_path as-of): %s itens = %s exatos + %s aproximados. health/lead-time do estado atual.',
           p_sprint_code, v_as_of::text, COALESCE(v_total,0), COALESCE(v_exatos,0), COALESCE(v_aprox,0)),
    NOW(), v_as_of, 'fim_sprint_reconstruido',
    COALESCE(v_qa_done,0), COALESCE(v_qa_with_return,0), COALESCE(v_qa_cycles,0),
    COALESCE(v_rate,0), COALESCE(v_avg_cycles,0),
    COALESCE(v_qa_concluidos,0), COALESCE(v_qa_concluidos_sr,0), COALESCE(v_qa_concluidos_cr,0),
    v_breakdown
  );

  DROP TABLE IF EXISTS tmp_snap_itens;

  RETURN QUERY SELECT p_sprint_code, v_as_of, COALESCE(v_total,0), COALESCE(v_qa_done,0),
    COALESCE(v_qa_concluidos,0), COALESCE(v_exatos,0), COALESCE(v_aprox,0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_capture_sprint_daily_progress_at(p_sprint text, p_captured_date date)
 RETURNS TABLE(out_sprint_code text, out_captured_date date, out_total bigint, out_finalized bigint, out_qa_concluidos bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sprint text := p_sprint;
  v_captured_date date := p_captured_date;
  v_as_of timestamptz := now();
  v_sprint_start date; v_sprint_end date;
  v_total bigint; v_planned bigint; v_unplanned bigint; v_delivered bigint; v_finalized bigint;
  v_criticos bigint; v_atencao bigint; v_saudaveis bigint;
  v_avg_lead numeric; v_max_lead numeric; v_transbordo bigint;
  v_qa_done bigint; v_qa_with_return bigint; v_qa_cycles bigint;
  v_qa_concluidos bigint; v_qa_concluidos_sr bigint; v_qa_concluidos_cr bigint;
  v_work_item_ids bigint[];
  v_rate numeric; v_avg_cycles numeric;
  v_breakdown jsonb;
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

  IF v_sprint IS NULL OR v_captured_date IS NULL THEN
    RETURN;
  END IF;

  SELECT r.sprint_start, r.sprint_end INTO v_sprint_start, v_sprint_end
  FROM public.fn_sprint_official_range(v_sprint) r LIMIT 1;

  -- ── Universo = quadro da sprint (SN-8), estado atual ───────────────────────
  CREATE TEMP TABLE tmp_daily_itens ON COMMIT DROP AS
  SELECT
    w.id AS work_item_id, w.parent_id,
    COALESCE(w.work_item_type,'Unknown') AS wtype,
    COALESCE(w.tags,'') AS tags_text,
    public.fn_estado_done(w.state) AS done_at,
    public.fn_estado_entregue(w.state) AS entregue_at,
    public.fn_classifica_demanda(COALESCE(w.work_item_type,'Unknown'), COALESCE(w.tags,''), w.state_history, v_as_of) AS cat,
    COALESCE(ls.qa_return_count,0) AS qrc_now,
    ls.total_lead_time_days,
    hs.health_status,
    EXISTS (
      SELECT 1 FROM public.qa_authorized_closers c WHERE c.is_active AND (
        lower(c.display_name) = lower(w.closed_by)
        OR (w.closed_date IS NOT NULL AND lower(c.email) = lower(w.closed_by_email))
      )
    ) AS qa_closed_at
  FROM public.devops_work_items w
  LEFT JOIN public.pbi_lifecycle_summary ls ON ls.work_item_id = w.id
  LEFT JOIN public.pbi_health_summary hs ON hs.work_item_id = w.id
  WHERE w.work_item_type IN ('Product Backlog Item','User Story','Bug')
    AND regexp_replace(w.iteration_path, '^.*\\', '') = v_sprint;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE NOT public.fn_demanda_nao_planejada(wtype, tags_text)),
    COUNT(*) FILTER (WHERE public.fn_demanda_nao_planejada(wtype, tags_text)),
    COUNT(*) FILTER (WHERE entregue_at),
    COUNT(*) FILTER (WHERE done_at),
    COUNT(*) FILTER (WHERE health_status='vermelho'),
    COUNT(*) FILTER (WHERE health_status='amarelo'),
    COUNT(*) FILTER (WHERE health_status='verde'),
    ROUND(AVG(total_lead_time_days),1), COALESCE(MAX(total_lead_time_days),0),
    COUNT(*) FILTER (WHERE public.fn_tem_tag_transbordo(tags_text)),
    COUNT(*) FILTER (WHERE done_at),
    COUNT(*) FILTER (WHERE done_at AND qrc_now > 0),
    COALESCE(SUM(qrc_now) FILTER (WHERE done_at),0),
    COUNT(*) FILTER (WHERE done_at AND qa_closed_at),
    COUNT(*) FILTER (WHERE done_at AND qa_closed_at AND qrc_now = 0),
    COUNT(*) FILTER (WHERE done_at AND qa_closed_at AND qrc_now > 0),
    ARRAY_AGG(DISTINCT work_item_id)
  INTO
    v_total, v_planned, v_unplanned, v_delivered, v_finalized,
    v_criticos, v_atencao, v_saudaveis, v_avg_lead, v_max_lead, v_transbordo,
    v_qa_done, v_qa_with_return, v_qa_cycles,
    v_qa_concluidos, v_qa_concluidos_sr, v_qa_concluidos_cr,
    v_work_item_ids
  FROM tmp_daily_itens;

  IF COALESCE(v_total,0) = 0 THEN
    DROP TABLE IF EXISTS tmp_daily_itens;
    RETURN;
  END IF;

  -- ── Breakdown por categoria e por fábrica (Epic raiz) ──────────────────────
  WITH RECURSIVE anc AS (
    SELECT t.work_item_id AS start_id, w2.id, w2.parent_id, w2.work_item_type, w2.title, 1 AS depth
    FROM tmp_daily_itens t JOIN public.devops_work_items w2 ON w2.id = t.parent_id
    UNION ALL
    SELECT a.start_id, p.id, p.parent_id, p.work_item_type, p.title, a.depth + 1
    FROM anc a JOIN public.devops_work_items p ON p.id = a.parent_id
    WHERE a.depth < 10
  ),
  fab AS (
    SELECT start_id,
      COALESCE(
        (array_agg(title ORDER BY depth) FILTER (WHERE work_item_type = 'Epic'))[1],
        (array_agg(title ORDER BY depth DESC))[1]
      ) AS fabrica
    FROM anc GROUP BY start_id
  ),
  cls AS (
    SELECT t.work_item_id, t.cat, t.done_at, t.entregue_at,
           COALESCE(f.fabrica, 'Sem fábrica') AS fabrica
    FROM tmp_daily_itens t LEFT JOIN fab f ON f.start_id = t.work_item_id
  ),
  scoped AS (
    SELECT '__geral__' AS escopo, c.* FROM cls c
    UNION ALL
    SELECT c.fabrica AS escopo, c.* FROM cls c
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
      'ids', jsonb_build_object(
        'entregue',   COALESCE(jsonb_agg(work_item_id) FILTER (WHERE entregue_at), '[]'::jsonb),
        'done',       COALESCE(jsonb_agg(work_item_id) FILTER (WHERE done_at), '[]'::jsonb),
        'bug',        COALESCE(jsonb_agg(work_item_id) FILTER (WHERE cat = 'bug'), '[]'::jsonb),
        'retorno_qa', COALESCE(jsonb_agg(work_item_id) FILTER (WHERE cat = 'retorno_qa'), '[]'::jsonb)
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

  -- F2 (23/11/2026): fábrica do ITEM pela pessoa (`fabricas_org`), ao lado da
  -- chave antiga por Épico. Falha aqui não pode derrubar a foto/série.
  BEGIN
    v_breakdown := v_breakdown || public.fn_breakdown_fabricas_org(
      (SELECT jsonb_agg(jsonb_build_object('work_item_id', t.work_item_id, 'cat', t.cat,
                                           'done_at', t.done_at, 'entregue_at', t.entregue_at))
         FROM tmp_daily_itens t),
      LEAST(COALESCE(v_sprint_end, v_captured_date), v_captured_date));
  EXCEPTION WHEN OTHERS THEN
    v_breakdown := v_breakdown || jsonb_build_object('fabricas_org_erro', left(SQLERRM, 200));
  END;

  v_rate := CASE WHEN COALESCE(v_qa_done,0) > 0
    THEN ROUND((COALESCE(v_qa_with_return,0)::numeric / v_qa_done::numeric) * 100, 1) ELSE 0 END;
  v_avg_cycles := CASE WHEN COALESCE(v_qa_with_return,0) > 0
    THEN ROUND((COALESCE(v_qa_cycles,0)::numeric / v_qa_with_return::numeric), 2) ELSE 0 END;

  INSERT INTO public.sprint_daily_progress (
    sprint_code, captured_date, snapshot_datetime, as_of_datetime,
    sprint_start_date, sprint_end_date,
    total_demands, planned_demands, unplanned_demands, delivered_demands, finalized_demands,
    itens_criticos, itens_atencao, itens_saudaveis,
    avg_lead_time_days, max_lead_time_days, transbordo_count,
    qa_done_items, qa_items_with_return, qa_return_cycles_total,
    qa_return_rate_pct, qa_avg_return_cycles,
    qa_concluidos, qa_concluidos_sem_retorno, qa_concluidos_com_retorno,
    work_item_count, category_breakdown
  ) VALUES (
    v_sprint, v_captured_date, now(), v_as_of,
    v_sprint_start, v_sprint_end,
    COALESCE(v_total,0), COALESCE(v_planned,0), COALESCE(v_unplanned,0),
    COALESCE(v_delivered,0), COALESCE(v_finalized,0),
    COALESCE(v_criticos,0), COALESCE(v_atencao,0), COALESCE(v_saudaveis,0),
    v_avg_lead, v_max_lead, COALESCE(v_transbordo,0),
    COALESCE(v_qa_done,0), COALESCE(v_qa_with_return,0), COALESCE(v_qa_cycles,0),
    COALESCE(v_rate,0), COALESCE(v_avg_cycles,0),
    COALESCE(v_qa_concluidos,0), COALESCE(v_qa_concluidos_sr,0), COALESCE(v_qa_concluidos_cr,0),
    COALESCE(array_length(v_work_item_ids,1),0), v_breakdown
  )
  ON CONFLICT (sprint_code, captured_date) DO UPDATE SET
    snapshot_datetime         = EXCLUDED.snapshot_datetime,
    as_of_datetime            = EXCLUDED.as_of_datetime,
    sprint_start_date         = EXCLUDED.sprint_start_date,
    sprint_end_date           = EXCLUDED.sprint_end_date,
    total_demands             = EXCLUDED.total_demands,
    planned_demands           = EXCLUDED.planned_demands,
    unplanned_demands         = EXCLUDED.unplanned_demands,
    delivered_demands         = EXCLUDED.delivered_demands,
    finalized_demands         = EXCLUDED.finalized_demands,
    itens_criticos            = EXCLUDED.itens_criticos,
    itens_atencao             = EXCLUDED.itens_atencao,
    itens_saudaveis           = EXCLUDED.itens_saudaveis,
    avg_lead_time_days        = EXCLUDED.avg_lead_time_days,
    max_lead_time_days        = EXCLUDED.max_lead_time_days,
    transbordo_count          = EXCLUDED.transbordo_count,
    qa_done_items             = EXCLUDED.qa_done_items,
    qa_items_with_return      = EXCLUDED.qa_items_with_return,
    qa_return_cycles_total    = EXCLUDED.qa_return_cycles_total,
    qa_return_rate_pct        = EXCLUDED.qa_return_rate_pct,
    qa_avg_return_cycles      = EXCLUDED.qa_avg_return_cycles,
    qa_concluidos             = EXCLUDED.qa_concluidos,
    qa_concluidos_sem_retorno = EXCLUDED.qa_concluidos_sem_retorno,
    qa_concluidos_com_retorno = EXCLUDED.qa_concluidos_com_retorno,
    work_item_count           = EXCLUDED.work_item_count,
    category_breakdown        = EXCLUDED.category_breakdown;

  DROP TABLE IF EXISTS tmp_daily_itens;

  RETURN QUERY SELECT v_sprint, v_captured_date,
    COALESCE(v_total,0), COALESCE(v_finalized,0), COALESCE(v_qa_concluidos,0);
END;
$function$;


CREATE OR REPLACE FUNCTION public.retorno_qa_hist(public.devops_work_items)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  SELECT public.fn_retorno_qa_hist($1.state_history, NULL);
$function$;

CREATE OR REPLACE FUNCTION public.retorno_qa_hist(public.vw_fabrica_kpis)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE((SELECT public.fn_retorno_qa_hist(w.state_history, NULL)
                   FROM public.devops_work_items w WHERE w.id = $1.id), false);
$function$;

COMMENT ON FUNCTION public.retorno_qa_hist(public.devops_work_items) IS
  'Campo calculado (PostgREST): o item já voltou de Em Teste para estado anterior.';
COMMENT ON FUNCTION public.retorno_qa_hist(public.vw_fabrica_kpis) IS
  'Campo calculado (PostgREST): o item já voltou de Em Teste para estado anterior.';

REVOKE ALL ON FUNCTION public.retorno_qa_hist(public.devops_work_items) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retorno_qa_hist(public.vw_fabrica_kpis) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retorno_qa_hist(public.devops_work_items) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retorno_qa_hist(public.vw_fabrica_kpis) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
