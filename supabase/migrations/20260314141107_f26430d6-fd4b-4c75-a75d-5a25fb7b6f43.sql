-- Insert sync job for timelog
INSERT INTO hub_sync_jobs (job_key, integration_id, area_id, schedule_minutes, enabled, config)
VALUES (
  'devops-sync-timelog',
  'dcbc333c-da92-47cd-8a1d-8852d1fdfa78',
  'ad0f888f-8133-4161-93bc-da037a83d536',
  15,
  true,
  '{"function_name": "devops-sync-timelog"}'::jsonb
);

-- Schedule cron job for timelog sync every 15 minutes
SELECT cron.schedule(
  'devops-sync-timelog-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/devops-sync-timelog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT public.get_cron_secret())
    ),
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);