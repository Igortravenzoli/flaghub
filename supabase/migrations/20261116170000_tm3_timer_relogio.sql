-- ============================================================================
-- TIMER FLAG / Fase 3 — o relógio e as regras anti-boicote
--
-- Princípio: o SERVIDOR é o relógio. O app só pede "iniciar", "ainda estou
-- aqui" e "pausar"; o início e o fim de cada trecho são carimbados com o now()
-- do banco, e toda correção só pode DIMINUIR o tempo.
--
-- Anti-boicote (impedir timer rodando sem uso), igual no navegador e no app:
--   • sinal      — o app manda um sinal a cada 5 min enquanto roda. Sem sinal
--                  por 15 min, o trecho fecha NO ÚLTIMO SINAL (aba fechada,
--                  máquina desligada, rede caiu: nada a mais é contado).
--   • presença   — a cada 60 min o app pergunta "ainda está nesta tarefa?".
--                  Sem resposta em 10 min, o trecho fecha nos 60 min (o tempo
--                  sem resposta não conta). A regra é do servidor: um app
--                  alterado que nunca pergunte é cortado do mesmo jeito.
--   • 4 h        — nenhum trecho passa de 4 h; para seguir, inicia de novo.
--   • 12 h/dia   — teto do dia (fuso de São Paulo).
--   • meia-noite — o trecho é partido na virada do dia; se a pessoa segue
--                  ativa, continua num trecho novo, já no dia seguinte.
--   • um por vez — só um timer rodando por pessoa (índice único parcial).
--   • relatos do app — suspensão, tela bloqueada, ociosidade: o app pausa
--                  informando quando parou; o servidor só aceita fim ANTERIOR
--                  a agora (desconta, nunca acrescenta).
-- As regras moram em timer_regras(); o app lê de lá (vem no timer_estado).
--
-- Quem fecha o que ninguém fechou: o job pg_cron `timer-fecha-abandonados`
-- (a cada 5 min, só lê o que está rodando e só grava quando corta).
--
-- Trilha: todo início, pausa, auto-pausa, correção e descarte vira linha em
-- timer_eventos com origem 'servidor'.
--
-- Fora daqui (fase 4): lançar na TechsBCN e travar a correção de trecho já
-- lançado.
--
-- Escopo: 100% aditivo. Não altera tabela, view, RPC nem política existente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. As regras
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
    'dia_max_seg',             43200,  -- 12 h por dia
    'fuso',                    'America/Sao_Paulo'
  );
$$;

COMMENT ON FUNCTION public.timer_regras() IS
  'Regras do Timer Flag (segundos). Fonte única: as RPCs e o app leem daqui.';

REVOKE EXECUTE ON FUNCTION public.timer_regras() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_regras() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. timer_trechos — cada pedaço de tempo marcado
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timer_trechos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_item_id          integer NOT NULL,
  work_item_titulo      text NOT NULL,
  work_item_tipo        text NOT NULL,
  team_project          text NULL,
  iniciado_em           timestamptz NOT NULL DEFAULT now(),
  ultimo_sinal_em       timestamptz NOT NULL DEFAULT now(),
  ultima_presenca_em    timestamptz NOT NULL DEFAULT now(),
  encerrado_em          timestamptz NULL,
  encerrado_original_em timestamptz NULL,
  motivo_fim            text NULL,
  descartado            boolean NOT NULL DEFAULT false,
  continuacao_de        uuid NULL REFERENCES public.timer_trechos(id) ON DELETE SET NULL,
  cliente               text NULL,
  plataforma            text NULL,
  versao_app            text NULL,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT timer_trechos_item_check    CHECK (work_item_id > 0),
  CONSTRAINT timer_trechos_titulo_check  CHECK (length(work_item_titulo) BETWEEN 1 AND 300),
  CONSTRAINT timer_trechos_tipo_check    CHECK (work_item_tipo IN ('Task', 'Product Backlog Item', 'Bug')),
  CONSTRAINT timer_trechos_projeto_check CHECK (team_project IS NULL OR length(team_project) <= 100),
  CONSTRAINT timer_trechos_fim_check     CHECK (encerrado_em IS NULL OR encerrado_em >= iniciado_em),
  CONSTRAINT timer_trechos_motivo_check  CHECK ((encerrado_em IS NULL) = (motivo_fim IS NULL)),
  CONSTRAINT timer_trechos_motivo_lista  CHECK (motivo_fim IS NULL OR motivo_fim IN (
    'manual', 'troca_tarefa', 'sem_sinal', 'sem_confirmacao', 'limite_trecho', 'limite_dia',
    'meia_noite', 'suspensao', 'bloqueio', 'ocioso', 'acesso_revogado'
  )),
  CONSTRAINT timer_trechos_cliente_check CHECK (cliente IS NULL OR cliente IN ('web','desktop','widget')),
  CONSTRAINT timer_trechos_plataforma_check CHECK (
    plataforma IS NULL OR plataforma IN ('windows','macos','linux','outra')
  ),
  CONSTRAINT timer_trechos_versao_check  CHECK (versao_app IS NULL OR length(versao_app) <= 32)
);

COMMENT ON TABLE public.timer_trechos IS
  'Trechos de tempo do Timer Flag. Escrita só pelas RPCs timer_* (SECURITY DEFINER): o início e o fim são o now() do banco, e correção só reduz. encerrado_original_em guarda o primeiro fim, antes de qualquer correção.';
COMMENT ON COLUMN public.timer_trechos.work_item_titulo IS
  'Título informado pelo app, só para exibição. O item é conferido no Azure DevOps na hora de lançar (fase 4).';

-- um timer rodando por pessoa
CREATE UNIQUE INDEX IF NOT EXISTS uq_timer_trechos_rodando
  ON public.timer_trechos (user_id) WHERE encerrado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_timer_trechos_user_inicio
  ON public.timer_trechos (user_id, iniciado_em DESC);

ALTER TABLE public.timer_trechos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_trechos FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.timer_trechos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.timer_trechos TO authenticated;

DROP POLICY IF EXISTS timer_trechos_select_proprio_ou_admin ON public.timer_trechos;
CREATE POLICY timer_trechos_select_proprio_ou_admin ON public.timer_trechos
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.hub_is_admin());

-- ---------------------------------------------------------------------------
-- 3. Funções internas (não executáveis por anon/authenticated)
-- ---------------------------------------------------------------------------

-- Início do dia (00:00 em São Paulo) como timestamptz.
CREATE OR REPLACE FUNCTION public.timer__inicio_dia(p_dia date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_dia::timestamp AT TIME ZONE 'America/Sao_Paulo');
$$;

CREATE OR REPLACE FUNCTION public.timer__dia(p_ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_ts AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

-- Segundos já fechados no dia (sem descartados), fora o trecho p_exceto.
CREATE OR REPLACE FUNCTION public.timer__usado_no_dia(p_user uuid, p_dia date, p_exceto uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(sum(extract(epoch FROM (encerrado_em - iniciado_em))), 0)
  FROM public.timer_trechos
  WHERE user_id = p_user
    AND encerrado_em IS NOT NULL
    AND NOT descartado
    AND id IS DISTINCT FROM p_exceto
    AND iniciado_em >= public.timer__inicio_dia(p_dia)
    AND iniciado_em <  public.timer__inicio_dia(p_dia + 1);
$$;

-- O corte que as regras impõem a um trecho rodando, olhando do instante
-- p_agora: o MAIS CEDO entre as regras violadas. NULL = segue rodando.
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
  v_cand  timestamptz;
  v_resto numeric;
BEGIN
  IF t.id IS NULL OR t.encerrado_em IS NOT NULL THEN
    RETURN;
  END IF;

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

  -- 12 h por dia
  v_resto := greatest(0, (r->>'dia_max_seg')::numeric
                         - public.timer__usado_no_dia(t.user_id, public.timer__dia(t.iniciado_em), t.id));
  v_cand := t.iniciado_em + make_interval(secs => v_resto::double precision);
  IF p_agora >= v_cand AND (corte IS NULL OR v_cand < corte) THEN
    corte := v_cand; motivo := 'limite_dia';
  END IF;

  -- virada do dia
  v_cand := public.timer__inicio_dia(public.timer__dia(t.iniciado_em) + 1);
  IF p_agora >= v_cand AND (corte IS NULL OR v_cand < corte) THEN
    corte := v_cand; motivo := 'meia_noite';
  END IF;

  IF corte IS NOT NULL THEN
    corte := greatest(corte, t.iniciado_em);
  END IF;
END;
$$;

-- Fecha um trecho rodando em p_fim (nunca depois de agora, nunca antes do
-- início) e grava o evento. Trecho de duração zero fica descartado.
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

-- Aplica as regras ao trecho rodando da pessoa, agora. Na virada do dia, se
-- a pessoa segue ativa, abre a continuação já no dia novo. Devolve quantos
-- trechos fechou.
CREATE OR REPLACE FUNCTION public.timer__aplicar(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t       public.timer_trechos;
  v_corte timestamptz;
  v_motivo text;
  v_n     integer := 0;
BEGIN
  FOR i IN 1..4 LOOP
    SELECT * INTO t FROM public.timer_trechos
     WHERE user_id = p_user AND encerrado_em IS NULL;
    EXIT WHEN t.id IS NULL;

    SELECT c.corte, c.motivo INTO v_corte, v_motivo FROM public.timer__corte(t, now()) c;
    EXIT WHEN v_corte IS NULL;

    PERFORM public.timer__fechar(t.id, v_corte, v_motivo, '{}'::jsonb);
    v_n := v_n + 1;

    EXIT WHEN v_motivo <> 'meia_noite';

    INSERT INTO public.timer_trechos (
      user_id, work_item_id, work_item_titulo, work_item_tipo, team_project,
      iniciado_em, ultimo_sinal_em, ultima_presenca_em, continuacao_de,
      cliente, plataforma, versao_app
    ) VALUES (
      t.user_id, t.work_item_id, t.work_item_titulo, t.work_item_tipo, t.team_project,
      v_corte, greatest(t.ultimo_sinal_em, v_corte), t.ultima_presenca_em, t.id,
      t.cliente, t.plataforma, t.versao_app
    );
  END LOOP;
  RETURN v_n;
END;
$$;

-- O que o app precisa para desenhar a tela.
CREATE OR REPLACE FUNCTION public.timer__estado(p_user uuid, p_dias integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hoje  date := public.timer__dia(now());
  v_desde timestamptz := public.timer__inicio_dia(v_hoje - (least(greatest(coalesce(p_dias, 1), 1), 7) - 1));
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
               iniciado_em, encerrado_em, encerrado_original_em, motivo_fim, descartado
        FROM public.timer_trechos
        WHERE user_id = p_user
          AND encerrado_em IS NOT NULL
          AND iniciado_em >= v_desde
          AND NOT (descartado AND encerrado_em = iniciado_em)
        ORDER BY iniciado_em DESC
        LIMIT 200
      ) x
    ),
    'fechado_hoje_seg', round(public.timer__usado_no_dia(p_user, v_hoje, NULL))
  );
END;
$$;

-- Exige o Timer ativo e serializa as ações da mesma pessoa.
CREATE OR REPLACE FUNCTION public.timer__exigir()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.hub_has_timer() THEN
    RAISE EXCEPTION 'timer_sem_acesso' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('timer:' || v_uid::text, 0));
  RETURN v_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer__inicio_dia(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.timer__dia(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.timer__usado_no_dia(uuid, date, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.timer__corte(public.timer_trechos, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.timer__fechar(uuid, timestamptz, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.timer__aplicar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.timer__estado(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.timer__exigir() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPCs do app
-- ---------------------------------------------------------------------------

-- Estado atual (aplica as regras antes de responder). p_dias: 1 = hoje, até 7.
CREATE OR REPLACE FUNCTION public.timer_estado(p_dias integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.timer__exigir();
BEGIN
  PERFORM public.timer__aplicar(v_uid);
  RETURN public.timer__estado(v_uid, p_dias);
END;
$$;

-- Inicia o timer num item. Se já roda outro item, fecha aquele (troca).
-- Iniciar de novo o MESMO item só renova sinal e presença.
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

  -- 60 inícios por hora é muito mais do que o uso real; segura laço de app.
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
         jsonb_build_object('tipo', work_item_tipo)
    FROM public.timer_trechos WHERE id = v_id;

  RETURN public.timer__estado(v_uid, 1);
END;
$$;

-- Sinal periódico (a cada 5 min). p_presenca = a pessoa respondeu "sigo aqui".
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

  UPDATE public.timer_trechos
     SET ultimo_sinal_em    = now(),
         ultima_presenca_em = CASE WHEN p_presenca THEN now() ELSE ultima_presenca_em END,
         atualizado_em      = now()
   WHERE user_id = v_uid AND encerrado_em IS NULL
  RETURNING * INTO t;

  IF t.id IS NOT NULL AND p_presenca THEN
    INSERT INTO public.timer_eventos (user_id, evento, origem, cliente, plataforma, versao_app, entry_id, work_item_id)
    VALUES (v_uid, 'confirmou_presenca', 'servidor', t.cliente, t.plataforma, t.versao_app, t.id, t.work_item_id);
  END IF;

  RETURN public.timer__estado(v_uid, 1);
END;
$$;

-- Pausa. p_fim (opcional) = quando a pessoa de fato parou (descontar os
-- últimos minutos, suspensão detectada, pergunta de presença negada). Só
-- vale para trás: o servidor limita a [início, agora].
CREATE OR REPLACE FUNCTION public.timer_pausar(p_motivo text DEFAULT 'manual', p_fim timestamptz DEFAULT NULL)
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

  SELECT id INTO v_id FROM public.timer_trechos WHERE user_id = v_uid AND encerrado_em IS NULL;
  IF v_id IS NOT NULL THEN
    PERFORM public.timer__fechar(v_id, least(coalesce(p_fim, now()), now()), p_motivo,
                                 jsonb_build_object('fim_relatado', p_fim IS NOT NULL));
  END IF;

  RETURN public.timer__estado(v_uid, 1);
END;
$$;

-- Correção: só ENCURTA um trecho fechado dos últimos 7 dias.
CREATE OR REPLACE FUNCTION public.timer_corrigir(p_id uuid, p_novo_fim timestamptz, p_dias integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.timer__exigir();
  t     public.timer_trechos;
BEGIN
  SELECT * INTO t FROM public.timer_trechos WHERE id = p_id AND user_id = v_uid FOR UPDATE;
  IF t.id IS NULL THEN
    RAISE EXCEPTION 'timer_trecho_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF t.encerrado_em IS NULL THEN
    RAISE EXCEPTION 'timer_trecho_rodando' USING ERRCODE = '22023';
  END IF;
  IF t.descartado THEN
    RAISE EXCEPTION 'timer_trecho_descartado' USING ERRCODE = '22023';
  END IF;
  IF t.iniciado_em < now() - interval '7 days' THEN
    RAISE EXCEPTION 'timer_trecho_antigo' USING ERRCODE = '22023';
  END IF;
  IF p_novo_fim IS NULL OR p_novo_fim < t.iniciado_em OR p_novo_fim > t.encerrado_em THEN
    RAISE EXCEPTION 'timer_correcao_so_reduz' USING ERRCODE = '22023';
  END IF;

  UPDATE public.timer_trechos
     SET encerrado_em = p_novo_fim,
         descartado   = (p_novo_fim = iniciado_em),
         atualizado_em = now()
   WHERE id = t.id;

  INSERT INTO public.timer_eventos (user_id, evento, origem, cliente, plataforma, versao_app, entry_id, work_item_id, detalhe)
  VALUES (v_uid, 'corrigiu', 'servidor', t.cliente, t.plataforma, t.versao_app, t.id, t.work_item_id,
          jsonb_build_object('fim_antes', t.encerrado_em, 'fim_depois', p_novo_fim,
                             'reduzido_seg', round(extract(epoch FROM (t.encerrado_em - p_novo_fim)))));

  RETURN public.timer__estado(v_uid, p_dias);
END;
$$;

-- Descarte: o trecho deixa de contar (fica na tabela e na trilha).
CREATE OR REPLACE FUNCTION public.timer_descartar(p_id uuid, p_dias integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.timer__exigir();
  t     public.timer_trechos;
BEGIN
  SELECT * INTO t FROM public.timer_trechos WHERE id = p_id AND user_id = v_uid FOR UPDATE;
  IF t.id IS NULL THEN
    RAISE EXCEPTION 'timer_trecho_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF t.encerrado_em IS NULL THEN
    RAISE EXCEPTION 'timer_trecho_rodando' USING ERRCODE = '22023';
  END IF;
  IF t.iniciado_em < now() - interval '7 days' THEN
    RAISE EXCEPTION 'timer_trecho_antigo' USING ERRCODE = '22023';
  END IF;

  IF NOT t.descartado THEN
    UPDATE public.timer_trechos SET descartado = true, atualizado_em = now() WHERE id = t.id;
    INSERT INTO public.timer_eventos (user_id, evento, origem, cliente, plataforma, versao_app, entry_id, work_item_id, detalhe)
    VALUES (v_uid, 'descartou', 'servidor', t.cliente, t.plataforma, t.versao_app, t.id, t.work_item_id,
            jsonb_build_object('duracao_seg', round(extract(epoch FROM (t.encerrado_em - t.iniciado_em)))));
  END IF;

  RETURN public.timer__estado(v_uid, p_dias);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_estado(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_estado(integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.timer_iniciar(integer, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_iniciar(integer, text, text, text, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.timer_sinal(boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_sinal(boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.timer_pausar(text, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_pausar(text, timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.timer_corrigir(uuid, timestamptz, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_corrigir(uuid, timestamptz, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.timer_descartar(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_descartar(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. O fechamento do que ninguém fechou (pg_cron)
-- ---------------------------------------------------------------------------
-- Percorre só os trechos rodando (poucos) e grava só quando corta: nada de
-- UPDATE cego a cada 5 min. Quem perdeu o acesso tem o trecho fechado agora.
CREATE OR REPLACE FUNCTION public.timer_fechar_abandonados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r   record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT t.id, t.user_id, a.status
      FROM public.timer_trechos t
      LEFT JOIN public.timer_access a ON a.user_id = t.user_id
     WHERE t.encerrado_em IS NULL
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('timer:' || r.user_id::text, 0));
    IF r.status IS DISTINCT FROM 'ativo' THEN
      PERFORM public.timer__fechar(r.id, now(), 'acesso_revogado', '{}'::jsonb);
      v_n := v_n + 1;
    ELSE
      v_n := v_n + public.timer__aplicar(r.user_id);
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

COMMENT ON FUNCTION public.timer_fechar_abandonados() IS
  'Job pg_cron timer-fecha-abandonados (5 em 5 min): aplica as regras a todo trecho rodando e fecha o de quem perdeu o acesso.';

REVOKE EXECUTE ON FUNCTION public.timer_fechar_abandonados() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'timer-fecha-abandonados';
  -- 3-58/5: fora dos minutos redondos em que os syncs já disparam.
  PERFORM cron.schedule('timer-fecha-abandonados', '3-58/5 * * * *',
                        $cmd$SELECT public.timer_fechar_abandonados();$cmd$);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Admin: o resumo para achar uso estranho
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.timer_admin_resumo(p_dias integer DEFAULT 14)
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
  correcoes             integer,
  descartes             integer,
  ultimo_uso            timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
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
           count(*) FILTER (WHERE e.evento = 'pausou_relato')       AS relatadas,
           count(*) FILTER (WHERE e.evento = 'confirmou_presenca')  AS presencas,
           count(*) FILTER (WHERE e.evento = 'corrigiu')            AS correcoes,
           count(*) FILTER (WHERE e.evento = 'descartou')           AS descartes,
           max(e.criado_em)                                         AS ultimo
      FROM public.timer_eventos e
     WHERE e.criado_em >= v_desde
     GROUP BY e.user_id
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
         coalesce(ev.correcoes, 0)::integer,
         coalesce(ev.descartes, 0)::integer,
         ev.ultimo
    FROM public.timer_access a
    LEFT JOIN ev ON ev.user_id = a.user_id
   ORDER BY ev.ultimo DESC NULLS LAST, a.email;
END;
$$;

COMMENT ON FUNCTION public.timer_admin_resumo(integer) IS
  'Admin: uso do Timer por pessoa nos últimos N dias (máx. 90), com os cortes automáticos e as correções, para achar uso estranho.';

REVOKE EXECUTE ON FUNCTION public.timer_admin_resumo(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_admin_resumo(integer) TO authenticated;
