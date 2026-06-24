-- ============================================================================
-- Migration: 20260623160000_qualidade_visao_executiva.sql
-- Backend da "Visão Executiva" de Qualidade (framework onde estamos / o que
-- queremos / de onde viemos), conforme nivelamento 12/06 (Thales/Alessander).
--
--   1. qualidade_sistema_versions — controle de versão de sistemas (CRUD do
--      owner da área 'qualidade' ou admin), exibido na visão executiva.
--   2. rpc_qa_exec_fila_aging() — META: fila QA (total / em teste / aguardando
--      deploy) + idade em sprints (no prazo <=2 vs ATRASO >2) + origem por sprint.
--   3. rpc_qa_exec_retornos_distribuicao(year) — retornos quantificados por nº de
--      ciclos (1x / 2x / >=3x destaque) + RECONCILIAÇÃO do bug 76-vs-26
--      (eventos -> itens com retorno (qualquer estágio) -> itens concluídos).
--
-- Aditivo: não altera tabelas/RPCs existentes.
-- ============================================================================

-- ── 1. Controle de versão de sistemas ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qualidade_sistema_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_nome  text NOT NULL,
  versao_atual  text NOT NULL DEFAULT '—',
  ordem         integer NOT NULL DEFAULT 0,
  notas         text,
  is_active     boolean NOT NULL DEFAULT true,
  updated_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_qsv_sistema UNIQUE (sistema_nome)
);

COMMENT ON TABLE public.qualidade_sistema_versions IS
  'Versão atual de cada sistema (Visão Executiva de Qualidade). CRUD pelo owner da área qualidade ou admin.';

CREATE INDEX IF NOT EXISTS idx_qsv_ordem ON public.qualidade_sistema_versions (ordem, sistema_nome);

ALTER TABLE public.qualidade_sistema_versions ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer usuário aprovado (para a visão executiva)
DROP POLICY IF EXISTS qsv_select_approved ON public.qualidade_sistema_versions;
CREATE POLICY qsv_select_approved ON public.qualidade_sistema_versions
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

-- INSERT/UPDATE/DELETE: admin global OU owner da área 'qualidade'
DROP POLICY IF EXISTS qsv_write_admin_or_owner ON public.qualidade_sistema_versions;
CREATE POLICY qsv_write_admin_or_owner ON public.qualidade_sistema_versions
  FOR ALL TO authenticated
  USING (
    public.hub_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hub_area_members m
      JOIN public.hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key = 'qualidade'
        AND m.area_role = 'owner'
    )
  )
  WITH CHECK (
    public.hub_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hub_area_members m
      JOIN public.hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key = 'qualidade'
        AND m.area_role = 'owner'
    )
  );

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_qsv_updated_at'
      AND tgrelid = 'public.qualidade_sistema_versions'::regclass
  ) THEN
    CREATE TRIGGER trg_qsv_updated_at
      BEFORE UPDATE ON public.qualidade_sistema_versions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Seed inicial (exemplos do nivelamento); idempotente
INSERT INTO public.qualidade_sistema_versions (sistema_nome, versao_atual, ordem) VALUES
  ('Flexx', '1.65.1', 10),
  ('Decision', '1.56.3', 20),
  ('FlexxSales', '1.00.3', 30),
  ('ConnectSales', '—', 40)
ON CONFLICT (sistema_nome) DO NOTHING;

-- ── 2. META: fila QA + idade em sprints (atraso > 2 sprints sem DONE) ─────────
CREATE OR REPLACE FUNCTION public.rpc_qa_exec_fila_aging()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_cur_sprint text;
  v_cur_num int;
  v_result jsonb;
BEGIN
  -- Sprint aberta hoje (BRT); fallback: maior sprint com itens
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
      ls.work_item_id,
      w.state,
      ls.first_committed_sprint,
      CASE WHEN ls.first_committed_sprint ~ '^S[0-9]+-[0-9]{4}$'
        THEN v_cur_num - regexp_replace(split_part(ls.first_committed_sprint,'-',1),'[^0-9]','','g')::int
        ELSE NULL END AS age_sprints
    FROM public.pbi_lifecycle_summary ls
    JOIN public.devops_work_items w ON w.id = ls.work_item_id
    WHERE ls.current_stage IN ('qualidade','deploy')
      AND lower(trim(w.state)) <> 'done'
  ),
  por_origem AS (
    SELECT COALESCE(first_committed_sprint,'—') AS sprint_origem,
           COALESCE(MAX(age_sprints), -1) AS age_sprints,
           COUNT(*) AS n,
           COUNT(*) FILTER (WHERE age_sprints > 2) AS atraso
    FROM fila GROUP BY 1
  )
  SELECT jsonb_build_object(
    'sprint_atual', v_cur_sprint,
    'total_qa', (SELECT COUNT(*) FROM fila),
    'em_teste', (SELECT COUNT(*) FROM fila WHERE lower(trim(state)) = 'em teste'),
    'aguardando_deploy', (SELECT COUNT(*) FROM fila WHERE lower(trim(state)) = 'aguardando deploy'),
    'no_prazo', (SELECT COUNT(*) FROM fila WHERE age_sprints IS NOT NULL AND age_sprints <= 2),
    'atraso', (SELECT COUNT(*) FROM fila WHERE age_sprints IS NOT NULL AND age_sprints > 2),
    'sem_sprint', (SELECT COUNT(*) FROM fila WHERE age_sprints IS NULL),
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

GRANT EXECUTE ON FUNCTION public.rpc_qa_exec_fila_aging() TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_qa_exec_fila_aging() IS
  'META Qualidade: fila QA (total/em teste/aguardando deploy) + idade em sprints (no prazo <=2 vs ATRASO >2) + origem por sprint.';

-- ── 3. Retornos quantificados (1x/2x/>=3x) + reconciliação do bug 76-vs-26 ────
CREATE OR REPLACE FUNCTION public.rpc_qa_exec_retornos_distribuicao(p_year int DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH ev AS (
    SELECT e.work_item_id,
           COUNT(*) AS ciclos,
           MAX(e.work_item_title) AS title,
           MAX(e.work_item_type) AS work_item_type,
           MAX(e.sprint_code) AS sprint_code,
           bool_or(e.is_open) AS tem_aberto
    FROM public.devops_qa_return_events e
    WHERE (p_year IS NULL OR EXTRACT(YEAR FROM e.transition_date) = p_year)
    GROUP BY e.work_item_id
  )
  SELECT jsonb_build_object(
    'eventos_total', COALESCE((SELECT SUM(ciclos) FROM ev), 0),
    'itens_com_retorno', COALESCE((SELECT COUNT(*) FROM ev), 0),
    'itens_1x', COALESCE((SELECT COUNT(*) FROM ev WHERE ciclos = 1), 0),
    'itens_2x', COALESCE((SELECT COUNT(*) FROM ev WHERE ciclos = 2), 0),
    'itens_3x_mais', COALESCE((SELECT COUNT(*) FROM ev WHERE ciclos >= 3), 0),
    'top_3x_mais', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'work_item_id', work_item_id,
        'title', title,
        'work_item_type', work_item_type,
        'sprint_code', sprint_code,
        'ciclos', ciclos,
        'tem_aberto', tem_aberto
      ) ORDER BY ciclos DESC, work_item_id)
      FROM (SELECT * FROM ev WHERE ciclos >= 3 ORDER BY ciclos DESC LIMIT 30) t
    ), '[]'::jsonb),
    -- Reconciliação do bug 76-vs-26 (itens concluídos com retorno, via lifecycle)
    'reconc', jsonb_build_object(
      'itens_qualquer_estagio', COALESCE((SELECT COUNT(*) FROM public.pbi_lifecycle_summary WHERE qa_return_count > 0), 0),
      'itens_concluidos', COALESCE((SELECT COUNT(*) FROM public.pbi_lifecycle_summary WHERE current_stage = 'done' AND qa_return_count > 0), 0),
      'ciclos_concluidos', COALESCE((SELECT SUM(qa_return_count) FROM public.pbi_lifecycle_summary WHERE current_stage = 'done' AND qa_return_count > 0), 0)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_qa_exec_retornos_distribuicao(int) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_qa_exec_retornos_distribuicao(int) IS
  'Retornos QA quantificados por nº de ciclos (1x/2x/>=3x destaque) a partir de devops_qa_return_events + reconciliação eventos->itens->concluídos (bug 76-vs-26).';
