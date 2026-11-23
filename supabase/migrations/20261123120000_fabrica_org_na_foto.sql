-- ════════════════════════════════════════════════════════════════════════════
-- F2 (23/11/2026) — fábrica do ITEM pela pessoa, na foto selada e na série diária
--
-- Regra de 22/11/2026 (Igor): a hora é da fábrica da PESSOA (organograma); onde
-- ela foi lançada no DevOps é marca, não conta. A entrega segue a mesma régua:
--   1. a fábrica de ENTREGA que mais lançou hora no item (o PBI/Bug e as tasks
--      filhas), com a hora indo pela pessoa como em `repartirHoraPorPessoa`
--      (src/lib/fabricaRoster.ts): casa da pessoa que mora no destino do item;
--      senão, rateio pelo % de alocação. Hora de área de apoio não decide.
--   2. sem hora de fábrica: a área do time / Épico do item (se cair em duas
--      fábricas, como a área ERP, desempata a casa do responsável);
--   3. sem destino: a casa principal do responsável, se for fábrica de entrega;
--   4. senão, 'Sem fábrica'.
-- Só fábrica de ENTREGA do organograma atual recebe item: área de apoio e squad
-- do formato anterior (K8, FLEXX) nunca — o Épico [FLEXX] não dá item à FLEXX.
-- A chave antiga `fabricas` (Épico raiz) continua igual: foto é imutável e as
-- telas leem as duas. Sem backfill automático.
-- ════════════════════════════════════════════════════════════════════════════

-- Espelho de src/lib/fabricaOrganograma.ts (FABRICAS). Um teste do front lê ESTA
-- função na migration mais recente que a define e exige igualdade com o TS.
CREATE OR REPLACE FUNCTION public.fn_fabrica_organograma()
RETURNS TABLE(codigo text, entrega boolean, anterior boolean, ordem integer, area_devops text, epicos_devops text[])
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT * FROM (VALUES
    ('GPS_GO',      true,  false,  0, NULL::text, ARRAY[]::text[]),
    ('APP',         true,  false,  1, NULL,       ARRAY['APP']),
    ('PROMO_SUITE', true,  false,  2, NULL,       ARRAY[]::text[]),
    ('ERP_SUST',    true,  false,  3, 'ERP',      ARRAY[]::text[]),
    ('ERP_EVOL',    true,  false,  4, 'ERP',      ARRAY[]::text[]),
    ('IR',          true,  false,  5, 'IR',       ARRAY[]::text[]),
    ('LAB',         true,  false,  6, 'LAB',      ARRAY['IA']),
    ('STAGING',     true,  false,  7, NULL,       ARRAY['STAGING']),
    ('INFRA',       false, false,  8, NULL,       ARRAY['INFRA']),
    ('QUALIDADE',   false, false,  9, NULL,       ARRAY[]::text[]),
    ('DESIGN',      false, false, 10, NULL,       ARRAY['DESIGN']),
    ('PRODUTOS',    false, false, 11, 'Produto',  ARRAY[]::text[]),
    ('K8',          true,  true,  12, NULL,       ARRAY['K8']),
    ('FLEXX',       true,  true,  13, NULL,       ARRAY['FLEXX'])
  ) AS o(codigo, entrega, anterior, ordem, area_devops, epicos_devops);
$function$;

-- Mesmo casamento de `normName` (front): sem acento, minúsculo, espaços colapsados.
CREATE OR REPLACE FUNCTION public.fn_norm_nome(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT btrim(regexp_replace(
    translate(lower(coalesce(p, '')),
      'áàâãäåéèêëíìîïóòôõöúùûüçñ',
      'aaaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g'));
$function$;

-- Nome limpo do Épico (mesmo `cleanFabricaName`): "[K8] - Squad" → "K8".
CREATE OR REPLACE FUNCTION public.fn_epico_limpo(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    WHEN p ~ '\[[^\]]+\]' THEN upper(btrim(substring(p from '\[([^\]]+)\]')))
    ELSE btrim(regexp_replace(p, '\s*-?\s*squad\s*$', '', 'i'))
  END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_fabrica_org_dos_itens(p_ids integer[], p_ate date)
RETURNS TABLE(work_item_id integer, fabrica text, criterio text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE
  org AS (SELECT * FROM public.fn_fabrica_organograma()),
  itens AS (
    SELECT w.id, w.area_path, w.parent_id, w.assigned_to_display
    FROM public.devops_work_items w
    WHERE w.id = ANY(p_ids)
  ),
  anc AS (
    SELECT i.id AS start_id, p.id, p.parent_id, p.work_item_type, p.title, 1 AS depth
    FROM itens i JOIN public.devops_work_items p ON p.id = i.parent_id
    UNION ALL
    SELECT a.start_id, p.id, p.parent_id, p.work_item_type, p.title, a.depth + 1
    FROM anc a JOIN public.devops_work_items p ON p.id = a.parent_id
    WHERE a.depth < 10
  ),
  epico AS (
    SELECT start_id, public.fn_epico_limpo((array_agg(title ORDER BY depth) FILTER (WHERE work_item_type = 'Epic'))[1]) AS ep
    FROM anc GROUP BY start_id
  ),
  -- Destino do item (mesma ordem de `destinoIdDoItem`): área de time conhecida › Épico conhecido.
  destino AS (
    SELECT i.id,
      COALESCE(
        NULLIF(ARRAY(SELECT o.codigo FROM org o
                     WHERE o.area_devops IS NOT NULL
                       AND o.area_devops = NULLIF(regexp_replace(i.area_path, '^.*\\', ''), i.area_path)
                     ORDER BY o.ordem), '{}'),
        NULLIF(ARRAY(SELECT o.codigo FROM org o WHERE e.ep = ANY(o.epicos_devops) ORDER BY o.ordem), '{}'),
        ARRAY[]::text[]
      ) AS codigos
    FROM itens i LEFT JOIN epico e ON e.start_id = i.id
  ),
  mapa AS (
    SELECT lower(m.timelog_name) AS tl, m.canonical_name FROM public.devops_collaborator_map m
  ),
  roster AS (
    SELECT public.fn_norm_nome(r.colaborador) AS k, r.squad, COALESCE(r.alocacao_pct, 100)::numeric AS pct
    FROM public.fabrica_squad_membership r
    WHERE r.ativo AND r.conta_horas IS DISTINCT FROM false
  ),
  -- Hora no item: o próprio PBI/Bug e as tasks filhas, até a data de corte.
  logs AS (
    SELECT i.id AS item, public.fn_norm_nome(COALESCE(m.canonical_name, t.user_name)) AS k,
           SUM(t.time_minutes)::numeric AS min
    FROM itens i
    JOIN public.devops_work_items x ON x.id = i.id OR x.parent_id = i.id
    JOIN public.v_devops_time_logs_ativos t ON t.work_item_id = x.id AND t.log_date <= p_ate
    LEFT JOIN mapa m ON m.tl = lower(t.user_name)
    GROUP BY 1, 2
  ),
  casas AS (
    SELECT l.item, l.k, l.min, r.squad, r.pct,
           r.squad = ANY(d.codigos) AS daqui,
           bool_or(r.squad = ANY(d.codigos)) OVER (PARTITION BY l.item, l.k) AS tem_daqui
    FROM logs l
    JOIN roster r ON r.k = l.k
    JOIN destino d ON d.id = l.item
  ),
  alvo AS (
    SELECT item, squad, min * pct / SUM(pct) OVER (PARTITION BY item, k) AS m
    FROM casas WHERE daqui OR NOT tem_daqui
  ),
  por_horas AS (
    SELECT DISTINCT ON (h.item) h.item, h.squad
    FROM (SELECT a.item, a.squad, SUM(a.m) AS m
          FROM alvo a JOIN org o ON o.codigo = a.squad AND o.entrega AND NOT o.anterior
          GROUP BY 1, 2) h
    JOIN org o ON o.codigo = h.squad
    WHERE h.m > 0
    ORDER BY h.item, h.m DESC, o.ordem
  ),
  -- Casas do responsável (nome do DevOps → nome canônico → cadastro), só as
  -- que podem receber ITEM: fábrica de entrega do organograma atual. Área de
  -- apoio e squad do formato anterior (K8, FLEXX) servem para a hora ir à casa
  -- certa da pessoa, nunca para dar fábrica a um item.
  resp AS (
    SELECT i.id AS item, r.squad, r.pct, o.ordem
    FROM itens i
    LEFT JOIN mapa m ON m.tl = lower(i.assigned_to_display)
    JOIN roster r ON r.k = public.fn_norm_nome(COALESCE(m.canonical_name, i.assigned_to_display))
    JOIN org o ON o.codigo = r.squad AND o.entrega AND NOT o.anterior
  ),
  por_destino AS (
    SELECT d.id AS item,
      COALESCE(
        (SELECT rp.squad FROM resp rp WHERE rp.item = d.id AND rp.squad = ANY(d.codigos) ORDER BY rp.pct DESC, rp.ordem LIMIT 1),
        (SELECT o.codigo FROM org o WHERE o.codigo = ANY(d.codigos) AND o.entrega AND NOT o.anterior ORDER BY o.ordem LIMIT 1)
      ) AS squad
    FROM destino d
  ),
  por_resp AS (
    SELECT DISTINCT ON (item) item, squad FROM resp ORDER BY item, pct DESC, ordem
  )
  SELECT i.id,
    COALESCE(ph.squad, pd.squad, pr.squad, 'Sem fábrica'),
    CASE WHEN ph.squad IS NOT NULL THEN 'horas'
         WHEN pd.squad IS NOT NULL THEN 'destino'
         WHEN pr.squad IS NOT NULL THEN 'responsavel'
         ELSE 'sem' END
  FROM itens i
  LEFT JOIN por_horas ph ON ph.item = i.id
  LEFT JOIN por_destino pd ON pd.item = i.id
  LEFT JOIN por_resp pr ON pr.item = i.id;
$function$;

-- Payload do breakdown por escopo — o MESMO formato de `fabricas` (escopo →
-- total/cats/entregue/done/ids/priorizado_*). Entrada: [{work_item_id, cat,
-- done_at, entregue_at, escopo}].
CREATE OR REPLACE FUNCTION public.fn_payload_por_escopo(p_linhas jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $function$
  WITH l AS (
    SELECT (x->>'work_item_id')::int AS work_item_id, x->>'cat' AS cat,
           COALESCE((x->>'done_at')::boolean, false) AS done_at,
           COALESCE((x->>'entregue_at')::boolean, false) AS entregue_at,
           x->>'escopo' AS escopo
    FROM jsonb_array_elements(COALESCE(p_linhas, '[]'::jsonb)) x
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
    FROM l GROUP BY escopo
  )
  SELECT COALESCE(jsonb_object_agg(escopo, payload), '{}'::jsonb) FROM agg;
$function$;

-- As duas chaves novas a partir das linhas da foto/série: `fabricas_org` e
-- `fabricas_org_meta` (regra, quantos itens por critério, carimbo do cadastro).
CREATE OR REPLACE FUNCTION public.fn_breakdown_fabricas_org(p_linhas jsonb, p_ate date)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids integer[];
  v_com_escopo jsonb;
  v_criterios jsonb;
BEGIN
  SELECT array_agg((x->>'work_item_id')::int) INTO v_ids FROM jsonb_array_elements(p_linhas) x;

  WITH f AS (SELECT * FROM public.fn_fabrica_org_dos_itens(v_ids, p_ate))
  SELECT
    jsonb_agg(x || jsonb_build_object('escopo', COALESCE(f.fabrica, 'Sem fábrica'))),
    (SELECT jsonb_object_agg(criterio, n) FROM (SELECT criterio, COUNT(*) n FROM f GROUP BY 1) c)
  INTO v_com_escopo, v_criterios
  FROM jsonb_array_elements(p_linhas) x
  LEFT JOIN f ON f.work_item_id = (x->>'work_item_id')::int;

  RETURN jsonb_build_object(
    'fabricas_org', public.fn_payload_por_escopo(v_com_escopo),
    'fabricas_org_meta', jsonb_build_object(
      'regra', 'pessoa-v1 (22/11/2026): horas de fábrica › área/Épico › responsável',
      'horas_ate', p_ate,
      'criterios', COALESCE(v_criterios, '{}'::jsonb),
      'cadastro_em', (SELECT max(updated_at) FROM public.fabrica_squad_membership)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_fabrica_org_dos_itens(integer[], date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_breakdown_fabricas_org(jsonb, date) FROM PUBLIC, anon, authenticated;


-- ── Foto selada: mesma função de produção (22/11/2026) + o bloco F2 ──────────

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


-- ── Série diária: mesma função de produção (22/11/2026) + o bloco F2 ─────────

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
    public.fn_classifica_demanda(COALESCE(w.work_item_type,'Unknown'), COALESCE(w.tags,'')) AS cat,
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


-- Preenche `fabricas_org` numa foto JÁ SELADA, só sob demanda (nenhum cron chama).
-- Não toca em nenhuma chave existente: só acrescenta as duas novas, com
-- `preenchido_depois` no meta. Estado (done/entregue) vem dos ids da própria foto;
-- a categoria, das tags atuais (a mesma fonte que a foto usou ao ser feita).
CREATE OR REPLACE FUNCTION public.rpc_preencher_fabricas_org(p_sprint_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  v_linhas jsonb;
  v_extra jsonb;
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

  SELECT * INTO s FROM public.sprint_indicator_snapshots
  WHERE sprint_code = p_sprint_code
  ORDER BY snapshot_datetime DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sem foto para %', p_sprint_code;
  END IF;
  IF s.category_breakdown ? 'fabricas_org' THEN
    RETURN jsonb_build_object('status', 'ja_tinha', 'meta', s.category_breakdown->'fabricas_org_meta');
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'work_item_id', u.id::int,
    'cat', public.fn_classifica_demanda(COALESCE(w.work_item_type, 'Unknown'), COALESCE(w.tags, '')),
    'done_at', COALESCE(s.category_breakdown->'geral'->'ids'->'done', '[]'::jsonb) @> to_jsonb(u.id::int),
    'entregue_at', COALESCE(s.category_breakdown->'geral'->'ids'->'entregue', '[]'::jsonb) @> to_jsonb(u.id::int)
  ))
  INTO v_linhas
  FROM unnest(s.source_work_item_ids) AS u(id)
  LEFT JOIN public.devops_work_items w ON w.id = u.id;

  v_extra := public.fn_breakdown_fabricas_org(v_linhas, s.sprint_end_date);
  v_extra := jsonb_set(v_extra, '{fabricas_org_meta,preenchido_depois}', to_jsonb(now()));

  UPDATE public.sprint_indicator_snapshots
     SET category_breakdown = category_breakdown || v_extra
   WHERE id = s.id;

  RETURN jsonb_build_object('status', 'preenchido', 'meta', v_extra->'fabricas_org_meta');
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_preencher_fabricas_org(text) FROM PUBLIC, anon;
