-- Purge all DevOps work items and related data to start fresh
-- 1. Clear query-item links
DELETE FROM public.devops_query_items_current;

-- 2. Clear time logs
DELETE FROM public.devops_time_logs;

-- 3. Clear work items
DELETE FROM public.devops_work_items;

-- 4. Reset last_synced_at on all queries so next sync fetches everything
UPDATE public.devops_queries SET last_synced_at = NULL;