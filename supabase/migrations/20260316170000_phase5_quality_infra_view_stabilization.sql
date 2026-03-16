-- Phase 5 — Qualidade/Infra view stabilization
--
-- Goals:
-- 1) remove duplicated rows caused by multi-query membership (same work_item in many queues)
-- 2) ensure iteration_path/tags are present for sprint filters and QA "AVIAO" KPI

CREATE OR REPLACE VIEW public.vw_qualidade_kpis
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    dq.work_item_id,
    dq.title,
    dq.work_item_type,
    dq.state,
    dq.assigned_to_display,
    dq.priority,
    dq.tags,
    dq.iteration_path,
    dq.created_date,
    dq.changed_date,
    dq.web_url,
    dq.snapshot_at
  FROM public.vw_devops_queue_items dq
  WHERE dq.sector = 'qualidade'
     OR dq.work_item_type IN ('Bug', 'Test Case', 'Test Plan', 'Test Suite')
)
SELECT DISTINCT ON (work_item_id)
  work_item_id AS id,
  title,
  work_item_type,
  state,
  assigned_to_display,
  priority,
  created_date,
  changed_date,
  web_url,
  tags,
  iteration_path
FROM base
ORDER BY work_item_id, changed_date DESC NULLS LAST, snapshot_at DESC NULLS LAST;

CREATE OR REPLACE VIEW public.vw_infraestrutura_kpis
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    dq.work_item_id,
    dq.title,
    dq.work_item_type,
    dq.state,
    dq.assigned_to_display,
    dq.priority,
    dq.effort,
    dq.tags,
    dq.iteration_path,
    dq.created_date,
    dq.changed_date,
    dq.web_url,
    dq.snapshot_at
  FROM public.vw_devops_queue_items dq
  WHERE dq.sector = 'infraestrutura'
     OR (dq.tags IS NOT NULL AND (
          dq.tags ILIKE '%infra%'
       OR dq.tags ILIKE '%iso%'
       OR dq.tags ILIKE '%seguranca%'
       OR dq.tags ILIKE '%segurança%'
       OR dq.tags ILIKE '%rede%'
     ))
)
SELECT DISTINCT ON (work_item_id)
  work_item_id AS id,
  title,
  work_item_type,
  state,
  assigned_to_display,
  priority,
  effort,
  tags,
  created_date,
  changed_date,
  web_url,
  iteration_path
FROM base
ORDER BY work_item_id, changed_date DESC NULLS LAST, snapshot_at DESC NULLS LAST;
