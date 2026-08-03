-- ============================================================================
-- SN-6 — Série diária: ponto de fechamento vai para DOMINGO + transbordo por TAG
--
-- Dois débitos deixados pela SN-5 (corte da foto em domingo 22:00 BRT), ambos
-- confirmados em dado real na virada da S15-2026 (03/08/2026):
--
-- 1) PONTO DE FECHAMENTO NO DIA ERRADO
--    A SN-4 foi escrita para o corte de SÁBADO: no domingo pós-sprint ela
--    capturava o estado (dom ~00:05 BRT) e gravava como
--    `captured_date = sprint_end + 1` (sábado). Com o corte em domingo 22:00,
--    esse ponto passou a ser tirado 22h ANTES do corte e rotulado 2 dias antes
--    dele — a série fecha num dia que não é o da foto.
--    Prova: S15-2026 (fim sex 31/07) tem ponto `captured_date = 2026-08-01`
--    gravado em 2026-08-02 03:05 UTC (dom 00:05 BRT).
--
--      captura:  dom 00:05  →  SEGUNDA 00:05 BRT   (sprint_end + 3)
--      rótulo:   sprint_end + 1 (sáb)  →  sprint_end + 2 (DOMINGO)
--
--    A captura de segunda fica 2h05 depois do corte (dom 22:00) e 25 min ANTES
--    da selagem da foto (seg 00:30) — a mesma folga de syncs que a foto usa.
--
--    ⚠️ A condição "não achei sprint aberta hoje" da SN-4 NÃO serve mais: a
--    sprint seguinte começa exatamente na SEGUNDA (S15 fim 31/07 → S16 início
--    03/08), então nesse dia SEMPRE há sprint aberta. Por isso a função foi
--    partida em duas: `..._at(sprint, data)` faz a captura, e
--    `rpc_capture_sprint_daily_progress()` virou driver, que na segunda grava
--    DOIS pontos — o de fechamento da sprint que encerrou e o do dia da que
--    abriu. Sem isso o ponto de fechamento nunca mais seria gravado.
--
-- 2) transbordo_count SEMPRE 0 NA SÉRIE DIÁRIA
--    Mesma correção que a SN-5 fez na foto, que não foi replicada aqui:
--    `pbi_lifecycle_summary.transbordou_sprint` nunca é escrito por ninguém.
--    Passa a ler a TAG (`fn_tem_tag_transbordo`), definição oficial do time.
--    Prova: foto da S15 = 19 transbordos; ponto diário da mesma sprint = 0.
--
-- Bônus de robustez (2 linhas): a resolução da sprint passa a desempatar por
-- ANO do código. Convivem no banco duas numerações (`S15-2026` e a legada
-- `S41-2025`, ambas terminando em 31/07/2026); o `ORDER BY sprint_end DESC`
-- sozinho escolhia entre elas de forma não determinística.
--
-- Nada aqui toca a FOTO (`sprint_indicator_snapshots`) — só a série de
-- evolução (`sprint_daily_progress`), que não é selada.
-- ============================================================================

-- ── Captura de UM ponto, para uma sprint e uma data de rótulo ───────────────
-- Corpo idêntico ao da SN-4, com duas mudanças: a sprint e o captured_date
-- chegam por parâmetro (a resolução virou responsabilidade do driver) e o
-- transbordo vem da tag.
CREATE OR REPLACE FUNCTION public.rpc_capture_sprint_daily_progress_at(
  p_sprint text,
  p_captured_date date
)
RETURNS TABLE(
  out_sprint_code text,
  out_captured_date date,
  out_total bigint,
  out_finalized bigint,
  out_qa_concluidos bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
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

  -- ── Indicadores no estado atual (as-of NOW) ────────────────────────────────
  WITH items AS (
    SELECT
      ls.work_item_id, w.state AS cur_state,
      w.closed_by, w.closed_by_email, w.closed_date,
      COALESCE(ls.qa_return_count,0) AS qrc_now,
      ls.total_lead_time_days, ls.transbordou_sprint,
      hs.health_status,
      COALESCE(w.work_item_type,'Unknown') AS wtype,
      COALESCE(w.tags,'') AS tags_text
    FROM pbi_lifecycle_summary ls
    LEFT JOIN devops_work_items w ON w.id = ls.work_item_id
    LEFT JOIN pbi_health_summary hs ON hs.work_item_id = ls.work_item_id
    WHERE ls.last_committed_sprint = v_sprint OR ls.first_committed_sprint = v_sprint
  ),
  fin AS (
    SELECT i.*,
      (lower(trim(i.cur_state)) IN ('done','closed','resolved')) AS done_at,
      EXISTS (
        SELECT 1 FROM qa_authorized_closers c WHERE c.is_active AND (
          lower(c.display_name) = lower(i.closed_by)
          OR (i.closed_date IS NOT NULL AND lower(c.email) = lower(i.closed_by_email))
        )
      ) AS qa_closed_at
    FROM items i
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE NOT public.fn_demanda_nao_planejada(wtype, tags_text)),
    COUNT(*) FILTER (WHERE public.fn_demanda_nao_planejada(wtype, tags_text)),
    COUNT(*) FILTER (WHERE lower(trim(cur_state)) IN ('em teste','aguardando deploy','deploy','homologação','homologacao')),
    COUNT(*) FILTER (WHERE done_at),
    COUNT(*) FILTER (WHERE health_status='vermelho'),
    COUNT(*) FILTER (WHERE health_status='amarelo'),
    COUNT(*) FILTER (WHERE health_status='verde'),
    ROUND(AVG(total_lead_time_days),1), COALESCE(MAX(total_lead_time_days),0),
    -- SN-6: transbordo = TAG (a coluna transbordou_sprint nunca é escrita)
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
  FROM fin;

  -- ── Breakdown por categoria e por fábrica (Epic raiz), estado atual ─────────
  WITH RECURSIVE base AS (
    SELECT
      ls.work_item_id, w.state AS cur_state, w.parent_id,
      COALESCE(w.work_item_type,'Unknown') AS wtype,
      COALESCE(w.tags,'') AS tags_text
    FROM pbi_lifecycle_summary ls
    LEFT JOIN devops_work_items w ON w.id = ls.work_item_id
    WHERE ls.last_committed_sprint = v_sprint OR ls.first_committed_sprint = v_sprint
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
    SELECT start_id,
      COALESCE(
        (array_agg(title ORDER BY depth) FILTER (WHERE work_item_type = 'Epic'))[1],
        (array_agg(title ORDER BY depth DESC))[1]
      ) AS fabrica
    FROM anc GROUP BY start_id
  ),
  cls AS (
    SELECT
      b.work_item_id,
      public.fn_classifica_demanda(b.wtype, b.tags_text) AS cat,
      COALESCE(f.fabrica, 'Sem fábrica') AS fabrica,
      (lower(trim(b.cur_state)) IN ('done','closed','resolved')) AS done_at,
      (lower(trim(b.cur_state)) IN ('aguardando teste','em teste','aguardando deploy')) AS entregue_at
    FROM base b
    LEFT JOIN fab f ON f.start_id = b.work_item_id
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

  -- ── UPSERT idempotente: 1 linha por (sprint, dia BRT) ──────────────────────
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

  RETURN QUERY SELECT v_sprint, v_captured_date,
    COALESCE(v_total,0), COALESCE(v_finalized,0), COALESCE(v_qa_concluidos,0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_capture_sprint_daily_progress_at(text, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_capture_sprint_daily_progress_at(text, date) IS
  'Grava UM ponto da série diária (estado atual as-of NOW) para a sprint e a '
  'data de rótulo informadas. UPSERT por (sprint_code, captured_date). '
  'Quem decide sprint e data é rpc_capture_sprint_daily_progress.';

-- ── Driver: ponto do dia + ponto de fechamento na segunda ───────────────────
CREATE OR REPLACE FUNCTION public.rpc_capture_sprint_daily_progress(
  p_sprint_code text DEFAULT NULL
)
RETURNS TABLE(
  out_sprint_code text,
  out_captured_date date,
  out_total bigint,
  out_finalized bigint,
  out_qa_concluidos bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_aberta text;
  v_fechando text;
  v_rotulo date;
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

  -- Sprint explícita: comportamento antigo (ponto de hoje, sem magia de calendário).
  IF p_sprint_code IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.rpc_capture_sprint_daily_progress_at(p_sprint_code, v_today);
    RETURN;
  END IF;

  -- 1) Ponto do dia da sprint ABERTA (janela oficial contém hoje em BRT).
  --    Desempate por ano do código: convivem duas numerações no banco.
  SELECT cands.sc INTO v_aberta
  FROM (
    SELECT DISTINCT COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) AS sc
    FROM public.pbi_lifecycle_summary ls
    WHERE COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$'
  ) cands
  JOIN LATERAL public.fn_sprint_official_range(cands.sc) r ON true
  WHERE v_today BETWEEN r.sprint_start AND r.sprint_end
  ORDER BY r.sprint_end DESC, split_part(cands.sc,'-',2)::int DESC, cands.sc DESC
  LIMIT 1;

  IF v_aberta IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.rpc_capture_sprint_daily_progress_at(v_aberta, v_today);
  END IF;

  -- 2) SN-6: ponto de FECHAMENTO da sprint que acabou de encerrar.
  --    Capturado na SEGUNDA (sprint_end + 3), 2h05 após o corte da foto, e
  --    gravado com rótulo de DOMINGO (sprint_end + 2) para a série fechar no
  --    mesmo dia da foto selada. Independe do passo 1: na segunda a sprint
  --    seguinte já está aberta, então os dois pontos convivem.
  SELECT cands.sc, r.sprint_end + 2 INTO v_fechando, v_rotulo
  FROM (
    SELECT DISTINCT COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) AS sc
    FROM public.pbi_lifecycle_summary ls
    WHERE COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$'
  ) cands
  JOIN LATERAL public.fn_sprint_official_range(cands.sc) r ON true
  WHERE v_today = r.sprint_end + 3
  ORDER BY r.sprint_end DESC, split_part(cands.sc,'-',2)::int DESC, cands.sc DESC
  LIMIT 1;

  -- Só grava se o ponto de fechamento ainda não existir: recapturar depois do
  -- transbordo trocaria o escopo da sprint encerrada (o botão Migrar reescreve
  -- last_committed_sprint dos itens que passaram adiante) e o ponto deixaria de
  -- bater com a foto. Ponto de fechamento é escrito UMA vez.
  IF v_fechando IS NOT NULL AND v_fechando IS DISTINCT FROM v_aberta
     AND NOT EXISTS (
       SELECT 1 FROM public.sprint_daily_progress p
       WHERE p.sprint_code = v_fechando AND p.captured_date = v_rotulo
     ) THEN
    RETURN QUERY SELECT * FROM public.rpc_capture_sprint_daily_progress_at(v_fechando, v_rotulo);
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.rpc_capture_sprint_daily_progress(text) IS
  'Driver da série diária (cron sprint-daily-progress, 00:05 BRT). Grava o ponto '
  'do dia da sprint aberta e, na SEGUNDA pós-sprint (sprint_end + 3), também o '
  'ponto de fechamento da sprint encerrada, com rótulo de DOMINGO '
  '(sprint_end + 2 = dia do corte da foto). Regra SN-6, 03/08/2026.';

-- ── Correção pontual: rótulo do ponto de fechamento da S15-2026 ─────────────
-- Único ponto já gravado pela regra antiga (sáb 01/08 em vez de dom 02/08).
-- Só o RÓTULO muda: os valores (58 / 29 entregues / 11 done) são idênticos aos
-- da foto selada, então recapturar seria pior — 13 itens já foram transbordados
-- para a S16 depois da selagem e o estado atual não representa mais o corte.
UPDATE public.sprint_daily_progress p
   SET captured_date = date '2026-08-02'
 WHERE p.sprint_code = 'S15-2026'
   AND p.captured_date = date '2026-08-01'
   AND NOT EXISTS (
     SELECT 1 FROM public.sprint_daily_progress q
     WHERE q.sprint_code = 'S15-2026' AND q.captured_date = date '2026-08-02'
   );
