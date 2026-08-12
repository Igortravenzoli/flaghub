-- ============================================================================
-- SN-9 — A fotografia passa a ser TIRADA no SÁBADO 13:00 BRT
--
-- Decisão do gestor (04/08/2026), substituindo a regra de domingo 22:00 da SN-5.
-- Diferente das mudanças anteriores, esta NÃO move só o corte: move o momento
-- em que a foto EXISTE. Até aqui corte e selagem eram separados por horas (corte
-- domingo 22:00, selagem segunda 00:30); agora os dois acontecem no sábado à
-- tarde, porque o objetivo declarado é liberar o TRANSBORDO no próprio sábado.
--
--   corte:   sexta 23:59 → sábado 23:59 → domingo 22:00 → SÁBADO 13:00 BRT
--   selagem: sábado 00:30 → domingo 00:30 → segunda 00:30 → SÁBADO 13:20 BRT
--
-- "Todos os sábados 13:00" é por sprint, não semanal: sprints são quinzenais e o
-- sábado do corte é sempre o SEGUINTE ao encerramento (`sprint_end + 1`, a
-- sprint encerra na sexta). O sábado do meio da sprint não gera foto nenhuma.
--
-- ── Por que a selagem é 13:20 e não 13:00 ──────────────────────────────────
-- A folga de 20 min (2 ciclos do devops-sync-all, que roda a cada 10 min) existe
-- pelo mesmo motivo das 2h30 da SN-5: os últimos minutos antes do corte precisam
-- estar espelhados no banco antes de a foto virar imutável. Encurtou porque o
-- transbordo agora espera por ela — 2h30 de espera no sábado à tarde não se
-- justifica; 20 min sim.
--
-- ── Três mudanças casadas (nenhuma funciona sozinha) ───────────────────────
-- 1) CORTE + GUARD DA SELAGEM. O guard deixa de comparar DATAS e passa a
--    comparar o INSTANTE do corte com now(). Era obrigatório: com a selagem no
--    mesmo dia do corte, "hoje > dia do corte" bloquearia o sábado inteiro e a
--    foto só sairia no domingo — exatamente o que esta mudança quer evitar.
--    Comparar timestamp também elimina o cuidado com data BRT × data UTC que a
--    SN-5 precisou documentar.
--
-- 2) PONTO DE FECHAMENTO DA SÉRIE DIÁRIA muda de dono. A SN-6 o capturava na
--    segunda 00:05 (`sprint_end + 3`) com rótulo de domingo; com o corte no
--    sábado 13:00 esse ponto passaria a ser gravado 2 dias DEPOIS da foto e,
--    pior, depois de o transbordo já ter destravado — o botão Migrar reescreve o
--    iteration_path dos itens que passaram adiante e o ponto deixaria de bater
--    com a foto. Passa a ser escrito pelo PRÓPRIO driver da selagem, na mesma
--    passada e logo após selar: mesmo instante, mesmo universo, sempre antes de
--    o botão destravar. Rótulo = `sprint_end + 1` (o sábado do corte).
--    Em consequência, `rpc_capture_sprint_daily_progress` volta a ser só "o
--    ponto do dia da sprint aberta" — se mantivesse o passo 2 da SN-6, gravaria
--    na segunda um SEGUNDO ponto de fechamento rotulado no domingo.
--
-- 3) TRAVA DO TRANSBORDO ganha o corte previsto. A regra pedida pelo gestor
--    ("só transbordar quando a foto já estiver tirada") já era a trava (a) da
--    migration TR e continua idêntica — o que muda é a mensagem, que agora
--    consegue dizer QUANDO libera, porque `rpc_transbordo_contexto` devolve
--    `corte_previsto`. Sem isso o gestor veria "foto ainda não selada" no sábado
--    de manhã sem saber se espera 20 minutos ou 2 dias.
--
-- ── O corte vira função ────────────────────────────────────────────────────
-- `fn_corte_foto_sprint(sprint_end)` passa a ser a fonte única do instante do
-- corte: a reconstrução usa como default, o guard da selagem compara contra ela
-- e a trava do transbordo a exibe. Nas regras anteriores essa aritmética estava
-- duplicada em três lugares e a SN-5 precisou mudar os três no mesmo commit.
--
-- Fotos já seladas NÃO são reprocessadas ("o passado não muda"). A série fica
-- mista e documentada: ≤S13 corte sexta · S14 corte sábado 23:59 (manual) ·
-- S15 corte domingo 22:00 · S16 em diante corte SÁBADO 13:00. Como a S15 já
-- fechou em 31/07 e foi selada, a primeira sprint sob esta regra é a S16-2026
-- (fim sexta 14/08 → corte sábado 15/08 13:00 BRT).
--
-- Não muda: o universo da foto (quadro por iteration_path, SN-7), a definição de
-- entregue (SN-7), o transbordo por tag (SN-5/SN-6) e o corte de HORAS/alocação
-- do timelog, que segue na sexta.
-- ============================================================================

-- ── Fonte única do instante do corte ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corte_foto_sprint(p_sprint_end date)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ((p_sprint_end + 1)::timestamp + interval '13 hours')
         AT TIME ZONE 'America/Sao_Paulo';
$$;

COMMENT ON FUNCTION public.fn_corte_foto_sprint(date) IS
  'Instante do corte da fotografia de uma sprint: SÁBADO 13:00 BRT '
  '(sprint_end + 1, a sprint encerra na sexta). Regra SN-9, 04/08/2026 — antes '
  'domingo 22:00 (SN-5), sábado 23:59 e sexta 23:59. Fonte única: reconstrução, '
  'guard da selagem e trava do transbordo leem daqui.';

GRANT EXECUTE ON FUNCTION public.fn_corte_foto_sprint(date) TO authenticated, service_role;

-- ── Reconstrução da foto — corpo da SN-7, só o corte padrão muda ────────────
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
  'PBI + User Story + Bug). Corte padrão: SÁBADO 13:00 BRT '
  '(fn_corte_foto_sprint; regra SN-9, 04/08/2026 — antes domingo 22:00). '
  'Entregue = aguardando teste/em teste/aguardando deploy/deploy/homologação. '
  'p_as_of permite corte alternativo (exceção manual e refação de foto antiga, '
  'que DEVE usar o corte da época).';

-- ── Driver da selagem: guard por INSTANTE + ponto de fechamento da série ────
CREATE OR REPLACE FUNCTION public.rpc_backfill_reconstruct_closed_sprints(
  p_year int DEFAULT EXTRACT(YEAR FROM NOW())::int
)
RETURNS TABLE(sprint_code text, status text, qa_done bigint, qa_concluidos bigint, itens_aprox bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_sprint text;
  v_end date;
  v_corte timestamptz;
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

    -- SN-9: guard por INSTANTE, não por data. A selagem acontece no MESMO dia do
    -- corte (sábado), então comparar datas bloquearia o sábado inteiro. Comparar
    -- now() com o corte também dispensa o cuidado com data BRT × UTC que a regra
    -- anterior exigia.
    v_corte := public.fn_corte_foto_sprint(v_end);

    IF now() < v_corte THEN
      sprint_code := v_sprint;
      status := CASE WHEN v_end >= v_today_brt THEN 'open_sprint_skipped' ELSE 'aguardando_corte_sabado' END;
      qa_done := NULL; qa_concluidos := NULL; itens_aprox := NULL;
      RETURN NEXT; CONTINUE;
    END IF;

    -- Passado imutável: foto selada (padrão ou manual) nunca é regravada.
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

      -- SN-9: ponto de FECHAMENTO da série diária, aqui e agora. Precisa ser
      -- escrito na mesma passada da selagem porque é a última janela em que o
      -- iteration_path dos itens ainda é o da sprint que fechou — logo depois
      -- daqui o botão Migrar destrava e reescreve esse campo. Bloco aninhado com
      -- exceção própria: falha na série não pode marcar a foto como erro, ela
      -- já está selada.
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM public.sprint_daily_progress p
          WHERE p.sprint_code = v_sprint AND p.captured_date = v_end + 1
        ) THEN
          -- A função dropa o próprio tmp_daily_itens ao sair; se abortar no meio,
          -- o rollback deste subbloco desfaz a criação. Seguro no laço.
          PERFORM public.rpc_capture_sprint_daily_progress_at(v_sprint, v_end + 1);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Ponto de fechamento da série diária falhou para % (%) — foto selada mesmo assim.',
          v_sprint, SQLERRM;
      END;

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
  'Driver da selagem. Varre as sprints do QUADRO (iteration_path) do ano '
  'informado e sela na primeira passada em que o corte (sábado 13:00 BRT) já '
  'passou — na prática, o job das 13:20 do sábado. Grava também o ponto de '
  'FECHAMENTO da série diária (rótulo sprint_end + 1), na mesma passada e antes '
  'de o transbordo destravar. Fotos seladas/manuais nunca são regravadas; erro '
  'numa sprint não interrompe as demais. Regra SN-9, 04/08/2026.';

-- ── Série diária volta a ser só "o ponto do dia da sprint aberta" ───────────
-- O passo 2 da SN-6 (ponto de fechamento na segunda, rotulado no domingo) sai
-- daqui: quem escreve esse ponto agora é o driver da selagem, no sábado. Mantido
-- aqui, gravaria na segunda um SEGUNDO ponto de fechamento com rótulo errado.
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
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

  -- Sprint explícita: ponto de hoje, sem magia de calendário.
  IF p_sprint_code IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.rpc_capture_sprint_daily_progress_at(p_sprint_code, v_today);
    RETURN;
  END IF;

  -- Ponto do dia da sprint ABERTA (janela oficial contém hoje em BRT).
  -- Desempate por ano do código: convivem duas numerações no banco.
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
END;
$function$;

COMMENT ON FUNCTION public.rpc_capture_sprint_daily_progress(text) IS
  'Driver da série diária (cron sprint-daily-progress, 00:05 BRT): grava o ponto '
  'do dia da sprint aberta. O ponto de FECHAMENTO da sprint encerrada NÃO sai '
  'daqui desde a SN-9 (04/08/2026) — é escrito por '
  'rpc_backfill_reconstruct_closed_sprints junto da selagem, no sábado.';

-- ── Trava do transbordo: mesma regra, agora com o corte previsto ────────────
-- Muda a assinatura (ganha corte_previsto) → DROP obrigatório antes do CREATE.
DROP FUNCTION IF EXISTS public.rpc_transbordo_contexto();

CREATE OR REPLACE FUNCTION public.rpc_transbordo_contexto()
RETURNS TABLE (
  sprint_origem   text,
  sprint_fim      date,
  sprint_destino  text,
  foto_selada     boolean,
  foto_as_of      timestamptz,
  corte_previsto  timestamptz,
  pode_migrar     boolean,
  motivo          text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_snap record;
BEGIN
  -- Sprint que fechou = a mais recente cujo fim oficial já passou.
  SELECT cands.sc, r.sprint_end INTO sprint_origem, sprint_fim
  FROM (
    SELECT DISTINCT coalesce(ls.last_committed_sprint, ls.first_committed_sprint) AS sc
    FROM public.pbi_lifecycle_summary ls
    WHERE coalesce(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$'
  ) cands
  JOIN LATERAL public.fn_sprint_official_range(cands.sc) r ON true
  WHERE r.sprint_end < v_hoje
  ORDER BY r.sprint_end DESC
  LIMIT 1;

  IF sprint_origem IS NULL THEN
    foto_selada := false; pode_migrar := false;
    motivo := 'Nenhuma sprint encerrada encontrada.';
    RETURN NEXT; RETURN;
  END IF;

  -- Destino pela DATA (segunda seguinte), nunca por n+1 — que quebraria na
  -- virada de ano (S26-2026 → S1-2027).
  sprint_destino := public.fn_sprint_code_for_date(sprint_fim + 3);
  corte_previsto := public.fn_corte_foto_sprint(sprint_fim);

  SELECT s.snapshot_source, s.as_of_datetime INTO v_snap
  FROM public.sprint_indicator_snapshots s
  WHERE s.sprint_code = sprint_origem
    AND s.snapshot_source IN ('fim_sprint_selado', 'manual')
  LIMIT 1;

  foto_selada := v_snap.snapshot_source IS NOT NULL;
  foto_as_of  := v_snap.as_of_datetime;

  -- Trava dupla (decisão do gestor, 25/07/2026 — reafirmada em 04/08/2026):
  -- (a) foto da sprint que fechou já TIRADA; (b) data posterior ao fim dela.
  -- (b) sozinha não basta tecnicamente — mover itens antes da selagem os faria
  -- sumir da foto, porque o universo sai do iteration_path atual. A mensagem
  -- distingue "a foto ainda não é hora" de "a foto atrasou".
  IF v_hoje <= sprint_fim THEN
    pode_migrar := false;
    motivo := format('Sprint %s ainda não encerrou (fim %s). Transbordo no meio da sprint é bloqueado.',
                     sprint_origem, to_char(sprint_fim, 'DD/MM'));
  ELSIF NOT foto_selada AND now() < corte_previsto THEN
    pode_migrar := false;
    motivo := format('A foto da %s ainda não foi tirada — o corte é %s (sábado 13:00). '
                     'O transbordo libera logo depois da selagem, ~20 min após o corte.',
                     sprint_origem,
                     to_char(corte_previsto AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'));
  ELSIF NOT foto_selada THEN
    pode_migrar := false;
    motivo := format('O corte da %s (%s) já passou, mas a foto ainda não foi selada. '
                     'Mover itens antes disso os apagaria da foto — acionar o suporte se persistir.',
                     sprint_origem,
                     to_char(corte_previsto AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'));
  ELSE
    pode_migrar := true;
    motivo := format('Liberado: %s encerrada e fotografada. Destino: %s.', sprint_origem, sprint_destino);
  END IF;

  RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION public.rpc_transbordo_contexto() IS
  'Trava do transbordo: exige foto TIRADA (selada) da sprint que fechou E data '
  'posterior ao fim da sprint. Devolve corte_previsto (sábado 13:00 BRT, SN-9) '
  'para a mensagem dizer quando libera. Fonte única — o front usa para habilitar '
  'o botão, a edge revalida antes de escrever.';

GRANT EXECUTE ON FUNCTION public.rpc_transbordo_contexto() TO authenticated, service_role;

-- ── Cron: job de sábado 13:20 BRT + diário como rede de segurança ───────────
-- 13:20 BRT = 16:20 UTC; o Brasil não tem mais horário de verão, então o
-- deslocamento é fixo (-3). DOW 6 = sábado (também em UTC nesse horário).
-- O job diário 00:30 continua existindo: se o de sábado falhar, ele sela na
-- madrugada seguinte (o guard já autoriza, o corte passou) — a foto atrasa, mas
-- não some. Localizar SEMPRE por jobname; o jobid muda entre ambientes.
DO $$
DECLARE
  v_jobid bigint;
  v_schedule text;
BEGIN
  SELECT jobid, schedule INTO v_jobid, v_schedule
  FROM cron.job WHERE jobname = 'snapshot-sprint-end-saturday' LIMIT 1;

  IF v_jobid IS NULL THEN
    PERFORM cron.schedule(
      'snapshot-sprint-end-saturday',
      '20 16 * * 6',
      'SELECT public.rpc_backfill_reconstruct_closed_sprints();'
    );
    RAISE NOTICE 'Job "snapshot-sprint-end-saturday" agendado (16:20 UTC = sáb 13:20 BRT).';
  ELSIF v_schedule IS DISTINCT FROM '20 16 * * 6' THEN
    PERFORM cron.alter_job(v_jobid, schedule => '20 16 * * 6');
    RAISE NOTICE 'Job "snapshot-sprint-end-saturday" (id %) reagendado de % para 20 16 * * 6.', v_jobid, v_schedule;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Agendamento do job de sábado falhou (%). Criar manualmente — ver docs/SETUP_CRON_JOBS.md.', SQLERRM;
END $$;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'snapshot-sprint-end-daily' LIMIT 1;
  IF v_jobid IS NULL THEN
    RAISE NOTICE 'Job "snapshot-sprint-end-daily" não encontrado — agendar manualmente (rede de segurança do job de sábado).';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Verificação do cron diário falhou (%).', SQLERRM;
END $$;

-- ── Auditoria de stragglers (somente leitura — NOTICE por achado) ───────────
-- Sprint do ano vigente cujo corte NOVO já passou e que segue sem foto selada
-- seria selada pela próxima passada com o corte de SÁBADO 13:00 — contradizendo
-- "cada sprint fica com o corte da sua época". Este bloco só ALERTA; a correção
-- é manual (runbook em docs/FOTOGRAFIA_SPRINT_SELAGEM.md: p_as_of com o corte
-- da época + snapshot_source = 'manual').
DO $$
DECLARE
  v_rec record;
  v_count int := 0;
BEGIN
  FOR v_rec IN
    SELECT cands.sc, r.sprint_end
    FROM (SELECT DISTINCT regexp_replace(w.iteration_path, '^.*\\', '') AS sc
            FROM public.devops_work_items w
           WHERE w.work_item_type IN ('Product Backlog Item','User Story','Bug')
             AND regexp_replace(w.iteration_path, '^.*\\', '') ~ '^S[0-9]+-[0-9]{4}$') cands
    JOIN LATERAL public.fn_sprint_official_range(cands.sc) r ON true
    WHERE split_part(cands.sc, '-', 2)::int = EXTRACT(YEAR FROM now())::int
      AND now() >= public.fn_corte_foto_sprint(r.sprint_end)
      AND NOT EXISTS (SELECT 1 FROM public.sprint_indicator_snapshots s
                       WHERE s.sprint_code = cands.sc
                         AND s.snapshot_source IN ('fim_sprint_selado','manual'))
    ORDER BY r.sprint_end
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE 'STRAGGLER: sprint % (fim %) sem foto selada — selar manualmente com o corte da época ANTES do próximo job.',
      v_rec.sc, v_rec.sprint_end;
  END LOOP;
  IF v_count = 0 THEN
    RAISE NOTICE 'Auditoria de stragglers: nenhuma sprint do ano sem foto selada. OK.';
  END IF;
END $$;
