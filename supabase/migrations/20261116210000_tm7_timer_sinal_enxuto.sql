-- ============================================================================
-- TIMER FLAG / sinal enxuto (egress)
--
-- O sinal de 5 em 5 min devolvia o estado inteiro (trechos do dia,
-- lançamentos). Com 10–15 devs, são ~1.440 sinais/dia — a maior parte do
-- egress do Timer, para repetir o que a tela já tem.
--
-- Agora timer_sinal(p_presenca, p_resumo): com p_resumo = true e NADA
-- mudado (as regras não fecharam trecho e segue rodando), devolve só
-- { agora, rodando, resumo: true }. Se as regras cortaram algo, ou não há
-- timer rodando, devolve o estado completo, como antes.
--
-- Compatível: p_resumo é opcional (default false); o app antigo segue
-- recebendo o estado completo. A lógica do celular (TM6) é mantida.
-- ============================================================================

DROP FUNCTION IF EXISTS public.timer_sinal(boolean);

CREATE FUNCTION public.timer_sinal(p_presenca boolean DEFAULT false, p_resumo boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     uuid := public.timer__exigir();
  t         public.timer_trechos;
  v_fechou  integer;
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
   WHERE user_id = v_uid AND encerrado_em IS NULL
  RETURNING * INTO t;

  IF t.id IS NOT NULL AND p_presenca THEN
    INSERT INTO public.timer_eventos (user_id, evento, origem, cliente, plataforma, versao_app, entry_id, work_item_id, detalhe)
    VALUES (v_uid, 'confirmou_presenca', 'servidor', t.cliente, t.plataforma, t.versao_app, t.id, t.work_item_id,
            jsonb_build_object('aparelho', 'computador'));
  END IF;

  IF p_resumo AND v_fechou = 0 AND t.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'resumo', true,
      'agora', now(),
      'rodando', jsonb_build_object(
        'id', t.id, 'work_item_id', t.work_item_id, 'titulo', t.work_item_titulo, 'tipo', t.work_item_tipo,
        'projeto', t.team_project, 'iniciado_em', t.iniciado_em, 'ultimo_sinal_em', t.ultimo_sinal_em,
        'ultima_presenca_em', t.ultima_presenca_em
      )
    );
  END IF;

  RETURN public.timer__estado(v_uid, 1);
END;
$$;

COMMENT ON FUNCTION public.timer_sinal(boolean, boolean) IS
  'Sinal do Timer (5 em 5 min) e confirmação de presença. p_resumo: sem mudança, devolve só agora + rodando (egress).';

REVOKE EXECUTE ON FUNCTION public.timer_sinal(boolean, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_sinal(boolean, boolean) TO authenticated;
