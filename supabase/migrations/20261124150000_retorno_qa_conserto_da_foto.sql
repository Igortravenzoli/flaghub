-- Retorno QA nas fotos já gravadas (24/11/2026, pedido do Igor).
--
-- 1. `fn_retorno_qa_hist(state_history, ate)`: o item saiu de "Em Teste" para
--    um estado anterior (New, Em desenvolvimento, To Do…) até `ate`. É a mesma
--    régua do módulo da Qualidade (`src/lib/qaRework.ts`, QA_ORIGIN_STATES ×
--    DEV_DEST_STATES). A volta para "New" é o processo desde set/2026: voltando
--    para "Em desenvolvimento" o dev se perdia nas PBIs.
--
-- 2. `rpc_retorno_qa_na_foto(sprint, p_historico)`: acerta o Retorno QA de UMA
--    foto gravada sem refazê-la (refazer relê as tags de hoje e apagaria o que a
--    foto registrou na hora). Mexe só nos itens que mudam:
--      • SAI: foto montada mais de 2 dias depois do corte (a S14, montada à mão
--        em 03/08 com corte em 19/07) e item contado pela tag sem volta do teste
--        até o corte, mas com volta depois: a tag foi posta depois do corte.
--      • ENTRA (só com p_historico): item do escopo com volta do teste até o
--        corte e sem a tag na foto.
--    A categoria anterior de quem entra vem dos ids da foto (bug) ou das tags de
--    hoje sem a de retorno (mesma régua do `rpc_preencher_fabricas_org`). Os
--    contadores do `geral` recebem a diferença; `fabricas_org` é refeito pelos
--    ids. A chave antiga `fabricas` (por Épico) não é usada pela tela e fica.
--    Rodar de novo não muda nada (quem entrou já está nos ids).

CREATE OR REPLACE FUNCTION public.fn_retorno_qa_hist(p_hist jsonb, p_ate timestamptz DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_hist) = 'array' THEN p_hist ELSE '[]'::jsonb END) h
    WHERE lower(trim(h->>'oldValue')) IN ('em teste', 'in test', 'testing')
      AND lower(trim(h->>'newValue')) IN ('em desenvolvimento', 'in progress', 'in development', 'to do', 'new',
                                          'committed', 'prioritized', 'active', 'approved')
      AND (p_ate IS NULL OR (h->>'revisedDate')::timestamptz <= p_ate)
  );
$function$;

COMMENT ON FUNCTION public.fn_retorno_qa_hist(jsonb, timestamptz) IS
  'Retorno QA pelo histórico: saiu de "Em Teste" para estado anterior (inclui New) até p_ate (NULL = sem corte). Mesma régua de src/lib/qaRework.ts.';

CREATE OR REPLACE FUNCTION public.fn_soma_payload_categoria(p_base jsonb, p_mais jsonb, p_menos jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT p_base
    || (SELECT jsonb_object_agg(bloco, (
          SELECT jsonb_object_agg(k, COALESCE((p_base->bloco->>k)::int, 0)
                                     + COALESCE((p_mais->bloco->>k)::int, 0)
                                     - COALESCE((p_menos->bloco->>k)::int, 0))
          FROM jsonb_object_keys(p_base->bloco) k))
        FROM unnest(ARRAY['cats', 'entregue', 'done']) bloco
        WHERE jsonb_typeof(p_base->bloco) = 'object')
    || (SELECT jsonb_object_agg(k, COALESCE((p_base->>k)::int, 0)
                                   + COALESCE((p_mais->>k)::int, 0)
                                   - COALESCE((p_menos->>k)::int, 0))
        FROM unnest(ARRAY['priorizado_done', 'priorizado_em_dev']) k
        WHERE p_base ? k);
$function$;

CREATE OR REPLACE FUNCTION public.rpc_retorno_qa_na_foto(p_sprint_code text, p_historico boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  g jsonb;
  v_ret jsonb; v_bug jsonb;
  v_tarde boolean;
  v_antes jsonb; v_depois jsonb;
  v_entra int[]; v_sai int[]; v_sai_bug int[];
  v_meta jsonb;
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

  g := s.category_breakdown->'geral';
  IF g IS NULL OR NOT (g ? 'ids') THEN
    RETURN jsonb_build_object('sprint', p_sprint_code, 'status', 'sem_ids');
  END IF;
  v_ret := COALESCE(g->'ids'->'retorno_qa', '[]'::jsonb);
  v_bug := COALESCE(g->'ids'->'bug', '[]'::jsonb);
  -- snapshot_datetime é timestamp sem fuso, gravado por now() em UTC.
  v_tarde := (s.snapshot_datetime AT TIME ZONE 'UTC') > s.as_of_datetime + interval '2 days';

  WITH it AS (
    SELECT u.id::int AS id,
      v_ret @> to_jsonb(u.id::int) AS ret,
      v_bug @> to_jsonb(u.id::int) AS bug,
      COALESCE(g->'ids'->'done', '[]'::jsonb) @> to_jsonb(u.id::int) AS done_at,
      COALESCE(g->'ids'->'entregue', '[]'::jsonb) @> to_jsonb(u.id::int) AS entregue_at,
      public.fn_retorno_qa_hist(w.state_history, s.as_of_datetime) AS hist,
      public.fn_retorno_qa_hist(w.state_history, NULL) AS hist_alguma,
      public.fn_classifica_demanda(
        COALESCE(w.work_item_type, 'Unknown'),
        regexp_replace(COALESCE(w.tags, ''), '(^|;)\s*retorno\s*(de\s*)?qa\s*(?=;|$)', '\1', 'gi')) AS cat_sem_tag
    FROM unnest(s.source_work_item_ids) AS u(id)
    LEFT JOIN public.devops_work_items w ON w.id = u.id
  ),
  mov AS (
    SELECT it.*,
      CASE
        WHEN ret AND v_tarde AND NOT hist AND hist_alguma THEN 'sai'
        WHEN p_historico AND hist AND NOT ret THEN 'entra'
      END AS mov
    FROM it
  ),
  l AS (
    SELECT mov.*,
      -- categoria na foto hoje
      CASE WHEN mov = 'sai' THEN 'retorno_qa'
           WHEN bug THEN 'bug'
           WHEN cat_sem_tag IN ('bug', 'retorno_qa') THEN 'priorizacao'
           ELSE cat_sem_tag END AS cat_antes,
      -- categoria com o conserto
      CASE WHEN mov = 'entra' THEN 'retorno_qa'
           WHEN cat_sem_tag = 'retorno_qa' THEN 'priorizacao'
           ELSE cat_sem_tag END AS cat_depois
    FROM mov WHERE mov IS NOT NULL
  )
  SELECT
    public.fn_payload_por_escopo(COALESCE(jsonb_agg(jsonb_build_object('work_item_id', id, 'cat', cat_antes, 'done_at', done_at,
                                   'entregue_at', entregue_at, 'escopo', 'x')), '[]'::jsonb))->'x',
    public.fn_payload_por_escopo(COALESCE(jsonb_agg(jsonb_build_object('work_item_id', id, 'cat', cat_depois, 'done_at', done_at,
                                   'entregue_at', entregue_at, 'escopo', 'x')), '[]'::jsonb))->'x',
    COALESCE(array_agg(id) FILTER (WHERE mov = 'entra'), '{}'),
    COALESCE(array_agg(id) FILTER (WHERE mov = 'sai'), '{}'),
    COALESCE(array_agg(id) FILTER (WHERE mov = 'sai' AND cat_depois = 'bug'), '{}')
  INTO v_antes, v_depois, v_entra, v_sai, v_sai_bug
  FROM l;

  v_meta := jsonb_build_object(
    'regra', 'tag na foto OU saída de "Em Teste" para estado anterior até o corte (24/11/2026)',
    'historico', p_historico,
    'entraram', COALESCE(s.category_breakdown->'retorno_qa_meta'->'entraram', '[]'::jsonb) || to_jsonb(v_entra),
    'sairam', COALESCE(s.category_breakdown->'retorno_qa_meta'->'sairam', '[]'::jsonb) || to_jsonb(v_sai),
    'em', now());

  IF cardinality(v_entra) = 0 AND cardinality(v_sai) = 0 THEN
    RETURN jsonb_build_object('sprint', p_sprint_code, 'status', 'sem_mudanca');
  END IF;

  v_meta := v_meta || jsonb_build_object('retorno_antes', (g->'cats'->>'retorno_qa')::int);
  g := public.fn_soma_payload_categoria(g, v_depois, v_antes);
  g := jsonb_set(g, '{ids,retorno_qa}',
    COALESCE((SELECT jsonb_agg(x ORDER BY ord) FROM jsonb_array_elements(v_ret) WITH ORDINALITY e(x, ord)
              WHERE NOT ((x #>> '{}')::int = ANY (v_sai))), '[]'::jsonb) || to_jsonb(v_entra));
  g := jsonb_set(g, '{ids,bug}',
    COALESCE((SELECT jsonb_agg(x ORDER BY ord) FROM jsonb_array_elements(v_bug) WITH ORDINALITY e(x, ord)
              WHERE NOT ((x #>> '{}')::int = ANY (v_entra))), '[]'::jsonb) || to_jsonb(v_sai_bug));

  UPDATE public.sprint_indicator_snapshots
     SET category_breakdown = jsonb_set(category_breakdown, '{geral}', g) || jsonb_build_object('retorno_qa_meta', v_meta)
   WHERE id = s.id;

  PERFORM public.rpc_preencher_fabricas_org(p_sprint_code, true);

  RETURN jsonb_build_object('sprint', p_sprint_code, 'status', 'acertado',
                            'entraram', to_jsonb(v_entra), 'sairam', to_jsonb(v_sai),
                            'retorno_antes', v_meta->'retorno_antes',
                            'retorno_qa', (g->'cats'->>'retorno_qa')::int);
END;
$function$;

COMMENT ON FUNCTION public.rpc_retorno_qa_na_foto(text, boolean) IS
  'Acerta o Retorno QA de uma foto gravada: tira a tag posta depois do corte (foto montada tarde) e, com p_historico, soma quem voltou do teste até o corte. Refaz fabricas_org.';

REVOKE ALL ON FUNCTION public.rpc_retorno_qa_na_foto(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_soma_payload_categoria(jsonb, jsonb, jsonb) FROM PUBLIC, anon;
