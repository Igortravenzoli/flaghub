-- ════════════════════════════════════════════════════════════════════════════
-- 24/11/2026 — DE → PARA do formato anterior: a Feature decide a fábrica do item
--
-- Os Épicos [K8] e [FLEXX] não são mais fábrica (F4), mas as Features debaixo
-- deles continuam recebendo item. Sem destino, esses itens iam para a fábrica de
-- quem lançou hora — o Bug 18766 (Feature SWFX) caiu no LAB por 2 h de uma
-- pessoa do LAB. O Igor definiu para onde cada Feature vai (tabela
-- DE-PARA-FORMATO-ANTERIOR.md, 24/11/2026) e que o DE-PARA vem NA FRENTE da hora.
--
-- Régua do item (pessoa-v2), nesta ordem:
--   1. DE-PARA: item debaixo de uma Feature da tabela vai para o PARA dela.
--      PARA com mais de uma fábrica (WMAN, NFEE, WDCS e WDES → as duas ERP) decide
--      entre elas pela hora, depois pelo responsável, depois pela ordem do organograma.
--   2. horas de fábrica de entrega › 3. área/Épico › 4. responsável (como antes).
-- A HORA continua da fábrica da pessoa (regra de 22/11/2026): isto só decide o ITEM.
-- ════════════════════════════════════════════════════════════════════════════

-- A tabela DE-PARA (Feature do DevOps → fábricas). Id da Feature, não o título:
-- o título pode ser editado no DevOps, o id não.
CREATE OR REPLACE FUNCTION public.fn_fabrica_de_para()
RETURNS TABLE(feature_id integer, de text, para text[])
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT * FROM (VALUES
    -- [FLEXX] - Squad
    (10012, '[FLEXX] - WMAN',                  ARRAY['ERP_SUST', 'ERP_EVOL']),
    (10015, '[FLEXXSPEED] - NFEE',             ARRAY['ERP_SUST', 'ERP_EVOL']),
    (10011, '[FLEXXDECISION] - WDCS',          ARRAY['ERP_SUST', 'ERP_EVOL']),
    (15635, '[VDESK] - WDES',                  ARRAY['ERP_SUST', 'ERP_EVOL']),
    (10014, '[FLEXXQUICKONE] - QUCK',          ARRAY['ERP_SUST']),
    ( 9993, '[FLEXXFRENTELOA] - WFES',         ARRAY['ERP_SUST']),
    (10016, '[SMARTSALES] - SMSL',             ARRAY['ERP_SUST']),
    (10013, '[FLEXXQUICKONEDACT] - QUCT',      ARRAY['ERP_SUST']),
    -- [K8] - Squad
    (10001, '[CONNECTMERCHAN] - MRCH',         ARRAY['PROMO_SUITE']),
    (10004, '[SUITEFLEXX] - SWFX',             ARRAY['PROMO_SUITE']),
    (10003, '[FLEXXPROMO] - FLXP',             ARRAY['PROMO_SUITE']),
    (10005, '[POWERBI] - PBII',                ARRAY['PROMO_SUITE']),
    (10000, '[FLEXXPOWERBI] - PFWE',           ARRAY['PROMO_SUITE']),
    (13509, '[SUITEFLEXX] - NOVODECISION',     ARRAY['IR'])
  ) AS t(feature_id, de, para);
$function$;

REVOKE ALL ON FUNCTION public.fn_fabrica_de_para() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_fabrica_org_dos_itens(p_ids integer[], p_ate date)
 RETURNS TABLE(work_item_id integer, fabrica text, criterio text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
  -- DE-PARA: a Feature da tabela mais próxima subindo pelos pais.
  de_para AS (
    SELECT DISTINCT ON (a.start_id) a.start_id, d.para
    FROM anc a JOIN public.fn_fabrica_de_para() d ON d.feature_id = a.id
    ORDER BY a.start_id, a.depth
  ),
  -- Destino do item: DE-PARA › área de time conhecida › Épico conhecido.
  destino AS (
    SELECT i.id,
      COALESCE(
        NULLIF(dp.para, '{}'),
        NULLIF(ARRAY(SELECT o.codigo FROM org o
                     WHERE o.area_devops IS NOT NULL
                       AND o.area_devops = NULLIF(regexp_replace(i.area_path, '^.*\\', ''), i.area_path)
                     ORDER BY o.ordem), '{}'),
        NULLIF(ARRAY(SELECT o.codigo FROM org o WHERE e.ep = ANY(o.epicos_devops) ORDER BY o.ordem), '{}'),
        ARRAY[]::text[]
      ) AS codigos,
      dp.para IS NOT NULL AS tem_de_para
    FROM itens i
    LEFT JOIN epico e ON e.start_id = i.id
    LEFT JOIN de_para dp ON dp.start_id = i.id
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
  horas_fab AS (
    SELECT a.item, a.squad, SUM(a.m) AS m, o.ordem
    FROM alvo a JOIN org o ON o.codigo = a.squad AND o.entrega AND NOT o.anterior
    GROUP BY a.item, a.squad, o.ordem
  ),
  por_horas AS (
    SELECT DISTINCT ON (h.item) h.item, h.squad
    FROM horas_fab h
    WHERE h.m > 0
    ORDER BY h.item, h.m DESC, h.ordem
  ),
  -- Casas do responsável (nome do DevOps → nome canônico → cadastro), só as
  -- que podem receber ITEM: fábrica de entrega do organograma atual. Área de
  -- apoio serve para a hora ir à casa certa da pessoa, nunca para dar fábrica a um item.
  resp AS (
    SELECT i.id AS item, r.squad, r.pct, o.ordem
    FROM itens i
    LEFT JOIN mapa m ON m.tl = lower(i.assigned_to_display)
    JOIN roster r ON r.k = public.fn_norm_nome(COALESCE(m.canonical_name, i.assigned_to_display))
    JOIN org o ON o.codigo = r.squad AND o.entrega AND NOT o.anterior
  ),
  -- 1. DE-PARA na frente: dentro do PARA, quem mais lançou hora › o responsável › a ordem do organograma.
  por_de_para AS (
    SELECT d.id AS item,
      COALESCE(
        (SELECT h.squad FROM horas_fab h WHERE h.item = d.id AND h.squad = ANY(d.codigos) AND h.m > 0 ORDER BY h.m DESC, h.ordem LIMIT 1),
        (SELECT rp.squad FROM resp rp WHERE rp.item = d.id AND rp.squad = ANY(d.codigos) ORDER BY rp.pct DESC, rp.ordem LIMIT 1),
        (SELECT o.codigo FROM org o WHERE o.codigo = ANY(d.codigos) AND o.entrega AND NOT o.anterior ORDER BY o.ordem LIMIT 1)
      ) AS squad
    FROM destino d WHERE d.tem_de_para
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
    COALESCE(pdp.squad, ph.squad, pd.squad, pr.squad, 'Sem fábrica'),
    CASE WHEN pdp.squad IS NOT NULL THEN 'de_para'
         WHEN ph.squad IS NOT NULL THEN 'horas'
         WHEN pd.squad IS NOT NULL THEN 'destino'
         WHEN pr.squad IS NOT NULL THEN 'responsavel'
         ELSE 'sem' END
  FROM itens i
  LEFT JOIN por_de_para pdp ON pdp.item = i.id
  LEFT JOIN por_horas ph ON ph.item = i.id
  LEFT JOIN por_destino pd ON pd.item = i.id
  LEFT JOIN por_resp pr ON pr.item = i.id;
$function$;

CREATE OR REPLACE FUNCTION public.fn_breakdown_fabricas_org(p_linhas jsonb, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
      'regra', 'pessoa-v2 (24/11/2026): DE-PARA do formato anterior › horas de fábrica › área/Épico › responsável',
      'horas_ate', p_ate,
      'criterios', COALESCE(v_criterios, '{}'::jsonb),
      'cadastro_em', (SELECT max(updated_at) FROM public.fabrica_squad_membership)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_fabrica_org_dos_itens(integer[], date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_breakdown_fabricas_org(jsonb, date) FROM PUBLIC, anon, authenticated;
