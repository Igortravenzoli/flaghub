-- Fix para rpc_gerencial_fabrica_summary: contar QA by sprint de detecção
-- Salvar como fix_qa_return_rpc.sql e executar no Supabase

WITH qa_returns_by_sprint AS (
  SELECT
    COALESCE(dqre.sprint_code, 'Sem Sprint') AS sprint,
    COUNT(DISTINCT dqre.work_item_id) AS unique_items_with_returns
  FROM devops_qa_return_events dqre
  GROUP BY COALESCE(dqre.sprint_code, 'Sem Sprint')
),
ls_sprints AS (
  SELECT DISTINCT COALESCE(last_committed_sprint, first_committed_sprint, 'Sem Sprint') AS sprint
  FROM pbi_lifecycle_summary
),
result AS (
  SELECT
    ls.sprint,
    COALESCE(qr.unique_items_with_returns, 0) AS qa_return_total
  FROM ls_sprints ls
  LEFT JOIN qa_returns_by_sprint qr ON qr.sprint = ls.sprint
  ORDER BY ls.sprint DESC
)
SELECT * FROM result;
