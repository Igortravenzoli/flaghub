-- ============================================================================
-- Migration: 20260612100000_fix_9999_dates_cleanup.sql
-- Limpeza da data sentinela 9999-01-01 do Azure DevOps
--
-- A API de updates do DevOps marca a revisão corrente com revisedDate
-- 9999-01-01. O sync gravava essa data crua em iteration_history, gerando
-- eventos de etapa com entered_at/exited_at em 9999 e durações de ~2,9 milhões
-- de dias (ex.: tempo médio QA de 647 mil dias). O sync já foi corrigido para
-- sanitizar; esta migration conserta os dados existentes:
--   1. iteration_history: substitui revisedDate 9999 pela changed_date real.
--   2. pbi_stage_events: remove eventos iniciados em 9999 e reabre os que
--      "saíram" em 9999 (são a etapa corrente).
--   3. pbi_lifecycle_summary: recomputa os dias por etapa dos itens afetados
--      a partir dos eventos limpos (abertos contam até now()).
--   4. qa_authorized_closers: canonical 'Marquin' → 'Marco' (pedido de UX).
-- ============================================================================

-- ── 1. iteration_history: troca 9999 pela data real da última alteração ─────
UPDATE public.devops_work_items w
SET iteration_history = (
  SELECT jsonb_agg(
           CASE WHEN (e->>'revisedDate') >= '9000-01-01'
                THEN jsonb_set(e, '{revisedDate}', to_jsonb(w.changed_date::text))
                ELSE e
           END
           ORDER BY ord)
  FROM jsonb_array_elements(w.iteration_history) WITH ORDINALITY t(e, ord)
)
WHERE w.iteration_history IS NOT NULL
  AND w.iteration_history::text LIKE '%9999-01-01%';

-- ── 2. Eventos de etapa ──────────────────────────────────────────────────────
-- Guarda os itens afetados antes de mexer (p/ recomputar no passo 3)
CREATE TEMP TABLE tmp_affected_9999 AS
SELECT DISTINCT work_item_id
FROM public.pbi_stage_events
WHERE entered_at >= '9000-01-01' OR exited_at >= '9000-01-01';

DELETE FROM public.pbi_stage_events WHERE entered_at >= '9000-01-01';

UPDATE public.pbi_stage_events
SET exited_at = NULL,
    duration_days = NULL,
    updated_at = now()
WHERE exited_at >= '9000-01-01';

-- ── 3. Recomputa dias por etapa dos itens afetados ───────────────────────────
WITH agg AS (
  SELECT
    e.work_item_id,
    COALESCE(SUM(CASE WHEN e.stage_key = 'backlog'   THEN COALESCE(e.duration_days, EXTRACT(EPOCH FROM (now() - e.entered_at)) / 86400) END), 0) AS backlog_d,
    COALESCE(SUM(CASE WHEN e.stage_key = 'design'    THEN COALESCE(e.duration_days, EXTRACT(EPOCH FROM (now() - e.entered_at)) / 86400) END), 0) AS design_d,
    COALESCE(SUM(CASE WHEN e.stage_key = 'fabrica'   THEN COALESCE(e.duration_days, EXTRACT(EPOCH FROM (now() - e.entered_at)) / 86400) END), 0) AS fabrica_d,
    COALESCE(SUM(CASE WHEN e.stage_key = 'qualidade' THEN COALESCE(e.duration_days, EXTRACT(EPOCH FROM (now() - e.entered_at)) / 86400) END), 0) AS qualidade_d,
    COALESCE(SUM(CASE WHEN e.stage_key = 'deploy'    THEN COALESCE(e.duration_days, EXTRACT(EPOCH FROM (now() - e.entered_at)) / 86400) END), 0) AS deploy_d
  FROM public.pbi_stage_events e
  JOIN tmp_affected_9999 a ON a.work_item_id = e.work_item_id
  GROUP BY e.work_item_id
)
UPDATE public.pbi_lifecycle_summary ls
SET backlog_days   = ROUND(agg.backlog_d::numeric, 2),
    design_days    = ROUND(agg.design_d::numeric, 2),
    fabrica_days   = ROUND(agg.fabrica_d::numeric, 2),
    qualidade_days = ROUND(agg.qualidade_d::numeric, 2),
    deploy_days    = ROUND(agg.deploy_d::numeric, 2),
    updated_at     = now()
FROM agg
WHERE agg.work_item_id = ls.work_item_id;

DROP TABLE tmp_affected_9999;

-- ── 4. Canonical do closer: Marquin → Marco ──────────────────────────────────
UPDATE public.qa_authorized_closers
SET canonical = 'Marco', updated_at = now()
WHERE lower(email) = 'marco@flag.com.br';
