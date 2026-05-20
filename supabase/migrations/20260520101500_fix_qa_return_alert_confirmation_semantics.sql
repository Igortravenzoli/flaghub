-- Ensure dispatch confirmation metadata is consistent with alert status.
-- Only successful dispatches may keep alert_sent_at.

UPDATE public.devops_qa_return_events
SET alert_sent_at = NULL
WHERE alert_status NOT IN ('sent', 'fallback_sent')
  AND alert_sent_at IS NOT NULL;
