-- ============================================================================
-- Migration: 20260624140000_fix_qa_exec_fila_aging.sql
-- Corrige a contagem da Fila QA na Visão Executiva de Qualidade.
--
-- BUG: rpc_qa_exec_fila_aging contava a fila a partir de pbi_lifecycle_summary,
-- que NÃO inclui Bugs — subcontava (33 em teste em vez de 59; 10 deploy em vez
-- de 12). A fonte oficial da fila é a view vw_qualidade_kpis (mesma do KPI
-- "Fila QA" do dashboard), que inclui PBIs e Bugs.
--
-- FIX: base = vw_qualidade_kpis. Origem do item (para idade em sprints):
--   first_committed_sprint do lifecycle quando existir (PBIs), senão sprint_code
--   da própria view (Bugs / itens sem lifecycle). Itens sem sprint válido contam
--   em "sem_sprint" (não entram em no_prazo/atraso).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_qa_exec_fila_aging()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_cur_sprint text;
  v_cur_num int;
  v_result jsonb;
BEGIN
  -- Sprint aberta hoje (BRT); fallback: maior sprint com itens no lifecycle
  SELECT cands.sc INTO v_cur_sprint
  FROM (
    SELECT DISTINCT COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) AS sc
    FROM public.pbi_lifecycle_summary ls
    WHERE COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$'
  ) cands
  JOIN LATERAL public.fn_sprint_official_range(cands.sc) r ON true
  WHERE (now() AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN r.sprint_start AND r.sprint_end
  ORDER BY r.sprint_end DESC
  LIMIT 1;

  IF v_cur_sprint IS NULL THEN
    SELECT COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) INTO v_cur_sprint
    FROM public.pbi_lifecycle_summary ls
    WHERE COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$'
    ORDER BY regexp_replace(split_part(COALESCE(ls.last_committed_sprint, ls.first_committed_sprint),'-',1),'[^0-9]','','g')::int DESC
    LIMIT 1;
  END IF;

  v_cur_num := regexp_replace(split_part(v_cur_sprint,'-',1),'[^0-9]','','g')::int;

  WITH fila AS (
    SELECT
      v.id,
      lower(trim(v.state)) AS st,
      COALESCE(
        NULLIF((SELECT ls.first_committed_sprint FROM public.pbi_lifecycle_summary ls WHERE ls.work_item_id = v.id LIMIT 1), ''),
        v.sprint_code
      ) AS origem
    FROM public.vw_qualidade_kpis v
  ),
  fila2 AS (
    SELECT id, st, origem,
      CASE WHEN origem ~ '^S[0-9]+-[0-9]{4}$'
        THEN v_cur_num - regexp_replace(split_part(origem,'-',1),'[^0-9]','','g')::int
        ELSE NULL END AS age
    FROM fila
  ),
  por_origem AS (
    SELECT origem AS sprint_origem, MAX(age) AS age_sprints, COUNT(*) AS n
    FROM fila2
    WHERE origem ~ '^S[0-9]+-[0-9]{4}$'
    GROUP BY origem
  )
  SELECT jsonb_build_object(
    'sprint_atual', v_cur_sprint,
    'total_qa', (SELECT COUNT(*) FROM fila2),
    'em_teste', (SELECT COUNT(*) FROM fila2 WHERE st = 'em teste'),
    'aguardando_deploy', (SELECT COUNT(*) FROM fila2 WHERE st = 'aguardando deploy'),
    'no_prazo', (SELECT COUNT(*) FROM fila2 WHERE age IS NOT NULL AND age <= 2),
    'atraso', (SELECT COUNT(*) FROM fila2 WHERE age IS NOT NULL AND age > 2),
    'sem_sprint', (SELECT COUNT(*) FROM fila2 WHERE age IS NULL),
    'por_origem', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sprint_origem', sprint_origem,
        'age_sprints', age_sprints,
        'n', n,
        'atraso', (age_sprints > 2)
      ) ORDER BY age_sprints DESC NULLS LAST) FROM por_origem
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.rpc_qa_exec_fila_aging() IS
  'META Qualidade: fila QA (total/em teste/aguardando deploy) a partir de vw_qualidade_kpis (inclui Bugs) + idade em sprints (origem = first_committed_sprint do lifecycle ou sprint_code da view).';
