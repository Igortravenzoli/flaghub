-- ============================================================================
-- Migration: 20260611100000_qa_atemporal_rpcs.sql
-- QA atemporal — alinhado à query oficial do Azure DevOps
--
-- Definição validada (reproduz a query do DevOps exatamente):
--   Concluído QA  = work item de QUALQUER tipo, state IN (Done,Closed,Resolved),
--                   Closed By ∈ qa_authorized_closers          → 473 em 2026
--   Com retorno   = tag 'RETORNO QA' (marcador de negócio)     → 92 em 2026
--   Período       = closed_date (visão atemporal: conta o que foi ENCERRADO
--                   dentro do período, independente da sprint alocada)
--
-- Obs.: sem datas, o summary replica o filtro DevOps (changed_date >= início
-- do ano) para o KPI bater com a query oficial (473). Com datas (recorte de
-- sprint), o corte é por closed_date.
--
-- RPCs:
--   1. fn_sprint_code_for_date(d)            — bucket de sprint p/ uma data
--   2. rpc_qa_atemporal_summary              — KPIs headline (473/92)
--   3. rpc_qa_encerramentos_por_usuario      — REDEFINIDA: closer × sprint-período
--   4. rpc_qa_closed_por_sprint_periodo      — período × sprint de ORIGEM (empilhado)
--   5. rpc_qa_items_atemporal                — linhas p/ drill-down + clientes
--   6. rpc_qa_handoff_histogram              — entradas em "Em Teste" por dia
-- ============================================================================

-- ── 1. Sprint bucket para uma data ───────────────────────────────────────────
-- Inverso de fn_sprint_official_range: sprints quinzenais a partir da primeira
-- segunda-feira do ano. O fim de semana entre sprints conta na sprint recém
-- encerrada (janela contínua de 14 dias).
CREATE OR REPLACE FUNCTION public.fn_sprint_code_for_date(p_date date)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM p_date)::int;
  v_jan1 date;
  v_first_monday date;
  v_n int;
BEGIN
  v_jan1 := make_date(v_year, 1, 1);
  v_first_monday := v_jan1 + ((8 - EXTRACT(ISODOW FROM v_jan1)::int) % 7);
  IF p_date < v_first_monday THEN
    v_year := v_year - 1;
    v_jan1 := make_date(v_year, 1, 1);
    v_first_monday := v_jan1 + ((8 - EXTRACT(ISODOW FROM v_jan1)::int) % 7);
  END IF;
  v_n := ((p_date - v_first_monday) / 14) + 1;
  RETURN 'S' || v_n || '-' || v_year;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_sprint_code_for_date(date) TO authenticated, service_role;

-- ── 2. Summary headline ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.rpc_qa_atemporal_summary(date, date);

CREATE OR REPLACE FUNCTION public.rpc_qa_atemporal_summary(
  p_date_start date DEFAULT NULL,
  p_date_end   date DEFAULT NULL
)
RETURNS TABLE(
  concluidos bigint,
  com_retorno bigint,
  sem_retorno bigint,
  pct_sem_retorno numeric,
  qtd_tasks bigint,
  qtd_pbis bigint,
  qtd_bugs bigint,
  qtd_outros bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  WITH qa_done AS (
    SELECT w.*
    FROM devops_work_items w
    WHERE lower(w.state) IN ('done','closed','resolved')
      AND EXISTS (
        SELECT 1 FROM qa_authorized_closers c
        WHERE c.is_active
          AND (lower(c.email) = lower(w.closed_by_email) OR lower(c.display_name) = lower(w.closed_by))
      )
      AND CASE
        WHEN p_date_start IS NULL AND p_date_end IS NULL
          THEN w.changed_date >= date_trunc('year', now())  -- réplica da query DevOps
        ELSE (p_date_start IS NULL OR w.closed_date::date >= p_date_start)
         AND (p_date_end   IS NULL OR w.closed_date::date <= p_date_end)
      END
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE tags ILIKE '%RETORNO QA%'),
    COUNT(*) FILTER (WHERE tags IS NULL OR tags NOT ILIKE '%RETORNO QA%'),
    CASE WHEN COUNT(*) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE tags IS NULL OR tags NOT ILIKE '%RETORNO QA%')::numeric / COUNT(*) * 100, 1)
      ELSE 0 END,
    COUNT(*) FILTER (WHERE work_item_type = 'Task'),
    COUNT(*) FILTER (WHERE work_item_type IN ('Product Backlog Item','User Story')),
    COUNT(*) FILTER (WHERE work_item_type = 'Bug'),
    COUNT(*) FILTER (WHERE work_item_type NOT IN ('Task','Product Backlog Item','User Story','Bug'))
  FROM qa_done;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_qa_atemporal_summary(date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_qa_atemporal_summary(date, date) IS
  'KPIs do QA alinhados à query DevOps: qualquer tipo, Done, Closed By allowlist; '
  'com retorno = tag RETORNO QA. Sem datas = changed_date >= início do ano (473).';

-- ── 3. Encerramentos por usuário (REDEFINIDA: período por closed_date) ───────
DROP FUNCTION IF EXISTS public.rpc_qa_encerramentos_por_usuario(text, date, date);
DROP FUNCTION IF EXISTS public.rpc_qa_encerramentos_por_usuario(date, date);

CREATE OR REPLACE FUNCTION public.rpc_qa_encerramentos_por_usuario(
  p_date_start date DEFAULT NULL,
  p_date_end   date DEFAULT NULL
)
RETURNS TABLE(
  sprint_code text,
  closer_email text,
  closer_display text,
  encerramentos bigint,
  sem_retorno bigint,
  com_retorno bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    fn_sprint_code_for_date(w.closed_date::date) AS sprint_code,
    c.email,
    COALESCE(c.canonical, c.display_name),
    COUNT(*),
    COUNT(*) FILTER (WHERE w.tags IS NULL OR w.tags NOT ILIKE '%RETORNO QA%'),
    COUNT(*) FILTER (WHERE w.tags ILIKE '%RETORNO QA%')
  FROM devops_work_items w
  JOIN qa_authorized_closers c
    ON c.is_active
   AND (lower(c.email) = lower(w.closed_by_email) OR lower(c.display_name) = lower(w.closed_by))
  WHERE lower(w.state) IN ('done','closed','resolved')
    AND w.closed_date IS NOT NULL
    AND w.closed_date::date >= COALESCE(p_date_start, date_trunc('year', now())::date)
    AND w.closed_date::date <= COALESCE(p_date_end, CURRENT_DATE)
  GROUP BY 1, c.email, COALESCE(c.canonical, c.display_name)
  ORDER BY 1, 4 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_qa_encerramentos_por_usuario(date, date) TO authenticated, service_role;

-- ── 4. Encerradas por período de sprint × sprint de origem ───────────────────
DROP FUNCTION IF EXISTS public.rpc_qa_closed_por_sprint_periodo(int);

CREATE OR REPLACE FUNCTION public.rpc_qa_closed_por_sprint_periodo(
  p_year int DEFAULT EXTRACT(YEAR FROM NOW())::int
)
RETURNS TABLE(
  sprint_periodo text,
  sprint_origem text,
  qtd bigint,
  com_retorno bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    fn_sprint_code_for_date(w.closed_date::date) AS sprint_periodo,
    COALESCE((regexp_match(coalesce(w.iteration_path,''), 'S[0-9]+-[0-9]{4}'))[1], 'Sem sprint') AS sprint_origem,
    COUNT(*),
    COUNT(*) FILTER (WHERE w.tags ILIKE '%RETORNO QA%')
  FROM devops_work_items w
  WHERE lower(w.state) IN ('done','closed','resolved')
    AND w.closed_date IS NOT NULL
    AND EXTRACT(YEAR FROM w.closed_date)::int = p_year
    AND EXISTS (
      SELECT 1 FROM qa_authorized_closers c
      WHERE c.is_active
        AND (lower(c.email) = lower(w.closed_by_email) OR lower(c.display_name) = lower(w.closed_by))
    )
  GROUP BY 1, 2
  ORDER BY 1, 3 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_qa_closed_por_sprint_periodo(int) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_qa_closed_por_sprint_periodo(int) IS
  'QA atemporal: itens encerrados DENTRO do período de cada sprint (closed_date), '
  'com breakdown pela sprint de ORIGEM da task (iteration_path).';

-- ── 5. Itens para drill-down / agregações por produto e cliente ──────────────
DROP FUNCTION IF EXISTS public.rpc_qa_items_atemporal(date, date);

CREATE OR REPLACE FUNCTION public.rpc_qa_items_atemporal(
  p_date_start date DEFAULT NULL,
  p_date_end   date DEFAULT NULL
)
RETURNS TABLE(
  work_item_id integer,
  title text,
  work_item_type text,
  closed_by text,
  closed_date timestamptz,
  sprint_periodo text,
  sprint_origem text,
  tem_retorno boolean,
  tags text,
  web_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    w.id,
    w.title,
    w.work_item_type,
    w.closed_by,
    w.closed_date,
    CASE WHEN w.closed_date IS NOT NULL THEN fn_sprint_code_for_date(w.closed_date::date) END,
    COALESCE((regexp_match(coalesce(w.iteration_path,''), 'S[0-9]+-[0-9]{4}'))[1], 'Sem sprint'),
    COALESCE(w.tags ILIKE '%RETORNO QA%', false),
    w.tags,
    w.web_url
  FROM devops_work_items w
  WHERE lower(w.state) IN ('done','closed','resolved')
    AND EXISTS (
      SELECT 1 FROM qa_authorized_closers c
      WHERE c.is_active
        AND (lower(c.email) = lower(w.closed_by_email) OR lower(c.display_name) = lower(w.closed_by))
    )
    AND CASE
      WHEN p_date_start IS NULL AND p_date_end IS NULL
        THEN w.changed_date >= date_trunc('year', now())
      ELSE (p_date_start IS NULL OR w.closed_date::date >= p_date_start)
       AND (p_date_end   IS NULL OR w.closed_date::date <= p_date_end)
    END
  ORDER BY w.closed_date DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_qa_items_atemporal(date, date) TO authenticated, service_role;

-- ── 6. Histograma de handoff Dev→QA (entradas em "Em Teste" por dia) ─────────
DROP FUNCTION IF EXISTS public.rpc_qa_handoff_histogram(date, date);

CREATE OR REPLACE FUNCTION public.rpc_qa_handoff_histogram(
  p_date_start date DEFAULT NULL,
  p_date_end   date DEFAULT NULL
)
RETURNS TABLE(
  dia date,
  entradas bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    (e->>'revisedDate')::timestamptz::date AS dia,
    COUNT(*)
  FROM devops_work_items w,
       jsonb_array_elements(w.state_history) e
  WHERE w.state_history IS NOT NULL
    AND lower(trim(e->>'newValue')) = 'em teste'
    AND (e->>'revisedDate') IS NOT NULL
    AND (e->>'revisedDate')::timestamptz::date >= COALESCE(p_date_start, date_trunc('year', now())::date)
    AND (e->>'revisedDate')::timestamptz::date <= COALESCE(p_date_end, CURRENT_DATE)
  GROUP BY 1
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_qa_handoff_histogram(date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_qa_handoff_histogram(date, date) IS
  'Volume diário de itens entrando em "Em Teste" (handoff Dev→QA), via state_history. '
  'Cobertura depende do histórico coletado (Tasks entram conforme o sync completa).';
