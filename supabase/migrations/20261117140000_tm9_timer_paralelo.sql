-- ============================================================================
-- TIMER FLAG / atividades em paralelo
--
-- Pedido do Igor (17/11/2026): "quero que permita multi atividades em
-- paralelo — estou atuando em outra demanda enquanto outra roda". Decisão
-- dele sobre a hora sobreposta: CONTA INTEIRA EM CADA tarefa (1 h de relógio
-- com duas rodando = 1 h em cada no TimeLog).
--
-- O que muda:
--   • até timer_regras().paralelo_max timers ao mesmo tempo por pessoa, um por
--     item (o índice único passa de (user_id) para (user_id, work_item_id));
--   • timer_iniciar(…, p_paralelo): false (padrão, o app antigo) = TROCA, como
--     antes; true = o novo roda junto com os que já rodam;
--   • timer_pausar(…, p_work_item_id) e timer_partir(p_work_item_id): com o
--     item, só ele; sem o item (o app antigo, os relatos de suspensão,
--     bloqueio e ociosidade, o job das 23:50), todos;
--   • o teto de 12 h/dia soma os que estão rodando (é teto de hora LANÇADA,
--     coerente com o teto do TimeLog em timer_lancamento_preparar, que não
--     muda); o corte cai primeiro no que atingiria o teto mais cedo;
--   • sinal e presença valem para todos os que rodam (a pessoa é uma só);
--   • timer__estado: 'rodando' segue sendo UM (o mais recente; o app antigo
--     continua funcionando) e ganha 'rodando_todos' (lista).
--
-- Compatível com o app no ar: as assinaturas novas só acrescentam parâmetros
-- com padrão, e sem eles o comportamento é o de hoje.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Regras e índice
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.timer_regras()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'sinal_seg',               300,    -- o app manda sinal a cada 5 min
    'sem_sinal_seg',           900,    -- 15 min sem sinal: fecha no último sinal
    'presenca_seg',            3600,   -- pergunta de presença a cada 60 min
    'presenca_tolerancia_seg', 600,    -- 10 min para responder
    'trecho_max_seg',          14400,  -- 4 h por trecho
    'dia_max_seg',             43200,  -- 12 h por dia (somando os paralelos)
    'paralelo_max',            3,      -- timers rodando ao mesmo tempo
    'fuso',                    'America/Sao_Paulo'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.timer_regras() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_regras() TO authenticated;

-- um timer rodando por pessoa E ITEM
CREATE UNIQUE INDEX IF NOT EXISTS uq_timer_trechos_rodando_item
  ON public.timer_trechos (user_id, work_item_id) WHERE encerrado_em IS NULL;
DROP INDEX IF EXISTS public.uq_timer_trechos_rodando;

-- ---------------------------------------------------------------------------
-- 2. Internas
-- ---------------------------------------------------------------------------

-- Segundos dos trechos que ESTÃO rodando no dia, contados até p_agora (sem o
-- p_exceto). Trecho rodando sempre começa no dia (a virada parte o trecho).
-- Cada um conta só até o próprio corte já vencido (sem sinal, sem presença,
-- 4 h, virada): um paralelo abandonado não come o teto de quem trabalha.
CREATE OR REPLACE FUNCTION public.timer__rodando_no_dia(p_user uuid, p_dia date, p_exceto uuid, p_agora timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH r AS (SELECT public.timer_regras() AS j)
  SELECT coalesce(sum(greatest(0, extract(epoch FROM (
           least(
             p_agora,
             public.timer__inicio_dia(p_dia + 1),
             t.iniciado_em + make_interval(secs => (r.j->>'trecho_max_seg')::int),
             CASE WHEN p_agora > t.ultimo_sinal_em + make_interval(secs => (r.j->>'sem_sinal_seg')::int)
                  THEN t.ultimo_sinal_em END,
             CASE WHEN p_agora > t.ultima_presenca_em
                                 + make_interval(secs => (r.j->>'presenca_seg')::int + (r.j->>'presenca_tolerancia_seg')::int)
                  THEN t.ultima_presenca_em + make_interval(secs => (r.j->>'presenca_seg')::int) END
           ) - t.iniciado_em)))), 0)
  FROM public.timer_trechos t, r
  WHERE t.user_id = p_user
    AND t.encerrado_em IS NULL
    AND t.id IS DISTINCT FROM p_exceto
    AND t.iniciado_em >= public.timer__inicio_dia(p_dia)
    AND t.iniciado_em <  public.timer__inicio_dia(p_dia + 1);
$$;

REVOKE EXECUTE ON FUNCTION public.timer__rodando_no_dia(uuid, date, uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- O corte de um trecho rodando: igual ao da TM3, com o teto do dia
-- descontando também o que os OUTROS trechos rodando já somam até p_agora.
CREATE OR REPLACE FUNCTION public.timer__corte(
  t        public.timer_trechos,
  p_agora  timestamptz,
  OUT corte  timestamptz,
  OUT motivo text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r       jsonb := public.timer_regras();
  v_dia   date;
  v_cand  timestamptz;
  v_resto numeric;
BEGIN
  IF t.id IS NULL OR t.encerrado_em IS NOT NULL THEN
    RETURN;
  END IF;
  v_dia := public.timer__dia(t.iniciado_em);

  -- sinal: 15 min calado → fecha no último sinal
  IF p_agora > t.ultimo_sinal_em + make_interval(secs => (r->>'sem_sinal_seg')::int) THEN
    corte := t.ultimo_sinal_em; motivo := 'sem_sinal';
  END IF;

  -- presença: 60 min sem confirmar + 10 de tolerância → fecha nos 60 min
  IF p_agora > t.ultima_presenca_em
               + make_interval(secs => (r->>'presenca_seg')::int + (r->>'presenca_tolerancia_seg')::int) THEN
    v_cand := t.ultima_presenca_em + make_interval(secs => (r->>'presenca_seg')::int);
    IF corte IS NULL OR v_cand < corte THEN corte := v_cand; motivo := 'sem_confirmacao'; END IF;
  END IF;

  -- 4 h por trecho
  v_cand := t.iniciado_em + make_interval(secs => (r->>'trecho_max_seg')::int);
  IF p_agora >= v_cand AND (corte IS NULL OR v_cand < corte) THEN
    corte := v_cand; motivo := 'limite_trecho';
  END IF;

  -- 12 h por dia, somando os fechados e os outros que rodam
  v_resto := greatest(0, (r->>'dia_max_seg')::numeric
                         - public.timer__usado_no_dia(t.user_id, v_dia, t.id)
                         - public.timer__rodando_no_dia(t.user_id, v_dia, t.id, p_agora));
  v_cand := t.iniciado_em + make_interval(secs => v_resto::double precision);
  IF p_agora >= v_cand AND (corte IS NULL OR v_cand < corte) THEN
    corte := v_cand; motivo := 'limite_dia';
  END IF;

  -- virada do dia
  v_cand := public.timer__inicio_dia(v_dia + 1);
  IF p_agora >= v_cand AND (corte IS NULL OR v_cand < corte) THEN
    corte := v_cand; motivo := 'meia_noite';
  END IF;

  IF corte IS NOT NULL THEN
    corte := greatest(corte, t.iniciado_em);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer__corte(public.timer_trechos, timestamptz) FROM PUBLIC, anon, authenticated;

-- Aplica as regras a TODOS os trechos rodando da pessoa: a cada volta fecha o
-- que tem o corte mais cedo e recalcula (o teto do dia depende dos outros).
-- Na virada do dia abre a continuação. Devolve quantos trechos fechou.
CREATE OR REPLACE FUNCTION public.timer__aplicar(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t        public.timer_trechos;
  v_id     uuid;
  v_corte  timestamptz;
  v_motivo text;
  v_n      integer := 0;
BEGIN
  FOR i IN 1..20 LOOP
    SELECT x.id, c.corte, c.motivo INTO v_id, v_corte, v_motivo
      FROM public.timer_trechos x
      CROSS JOIN LATERAL public.timer__corte(x, now()) c
     WHERE x.user_id = p_user AND x.encerrado_em IS NULL AND c.corte IS NOT NULL
     ORDER BY c.corte, x.iniciado_em
     LIMIT 1;
    EXIT WHEN v_id IS NULL;

    SELECT * INTO t FROM public.timer_trechos WHERE id = v_id;
    PERFORM public.timer__fechar(t.id, v_corte, v_motivo, '{}'::jsonb);
    v_n := v_n + 1;

    IF v_motivo = 'meia_noite' THEN
      INSERT INTO public.timer_trechos (
        user_id, work_item_id, work_item_titulo, work_item_tipo, team_project,
        iniciado_em, ultimo_sinal_em, ultima_presenca_em, continuacao_de,
        cliente, plataforma, versao_app
      ) VALUES (
        t.user_id, t.work_item_id, t.work_item_titulo, t.work_item_tipo, t.team_project,
        v_corte, greatest(t.ultimo_sinal_em, v_corte), t.ultima_presenca_em, t.id,
        t.cliente, t.plataforma, t.versao_app
      );
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer__aplicar(uuid) FROM PUBLIC, anon, authenticated;

-- Os trechos rodando, do mais recente para o mais antigo.
CREATE OR REPLACE FUNCTION public.timer__rodando_json(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.iniciado_em DESC), '[]'::jsonb) FROM (
    SELECT id, work_item_id, work_item_titulo AS titulo, work_item_tipo AS tipo, team_project AS projeto,
           iniciado_em, ultimo_sinal_em, ultima_presenca_em
    FROM public.timer_trechos
    WHERE user_id = p_user AND encerrado_em IS NULL
  ) x;
$$;

REVOKE EXECUTE ON FUNCTION public.timer__rodando_json(uuid) FROM PUBLIC, anon, authenticated;

-- Estado: 'rodando' = o mais recente (compatível); 'rodando_todos' = a lista.
CREATE OR REPLACE FUNCTION public.timer__estado(p_user uuid, p_dias integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hoje    date := public.timer__dia(now());
  v_dias    integer := least(greatest(coalesce(p_dias, 1), 1), 7);
  v_desde   timestamptz := public.timer__inicio_dia(v_hoje - (v_dias - 1));
  v_rodando jsonb := public.timer__rodando_json(p_user);
BEGIN
  RETURN jsonb_build_object(
    'agora', now(),
    'regras', public.timer_regras(),
    'rodando', v_rodando->0,
    'rodando_todos', v_rodando,
    'trechos', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.iniciado_em DESC), '[]'::jsonb) FROM (
        SELECT id, work_item_id, work_item_titulo AS titulo, work_item_tipo AS tipo, team_project AS projeto,
               iniciado_em, encerrado_em, encerrado_original_em, motivo_fim, descartado, lancamento_id
        FROM public.timer_trechos
        WHERE user_id = p_user
          AND encerrado_em IS NOT NULL
          AND iniciado_em >= v_desde
          AND NOT (descartado AND encerrado_em = iniciado_em)
        ORDER BY iniciado_em DESC
        LIMIT 200
      ) x
    ),
    'lancamentos', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.dia DESC, x.criado_em DESC), '[]'::jsonb) FROM (
        SELECT l.id, l.work_item_id, l.work_item_titulo AS titulo, l.dia, l.inicio, l.minutos, l.notas,
               l.status, l.erro, l.tentativas, l.enviado_em, l.criado_em,
               d.time_minutes AS minutos_timelog,
               (d.ext_entry_id IS NOT NULL) AS conferido,
               (o.ext_entry_id IS NOT NULL) AS excluido_na_origem
        FROM public.timer_lancamentos l
        LEFT JOIN LATERAL (
          SELECT dl.ext_entry_id, dl.time_minutes FROM public.devops_time_logs dl
           WHERE dl.ext_entry_id = l.id::text LIMIT 1
        ) d ON true
        LEFT JOIN public.devops_time_log_orphans o ON o.ext_entry_id = l.id::text
        WHERE l.user_id = p_user
          AND l.dia >= v_hoje - (v_dias - 1)
          AND (l.status <> 'cancelado' OR l.atualizado_em > now() - interval '1 day')
        ORDER BY l.dia DESC, l.criado_em DESC
        LIMIT 200
      ) x
    ),
    'demandas', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.ultima_atividade_em DESC), '[]'::jsonb) FROM (
        SELECT id, work_item_id, titulo, tipo, projeto, aberta_em, ultima_atividade_em
        FROM public.timer_demandas
        WHERE user_id = p_user AND encerrada_em IS NULL
        ORDER BY ultima_atividade_em DESC
        LIMIT 50
      ) x
    ),
    'fechado_hoje_seg', round(public.timer__usado_no_dia(p_user, v_hoje, NULL))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer__estado(uuid, integer) FROM PUBLIC, anon, authenticated;

-- Parte (fecha AGORA com 'parcial' e abre a continuação) o trecho rodando do
-- item, ou todos com p_item nulo. Devolve quantos partiu.
DROP FUNCTION IF EXISTS public.timer__partir(uuid);
CREATE FUNCTION public.timer__partir(p_user uuid, p_item integer DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t   public.timer_trechos;
  v_n integer := 0;
BEGIN
  PERFORM public.timer__aplicar(p_user);
  FOR t IN
    SELECT * FROM public.timer_trechos
     WHERE user_id = p_user AND encerrado_em IS NULL
       AND (p_item IS NULL OR work_item_id = p_item)
     ORDER BY iniciado_em
  LOOP
    PERFORM public.timer__fechar(t.id, now(), 'parcial', '{}'::jsonb);
    INSERT INTO public.timer_trechos (
      user_id, work_item_id, work_item_titulo, work_item_tipo, team_project,
      iniciado_em, ultimo_sinal_em, ultima_presenca_em, continuacao_de, cliente, plataforma, versao_app
    ) VALUES (
      t.user_id, t.work_item_id, t.work_item_titulo, t.work_item_tipo, t.team_project,
      now(), greatest(t.ultimo_sinal_em, now()), t.ultima_presenca_em, t.id, t.cliente, t.plataforma, t.versao_app
    );
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer__partir(uuid, integer) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPCs do app
-- ---------------------------------------------------------------------------

-- Iniciar. Mesmo item já rodando: só renova sinal e presença. Senão, com
-- p_paralelo = false fecha os que rodam (troca, como antes); com true, o novo
-- roda junto (até paralelo_max).
DROP FUNCTION IF EXISTS public.timer_iniciar(integer, text, text, text, text, text, text);
CREATE FUNCTION public.timer_iniciar(
  p_work_item_id integer,
  p_titulo       text,
  p_tipo         text,
  p_projeto      text DEFAULT NULL,
  p_cliente      text DEFAULT 'web',
  p_plataforma   text DEFAULT NULL,
  p_versao_app   text DEFAULT NULL,
  p_paralelo     boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     uuid := public.timer__exigir();
  t         public.timer_trechos;
  v_titulo  text;
  v_projeto text := left(nullif(btrim(p_projeto), ''), 100);
  v_inicios integer;
  v_outros  integer;
  v_outro   uuid;
  v_id      uuid;
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

  SELECT * INTO t FROM public.timer_trechos
   WHERE user_id = v_uid AND encerrado_em IS NULL AND work_item_id = p_work_item_id;

  IF t.id IS NOT NULL THEN
    UPDATE public.timer_trechos
       SET ultimo_sinal_em = now(), ultima_presenca_em = now(), atualizado_em = now()
     WHERE id = t.id;
    PERFORM public.timer__demanda_tocar(v_uid, p_work_item_id, v_titulo, p_tipo, v_projeto);
    RETURN public.timer__estado(v_uid, 1);
  END IF;

  SELECT count(*) INTO v_inicios FROM public.timer_eventos
   WHERE user_id = v_uid AND evento = 'iniciou' AND criado_em > now() - interval '1 hour';
  IF v_inicios >= 60 THEN
    RAISE EXCEPTION 'timer_muitas_acoes' USING ERRCODE = '53400';
  END IF;

  IF coalesce(p_paralelo, false) THEN
    SELECT count(*) INTO v_outros FROM public.timer_trechos WHERE user_id = v_uid AND encerrado_em IS NULL;
    IF v_outros >= (public.timer_regras()->>'paralelo_max')::int THEN
      RAISE EXCEPTION 'timer_muitos_paralelos' USING ERRCODE = '53400';
    END IF;
  ELSE
    v_outros := 0;
    FOR v_outro IN SELECT id FROM public.timer_trechos WHERE user_id = v_uid AND encerrado_em IS NULL LOOP
      PERFORM public.timer__fechar(v_outro, now(), 'troca_tarefa', '{}'::jsonb);
    END LOOP;
  END IF;

  IF public.timer__usado_no_dia(v_uid, public.timer__dia(now()), NULL)
     + public.timer__rodando_no_dia(v_uid, public.timer__dia(now()), NULL, now())
     >= (public.timer_regras()->>'dia_max_seg')::numeric THEN
    RAISE EXCEPTION 'timer_limite_dia' USING ERRCODE = '53400';
  END IF;

  INSERT INTO public.timer_trechos (
    user_id, work_item_id, work_item_titulo, work_item_tipo, team_project, cliente, plataforma, versao_app
  ) VALUES (
    v_uid, p_work_item_id, v_titulo, p_tipo, v_projeto,
    CASE WHEN p_cliente IN ('web','desktop','widget') THEN p_cliente ELSE NULL END,
    CASE WHEN p_plataforma IN ('windows','macos','linux','outra') THEN p_plataforma ELSE NULL END,
    left(p_versao_app, 32)
  ) RETURNING id INTO v_id;

  PERFORM public.timer__demanda_tocar(v_uid, p_work_item_id, v_titulo, p_tipo, v_projeto);

  INSERT INTO public.timer_eventos (user_id, evento, origem, cliente, plataforma, versao_app, entry_id, work_item_id, detalhe)
  SELECT user_id, 'iniciou', 'servidor', cliente, plataforma, versao_app, id, work_item_id,
         jsonb_build_object('tipo', work_item_tipo, 'aparelho', 'computador', 'paralelo_com', v_outros)
    FROM public.timer_trechos WHERE id = v_id;

  RETURN public.timer__estado(v_uid, 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_iniciar(integer, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_iniciar(integer, text, text, text, text, text, text, boolean) TO authenticated;

-- Sinal: renova TODOS os que rodam (a pessoa é uma só). Resumo (TM7) com a
-- lista.
CREATE OR REPLACE FUNCTION public.timer_sinal(p_presenca boolean DEFAULT false, p_resumo boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     uuid := public.timer__exigir();
  v_fechou  integer;
  v_n       integer;
  v_rodando jsonb;
BEGIN
  -- As regras valem ANTES do sinal: presença vencida não é ressuscitada.
  v_fechou := public.timer__aplicar(v_uid);

  IF public.timer__eh_celular(public.timer__ua()) THEN
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
   WHERE user_id = v_uid AND encerrado_em IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n > 0 AND p_presenca THEN
    INSERT INTO public.timer_eventos (user_id, evento, origem, cliente, plataforma, versao_app, entry_id, work_item_id, detalhe)
    SELECT v_uid, 'confirmou_presenca', 'servidor', cliente, plataforma, versao_app, id, work_item_id,
           jsonb_build_object('aparelho', 'computador')
      FROM public.timer_trechos WHERE user_id = v_uid AND encerrado_em IS NULL;
  END IF;

  IF p_resumo AND v_fechou = 0 AND v_n > 0 THEN
    v_rodando := public.timer__rodando_json(v_uid);
    RETURN jsonb_build_object('resumo', true, 'agora', now(), 'rodando', v_rodando->0, 'rodando_todos', v_rodando);
  END IF;

  RETURN public.timer__estado(v_uid, 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_sinal(boolean, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_sinal(boolean, boolean) TO authenticated;

-- Pausar o item, ou todos (p_work_item_id nulo: o app antigo e os relatos de
-- suspensão, bloqueio e ociosidade, que valem para a pessoa).
DROP FUNCTION IF EXISTS public.timer_pausar(text, timestamptz);
CREATE FUNCTION public.timer_pausar(
  p_motivo       text DEFAULT 'manual',
  p_fim          timestamptz DEFAULT NULL,
  p_work_item_id integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.timer__exigir();
  v_id  uuid;
BEGIN
  IF p_motivo IS NULL OR p_motivo NOT IN ('manual', 'suspensao', 'bloqueio', 'ocioso', 'sem_confirmacao') THEN
    RAISE EXCEPTION 'timer_motivo_invalido' USING ERRCODE = '22023';
  END IF;

  PERFORM public.timer__aplicar(v_uid);

  FOR v_id IN
    SELECT id FROM public.timer_trechos
     WHERE user_id = v_uid AND encerrado_em IS NULL
       AND (p_work_item_id IS NULL OR work_item_id = p_work_item_id)
  LOOP
    PERFORM public.timer__fechar(v_id, least(coalesce(p_fim, now()), now()), p_motivo,
                                 jsonb_build_object('fim_relatado', p_fim IS NOT NULL));
  END LOOP;

  RETURN public.timer__estado(v_uid, 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_pausar(text, timestamptz, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_pausar(text, timestamptz, integer) TO authenticated;

-- Lançar sem encerrar: parte o item (ou todos, sem o item: o app antigo).
DROP FUNCTION IF EXISTS public.timer_partir();
CREATE FUNCTION public.timer_partir(p_work_item_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.timer__exigir();
BEGIN
  PERFORM public.timer__partir(v_uid, p_work_item_id);
  RETURN public.timer__estado(v_uid, 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_partir(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_partir(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. O job: uma volta por pessoa (não por trecho)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.timer_fechar_abandonados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r    record;
  v_id uuid;
  v_n  integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT t.user_id, a.status
      FROM public.timer_trechos t
      LEFT JOIN public.timer_access a ON a.user_id = t.user_id
     WHERE t.encerrado_em IS NULL
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('timer:' || r.user_id::text, 0));
    IF r.status IS DISTINCT FROM 'ativo' THEN
      FOR v_id IN SELECT id FROM public.timer_trechos WHERE user_id = r.user_id AND encerrado_em IS NULL LOOP
        PERFORM public.timer__fechar(v_id, now(), 'acesso_revogado', '{}'::jsonb);
        v_n := v_n + 1;
      END LOOP;
    ELSE
      v_n := v_n + public.timer__aplicar(r.user_id);
    END IF;
  END LOOP;

  -- só grava se houver envio preso (o UPDATE filtra antes)
  IF EXISTS (SELECT 1 FROM public.timer_lancamentos
              WHERE status = 'enviando' AND atualizado_em < now() - interval '15 minutes') THEN
    v_n := v_n + public.timer__destravar_envios();
  END IF;
  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_fechar_abandonados() FROM PUBLIC, anon, authenticated;
