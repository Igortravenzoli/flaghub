-- ============================================================================
-- Migration: 20260624150000_qa_retornos_coerente_encerramentos.sql
-- Torna "Retornos por nº de ciclos" COERENTE com "Encerramentos por usuário".
--
-- ANTES: rpc_qa_exec_retornos_distribuicao contava por devops_qa_return_events
-- (tabela de eventos só desde abr/2026) → 49 itens, divergindo do bloco de
-- encerramentos que usa a tag RETORNO QA (Closed By autorizado) → 106 itens.
--
-- AGORA: mesma base do rpc_qa_encerramentos_por_usuario — itens ENCERRADOS no
-- ano (state done/closed/resolved, closed_date no ano, Closed By autorizado),
-- "com retorno" = tag RETORNO QA. Os ciclos por item vêm do state_history
-- (entradas em "Em Teste" - 1, mínimo 1 para itens marcados). Assim:
--   soma(1x + 2x + >=3x) = total "com retorno" da aba de encerramentos.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_qa_exec_retornos_distribuicao(p_year int DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH enc AS (
    SELECT
      w.id, w.title, w.work_item_type, w.closed_date,
      (w.tags ILIKE '%RETORNO QA%') AS com_tag,
      GREATEST(1, (
        SELECT COUNT(*) FROM jsonb_array_elements(w.state_history) e
        WHERE lower(trim(e->>'newValue')) = 'em teste'
      ) - 1) AS ciclos
    FROM public.devops_work_items w
    JOIN public.qa_authorized_closers c
      ON c.is_active
     AND (lower(c.email) = lower(w.closed_by_email) OR lower(c.display_name) = lower(w.closed_by))
    WHERE lower(w.state) IN ('done','closed','resolved')
      AND w.closed_date IS NOT NULL
      AND (p_year IS NULL OR EXTRACT(YEAR FROM w.closed_date) = p_year)
  ),
  ret AS (SELECT * FROM enc WHERE com_tag)
  SELECT jsonb_build_object(
    'itens_com_retorno', (SELECT COUNT(*) FROM ret),
    'itens_1x', (SELECT COUNT(*) FROM ret WHERE ciclos = 1),
    'itens_2x', (SELECT COUNT(*) FROM ret WHERE ciclos = 2),
    'itens_3x_mais', (SELECT COUNT(*) FROM ret WHERE ciclos >= 3),
    'ciclos_total', (SELECT COALESCE(SUM(ciclos), 0) FROM ret),
    'top_3x_mais', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'work_item_id', id,
        'title', title,
        'work_item_type', work_item_type,
        'sprint_code', public.fn_sprint_code_for_date(closed_date::date),
        'ciclos', ciclos
      ) ORDER BY ciclos DESC, id)
      FROM (SELECT * FROM ret WHERE ciclos >= 3 ORDER BY ciclos DESC LIMIT 30) t
    ), '[]'::jsonb),
    -- Ponte com a aba de encerramentos (mesmos números)
    'reconc', jsonb_build_object(
      'total_encerrados', (SELECT COUNT(*) FROM enc),
      'sem_retorno', (SELECT COUNT(*) FROM enc) - (SELECT COUNT(*) FROM ret),
      'com_retorno', (SELECT COUNT(*) FROM ret)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.rpc_qa_exec_retornos_distribuicao(int) IS
  'Distribuição de retornos QA por nº de ciclos (1x/2x/>=3x) sobre itens ENCERRADOS no ano com tag RETORNO QA (mesma base de rpc_qa_encerramentos_por_usuario). Soma dos buckets = "com retorno" da aba de encerramentos.';
