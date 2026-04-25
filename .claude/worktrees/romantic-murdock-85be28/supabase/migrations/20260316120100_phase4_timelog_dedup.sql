-- Phase 4 — TimeLogs dedup hardening
--
-- Adds ext_entry_id: the official entry-level ID from the TechsBCN DevOps-TimeLog
-- extension API.  A partial unique index allows UPSERT-on-conflict when the API
-- provides entry IDs, enabling UPDATE of changed entries (e.g. edited time).
-- Rows ingested without an official ID continue to use content-based dedup.

ALTER TABLE public.devops_time_logs
    ADD COLUMN IF NOT EXISTS ext_entry_id text;

-- Partial unique index: only applies when ext_entry_id is not null, so
-- the constraint does not affect existing rows or entries without IDs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_devops_time_logs_ext_entry_id
    ON public.devops_time_logs (ext_entry_id)
    WHERE ext_entry_id IS NOT NULL;
