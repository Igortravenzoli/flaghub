-- ============================================================================
-- SN-7 — A fotografia passa a medir O QUADRO DA SPRINT
--
-- Decisão do gestor (03/08/2026), a partir da auditoria de todas as fotos de
-- 2026 contra o board do DevOps. Três mudanças casadas:
--
-- 1) UNIVERSO — de `pbi_lifecycle_summary.committed_sprint` para o
--    `iteration_path` do item NO CORTE (reconstruído por iteration_history).
--
--    A tabela derivada nunca recebeu bug novo: o job que a popula filtra
--    `work_item_type in ('Product Backlog Item','User Story')`
--    (devops-sync-all). Os 888 bugs que existem lá vieram de um backfill único
--    de 01/07/2026 — 886 têm esse computed_at e nenhum foi atualizado desde.
--    Efeito medido: S1–S13 continuam corretas (o backfill ainda cobria tudo),
--    S14 perdeu 35 dos 125 itens e a S15, 70 dos 128 — sobraram 2 bugs de 71.
--    Distorção: S14 marcava 91,1% contra 71,8% reais.
--
--    O universo passa a ser o mesmo do card "Itens no escopo" da Visão Geral
--    (`isManagerLikeItem`: PBI + User Story + Bug), que sempre esteve certo.
--
--    Na SELAGEM (segunda 00:30) o iteration_path do item ainda é o da sprint
--    que fechou — o botão Migrar só destrava depois da foto selada. A
--    reconstrução por histórico existe para refazer foto antiga; nesse caso ela
--    carrega ±1 item de incerteza, porque iteration_history tem sync próprio e
--    atrasa.
--
-- 2) "ENTREGUE" VIRA UMA DEFINIÇÃO SÓ. A foto carregava duas listas de estado
--    divergentes — `delivered_demands` contava em teste/aguardando deploy/
--    deploy/homologação e o `category_breakdown.entregue` contava aguardando
--    teste/em teste/aguardando deploy. A mesma sprint dava 69% ou 71%
--    conforme o card. Passa a valer a UNIÃO das duas, que é a régua do gestor
--    ("teste + deploy + aguardando"): aguardando teste, em teste, aguardando
--    deploy, deploy, homologação.
--
-- 3) IDS POR BUCKET no category_breakdown, para o gráfico de evolução abrir a
--    lista de itens por trás de cada bolinha (Entrega / Retorno QA / Bug) com
--    link para o DevOps. Fotos seladas antes desta migration não têm `ids` —
--    o front degrada para "detalhamento indisponível".
--
-- Health e lead-time seguem vindo de pbi_health_summary/pbi_lifecycle_summary
-- por LEFT JOIN: enquanto o job não processar Bug, esses dois indicadores
-- cobrem só os PBIs do escopo. Contagem, entrega, bug e retorno QA já não
-- dependem deles.
-- ============================================================================

-- ── Sprint do item no instante do corte ─────────────────────────────────────
-- Último destino registrado até o corte; sem histórico anterior, o oldValue do
-- primeiro evento; sem histórico nenhum, o caminho atual.
CREATE OR REPLACE FUNCTION public.fn_iteration_as_of(
  p_iteration_path text,
  p_iteration_history jsonb,
  p_as_of timestamptz
)
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT regexp_replace(
    COALESCE(
      (SELECT h->>'newValue' FROM jsonb_array_elements(p_iteration_history) h
        WHERE (h->>'revisedDate')::timestamptz <= p_as_of
        ORDER BY (h->>'revisedDate')::timestamptz DESC LIMIT 1),
      (SELECT h->>'oldValue' FROM jsonb_array_elements(p_iteration_history) h
        ORDER BY (h->>'revisedDate')::timestamptz ASC LIMIT 1),
      p_iteration_path
    ), '^.*\\', '');
$$;

COMMENT ON FUNCTION public.fn_iteration_as_of(text, jsonb, timestamptz) IS
  'Código da sprint (último segmento do iteration_path) em que o item estava na '
  'data informada. Base do universo da fotografia desde a SN-7 (03/08/2026).';

-- ── Estados que contam como ENTREGUE (definição única) ──────────────────────
CREATE OR REPLACE FUNCTION public.fn_estado_entregue(p_state text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT lower(trim(COALESCE(p_state,''))) IN
    ('aguardando teste','em teste','aguardando deploy','deploy','homologação','homologacao');
$$;

CREATE OR REPLACE FUNCTION public.fn_estado_done(p_state text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT lower(trim(COALESCE(p_state,''))) IN ('done','closed','resolved');
$$;

COMMENT ON FUNCTION public.fn_estado_entregue(text) IS
  'Item entregue: dev concluiu e o item está em teste, deploy ou homologação. '
  'União das duas listas divergentes que a foto carregava até a SN-7 — inclui '
  '"Aguardando Teste" (régua do gestor, 03/08/2026).';

-- ── Reconstrução da foto sobre o quadro ─────────────────────────────────────
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
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

  SELECT r.sprint_start, r.sprint_end INTO v_sprint_start, v_sprint_end
  FROM public.fn_sprint_official_range(p_sprint_code) r LIMIT 1;

  -- Corte padrão: DOMINGO 22:00 BRT (sprint_end é sexta; +2 dias, às 22h).
  v_as_of := COALESCE(
    p_as_of,
    (((v_sprint_end + 2)::timestamp + interval '22 hours') AT TIME ZONE 'America/Sao_Paulo')
  );

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
    public.fn_classifica_demanda(COALESCE(a.work_item_type,'Unknown'), a.tags_text) AS cat,
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
      -- SN-7: ids por bucket, para o drill-down do gráfico de evolução.
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

COMMENT ON FUNCTION public.rpc_reconstruct_sprint_snapshot(text, timestamptz) IS
  'Reconstrói a foto de fim de sprint sobre O QUADRO (iteration_path no corte, '
  'PBI + User Story + Bug) — mesmo universo do card "Itens no escopo". Corte '
  'padrão: domingo 22:00 BRT. Entregue = aguardando teste/em teste/aguardando '
  'deploy/deploy/homologação (definição única desde a SN-7). Grava ids por '
  'bucket no category_breakdown para o drill-down. p_as_of permite corte '
  'alternativo (exceções manuais e refação de foto antiga).';

-- ── Driver: quais sprints selar ─────────────────────────────────────────────
-- Passa a varrer o QUADRO (iteration_path do DevOps) em vez de
-- pbi_lifecycle_summary — que é justamente a tabela que deixou de receber bug.
-- Uma sprint composta só de bugs nunca apareceria na lista antiga e ficaria
-- eternamente sem foto. Cada sprint roda em bloco protegido: erro em uma não
-- derruba a madrugada inteira.
CREATE OR REPLACE FUNCTION public.rpc_backfill_reconstruct_closed_sprints(
  p_year int DEFAULT EXTRACT(YEAR FROM NOW())::int
)
RETURNS TABLE(sprint_code text, status text, qa_done bigint, qa_concluidos bigint, itens_aprox bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_sprint text;
  v_end date;
  v_res record;
  v_today_brt date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

  FOR v_sprint IN
    SELECT DISTINCT regexp_replace(w.iteration_path, '^.*\\', '') AS sc
    FROM public.devops_work_items w
    WHERE w.work_item_type IN ('Product Backlog Item','User Story','Bug')
      AND regexp_replace(w.iteration_path, '^.*\\', '') ~ '^S[0-9]+-[0-9]{4}$'
      AND split_part(regexp_replace(w.iteration_path, '^.*\\', ''), '-', 2)::int = p_year
    ORDER BY 1
  LOOP
    SELECT r.sprint_end INTO v_end FROM public.fn_sprint_official_range(v_sprint) r LIMIT 1;
    IF v_end IS NULL THEN
      sprint_code := v_sprint; status := 'invalid_sprint_code'; qa_done := NULL; qa_concluidos := NULL; itens_aprox := NULL;
      RETURN NEXT; CONTINUE;
    END IF;

    -- Corte = domingo (v_end + 2) 22:00 BRT; primeira passada elegível é
    -- SEGUNDA 00:30 BRT.
    IF v_end + 2 >= v_today_brt THEN
      sprint_code := v_sprint;
      status := CASE WHEN v_end >= v_today_brt THEN 'open_sprint_skipped' ELSE 'aguardando_corte_domingo' END;
      qa_done := NULL; qa_concluidos := NULL; itens_aprox := NULL;
      RETURN NEXT; CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.sprint_indicator_snapshots s
      WHERE s.sprint_code = v_sprint
        AND s.snapshot_source IN ('fim_sprint_selado', 'manual')
    ) THEN
      sprint_code := v_sprint; status := 'selado_preservado'; qa_done := NULL; qa_concluidos := NULL; itens_aprox := NULL;
      RETURN NEXT; CONTINUE;
    END IF;

    BEGIN
      SELECT * INTO v_res FROM public.rpc_reconstruct_sprint_snapshot(v_sprint, NULL) LIMIT 1;
      UPDATE public.sprint_indicator_snapshots s
         SET snapshot_source = 'fim_sprint_selado'
       WHERE s.sprint_code = v_sprint;

      sprint_code := v_sprint; status := 'reconstructed_sealed';
      qa_done := v_res.qa_done; qa_concluidos := v_res.qa_concluidos; itens_aprox := v_res.itens_aprox;
    EXCEPTION WHEN OTHERS THEN
      sprint_code := v_sprint; status := 'erro: ' || left(SQLERRM, 80);
      qa_done := NULL; qa_concluidos := NULL; itens_aprox := NULL;
    END;
    RETURN NEXT;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.rpc_backfill_reconstruct_closed_sprints(int) IS
  'Driver diário da selagem. Varre as sprints do QUADRO (iteration_path) do ano '
  'informado e sela na primeira madrugada em que o corte (domingo 22:00 BRT) já '
  'passou — na prática, segunda 00:30. Fotos seladas/manuais nunca são '
  'regravadas; erro numa sprint não interrompe as demais.';
