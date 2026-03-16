-- Phase 1: incremental processing metadata + retention jobs

ALTER TABLE public.devops_work_items
ADD COLUMN IF NOT EXISTS iteration_history_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_devops_wi_iteration_history_synced_at
ON public.devops_work_items (iteration_history_synced_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-helpdesk-snapshots-daily') THEN
    PERFORM cron.unschedule('cleanup-helpdesk-snapshots-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-helpdesk-snapshots-daily',
  '10 2 * * *',
  $$
  DELETE FROM public.helpdesk_dashboard_snapshots
  WHERE collected_at < now() - interval '90 days';
  $$
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-hub-raw-ingestions-daily') THEN
    PERFORM cron.unschedule('cleanup-hub-raw-ingestions-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-hub-raw-ingestions-daily',
  '25 2 * * *',
  $$
  DELETE FROM public.hub_raw_ingestions
  WHERE collected_at < now() - interval '30 days';
  $$
);
