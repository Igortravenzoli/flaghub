-- ============================================================================
-- TIMER FLAG / anti-boicote pelo celular + rastro do dia
--
-- Por quê (16/11/2026): o Timer instalado no celular (PWA) não segura timer
-- sozinho (o SO congela a página e o servidor corta pelo sinal), mas deixa
-- cômodo confirmar a presença de hora em hora sem estar trabalhando.
--
-- 1. Celular só consulta. Pelo User-Agent da requisição (o que o PostgREST
--    recebeu, não o que o app diz): iniciar é recusado; o sinal e a
--    confirmação de presença vindos do celular NÃO estendem o timer (ficam
--    registrados como tentativa). Pausar, encerrar, encurtar e descartar
--    seguem livres: só reduzem tempo.
--    UA dá para disfarçar; disfarçar exige esforço deliberado e o rastro
--    (abaixo) continua valendo.
-- 2. Aparelho no rastro: início e presença registram 'aparelho' (computador
--    ou celular) visto pelo servidor; o resumo do admin conta as tentativas
--    pelo celular.
-- 3. Rastro do dia (timer_admin_rastro): por pessoa e dia, horas do Timer ao
--    lado de commits, PRs e work items mexidos. É INFORMAÇÃO, não veredito:
--    muita atividade legítima não gera commit (reunião, análise, QA). Só é
--    destacado o dia com 6 h ou mais e nenhum rastro, "para conferir".
--
-- Escopo: recria timer_iniciar, timer_sinal e timer_admin_resumo (mesma
-- assinatura de entrada); o resumo ganha duas colunas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. O aparelho da requisição
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.timer__ua()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT left(coalesce(nullif(current_setting('request.headers', true), '')::json->>'user-agent', ''), 400);
$$;

CREATE OR REPLACE FUNCTION public.timer__eh_celular(p_ua text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_ua, '') ~* '(android|iphone|ipad|ipod|mobile|webos|blackberry|opera mini|iemobile|windows phone)';
$$;

REVOKE EXECUTE ON FUNCTION public.timer__ua() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.timer__eh_celular(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Iniciar: recusado no celular
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.timer_iniciar(
  p_work_item_id integer,
  p_titulo       text,
  p_tipo         text,
  p_projeto      text DEFAULT NULL,
  p_cliente      text DEFAULT 'web',
  p_plataforma   text DEFAULT NULL,
  p_versao_app   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    uuid := public.timer__exigir();
  t        public.timer_trechos;
  v_titulo text;
  v_inicios integer;
  v_id     uuid;
BEGIN
  IF public.timer__eh_celular(public.timer__ua()) THEN
    RAISE EXCEPTION 'timer_celular' USING ERRCODE = '42501';
  END IF;
  IF p_work_item_id IS NULL OR p_work_item_id <= 0 THEN
    RAISE EXCEPTION 'timer_item_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('Task', 'Product Backlog Item', 'Bug') THEN
    RAISE EXCEPTION 'timer_tipo_invalido' USING ERRCODE = '22023';
  END IF;
  v_titulo := left(btrim(regexp_replace(coalesce(p_titulo, ''), '[[:cntrl:]]+', ' ', 'g')), 300);
  IF v_titulo = '' THEN v_titulo := '#' || p_work_item_id; END IF;

  PERFORM public.timer__aplicar(v_uid);

  SELECT * INTO t FROM public.timer_trechos WHERE user_id = v_uid AND encerrado_em IS NULL;

  IF t.id IS NOT NULL AND t.work_item_id = p_work_item_id THEN
    UPDATE public.timer_trechos
       SET ultimo_sinal_em = now(), ultima_presenca_em = now(), atualizado_em = now()
     WHERE id = t.id;
    RETURN public.timer__estado(v_uid, 1);
  END IF;

  SELECT count(*) INTO v_inicios FROM public.timer_eventos
   WHERE user_id = v_uid AND evento = 'iniciou' AND criado_em > now() - interval '1 hour';
  IF v_inicios >= 60 THEN
    RAISE EXCEPTION 'timer_muitas_acoes' USING ERRCODE = '53400';
  END IF;

  IF t.id IS NOT NULL THEN
    PERFORM public.timer__fechar(t.id, now(), 'troca_tarefa', '{}'::jsonb);
  END IF;

  IF public.timer__usado_no_dia(v_uid, public.timer__dia(now()), NULL)
     >= (public.timer_regras()->>'dia_max_seg')::numeric THEN
    RAISE EXCEPTION 'timer_limite_dia' USING ERRCODE = '53400';
  END IF;

  INSERT INTO public.timer_trechos (
    user_id, work_item_id, work_item_titulo, work_item_tipo, team_project, cliente, plataforma, versao_app
  ) VALUES (
    v_uid, p_work_item_id, v_titulo, p_tipo, left(nullif(btrim(p_projeto), ''), 100),
    CASE WHEN p_cliente IN ('web','desktop','widget') THEN p_cliente ELSE NULL END,
    CASE WHEN p_plataforma IN ('windows','macos','linux','outra') THEN p_plataforma ELSE NULL END,
    left(p_versao_app, 32)
  ) RETURNING id INTO v_id;

  INSERT INTO public.timer_eventos (user_id, evento, origem, cliente, plataforma, versao_app, entry_id, work_item_id, detalhe)
  SELECT user_id, 'iniciou', 'servidor', cliente, plataforma, versao_app, id, work_item_id,
         jsonb_build_object('tipo', work_item_tipo, 'aparelho', 'computador')
    FROM public.timer_trechos WHERE id = v_id;

  RETURN public.timer__estado(v_uid, 1);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Sinal: do celular não estende (fica a tentativa na trilha)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.timer_sinal(p_presenca boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.timer__exigir();
  t     public.timer_trechos;
BEGIN
  -- As regras valem ANTES do sinal: presença vencida não é ressuscitada.
  PERFORM public.timer__aplicar(v_uid);

  IF public.timer__eh_celular(public.timer__ua()) THEN
    -- Uma linha por 10 min no máximo: a trilha não vira contador de sinal.
    IF NOT EXISTS (
      SELECT 1 FROM public.timer_eventos
       WHERE user_id = v_uid AND evento = 'sinal_celular_recusado' AND criado_em > now() - interval '10 minutes'
    ) OR p_presenca THEN
      INSERT INTO public.timer_eventos (user_id, evento, origem, detalhe)
      VALUES (v_uid, 'sinal_celular_recusado', 'servidor',
              jsonb_build_object('presenca', p_presenca, 'aparelho', 'celular'));
    END IF;
    RETURN public.timer__estado(v_uid, 1) || jsonb_build_object('somente_consulta', true);
  END IF;

  UPDATE public.timer_trechos
     SET ultimo_sinal_em    = now(),
         ultima_presenca_em = CASE WHEN p_presenca THEN now() ELSE ultima_presenca_em END,
         atualizado_em      = now()
   WHERE user_id = v_uid AND encerrado_em IS NULL
  RETURNING * INTO t;

  IF t.id IS NOT NULL AND p_presenca THEN
    INSERT INTO public.timer_eventos (user_id, evento, origem, cliente, plataforma, versao_app, entry_id, work_item_id, detalhe)
    VALUES (v_uid, 'confirmou_presenca', 'servidor', t.cliente, t.plataforma, t.versao_app, t.id, t.work_item_id,
            jsonb_build_object('aparelho', 'computador'));
  END IF;

  RETURN public.timer__estado(v_uid, 1);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Rastro do dia (admin)
-- ---------------------------------------------------------------------------
-- Por pessoa e dia (fuso de São Paulo): horas do Timer e o que a pessoa
-- deixou no Azure DevOps. Fontes, todas do espelho que o FlagHub já tem:
--   • commits (devops_git_commits.author_email)
--   • PRs abertos ou fechados (devops_git_pull_requests.created_by_email)
--   • work items atribuídos a ela, ou em que o Timer marcou hora, alterados
--     no dia (devops_work_items.changed_date) — o espelho cobre as queries
--     cadastradas, não o DevOps inteiro.
CREATE OR REPLACE FUNCTION public.timer_admin_rastro(p_dias integer DEFAULT 14)
RETURNS TABLE (
  user_id        uuid,
  email          text,
  devops_display text,
  dia            date,
  horas          numeric,
  commits        integer,
  prs            integer,
  itens_mexidos  integer,
  para_conferir  boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_dias  integer := least(greatest(coalesce(p_dias, 14), 1), 60);
  v_desde date := public.timer__dia(now()) - (least(greatest(coalesce(p_dias, 14), 1), 60) - 1);
BEGIN
  IF NOT public.hub_is_admin() THEN
    RAISE EXCEPTION 'apenas_admin' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH pessoas AS (
    SELECT a.user_id, a.email, a.devops_display,
           lower(coalesce(a.devops_email, a.email)) AS mail
      FROM public.timer_access a
  ),
  horas_dia AS (
    SELECT t.user_id, public.timer__dia(t.iniciado_em) AS dia,
           sum(extract(epoch FROM (t.encerrado_em - t.iniciado_em))) / 3600.0 AS horas,
           array_agg(DISTINCT t.work_item_id) AS itens
      FROM public.timer_trechos t
     WHERE t.encerrado_em IS NOT NULL AND NOT t.descartado
       AND t.iniciado_em >= public.timer__inicio_dia(v_desde)
     GROUP BY 1, 2
  )
  SELECT p.user_id, p.email, p.devops_display, h.dia,
         round(h.horas, 2),
         (SELECT count(*) FROM public.devops_git_commits c
           WHERE lower(c.author_email) = p.mail
             AND public.timer__dia(c.author_date) = h.dia)::integer,
         (SELECT count(*) FROM public.devops_git_pull_requests r
           WHERE lower(r.created_by_email) = p.mail
             AND (public.timer__dia(r.creation_date) = h.dia OR public.timer__dia(r.closed_date) = h.dia))::integer,
         (SELECT count(*) FROM public.devops_work_items w
           WHERE public.timer__dia(w.changed_date) = h.dia
             AND (lower(w.assigned_to_unique) = p.mail OR w.id = ANY (h.itens)))::integer,
         false
    FROM horas_dia h
    JOIN pessoas p ON p.user_id = h.user_id
   ORDER BY h.dia DESC, p.email;
END;
$$;

-- para_conferir é calculado fora do SELECT para a regra ficar num lugar só
CREATE OR REPLACE FUNCTION public.timer_admin_rastro_conferir(p_dias integer DEFAULT 14)
RETURNS TABLE (
  user_id        uuid,
  email          text,
  devops_display text,
  dia            date,
  horas          numeric,
  commits        integer,
  prs            integer,
  itens_mexidos  integer,
  para_conferir  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.user_id, r.email, r.devops_display, r.dia, r.horas, r.commits, r.prs, r.itens_mexidos,
         (r.horas >= 6 AND r.commits = 0 AND r.prs = 0 AND r.itens_mexidos = 0)
    FROM public.timer_admin_rastro(p_dias) r;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_admin_rastro(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_admin_rastro(integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.timer_admin_rastro_conferir(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_admin_rastro_conferir(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Resumo do admin: + tentativas pelo celular e dias para conferir
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.timer_admin_resumo(integer);

CREATE FUNCTION public.timer_admin_resumo(p_dias integer DEFAULT 14)
RETURNS TABLE (
  user_id               uuid,
  email                 text,
  devops_display        text,
  status                text,
  horas                 numeric,
  dias_com_uso          integer,
  trechos               integer,
  maior_trecho_min      integer,
  dias_acima_10h        integer,
  auto_sem_sinal        integer,
  auto_sem_confirmacao  integer,
  auto_limite_trecho    integer,
  auto_limite_dia       integer,
  pausas_relatadas      integer,
  presencas_confirmadas integer,
  tentativas_celular    integer,
  correcoes             integer,
  descartes             integer,
  dias_para_conferir    integer,
  ultimo_uso            timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_dias  integer := least(greatest(coalesce(p_dias, 14), 1), 90);
  v_desde timestamptz := now() - make_interval(days => least(greatest(coalesce(p_dias, 14), 1), 90));
BEGIN
  IF NOT public.hub_is_admin() THEN
    RAISE EXCEPTION 'apenas_admin' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH tr AS (
    SELECT t.user_id,
           public.timer__dia(t.iniciado_em) AS dia,
           extract(epoch FROM (t.encerrado_em - t.iniciado_em)) AS seg,
           t.motivo_fim
      FROM public.timer_trechos t
     WHERE t.encerrado_em IS NOT NULL AND NOT t.descartado AND t.iniciado_em >= v_desde
  ),
  por_dia AS (
    SELECT tr.user_id, tr.dia, sum(tr.seg) AS seg FROM tr GROUP BY 1, 2
  ),
  ev AS (
    SELECT e.user_id,
           count(*) FILTER (WHERE e.evento = 'pausou_relato')          AS relatadas,
           count(*) FILTER (WHERE e.evento = 'confirmou_presenca')     AS presencas,
           count(*) FILTER (WHERE e.evento = 'sinal_celular_recusado') AS celular,
           count(*) FILTER (WHERE e.evento = 'corrigiu')               AS correcoes,
           count(*) FILTER (WHERE e.evento = 'descartou')              AS descartes,
           max(e.criado_em)                                            AS ultimo
      FROM public.timer_eventos e
     WHERE e.criado_em >= v_desde
     GROUP BY e.user_id
  ),
  conferir AS (
    SELECT r.user_id, count(*) AS n
      FROM public.timer_admin_rastro_conferir(least(v_dias, 60)) r
     WHERE r.para_conferir
     GROUP BY r.user_id
  )
  SELECT a.user_id, a.email, a.devops_display, a.status,
         round(coalesce((SELECT sum(seg) FROM tr WHERE tr.user_id = a.user_id), 0) / 3600.0, 2),
         coalesce((SELECT count(*) FROM por_dia d WHERE d.user_id = a.user_id), 0)::integer,
         coalesce((SELECT count(*) FROM tr WHERE tr.user_id = a.user_id), 0)::integer,
         coalesce((SELECT round(max(seg) / 60) FROM tr WHERE tr.user_id = a.user_id), 0)::integer,
         coalesce((SELECT count(*) FROM por_dia d WHERE d.user_id = a.user_id AND d.seg > 36000), 0)::integer,
         coalesce((SELECT count(*) FROM tr WHERE tr.user_id = a.user_id AND tr.motivo_fim = 'sem_sinal'), 0)::integer,
         coalesce((SELECT count(*) FROM tr WHERE tr.user_id = a.user_id AND tr.motivo_fim = 'sem_confirmacao'), 0)::integer,
         coalesce((SELECT count(*) FROM tr WHERE tr.user_id = a.user_id AND tr.motivo_fim = 'limite_trecho'), 0)::integer,
         coalesce((SELECT count(*) FROM tr WHERE tr.user_id = a.user_id AND tr.motivo_fim = 'limite_dia'), 0)::integer,
         coalesce(ev.relatadas, 0)::integer,
         coalesce(ev.presencas, 0)::integer,
         coalesce(ev.celular, 0)::integer,
         coalesce(ev.correcoes, 0)::integer,
         coalesce(ev.descartes, 0)::integer,
         coalesce(cf.n, 0)::integer,
         ev.ultimo
    FROM public.timer_access a
    LEFT JOIN ev ON ev.user_id = a.user_id
    LEFT JOIN conferir cf ON cf.user_id = a.user_id
   ORDER BY ev.ultimo DESC NULLS LAST, a.email;
END;
$$;

COMMENT ON FUNCTION public.timer_admin_resumo(integer) IS
  'Admin: uso do Timer por pessoa nos últimos N dias (máx. 90): cortes automáticos, correções, tentativas pelo celular e dias para conferir (6 h ou mais sem rastro no DevOps).';

REVOKE EXECUTE ON FUNCTION public.timer_admin_resumo(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_admin_resumo(integer) TO authenticated;
