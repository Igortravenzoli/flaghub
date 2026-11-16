-- ============================================================================
-- TIMER FLAG / cockpit — anotações
--
-- Anotação é LEMBRETE: "anote e Enter, vira demanda depois". Ela não marca
-- tempo. O play de uma anotação cria a Task no PBI/Bug que a pessoa escolher
-- (op `criar` da edge, a mesma da fase 2) e inicia o timer nela; aí a
-- anotação é fechada com o id do item que virou. Toda hora continua presa a
-- um item do Azure DevOps — lançamento e conciliação não mudam.
--
-- Por que no banco e não no navegador: a mesma pessoa usa o Timer no
-- navegador e no app desktop (perfis de navegador diferentes).
--
-- Tetos: 200 caracteres por anotação, 50 abertas por pessoa.
-- Escopo: 100% aditivo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.timer_anotacoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  texto        text NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  fechada_em   timestamptz NULL,
  virou_item_id integer NULL,

  CONSTRAINT timer_anotacoes_texto_check CHECK (length(texto) BETWEEN 1 AND 200),
  CONSTRAINT timer_anotacoes_item_check  CHECK (virou_item_id IS NULL OR virou_item_id > 0),
  CONSTRAINT timer_anotacoes_virou_check CHECK (virou_item_id IS NULL OR fechada_em IS NOT NULL)
);

COMMENT ON TABLE public.timer_anotacoes IS
  'Anotações do Timer Flag (lembretes que viram Task). Não marcam tempo. Escrita só pelas RPCs timer_anot*.';

CREATE INDEX IF NOT EXISTS idx_timer_anotacoes_abertas
  ON public.timer_anotacoes (user_id, criado_em) WHERE fechada_em IS NULL;

ALTER TABLE public.timer_anotacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_anotacoes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.timer_anotacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.timer_anotacoes TO authenticated;

DROP POLICY IF EXISTS timer_anotacoes_select_propria ON public.timer_anotacoes;
CREATE POLICY timer_anotacoes_select_propria ON public.timer_anotacoes
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- As anotações abertas, mais antigas primeiro (a ordem em que foram anotadas).
CREATE OR REPLACE FUNCTION public.timer__anotacoes(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'texto', texto, 'criado_em', criado_em) ORDER BY criado_em), '[]'::jsonb)
    FROM public.timer_anotacoes
   WHERE user_id = p_user AND fechada_em IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.timer__anotacoes(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.timer_anotacoes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.timer__exigir();
BEGIN
  RETURN public.timer__anotacoes(v_uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.timer_anotar(p_texto text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid   uuid := public.timer__exigir();
  v_texto text := left(btrim(regexp_replace(coalesce(p_texto, ''), '[[:cntrl:]]+', ' ', 'g')), 200);
  v_n     integer;
BEGIN
  IF v_texto = '' THEN
    RAISE EXCEPTION 'timer_anotacao_vazia' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_n FROM public.timer_anotacoes WHERE user_id = v_uid AND fechada_em IS NULL;
  IF v_n >= 50 THEN
    RAISE EXCEPTION 'timer_anotacoes_demais' USING ERRCODE = '53400';
  END IF;
  INSERT INTO public.timer_anotacoes (user_id, texto) VALUES (v_uid, v_texto);
  RETURN public.timer__anotacoes(v_uid);
END;
$$;

-- Fecha uma anotação: feita (✓) ou virou o item p_virou_item_id (play).
CREATE OR REPLACE FUNCTION public.timer_anotacao_fechar(p_id uuid, p_virou_item_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.timer__exigir();
BEGIN
  IF p_virou_item_id IS NOT NULL AND p_virou_item_id <= 0 THEN
    RAISE EXCEPTION 'timer_item_invalido' USING ERRCODE = '22023';
  END IF;
  UPDATE public.timer_anotacoes
     SET fechada_em = now(), virou_item_id = p_virou_item_id
   WHERE id = p_id AND user_id = v_uid AND fechada_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'timer_anotacao_inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF p_virou_item_id IS NOT NULL THEN
    INSERT INTO public.timer_eventos (user_id, evento, origem, work_item_id, detalhe)
    VALUES (v_uid, 'anotacao_virou_item', 'servidor', p_virou_item_id, jsonb_build_object('anotacao', p_id));
  END IF;
  RETURN public.timer__anotacoes(v_uid);
END;
$$;

-- Apagar (✕): some de vez — é lembrete pessoal, não registro de hora.
CREATE OR REPLACE FUNCTION public.timer_anotacao_apagar(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.timer__exigir();
BEGIN
  DELETE FROM public.timer_anotacoes WHERE id = p_id AND user_id = v_uid AND fechada_em IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'timer_anotacao_inexistente' USING ERRCODE = 'P0002';
  END IF;
  RETURN public.timer__anotacoes(v_uid);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_anotacoes() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_anotacoes() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.timer_anotar(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_anotar(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.timer_anotacao_fechar(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_anotacao_fechar(uuid, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.timer_anotacao_apagar(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_anotacao_apagar(uuid) TO authenticated;
