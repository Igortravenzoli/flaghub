-- Phase 4 — Roll-up rule: add count_in_kpi + tags to vw_fabrica_kpis
--
-- count_in_kpi = false for:
--   • Tasks/Bugs in the queue whose parent PBI is ALSO in the queue  (first UNION)
--   • All child Tasks pulled in via the second UNION (parent already counted)
--
-- KPI metrics (total, inProgress, etc.) MUST filter to count_in_kpi = true
-- to avoid double-counting PBIs alongside their child Tasks.
-- Sprint-board display continues to use all rows (shows full task hierarchy).

CREATE OR REPLACE VIEW public.vw_fabrica_kpis
WITH (security_invoker = on) AS

-- ── Part 1: items directly in the Fábrica queue ──────────────────────────────
SELECT
    dq.work_item_id AS id,
    dq.title,
    dq.work_item_type,
    dq.state,
    dq.assigned_to_display,
    dq.priority,
    dq.effort,
    dq.iteration_path,
    dq.created_date,
    dq.changed_date,
    dq.parent_id,
    p.title           AS parent_title,
    p.work_item_type  AS parent_type,
    dq.web_url,
    dq.tags,
    -- count_in_kpi: Tasks/Bugs whose parent PBI is already in the queue
    -- are excluded from KPI counts to prevent double-counting.
    CASE
        WHEN dq.work_item_type NOT IN ('Task', 'Bug', 'Test Case') THEN true
        WHEN dq.parent_id IS NULL                                  THEN true
        WHEN NOT EXISTS (
            SELECT 1
            FROM   public.vw_devops_queue_items dq2
            WHERE  dq2.work_item_id = dq.parent_id
              AND  dq2.sector       = 'fabrica'
        ) THEN true
        ELSE false
    END AS count_in_kpi

FROM public.vw_devops_queue_items dq
LEFT JOIN public.devops_work_items p ON p.id = dq.parent_id
WHERE dq.sector = 'fabrica'

UNION ALL

-- ── Part 2: child Tasks/Bugs whose parent PBI is in the queue ────────────────
-- These are never counted in KPI metrics (parent PBI already counted above).
SELECT
    child.id,
    child.title,
    child.work_item_type,
    child.state,
    child.assigned_to_display,
    child.priority,
    child.effort,
    child.iteration_path,
    child.created_date,
    child.changed_date,
    child.parent_id,
    parent_pbi.title          AS parent_title,
    parent_pbi.work_item_type AS parent_type,
    child.web_url,
    child.tags,
    false AS count_in_kpi   -- parent PBI is counted in Part 1

FROM public.devops_work_items child
JOIN public.vw_devops_queue_items dq_parent
    ON  dq_parent.work_item_id = child.parent_id
    AND dq_parent.sector       = 'fabrica'
LEFT JOIN public.devops_work_items parent_pbi ON parent_pbi.id = child.parent_id
WHERE child.work_item_type IN ('Task', 'Bug')
  AND child.id NOT IN (
      SELECT dq3.work_item_id
      FROM   public.vw_devops_queue_items dq3
      WHERE  dq3.sector = 'fabrica'
  );
