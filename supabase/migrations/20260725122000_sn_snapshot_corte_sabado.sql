-- ============================================================================
-- SN-1 + SN-2 — Fotografia de fim de sprint passa a cortar SÁBADO 23:59 BRT
--
-- Decisão do gestor (24/07/2026): a foto de cada sprint deixa de ser o estado
-- de sexta 23:59 e passa a ser o estado de SÁBADO 23:59:59 BRT — a exceção
-- manual da S14-2026 (corte sábado 18/07) vira a regra padrão. Vale a partir
-- da S15-2026; fotos já seladas (corte sexta) permanecem imutáveis ("o passado
-- não muda") — a série histórica fica mista e documentada.
--
-- As DUAS mudanças são CASADAS (armadilha): se só o corte mudasse, o cron de
-- SÁBADO 00:30 BRT selaria uma foto cujo corte (sábado 23:59) ainda está no
-- futuro — congelando na prática o estado de sábado 00:30. Por isso:
--
--   SN-1  rpc_reconstruct_sprint_snapshot — default do corte:
--         (sprint_end + 1) − 1s  →  (sprint_end + 2) − 1s   (sáb 23:59:59 BRT)
--   SN-2  rpc_backfill_reconstruct_closed_sprints — guard de selagem:
--         pula enquanto v_end + 1 >= data BRT de hoje (sela só a partir de
--         domingo, quando o corte de sábado já passou). Guard usa a data BRT
--         (não CURRENT_DATE/UTC): entre 21:00 e 23:59 BRT a data UTC já virou,
--         e uma execução manual nessa janela selaria com corte no futuro.
--         Job diário continua '30 3 * * *'
--         (domingo 03:30 UTC = dom 00:30 BRT, 31min após o corte de sábado
--         23:59 BRT = dom 02:59:59 UTC). Job localizado por JOBNAME
--         ('snapshot-sprint-end-daily'), nunca mais pelo id hardcoded.
--
-- A foto é UMA tabela (sprint_indicator_snapshots) compartilhada por Fábrica
-- (category_breakdown) e Qualidade (colunas qa_*) — esta mudança atende os
-- dois setores de uma vez. Corte de HORAS/alocação não muda (segue sexta).
-- ============================================================================

-- ── SN-1: corte padrão sábado 23:59:59 BRT ──────────────────────────────────
-- Corpo idêntico ao vigente (20260610100000_snapshot_category_breakdown);
-- única mudança: o default de v_as_of (sprint_end + 2 em vez de + 1).
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

  -- Corte padrão: SÁBADO 23:59:59 BRT (sprint_end é sexta; +2 dias − 1s).
  -- Até 24/07/2026 o padrão era sexta 23:59:59 (+1 − 1s); fotos antigas seguem
  -- essa regra e não são reprocessadas.
  v_as_of := COALESCE(
    p_as_of,
    (((v_sprint_end + 2)::timestamp - interval '1 second') AT TIME ZONE 'America/Sao_Paulo')
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

COMMENT ON FUNCTION public.rpc_reconstruct_sprint_snapshot(text, timestamptz) IS
  'Reconstrói a foto de fim de sprint via state_history. Corte padrão: SÁBADO '
  '23:59:59 BRT (sprint_end+2 −1s; regra de 24/07/2026 — antes era sexta). '
  'p_as_of permite corte alternativo (exceções manuais).';

-- ── SN-2: guard do driver — só sela a partir de DOMINGO ─────────────────────
-- Corpo idêntico ao vigente (20260719140000_sprint_snapshot_selagem); única
-- mudança: o pulo passa de (v_end >= CURRENT_DATE) para
-- (v_end + 1 >= CURRENT_DATE), com status distinto para observabilidade.
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
    SELECT DISTINCT COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) AS sc
    FROM public.pbi_lifecycle_summary ls
    WHERE COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$'
      AND split_part(COALESCE(ls.last_committed_sprint, ls.first_committed_sprint), '-', 2)::int = p_year
    ORDER BY 1
  LOOP
    SELECT r.sprint_end INTO v_end FROM public.fn_sprint_official_range(v_sprint) r LIMIT 1;
    IF v_end IS NULL THEN
      sprint_code := v_sprint; status := 'invalid_sprint_code'; qa_done := NULL; qa_concluidos := NULL; itens_aprox := NULL;
      RETURN NEXT; CONTINUE;
    END IF;

    -- Corte da foto = sábado (v_end + 1) 23:59:59 BRT. Selar antes de o corte
    -- passar congelaria o estado de sábado — por isso o pulo cobre até sábado
    -- inclusive (em data BRT); a primeira passada elegível é DOMINGO 00:30 BRT
    -- (job diário '30 3 * * *' UTC).
    IF v_end + 1 >= v_today_brt THEN
      sprint_code := v_sprint;
      status := CASE WHEN v_end >= v_today_brt
                     THEN 'open_sprint_skipped'
                     ELSE 'aguardando_corte_sabado' END;
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

    -- Primeira madrugada elegível (domingo) ou foto ainda não selada: constrói
    -- a foto com o corte padrão (sábado 23:59 BRT) e SELA na mesma passada.
    SELECT * INTO v_res FROM public.rpc_reconstruct_sprint_snapshot(v_sprint, NULL) LIMIT 1;
    UPDATE public.sprint_indicator_snapshots s
       SET snapshot_source = 'fim_sprint_selado'
     WHERE s.sprint_code = v_sprint;

    sprint_code := v_sprint; status := 'reconstructed_sealed';
    qa_done := v_res.qa_done; qa_concluidos := v_res.qa_concluidos; itens_aprox := v_res.itens_aprox;
    RETURN NEXT;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.rpc_backfill_reconstruct_closed_sprints(int) IS
  'Driver diário da selagem de fotos de sprint. Sela na primeira madrugada em '
  'que o corte (sábado 23:59 BRT) já passou — na prática, domingo 00:30 BRT. '
  'Fotos seladas/manuais nunca são regravadas.';

-- ── Cron: garantir o agendamento pelo JOBNAME (nunca por id hardcoded) ──────
-- O schedule não muda ('30 3 * * *' = 00:30 BRT diário); este bloco só
-- normaliza caso algum ambiente esteja divergente e alerta se o job não existir.
DO $$
DECLARE
  v_jobid bigint;
  v_schedule text;
BEGIN
  SELECT jobid, schedule INTO v_jobid, v_schedule
  FROM cron.job
  WHERE jobname = 'snapshot-sprint-end-daily'
  LIMIT 1;

  IF v_jobid IS NULL THEN
    RAISE NOTICE 'Job "snapshot-sprint-end-daily" não encontrado — agendar manualmente (ver docs/SETUP_CRON_JOBS.md).';
  ELSIF v_schedule IS DISTINCT FROM '30 3 * * *' THEN
    PERFORM cron.alter_job(v_jobid, schedule => '30 3 * * *');
    RAISE NOTICE 'Job "snapshot-sprint-end-daily" (id %) reagendado de % para 30 3 * * *.', v_jobid, v_schedule;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Verificação do cron falhou (%). Conferir agendamento manualmente.', SQLERRM;
END $$;

-- ── Auditoria de stragglers (somente leitura — NOTICE por achado) ───────────
-- Sprint antiga que ainda esteja SEM foto selada/manual seria selada pela
-- próxima madrugada com o corte NOVO (sábado) — contradizendo a regra "série
-- histórica pré-S15 = corte sexta". Este bloco só ALERTA; a correção é manual
-- (runbook em docs/FOTOGRAFIA_SPRINT_SELAGEM.md: selar com p_as_of = sexta
-- 23:59:59 BRT da época + snapshot_source = 'manual').
DO $$
DECLARE
  v_rec record;
  v_count int := 0;
BEGIN
  FOR v_rec IN
    SELECT cands.sc, r.sprint_end
    FROM (SELECT DISTINCT COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) AS sc
            FROM public.pbi_lifecycle_summary ls
           WHERE COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$') cands
    JOIN LATERAL public.fn_sprint_official_range(cands.sc) r ON true
    WHERE r.sprint_end + 1 < (now() AT TIME ZONE 'America/Sao_Paulo')::date
      AND NOT EXISTS (SELECT 1 FROM public.sprint_indicator_snapshots s
                       WHERE s.sprint_code = cands.sc
                         AND s.snapshot_source IN ('fim_sprint_selado','manual'))
    ORDER BY r.sprint_end
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE 'STRAGGLER: sprint % (fim %) sem foto selada — selar manualmente com corte da época (sexta 23:59:59 BRT) antes da próxima madrugada de domingo.',
      v_rec.sc, v_rec.sprint_end;
  END LOOP;
  IF v_count = 0 THEN
    RAISE NOTICE 'Auditoria de stragglers: nenhuma sprint antiga sem foto selada. OK.';
  END IF;
END $$;
