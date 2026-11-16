-- ============================================================================
-- TIMER FLAG / demandas abertas, lançar sem encerrar, lançamento das 23:50
--
-- Pedido do Igor (16/11/2026):
--   • "Em espera" = o que foi iniciado e NÃO foi encerrado. Até aqui era só o
--     tempo ainda não lançado; agora existe a DEMANDA: nasce ao iniciar um
--     item, fica aberta até a pessoa clicar em Encerrar. Lançar horas não
--     encerra.
--   • Lançar horas de tarefa em andamento sem encerrar: timer_partir corta o
--     trecho rodando AGORA (motivo 'parcial') e abre a continuação no mesmo
--     instante; o pedaço fechado pode ser lançado e o relógio segue.
--   • Lançamento automático às 23:50 (São Paulo): o job parte os timers
--     rodando e a edge lança o que estiver pendente no dia, para nada ficar
--     sem lançar na virada.
--   • Editar o texto de uma anotação.
--
-- Escopo: recria timer_iniciar (+ demanda), timer__fechar (+ 'parcial') e
-- timer__estado (+ demandas). Aditivo no resto.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Motivo 'parcial'
-- ---------------------------------------------------------------------------
ALTER TABLE public.timer_trechos DROP CONSTRAINT IF EXISTS timer_trechos_motivo_lista;
ALTER TABLE public.timer_trechos ADD CONSTRAINT timer_trechos_motivo_lista CHECK (motivo_fim IS NULL OR motivo_fim IN (
  'manual', 'troca_tarefa', 'sem_sinal', 'sem_confirmacao', 'limite_trecho', 'limite_dia',
  'meia_noite', 'suspensao', 'bloqueio', 'ocioso', 'acesso_revogado', 'parcial'
));

CREATE OR REPLACE FUNCTION public.timer__fechar(p_id uuid, p_fim timestamptz, p_motivo text, p_detalhe jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t public.timer_trechos;
BEGIN
  UPDATE public.timer_trechos
     SET encerrado_em          = greatest(iniciado_em, least(coalesce(p_fim, now()), now())),
         encerrado_original_em = greatest(iniciado_em, least(coalesce(p_fim, now()), now())),
         motivo_fim            = p_motivo,
         descartado            = (greatest(iniciado_em, least(coalesce(p_fim, now()), now())) = iniciado_em),
         atualizado_em         = now()
   WHERE id = p_id
     AND encerrado_em IS NULL
  RETURNING * INTO t;

  IF t.id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.timer_eventos (user_id, evento, origem, cliente, plataforma, versao_app, entry_id, work_item_id, detalhe)
  VALUES (
    t.user_id,
    CASE p_motivo
      WHEN 'manual' THEN 'pausou'
      WHEN 'troca_tarefa' THEN 'trocou_tarefa'
      WHEN 'suspensao' THEN 'pausou_relato'
      WHEN 'bloqueio' THEN 'pausou_relato'
      WHEN 'ocioso' THEN 'pausou_relato'
      WHEN 'parcial' THEN 'partiu'
      ELSE 'auto_pausa'
    END,
    'servidor', t.cliente, t.plataforma, t.versao_app, t.id, t.work_item_id,
    jsonb_build_object(
      'motivo', p_motivo,
      'duracao_seg', round(extract(epoch FROM (t.encerrado_em - t.iniciado_em))),
      'descontado_seg', greatest(0, round(extract(epoch FROM (now() - t.encerrado_em))))
    ) || coalesce(p_detalhe, '{}'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer__fechar(uuid, timestamptz, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Demandas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timer_demandas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_item_id        integer NOT NULL,
  titulo              text NOT NULL,
  tipo                text NOT NULL,
  projeto             text NULL,
  aberta_em           timestamptz NOT NULL DEFAULT now(),
  ultima_atividade_em timestamptz NOT NULL DEFAULT now(),
  encerrada_em        timestamptz NULL,

  CONSTRAINT timer_demandas_item_check   CHECK (work_item_id > 0),
  CONSTRAINT timer_demandas_titulo_check CHECK (length(titulo) BETWEEN 1 AND 300)
);

COMMENT ON TABLE public.timer_demandas IS
  'Demanda do Timer: nasce ao iniciar um item e fica aberta até a pessoa encerrar. Em espera = aberta e não rodando. Lançar horas não encerra.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_timer_demandas_aberta
  ON public.timer_demandas (user_id, work_item_id) WHERE encerrada_em IS NULL;

ALTER TABLE public.timer_demandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_demandas FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.timer_demandas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.timer_demandas TO authenticated;

DROP POLICY IF EXISTS timer_demandas_select_propria ON public.timer_demandas;
CREATE POLICY timer_demandas_select_propria ON public.timer_demandas
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.timer__demanda_tocar(p_user uuid, p_item integer, p_titulo text, p_tipo text, p_projeto text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.timer_demandas (user_id, work_item_id, titulo, tipo, projeto)
  VALUES (p_user, p_item, p_titulo, p_tipo, p_projeto)
  ON CONFLICT (user_id, work_item_id) WHERE encerrada_em IS NULL
  DO UPDATE SET ultima_atividade_em = now(), titulo = EXCLUDED.titulo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer__demanda_tocar(uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated;

-- Quem já tem tempo pendente nos últimos 7 dias ganha a demanda aberta.
INSERT INTO public.timer_demandas (user_id, work_item_id, titulo, tipo, projeto, aberta_em, ultima_atividade_em)
SELECT DISTINCT ON (t.user_id, t.work_item_id)
       t.user_id, t.work_item_id, t.work_item_titulo, t.work_item_tipo, t.team_project, t.iniciado_em, t.iniciado_em
  FROM public.timer_trechos t
 WHERE NOT t.descartado
   AND (t.encerrado_em IS NULL OR t.lancamento_id IS NULL)
   AND t.iniciado_em > now() - interval '7 days'
 ORDER BY t.user_id, t.work_item_id, t.iniciado_em DESC
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Iniciar: abre (ou toca) a demanda
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
    PERFORM public.timer__demanda_tocar(v_uid, p_work_item_id, v_titulo, p_tipo, left(nullif(btrim(p_projeto), ''), 100));
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

  PERFORM public.timer__demanda_tocar(v_uid, p_work_item_id, v_titulo, p_tipo, left(nullif(btrim(p_projeto), ''), 100));

  INSERT INTO public.timer_eventos (user_id, evento, origem, cliente, plataforma, versao_app, entry_id, work_item_id, detalhe)
  SELECT user_id, 'iniciou', 'servidor', cliente, plataforma, versao_app, id, work_item_id,
         jsonb_build_object('tipo', work_item_tipo, 'aparelho', 'computador')
    FROM public.timer_trechos WHERE id = v_id;

  RETURN public.timer__estado(v_uid, 1);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Partir o trecho rodando (lançar sem encerrar)
-- ---------------------------------------------------------------------------
-- Fecha o trecho rodando AGORA com motivo 'parcial' e abre a continuação no
-- mesmo instante, com o mesmo sinal e a mesma presença: o relógio da pessoa
-- não para e o pedaço fechado pode ser lançado.
CREATE OR REPLACE FUNCTION public.timer__partir(p_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t     public.timer_trechos;
  v_id  uuid;
BEGIN
  PERFORM public.timer__aplicar(p_user);
  SELECT * INTO t FROM public.timer_trechos WHERE user_id = p_user AND encerrado_em IS NULL;
  IF t.id IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM public.timer__fechar(t.id, now(), 'parcial', '{}'::jsonb);
  INSERT INTO public.timer_trechos (
    user_id, work_item_id, work_item_titulo, work_item_tipo, team_project,
    iniciado_em, ultimo_sinal_em, ultima_presenca_em, continuacao_de, cliente, plataforma, versao_app
  ) VALUES (
    t.user_id, t.work_item_id, t.work_item_titulo, t.work_item_tipo, t.team_project,
    now(), greatest(t.ultimo_sinal_em, now()), t.ultima_presenca_em, t.id, t.cliente, t.plataforma, t.versao_app
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer__partir(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.timer_partir()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.timer__exigir();
BEGIN
  PERFORM public.timer__partir(v_uid);
  RETURN public.timer__estado(v_uid, 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_partir() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_partir() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Encerrar a demanda
-- ---------------------------------------------------------------------------
-- Se o item está rodando, pausa antes. O lançamento das horas é feito pela
-- edge ANTES de chamar isto (Encerrar = lançar + encerrar).
CREATE OR REPLACE FUNCTION public.timer_demanda_encerrar(p_work_item_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.timer__exigir();
  v_id  uuid;
BEGIN
  PERFORM public.timer__aplicar(v_uid);
  SELECT id INTO v_id FROM public.timer_trechos
   WHERE user_id = v_uid AND encerrado_em IS NULL AND work_item_id = p_work_item_id;
  IF v_id IS NOT NULL THEN
    PERFORM public.timer__fechar(v_id, now(), 'manual', '{}'::jsonb);
  END IF;

  UPDATE public.timer_demandas SET encerrada_em = now()
   WHERE user_id = v_uid AND work_item_id = p_work_item_id AND encerrada_em IS NULL;
  IF FOUND THEN
    INSERT INTO public.timer_eventos (user_id, evento, origem, work_item_id)
    VALUES (v_uid, 'encerrou_demanda', 'servidor', p_work_item_id);
  END IF;

  RETURN public.timer__estado(v_uid, 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_demanda_encerrar(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_demanda_encerrar(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Estado: + demandas abertas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.timer__estado(p_user uuid, p_dias integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hoje  date := public.timer__dia(now());
  v_dias  integer := least(greatest(coalesce(p_dias, 1), 1), 7);
  v_desde timestamptz := public.timer__inicio_dia(v_hoje - (v_dias - 1));
BEGIN
  RETURN jsonb_build_object(
    'agora', now(),
    'regras', public.timer_regras(),
    'rodando', (
      SELECT to_jsonb(x) FROM (
        SELECT id, work_item_id, work_item_titulo AS titulo, work_item_tipo AS tipo, team_project AS projeto,
               iniciado_em, ultimo_sinal_em, ultima_presenca_em
        FROM public.timer_trechos
        WHERE user_id = p_user AND encerrado_em IS NULL
      ) x
    ),
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

-- ---------------------------------------------------------------------------
-- 7. Editar anotação
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.timer_anotacao_editar(p_id uuid, p_texto text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid   uuid := public.timer__exigir();
  v_texto text := left(btrim(regexp_replace(coalesce(p_texto, ''), '[[:cntrl:]]+', ' ', 'g')), 200);
BEGIN
  IF v_texto = '' THEN
    RAISE EXCEPTION 'timer_anotacao_vazia' USING ERRCODE = '22023';
  END IF;
  UPDATE public.timer_anotacoes SET texto = v_texto
   WHERE id = p_id AND user_id = v_uid AND fechada_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'timer_anotacao_inexistente' USING ERRCODE = 'P0002';
  END IF;
  RETURN public.timer__anotacoes(v_uid);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_anotacao_editar(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_anotacao_editar(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Lançamento automático das 23:50 (a edge chama com o service role)
-- ---------------------------------------------------------------------------
-- Parte os timers rodando (o pedaço até agora fica fechado) e devolve, por
-- pessoa com conta no DevOps, os itens com tempo pendente no dia. A edge
-- prepara e envia cada um, como no botão Lançar.
CREATE OR REPLACE FUNCTION public.timer_auto_pendencias(p_dia date)
RETURNS TABLE (user_id uuid, work_item_id integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT t.user_id
      FROM public.timer_trechos t
      JOIN public.timer_access a ON a.user_id = t.user_id
     WHERE t.encerrado_em IS NULL AND a.status = 'ativo' AND a.devops_guid IS NOT NULL
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('timer:' || r.user_id::text, 0));
    PERFORM public.timer__partir(r.user_id);
  END LOOP;

  RETURN QUERY
  SELECT DISTINCT t.user_id, t.work_item_id
    FROM public.timer_trechos t
    JOIN public.timer_access a ON a.user_id = t.user_id
   WHERE a.status = 'ativo' AND a.devops_guid IS NOT NULL
     AND t.encerrado_em IS NOT NULL AND NOT t.descartado AND t.lancamento_id IS NULL
     AND t.iniciado_em >= public.timer__inicio_dia(p_dia)
     AND t.iniciado_em <  public.timer__inicio_dia(p_dia + 1)
     AND extract(epoch FROM (t.encerrado_em - t.iniciado_em)) > 0
   ORDER BY 1, 2;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_auto_pendencias(date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_auto_pendencias(date) TO service_role;

-- 23:50 em São Paulo = 02:50 UTC (sem horário de verão desde 2019).
DO $$
DECLARE
  v_base_url text;
  v_anon_key text;
  v_command  text;
BEGIN
  SELECT substring(j.command from '(https://[^''\n]+)/functions/v1/'),
         substring(j.command from 'Bearer ([A-Za-z0-9._-]+)')
    INTO v_base_url, v_anon_key
  FROM cron.job j
  WHERE j.jobname = 'sync-devops-all'
  LIMIT 1;

  IF v_base_url IS NULL OR v_anon_key IS NULL THEN
    RAISE EXCEPTION 'Cron sync-devops-all não encontrado: não dá para derivar URL/anon key do job das 23:50.';
  END IF;

  v_command := format($cmd$
SELECT net.http_post(
  url := %L,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', %L,
    'x-cron-secret', public.get_cron_secret()
  ),
  body := '{"op":"lancar_dia_auto"}'::jsonb
) AS request_id;
$cmd$, v_base_url || '/functions/v1/timer-devops', 'Bearer ' || v_anon_key);

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'timer-lanca-23h50';
  PERFORM cron.schedule('timer-lanca-23h50', '50 2 * * *', v_command);
END;
$$;
