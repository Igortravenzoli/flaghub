-- ============================================================================
-- Migration: 20260702170000_fix_qa_vazao_meta_em_teste.sql
-- Consistência do KPI "Meta de Vazão" (Visão Executiva · Qualidade).
--
-- PROBLEMA (validação QA 02/07): card mostrava 19 no prazo + 8 em atraso com
-- ~62 itens Em Teste — 53 itens caíam em "sem sprint de origem" e ficavam
-- fora do cálculo. O número não fechava para a gestão.
--
-- CAUSA RAIZ (dados): compute_pbi_health_all() gravava em
-- first_committed_sprint o PRIMEIRO ELEMENTO CRU do iteration_history
-- (_iter_hist->>0 = JSON do evento {"newValue":..,"oldValue":..,"revisedDate":..})
-- em vez do código da sprint. O recompute de 01/07 11:58 sobrescreveu 51 itens
-- da fila QA com esse blob, que não casa com '^S[0-9]+-[0-9]{4}$' no
-- rpc_qa_exec_fila_aging → item vira "sem sprint" e sai do no_prazo/atraso.
-- A mesma função também contava "migrações de sprint" sobre elementos crus
-- (jsonb_array_elements_text de objetos), inflando sprint_migration_count.
--
-- CAUSA SECUNDÁRIA (regra): a meta era calculada sobre a fila inteira
-- (Em Teste + Aguardando Deploy), então nem com dados sãos fecharia com o
-- contador "em teste". Pedido da gestão: "das N em teste (PBI e Bug),
-- x está no prazo, y estrapolou".
--
-- FIX:
--   1. compute_pbi_health_all: extrai códigos de sprint do iteration_history
--      (oldValue antes de newValue, em ordem cronológica); fallback =
--      iteration_path. Migrações = nº de códigos distintos - 1.
--   2. Repara first/last_committed_sprint corrompidos em pbi_lifecycle_summary
--      (só valores não nulos que não são código de sprint válido).
--   3. rpc_qa_exec_fila_aging: no_prazo/atraso/sem_sprint/por_origem passam a
--      ter base = itens EM TESTE (PBI + Bug), fechando com o contador
--      "em teste". Extração de origem tolerante a formato e idade correta
--      para sprints de anos anteriores (sempre > 2 sprints = atraso).
-- ============================================================================

-- ── 1) compute_pbi_health_all: sprint codes corretos a partir do histórico ──
CREATE OR REPLACE FUNCTION public.compute_pbi_health_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _wi RECORD;
  _stage_key text;
  _stage_match RECORD;
  _days_in_stage integer;
  _health text;
  _reasons text[];
  _threshold RECORD;
  _overflow_count integer;
  _sprint_migration_count integer;
  _iter_hist jsonb;
  _hist_sprints text[];
  _first_sprint text;
  _last_sprint text;
  _path_sprint text;
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

  FOR _wi IN
    SELECT
      w.id,
      w.state,
      w.work_item_type,
      w.iteration_path,
      w.created_date,
      w.changed_date,
      w.assigned_to_display,
      w.tags,
      w.iteration_history,
      w.area_path
    FROM devops_work_items w
    WHERE w.work_item_type IN ('Product Backlog Item', 'User Story', 'Bug')
  LOOP
    _stage_key := 'backlog';
    FOR _stage_match IN
      SELECT sc.stage_key, unnest(sc.state_patterns) AS pattern
      FROM pbi_stage_config sc
      WHERE sc.is_active = true
      ORDER BY sc.sort_order
    LOOP
      IF lower(coalesce(_wi.state, '')) = lower(_stage_match.pattern) THEN
        _stage_key := _stage_match.stage_key;
        EXIT;
      END IF;
    END LOOP;

    IF _stage_key = 'done' THEN
      _days_in_stage := 0;
    ELSE
      _days_in_stage := GREATEST(0, EXTRACT(DAY FROM (now() - coalesce(_wi.changed_date, _wi.created_date)))::integer);
    END IF;

    -- Códigos de sprint do histórico, em ordem cronológica de aparição.
    -- Eventos são objetos {"newValue","oldValue","revisedDate"} (oldValue vem
    -- antes de newValue na linha do tempo); elementos string são aceitos como
    -- caminho de iteração direto.
    _overflow_count := 0;
    _sprint_migration_count := 0;
    _hist_sprints := NULL;
    _iter_hist := _wi.iteration_history;
    _path_sprint := upper(substring(coalesce(_wi.iteration_path, '') from '(S[0-9]+-[0-9]{4})'));
    IF _iter_hist IS NOT NULL AND jsonb_typeof(_iter_hist) = 'array' THEN
      SELECT array_agg(code ORDER BY first_seen)
      INTO _hist_sprints
      FROM (
        SELECT code, min(ord * 10 + pos) AS first_seen
        FROM (
          SELECT upper(substring(v.val from '(S[0-9]+-[0-9]{4})')) AS code, e.ord, v.pos
          FROM jsonb_array_elements(_iter_hist) WITH ORDINALITY AS e(elem, ord),
          LATERAL (VALUES
            (CASE WHEN jsonb_typeof(e.elem) = 'object' THEN e.elem->>'oldValue' ELSE e.elem #>> '{}' END, 1),
            (CASE WHEN jsonb_typeof(e.elem) = 'object' THEN e.elem->>'newValue' ELSE NULL END, 2)
          ) AS v(val, pos)
        ) x
        WHERE code IS NOT NULL
        GROUP BY code
      ) y;
    END IF;

    _first_sprint := COALESCE(_hist_sprints[1], _path_sprint);
    _last_sprint := COALESCE(_path_sprint, _hist_sprints[cardinality(_hist_sprints)]);

    IF cardinality(_hist_sprints) > 1 THEN
      _sprint_migration_count := cardinality(_hist_sprints) - 1;
      _overflow_count := _sprint_migration_count;
    END IF;

    INSERT INTO pbi_lifecycle_summary (
      work_item_id, sector, current_stage, has_design_stage,
      first_committed_sprint, last_committed_sprint,
      lead_owner_at_commitment, overflow_stage,
      total_lead_time_days,
      backlog_days, design_days, fabrica_days, qualidade_days, deploy_days,
      sprint_migration_count, overflow_count, overflow_by_stage,
      qa_return_count, computed_at
    ) VALUES (
      _wi.id,
      NULL,
      _stage_key,
      false,
      _first_sprint,
      _last_sprint,
      _wi.assigned_to_display,
      CASE WHEN _overflow_count > 0 THEN _stage_key ELSE NULL END,
      GREATEST(0, EXTRACT(DAY FROM (
        CASE WHEN _stage_key = 'done' THEN coalesce(_wi.changed_date, now())
             ELSE now() END
        - coalesce(_wi.created_date, now())
      ))::integer),
      CASE WHEN _stage_key = 'backlog' THEN _days_in_stage ELSE 0 END,
      0,
      CASE WHEN _stage_key = 'fabrica' THEN _days_in_stage ELSE 0 END,
      CASE WHEN _stage_key = 'qualidade' THEN _days_in_stage ELSE 0 END,
      CASE WHEN _stage_key = 'deploy' THEN _days_in_stage ELSE 0 END,
      _sprint_migration_count,
      _overflow_count,
      NULL,
      0,
      now()
    )
    ON CONFLICT (work_item_id) DO UPDATE SET
      current_stage = EXCLUDED.current_stage,
      first_committed_sprint = EXCLUDED.first_committed_sprint,
      last_committed_sprint = EXCLUDED.last_committed_sprint,
      lead_owner_at_commitment = EXCLUDED.lead_owner_at_commitment,
      overflow_stage = EXCLUDED.overflow_stage,
      total_lead_time_days = EXCLUDED.total_lead_time_days,
      backlog_days = EXCLUDED.backlog_days,
      design_days = EXCLUDED.design_days,
      fabrica_days = EXCLUDED.fabrica_days,
      qualidade_days = EXCLUDED.qualidade_days,
      deploy_days = EXCLUDED.deploy_days,
      sprint_migration_count = EXCLUDED.sprint_migration_count,
      overflow_count = EXCLUDED.overflow_count,
      qa_return_count = EXCLUDED.qa_return_count,
      computed_at = now(),
      updated_at = now();

    _health := 'verde';
    _reasons := ARRAY[]::text[];

    IF _overflow_count > 0 THEN
      _health := 'vermelho';
      _reasons := array_append(_reasons, 'Transbordo: ' || _overflow_count || ' migração(ões) de sprint');
    END IF;

    IF _sprint_migration_count > 1 AND _health <> 'vermelho' THEN
      _health := 'vermelho';
      _reasons := array_append(_reasons, 'Múltiplas migrações de sprint: ' || _sprint_migration_count);
    ELSIF _sprint_migration_count = 1 AND _health = 'verde' THEN
      _health := 'amarelo';
      _reasons := array_append(_reasons, '1 migração de sprint');
    END IF;

    IF _stage_key <> 'done' THEN
      SELECT * INTO _threshold FROM pbi_health_thresholds
      WHERE stage_key = _stage_key AND is_active = true LIMIT 1;

      IF FOUND THEN
        IF _days_in_stage > _threshold.critical_days AND _threshold.critical_days > 0 THEN
          _health := 'vermelho';
          _reasons := array_append(_reasons, 'Tempo crítico na etapa ' || _stage_key || ': ' || _days_in_stage || ' dias (limite: ' || _threshold.critical_days || ')');
        ELSIF _days_in_stage > _threshold.warn_days AND _threshold.warn_days > 0 AND _health = 'verde' THEN
          _health := 'amarelo';
          _reasons := array_append(_reasons, 'Atenção na etapa ' || _stage_key || ': ' || _days_in_stage || ' dias (limite: ' || _threshold.warn_days || ')');
        END IF;
      END IF;
    END IF;

    IF _stage_key = 'done' AND array_length(_reasons, 1) IS NULL THEN
      _reasons := array_append(_reasons, 'Concluída sem alertas');
    END IF;

    INSERT INTO pbi_health_summary (
      work_item_id, sector, health_status, bottleneck_stage, health_reasons, computed_at
    ) VALUES (
      _wi.id,
      NULL,
      _health,
      CASE WHEN _health <> 'verde' AND _stage_key <> 'done' THEN _stage_key ELSE NULL END,
      to_jsonb(_reasons),
      now()
    )
    ON CONFLICT (work_item_id) DO UPDATE SET
      health_status = EXCLUDED.health_status,
      bottleneck_stage = EXCLUDED.bottleneck_stage,
      health_reasons = EXCLUDED.health_reasons,
      computed_at = now(),
      updated_at = now();

  END LOOP;
END;
$function$;

-- ── 2) Repara dados corrompidos (blob JSON / 'Backlog' em vez de código) ────
WITH fixed AS (
  SELECT
    ls.work_item_id,
    COALESCE(
      (
        SELECT y.code
        FROM (
          SELECT code, min(ord * 10 + pos) AS first_seen
          FROM (
            SELECT upper(substring(v.val from '(S[0-9]+-[0-9]{4})')) AS code, e.ord, v.pos
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(w.iteration_history) = 'array' THEN w.iteration_history ELSE '[]'::jsonb END
            ) WITH ORDINALITY AS e(elem, ord),
            LATERAL (VALUES
              (CASE WHEN jsonb_typeof(e.elem) = 'object' THEN e.elem->>'oldValue' ELSE e.elem #>> '{}' END, 1),
              (CASE WHEN jsonb_typeof(e.elem) = 'object' THEN e.elem->>'newValue' ELSE NULL END, 2)
            ) AS v(val, pos)
          ) x
          WHERE code IS NOT NULL
          GROUP BY code
          ORDER BY first_seen
          LIMIT 1
        ) y
      ),
      upper(substring(coalesce(w.iteration_path, '') from '(S[0-9]+-[0-9]{4})'))
    ) AS first_ok,
    upper(substring(coalesce(w.iteration_path, '') from '(S[0-9]+-[0-9]{4})')) AS last_ok
  FROM public.pbi_lifecycle_summary ls
  JOIN public.devops_work_items w ON w.id = ls.work_item_id
  WHERE (ls.first_committed_sprint IS NOT NULL AND ls.first_committed_sprint !~ '^S[0-9]+-[0-9]{4}$')
     OR (ls.last_committed_sprint IS NOT NULL AND ls.last_committed_sprint !~ '^S[0-9]+-[0-9]{4}$')
)
UPDATE public.pbi_lifecycle_summary ls
SET
  first_committed_sprint = CASE
    WHEN ls.first_committed_sprint IS NOT NULL AND ls.first_committed_sprint !~ '^S[0-9]+-[0-9]{4}$'
    THEN f.first_ok ELSE ls.first_committed_sprint END,
  last_committed_sprint = CASE
    WHEN ls.last_committed_sprint IS NOT NULL AND ls.last_committed_sprint !~ '^S[0-9]+-[0-9]{4}$'
    THEN f.last_ok ELSE ls.last_committed_sprint END,
  updated_at = now()
FROM fixed f
WHERE ls.work_item_id = f.work_item_id;

-- ── 3) rpc_qa_exec_fila_aging: meta com base = itens EM TESTE ───────────────
CREATE OR REPLACE FUNCTION public.rpc_qa_exec_fila_aging()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_cur_sprint text;
  v_cur_num int;
  v_cur_year int;
  v_prev_year_max int;
  v_result jsonb;
BEGIN
  -- Sprint aberta hoje (BRT); fallback: maior sprint com itens no lifecycle
  SELECT cands.sc INTO v_cur_sprint
  FROM (
    SELECT DISTINCT COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) AS sc
    FROM public.pbi_lifecycle_summary ls
    WHERE COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$'
  ) cands
  JOIN LATERAL public.fn_sprint_official_range(cands.sc) r ON true
  WHERE (now() AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN r.sprint_start AND r.sprint_end
  ORDER BY r.sprint_end DESC
  LIMIT 1;

  IF v_cur_sprint IS NULL THEN
    SELECT COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) INTO v_cur_sprint
    FROM public.pbi_lifecycle_summary ls
    WHERE COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$'
    ORDER BY regexp_replace(split_part(COALESCE(ls.last_committed_sprint, ls.first_committed_sprint),'-',1),'[^0-9]','','g')::int DESC
    LIMIT 1;
  END IF;

  v_cur_num := regexp_replace(split_part(v_cur_sprint,'-',1),'[^0-9]','','g')::int;
  v_cur_year := split_part(v_cur_sprint,'-',2)::int;

  -- Última sprint do ano anterior (para idade de itens cross-year); fallback 26
  SELECT COALESCE(max((regexp_match(iteration_path, 'S([0-9]+)-' || (v_cur_year - 1)::text))[1]::int), 26)
  INTO v_prev_year_max
  FROM public.devops_work_items
  WHERE iteration_path ~ ('S[0-9]+-' || (v_cur_year - 1)::text);

  WITH fila AS (
    SELECT
      v.id,
      lower(trim(v.state)) AS st,
      -- Origem tolerante a formato: extrai o código de sprint de qualquer
      -- string (protege contra lixo em first_committed_sprint)
      COALESCE(
        upper(substring(
          (SELECT ls.first_committed_sprint FROM public.pbi_lifecycle_summary ls WHERE ls.work_item_id = v.id LIMIT 1)
          from '(S[0-9]+-[0-9]{4})'
        )),
        v.sprint_code
      ) AS origem
    FROM public.vw_qualidade_kpis v
  ),
  fila2 AS (
    SELECT id, st, origem,
      CASE
        WHEN origem !~ '^S[0-9]+-[0-9]{4}$' THEN NULL
        WHEN split_part(origem,'-',2)::int = v_cur_year
          THEN v_cur_num - regexp_replace(split_part(origem,'-',1),'[^0-9]','','g')::int
        -- Sprint de ano anterior: idade = sprints restantes daquele ano + sprints do ano atual
        ELSE (v_prev_year_max - regexp_replace(split_part(origem,'-',1),'[^0-9]','','g')::int)
             + v_cur_num
             + GREATEST(0, v_cur_year - split_part(origem,'-',2)::int - 1) * 26
      END AS age
    FROM fila
  ),
  -- Base da meta de vazão: itens EM TESTE (PBI + Bug) — fecha com o contador "em teste"
  em_teste AS (
    SELECT * FROM fila2 WHERE st = 'em teste'
  ),
  por_origem AS (
    SELECT origem AS sprint_origem, MAX(age) AS age_sprints, COUNT(*) AS n
    FROM em_teste
    WHERE origem ~ '^S[0-9]+-[0-9]{4}$'
    GROUP BY origem
  )
  SELECT jsonb_build_object(
    'sprint_atual', v_cur_sprint,
    'total_qa', (SELECT COUNT(*) FROM fila2),
    'em_teste', (SELECT COUNT(*) FROM fila2 WHERE st = 'em teste'),
    'aguardando_deploy', (SELECT COUNT(*) FROM fila2 WHERE st = 'aguardando deploy'),
    'no_prazo', (SELECT COUNT(*) FROM em_teste WHERE age IS NOT NULL AND age <= 2),
    'atraso', (SELECT COUNT(*) FROM em_teste WHERE age IS NOT NULL AND age > 2),
    'sem_sprint', (SELECT COUNT(*) FROM em_teste WHERE age IS NULL),
    'por_origem', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sprint_origem', sprint_origem,
        'age_sprints', age_sprints,
        'n', n,
        'atraso', (age_sprints > 2)
      ) ORDER BY age_sprints DESC NULLS LAST) FROM por_origem
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_qa_exec_fila_aging() TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_qa_exec_fila_aging() IS
  'META Qualidade: fila QA (total/em teste/aguardando deploy) a partir de vw_qualidade_kpis (inclui Bugs). Aging (no_prazo/atraso/sem_sprint/por_origem) com base = itens Em Teste; origem = first_committed_sprint do lifecycle (extração tolerante) ou sprint_code da view.';

COMMENT ON FUNCTION public.compute_pbi_health_all() IS
  'Recalcula pbi_lifecycle_summary/pbi_health_summary em SQL (fallback do devops-sync-all). first/last_committed_sprint = códigos de sprint extraídos do iteration_history/iteration_path (nunca o evento JSON cru).';
