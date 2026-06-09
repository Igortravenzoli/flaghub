-- ============================================================================
-- Migration: 20260609121000_qa_gerencial_closed_by_rpcs.sql
-- DASH QA — RPCs gerenciais baseadas em Closed By autorizado
--
--   1. rpc_gerencial_qa_summary       — adiciona "concluidos" (Closed By da
--      allowlist) e redefine aprovadas/reprovadas em cima disso.
--   2. rpc_qa_encerramentos_por_usuario — histórico de encerramentos por
--      usuário do QA, por sprint (gráfico novo).
--   3. rpc_gerencial_qa_items         — linhas por item (tags, retorno, closer)
--      p/ agregações por produto/sistema no frontend.
--
-- "Concluído QA" = o item foi encerrado por um usuário da tabela
-- qa_authorized_closers (match por email OU display_name, case-insensitive).
-- ============================================================================

-- ── 1. rpc_gerencial_qa_summary (redefinição: + coluna concluidos) ───────────
DROP FUNCTION IF EXISTS public.rpc_gerencial_qa_summary(text, date, date);

CREATE OR REPLACE FUNCTION public.rpc_gerencial_qa_summary(
  p_sprint_code text DEFAULT NULL,
  p_date_start  date DEFAULT NULL,
  p_date_end    date DEFAULT NULL
)
RETURNS TABLE(
  sprint_code        text,
  total_itens        bigint,
  concluidos         bigint,
  testadas           bigint,
  aprovadas          bigint,
  reprovadas         bigint,
  retornadas         bigint,
  avg_qualidade_days numeric,
  max_qualidade_days numeric,
  taxa_aprovacao     numeric,
  taxa_retrabalho    numeric,
  retrabalho_baixo   bigint,
  retrabalho_alto    bigint,
  retrabalho_critico bigint,
  itens_criticos     bigint,
  itens_atencao      bigint,
  itens_saudaveis    bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  WITH base AS (
    SELECT
      COALESCE(ls.last_committed_sprint, ls.first_committed_sprint, 'Sem Sprint') AS sprint,
      ls.*,
      hs.health_status,
      EXISTS (
        SELECT 1 FROM qa_authorized_closers c
        WHERE c.is_active
          AND (
            lower(c.email)        = lower(w.closed_by_email)
            OR lower(c.display_name) = lower(w.closed_by)
          )
      ) AS qa_closed
    FROM pbi_lifecycle_summary ls
    LEFT JOIN devops_work_items w  ON w.id = ls.work_item_id
    LEFT JOIN pbi_health_summary hs ON hs.work_item_id = ls.work_item_id
    WHERE (p_sprint_code IS NULL OR ls.last_committed_sprint = p_sprint_code OR ls.first_committed_sprint = p_sprint_code)
      AND (p_date_start IS NULL OR ls.computed_at::date >= p_date_start)
      AND (p_date_end   IS NULL OR ls.computed_at::date <= p_date_end)
  )
  SELECT
    b.sprint AS sprint_code,
    COUNT(*) AS total_itens,
    COUNT(*) FILTER (WHERE b.qa_closed) AS concluidos,
    COUNT(*) FILTER (WHERE b.qualidade_days > 0 OR b.current_stage = 'qualidade' OR b.qa_closed) AS testadas,
    COUNT(*) FILTER (WHERE b.qa_closed AND COALESCE(b.qa_return_count,0) = 0) AS aprovadas,
    COUNT(*) FILTER (WHERE b.qa_closed AND COALESCE(b.qa_return_count,0) > 0) AS reprovadas,
    COUNT(*) FILTER (WHERE b.qa_return_count > 0 AND b.current_stage IN ('fabrica','design','backlog')) AS retornadas,
    ROUND(AVG(CASE WHEN b.qualidade_days > 0 THEN b.qualidade_days END), 1) AS avg_qualidade_days,
    COALESCE(MAX(CASE WHEN b.qualidade_days > 0 THEN b.qualidade_days END), 0) AS max_qualidade_days,
    CASE WHEN COUNT(*) FILTER (WHERE b.qa_closed) > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE b.qa_closed AND COALESCE(b.qa_return_count,0) = 0)::numeric /
        NULLIF(COUNT(*) FILTER (WHERE b.qa_closed), 0) * 100, 1)
      ELSE 0 END AS taxa_aprovacao,
    CASE WHEN COUNT(*) FILTER (WHERE b.qa_closed) > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE b.qa_closed AND COALESCE(b.qa_return_count,0) > 0)::numeric /
        NULLIF(COUNT(*) FILTER (WHERE b.qa_closed), 0) * 100, 1)
      ELSE 0 END AS taxa_retrabalho,
    COUNT(*) FILTER (WHERE b.qa_return_count = 1) AS retrabalho_baixo,
    COUNT(*) FILTER (WHERE b.qa_return_count = 2) AS retrabalho_alto,
    COUNT(*) FILTER (WHERE b.qa_return_count >= 3) AS retrabalho_critico,
    COUNT(*) FILTER (WHERE b.health_status = 'vermelho') AS itens_criticos,
    COUNT(*) FILTER (WHERE b.health_status = 'amarelo') AS itens_atencao,
    COUNT(*) FILTER (WHERE b.health_status = 'verde') AS itens_saudaveis
  FROM base b
  GROUP BY b.sprint
  ORDER BY b.sprint DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_gerencial_qa_summary(text, date, date) TO authenticated;

COMMENT ON FUNCTION public.rpc_gerencial_qa_summary(text, date, date) IS
  'Resumo gerencial QA por sprint. "concluidos"/"aprovadas"/"reprovadas" consideram '
  'apenas itens encerrados por usuário da allowlist qa_authorized_closers (Closed By).';

-- ── 2. rpc_qa_encerramentos_por_usuario (histórico por closer × sprint) ──────
DROP FUNCTION IF EXISTS public.rpc_qa_encerramentos_por_usuario(text, date, date);

CREATE OR REPLACE FUNCTION public.rpc_qa_encerramentos_por_usuario(
  p_sprint_code text DEFAULT NULL,
  p_date_start  date DEFAULT NULL,
  p_date_end    date DEFAULT NULL
)
RETURNS TABLE(
  sprint_code    text,
  closer_email   text,
  closer_display text,
  encerramentos  bigint,
  sem_retorno    bigint,
  com_retorno    bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    COALESCE(ls.last_committed_sprint, ls.first_committed_sprint, 'Sem Sprint') AS sprint_code,
    c.email AS closer_email,
    COALESCE(c.canonical, c.display_name) AS closer_display,
    COUNT(*) AS encerramentos,
    COUNT(*) FILTER (WHERE COALESCE(ls.qa_return_count,0) = 0) AS sem_retorno,
    COUNT(*) FILTER (WHERE COALESCE(ls.qa_return_count,0) > 0) AS com_retorno
  FROM pbi_lifecycle_summary ls
  JOIN devops_work_items w ON w.id = ls.work_item_id
  JOIN qa_authorized_closers c
    ON c.is_active
   AND (
     lower(c.email)        = lower(w.closed_by_email)
     OR lower(c.display_name) = lower(w.closed_by)
   )
  WHERE (p_sprint_code IS NULL OR ls.last_committed_sprint = p_sprint_code OR ls.first_committed_sprint = p_sprint_code)
    AND (p_date_start IS NULL OR ls.computed_at::date >= p_date_start)
    AND (p_date_end   IS NULL OR ls.computed_at::date <= p_date_end)
  GROUP BY 1, c.email, COALESCE(c.canonical, c.display_name)
  ORDER BY 1 DESC, encerramentos DESC;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_qa_encerramentos_por_usuario(text, date, date) TO authenticated;

COMMENT ON FUNCTION public.rpc_qa_encerramentos_por_usuario(text, date, date) IS
  'Histórico de encerramentos do QA por usuário (allowlist) e sprint.';

-- ── 3. rpc_gerencial_qa_items (linhas por item p/ agregação por produto) ─────
DROP FUNCTION IF EXISTS public.rpc_gerencial_qa_items(text, date, date);

CREATE OR REPLACE FUNCTION public.rpc_gerencial_qa_items(
  p_sprint_code text DEFAULT NULL,
  p_date_start  date DEFAULT NULL,
  p_date_end    date DEFAULT NULL
)
RETURNS TABLE(
  work_item_id    integer,
  sprint_code     text,
  work_item_type  text,
  title           text,
  tags            text,
  qa_return_count integer,
  closed_by       text,
  closed_by_email text,
  qa_closed       boolean,
  current_stage   text,
  qualidade_days  numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    ls.work_item_id,
    COALESCE(ls.last_committed_sprint, ls.first_committed_sprint, 'Sem Sprint') AS sprint_code,
    w.work_item_type,
    w.title,
    w.tags,
    COALESCE(ls.qa_return_count, 0) AS qa_return_count,
    w.closed_by,
    w.closed_by_email,
    EXISTS (
      SELECT 1 FROM qa_authorized_closers c
      WHERE c.is_active
        AND (
          lower(c.email)        = lower(w.closed_by_email)
          OR lower(c.display_name) = lower(w.closed_by)
        )
    ) AS qa_closed,
    ls.current_stage,
    ls.qualidade_days
  FROM pbi_lifecycle_summary ls
  LEFT JOIN devops_work_items w ON w.id = ls.work_item_id
  WHERE (p_sprint_code IS NULL OR ls.last_committed_sprint = p_sprint_code OR ls.first_committed_sprint = p_sprint_code)
    AND (p_date_start IS NULL OR ls.computed_at::date >= p_date_start)
    AND (p_date_end   IS NULL OR ls.computed_at::date <= p_date_end);
$$;

GRANT EXECUTE ON FUNCTION public.rpc_gerencial_qa_items(text, date, date) TO authenticated;

COMMENT ON FUNCTION public.rpc_gerencial_qa_items(text, date, date) IS
  'Linhas por item (PBI/Bug) do recorte QA — tags, retorno e Closed By — '
  'para agregações por produto/sistema no frontend.';
