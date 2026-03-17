-- Fix: unschedule the broken job and reschedule with hardcoded URL
SELECT cron.unschedule('devops-sync-timelog-every-15min');

SELECT cron.schedule(
  'devops-sync-timelog-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://onpdhywrzjtwxaxuvijw.supabase.co/functions/v1/devops-sync-timelog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT public.get_cron_secret())
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);