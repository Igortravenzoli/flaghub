-- ============================================================================
-- TIMER FLAG / Fase 4 — lançar as horas na TechsBCN (TimeLog) e conciliar
--
-- O que é um lançamento: os trechos FECHADOS de uma pessoa, num item, num dia,
-- somados num único documento da extensão TechsBCN DevOps-TimeLog (o mesmo
-- formato que devops-post-timelog já grava: { id, user, userId, workItemId,
-- workItemName, startTime, date, time (min), notes }).
--
-- Quem fala com o Azure é a edge `timer-devops` (op `lancar`), com o
-- DEVOPS_PAT_TIMER. O banco faz a parte que não pode depender do app:
--   • só a PRÓPRIA hora: o userId vai de timer_access.devops_guid (resolvido
--     pelo e-mail do SSO), nunca do corpo da requisição;
--   • só trecho fechado, não descartado e ainda não lançado; os minutos são
--     somados aqui, a partir dos trechos — o app não informa duração;
--   • só dos últimos 7 dias (a mesma janela da correção) e nunca do futuro;
--   • teto do dia CONTANDO O QUE JÁ ESTÁ NO TIMELOG: o que o sync trouxe para
--     devops_time_logs com o devops_guid da pessoa naquele dia (lançado à mão
--     na extensão, pelo VDESK ou pelo próprio Timer) + o que o Timer já
--     enviou e o sync ainda não trouxe + o novo ≤ 12 h;
--   • trecho lançado fica TRAVADO: não encurta nem descarta (trigger).
--
-- Idempotência: o id do lançamento (uuid) É o id do documento na TechsBCN.
-- Reenvio de um lançamento com erro primeiro procura o documento por esse
-- id; só regrava se ele não existir. Nada de repetir POST às cegas.
--
-- Conciliação: o devops-sync-timelog (cron de 15 min) traz os documentos para
-- devops_time_logs com ext_entry_id = id do documento. O estado do Timer
-- mostra, por lançamento: conferido (achado), divergente (alguém mudou os
-- minutos na extensão) ou excluído na origem (devops_time_log_orphans).
--
-- Escopo: aditivo. Altera timer__estado (inclui lançamentos) e põe uma
-- coluna + trigger em timer_trechos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. timer_lancamentos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timer_lancamentos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_item_id        integer NOT NULL,
  work_item_titulo    text NULL,
  dia                 date NOT NULL,
  inicio              text NOT NULL,
  minutos             integer NOT NULL,
  notas               text NULL,
  status              text NOT NULL DEFAULT 'enviando',
  devops_user_id      text NOT NULL,
  devops_user_display text NULL,
  tentativas          integer NOT NULL DEFAULT 0,
  erro                text NULL,
  enviado_em          timestamptz NULL,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT timer_lancamentos_item_check    CHECK (work_item_id > 0),
  CONSTRAINT timer_lancamentos_inicio_check  CHECK (inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT timer_lancamentos_minutos_check CHECK (minutos BETWEEN 1 AND 720),
  CONSTRAINT timer_lancamentos_notas_check   CHECK (notas IS NULL OR length(notas) <= 500),
  CONSTRAINT timer_lancamentos_titulo_check  CHECK (work_item_titulo IS NULL OR length(work_item_titulo) <= 300),
  CONSTRAINT timer_lancamentos_erro_check    CHECK (erro IS NULL OR length(erro) <= 500),
  CONSTRAINT timer_lancamentos_status_check  CHECK (status IN ('enviando', 'lancado', 'erro', 'cancelado'))
);

COMMENT ON TABLE public.timer_lancamentos IS
  'Lançamentos do Timer Flag na TechsBCN DevOps-TimeLog. id = id do documento na extensão (= devops_time_logs.ext_entry_id depois do sync). Escrita só pelas RPCs timer_lancamento_* (service role, chamadas pela edge timer-devops).';

CREATE INDEX IF NOT EXISTS idx_timer_lancamentos_user_dia
  ON public.timer_lancamentos (user_id, dia DESC);

ALTER TABLE public.timer_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_lancamentos FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.timer_lancamentos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.timer_lancamentos TO authenticated;

DROP POLICY IF EXISTS timer_lancamentos_select_proprio_ou_admin ON public.timer_lancamentos;
CREATE POLICY timer_lancamentos_select_proprio_ou_admin ON public.timer_lancamentos
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.hub_is_admin());

-- ---------------------------------------------------------------------------
-- 2. trecho → lançamento, e a trava
-- ---------------------------------------------------------------------------
ALTER TABLE public.timer_trechos
  ADD COLUMN IF NOT EXISTS lancamento_id uuid NULL REFERENCES public.timer_lancamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_timer_trechos_lancamento
  ON public.timer_trechos (lancamento_id) WHERE lancamento_id IS NOT NULL;

-- Trecho que entrou num lançamento não muda de duração nem é descartado.
-- (Cancelar o lançamento solta o trecho — aí ele volta a ser editável.)
CREATE OR REPLACE FUNCTION public.timer__trava_trecho_lancado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.lancamento_id IS NOT NULL
     AND (NEW.encerrado_em IS DISTINCT FROM OLD.encerrado_em
          OR NEW.descartado IS DISTINCT FROM OLD.descartado
          OR NEW.iniciado_em IS DISTINCT FROM OLD.iniciado_em) THEN
    RAISE EXCEPTION 'timer_trecho_lancado' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_timer_trava_trecho_lancado ON public.timer_trechos;
CREATE TRIGGER trg_timer_trava_trecho_lancado
  BEFORE UPDATE ON public.timer_trechos
  FOR EACH ROW EXECUTE FUNCTION public.timer__trava_trecho_lancado();

-- ---------------------------------------------------------------------------
-- 3. RPCs da edge (service role; o app NÃO executa)
-- ---------------------------------------------------------------------------

-- Monta o lançamento: soma os trechos elegíveis, confere janela e teto e
-- trava os trechos. Devolve o que a edge precisa para gravar o documento.
CREATE OR REPLACE FUNCTION public.timer_lancamento_preparar(
  p_user         uuid,
  p_dia          date,
  p_work_item_id integer,
  p_notas        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a          public.timer_access;
  v_hoje     date := public.timer__dia(now());
  v_seg      numeric;
  v_inicio   timestamptz;
  v_min      integer;
  v_no_devops integer;
  v_do_timer integer;
  v_recentes integer;
  v_notas    text;
  v_id       uuid;
BEGIN
  SELECT * INTO a FROM public.timer_access WHERE user_id = p_user;
  IF a.user_id IS NULL OR a.status <> 'ativo' THEN
    RAISE EXCEPTION 'timer_sem_acesso' USING ERRCODE = '42501';
  END IF;
  IF a.devops_guid IS NULL THEN
    RAISE EXCEPTION 'timer_sem_conta_devops' USING ERRCODE = '22023';
  END IF;
  IF p_work_item_id IS NULL OR p_work_item_id <= 0 THEN
    RAISE EXCEPTION 'timer_item_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_dia IS NULL OR p_dia > v_hoje OR p_dia < v_hoje - 7 THEN
    RAISE EXCEPTION 'timer_dia_fora_da_janela' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('timer:' || p_user::text, 0));

  -- 30 lançamentos por hora: muito acima do uso real; segura laço.
  SELECT count(*) INTO v_recentes FROM public.timer_lancamentos
   WHERE user_id = p_user AND criado_em > now() - interval '1 hour';
  IF v_recentes >= 30 THEN
    RAISE EXCEPTION 'timer_muitas_acoes' USING ERRCODE = '53400';
  END IF;

  SELECT coalesce(sum(extract(epoch FROM (encerrado_em - iniciado_em))), 0), min(iniciado_em)
    INTO v_seg, v_inicio
    FROM public.timer_trechos
   WHERE user_id = p_user
     AND work_item_id = p_work_item_id
     AND encerrado_em IS NOT NULL
     AND NOT descartado
     AND lancamento_id IS NULL
     AND iniciado_em >= public.timer__inicio_dia(p_dia)
     AND iniciado_em <  public.timer__inicio_dia(p_dia + 1);

  v_min := round(v_seg / 60.0);
  IF v_min < 1 THEN
    RAISE EXCEPTION 'timer_nada_a_lancar' USING ERRCODE = '22023';
  END IF;

  -- teto do dia contando o que já está no TimeLog
  SELECT coalesce(sum(l.time_minutes), 0)::integer INTO v_no_devops
    FROM public.devops_time_logs l
   WHERE l.user_id_ext = a.devops_guid
     AND l.log_date = p_dia
     AND (l.ext_entry_id IS NULL OR NOT EXISTS (
           SELECT 1 FROM public.timer_lancamentos t
            WHERE t.user_id = p_user AND t.id::text = l.ext_entry_id));
  SELECT coalesce(sum(minutos), 0)::integer INTO v_do_timer
    FROM public.timer_lancamentos
   WHERE user_id = p_user AND dia = p_dia AND status IN ('enviando', 'lancado', 'erro');

  IF v_no_devops + v_do_timer + v_min > ((public.timer_regras()->>'dia_max_seg')::integer / 60) THEN
    RAISE EXCEPTION 'timer_teto_dia_timelog'
      USING ERRCODE = '53400',
            DETAIL = format('no TimeLog: %s min, já enviado pelo Timer: %s min, este: %s min', v_no_devops, v_do_timer, v_min);
  END IF;

  v_notas := nullif(left(btrim(regexp_replace(coalesce(p_notas, ''), '[[:cntrl:]]+', ' ', 'g')), 500), '');

  INSERT INTO public.timer_lancamentos (
    user_id, work_item_id, dia, inicio, minutos, notas, status, devops_user_id, devops_user_display
  ) VALUES (
    p_user, p_work_item_id, p_dia, to_char(v_inicio AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
    v_min, v_notas, 'enviando', a.devops_guid, a.devops_display
  ) RETURNING id INTO v_id;

  UPDATE public.timer_trechos
     SET lancamento_id = v_id
   WHERE user_id = p_user
     AND work_item_id = p_work_item_id
     AND encerrado_em IS NOT NULL
     AND NOT descartado
     AND lancamento_id IS NULL
     AND iniciado_em >= public.timer__inicio_dia(p_dia)
     AND iniciado_em <  public.timer__inicio_dia(p_dia + 1);

  INSERT INTO public.timer_eventos (user_id, evento, origem, work_item_id, detalhe)
  VALUES (p_user, 'lancamento_preparado', 'servidor', p_work_item_id,
          jsonb_build_object('lancamento', v_id, 'dia', p_dia, 'minutos', v_min));

  RETURN jsonb_build_object(
    'id', v_id, 'work_item_id', p_work_item_id, 'dia', p_dia, 'minutos', v_min,
    'inicio', to_char(v_inicio AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
    'notas', v_notas, 'devops_user_id', a.devops_guid, 'devops_user_display', a.devops_display
  );
END;
$$;

-- Reenvio de um lançamento com erro: volta para 'enviando' e devolve os dados.
CREATE OR REPLACE FUNCTION public.timer_lancamento_reenviar(p_user uuid, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  l public.timer_lancamentos;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.timer_access WHERE user_id = p_user AND status = 'ativo') THEN
    RAISE EXCEPTION 'timer_sem_acesso' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('timer:' || p_user::text, 0));

  SELECT * INTO l FROM public.timer_lancamentos WHERE id = p_id AND user_id = p_user FOR UPDATE;
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'timer_lancamento_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF l.status <> 'erro' THEN
    RAISE EXCEPTION 'timer_lancamento_nao_reenviavel' USING ERRCODE = '22023';
  END IF;
  IF l.tentativas >= 5 THEN
    RAISE EXCEPTION 'timer_lancamento_tentativas' USING ERRCODE = '53400';
  END IF;

  UPDATE public.timer_lancamentos SET status = 'enviando', atualizado_em = now() WHERE id = l.id;

  RETURN jsonb_build_object(
    'id', l.id, 'work_item_id', l.work_item_id, 'dia', l.dia, 'minutos', l.minutos, 'inicio', l.inicio,
    'notas', l.notas, 'devops_user_id', l.devops_user_id, 'devops_user_display', l.devops_user_display
  );
END;
$$;

-- Resultado do envio:
--   'lancado'   → documento gravado (ou já existia com esse id)
--   'erro'      → falhou e PODE ter ou não chegado: o reenvio confere antes
--   'cancelado' → recusado ANTES de gravar (item inexistente, tipo errado…):
--                 os trechos são soltos e voltam a ser editáveis
CREATE OR REPLACE FUNCTION public.timer_lancamento_resultado(
  p_id     uuid,
  p_status text,
  p_titulo text DEFAULT NULL,
  p_erro   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  l public.timer_lancamentos;
BEGIN
  IF p_status NOT IN ('lancado', 'erro', 'cancelado') THEN
    RAISE EXCEPTION 'timer_status_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO l FROM public.timer_lancamentos WHERE id = p_id FOR UPDATE;
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'timer_lancamento_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF l.status <> 'enviando' THEN
    RAISE EXCEPTION 'timer_lancamento_fora_de_envio' USING ERRCODE = '22023';
  END IF;

  UPDATE public.timer_lancamentos
     SET status           = p_status,
         tentativas       = CASE WHEN p_status = 'cancelado' THEN tentativas ELSE tentativas + 1 END,
         work_item_titulo = coalesce(left(p_titulo, 300), work_item_titulo),
         erro             = CASE WHEN p_status = 'lancado' THEN NULL ELSE left(p_erro, 500) END,
         enviado_em       = CASE WHEN p_status = 'lancado' THEN now() ELSE enviado_em END,
         atualizado_em    = now()
   WHERE id = l.id;

  IF p_status = 'cancelado' THEN
    UPDATE public.timer_trechos SET lancamento_id = NULL WHERE lancamento_id = l.id;
  END IF;

  INSERT INTO public.timer_eventos (user_id, evento, origem, work_item_id, detalhe)
  VALUES (l.user_id,
          CASE p_status WHEN 'lancado' THEN 'lancou' WHEN 'erro' THEN 'lancamento_erro' ELSE 'lancamento_cancelado' END,
          'servidor', l.work_item_id,
          jsonb_build_object('lancamento', l.id, 'dia', l.dia, 'minutos', l.minutos, 'erro', left(p_erro, 300)));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_lancamento_preparar(uuid, date, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.timer_lancamento_reenviar(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.timer_lancamento_resultado(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.timer_lancamento_preparar(uuid, date, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.timer_lancamento_reenviar(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.timer_lancamento_resultado(uuid, text, text, text) TO service_role;

-- Lançamento preso em 'enviando' (a edge caiu no meio): depois de 15 min vira
-- 'erro', e o reenvio confere se o documento chegou. Roda no job do Timer.
CREATE OR REPLACE FUNCTION public.timer__destravar_envios()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.timer_lancamentos
     SET status = 'erro', erro = 'O envio não terminou. Tente de novo: conferimos antes de regravar.',
         atualizado_em = now()
   WHERE status = 'enviando' AND atualizado_em < now() - interval '15 minutes';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer__destravar_envios() FROM PUBLIC, anon, authenticated;

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

  -- só grava se houver envio preso (o UPDATE filtra antes)
  IF EXISTS (SELECT 1 FROM public.timer_lancamentos
              WHERE status = 'enviando' AND atualizado_em < now() - interval '15 minutes') THEN
    v_n := v_n + public.timer__destravar_envios();
  END IF;
  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_fechar_abandonados() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. O estado passa a trazer os lançamentos e a conciliação
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
          -- cancelado só aparece no dia em que foi cancelado (para a pessoa ver o motivo)
          AND (l.status <> 'cancelado' OR l.atualizado_em > now() - interval '1 day')
        ORDER BY l.dia DESC, l.criado_em DESC
        LIMIT 200
      ) x
    ),
    'fechado_hoje_seg', round(public.timer__usado_no_dia(p_user, v_hoje, NULL))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer__estado(uuid, integer) FROM PUBLIC, anon, authenticated;
