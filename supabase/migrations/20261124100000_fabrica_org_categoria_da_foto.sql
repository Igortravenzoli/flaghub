-- ════════════════════════════════════════════════════════════════════════════
-- 24/11/2026 — o preenchimento de `fabricas_org` nas fotos seladas usa a
-- CATEGORIA DA FOTO, não a das tags de hoje
--
-- O que deu errado: `rpc_preencher_fabricas_org` (20261123120000) classificava
-- cada item pelas tags ATUAIS. A tag RETORNO QA é posta depois que o item volta
-- do QA — muitas vezes depois que a sprint já foi selada —, então o preenchimento
-- de S14–S20 contou mais Retorno QA (e menos Bug, porque retorno vence bug na
-- classificação) do que a própria foto: na S14, 40 retornos contra 30 da foto.
-- A soma das fábricas deixava de bater com o geral.
--
-- Agora: o item que a foto selou como bug é bug; o que ela selou como retorno é
-- retorno (ids da chave `geral`, gravados desde a SN-7). O resto é classificado
-- pelas tags sem a RETORNO QA e nunca vira bug nem retorno que a foto não tinha
-- (sobra 'priorizacao'). Total, encerrados, Bug e Retorno QA de cada fábrica
-- passam a somar exatamente o geral da foto.
--
-- `p_refazer` (padrão false) regrava `fabricas_org` de uma foto que já tem a
-- chave. Nenhuma outra chave é tocada. As fotos novas (fechamento e série
-- diária) já montam `fabricas_org` das mesmas linhas do geral e não mudam.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.rpc_preencher_fabricas_org(text);

CREATE OR REPLACE FUNCTION public.rpc_preencher_fabricas_org(p_sprint_code text, p_refazer boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  v_ids jsonb;
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
  IF s.category_breakdown ? 'fabricas_org' AND NOT p_refazer THEN
    RETURN jsonb_build_object('status', 'ja_tinha', 'meta', s.category_breakdown->'fabricas_org_meta');
  END IF;

  v_ids := s.category_breakdown->'geral'->'ids';

  SELECT jsonb_agg(jsonb_build_object(
    'work_item_id', u.id::int,
    'cat', CASE
      -- Foto sem ids (anterior à SN-7): não há como saber; tags de hoje.
      WHEN v_ids IS NULL THEN public.fn_classifica_demanda(COALESCE(w.work_item_type, 'Unknown'), COALESCE(w.tags, ''))
      WHEN COALESCE(v_ids->'bug', '[]'::jsonb) @> to_jsonb(u.id::int) THEN 'bug'
      WHEN COALESCE(v_ids->'retorno_qa', '[]'::jsonb) @> to_jsonb(u.id::int) THEN 'retorno_qa'
      ELSE (
        SELECT CASE WHEN c IN ('bug', 'retorno_qa') THEN 'priorizacao' ELSE c END
        FROM public.fn_classifica_demanda(
          COALESCE(w.work_item_type, 'Unknown'),
          regexp_replace(COALESCE(w.tags, ''), '(^|;)\s*retorno\s*(de\s*)?qa\s*(?=;|$)', '\1', 'gi')
        ) AS c
      )
    END,
    'done_at', COALESCE(v_ids->'done', '[]'::jsonb) @> to_jsonb(u.id::int),
    'entregue_at', COALESCE(v_ids->'entregue', '[]'::jsonb) @> to_jsonb(u.id::int)
  ))
  INTO v_linhas
  FROM unnest(s.source_work_item_ids) AS u(id)
  LEFT JOIN public.devops_work_items w ON w.id = u.id;

  v_extra := public.fn_breakdown_fabricas_org(v_linhas, s.sprint_end_date);
  v_extra := jsonb_set(v_extra, '{fabricas_org_meta,preenchido_depois}',
    COALESCE(s.category_breakdown->'fabricas_org_meta'->'preenchido_depois', to_jsonb(now())));
  v_extra := jsonb_set(v_extra, '{fabricas_org_meta,categoria}',
    to_jsonb(CASE WHEN v_ids IS NULL THEN 'tags de hoje' ELSE 'da foto (bug e retorno pelos ids do geral)' END));
  IF p_refazer AND s.category_breakdown ? 'fabricas_org' THEN
    v_extra := jsonb_set(v_extra, '{fabricas_org_meta,refeito}', to_jsonb(now()));
  END IF;

  UPDATE public.sprint_indicator_snapshots
     SET category_breakdown = category_breakdown || v_extra
   WHERE id = s.id;

  RETURN jsonb_build_object('status', CASE WHEN p_refazer THEN 'refeito' ELSE 'preenchido' END,
                            'meta', v_extra->'fabricas_org_meta');
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_preencher_fabricas_org(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_preencher_fabricas_org(text, boolean) TO authenticated, service_role;
