-- Reagenda jobs de sync para incluir Authorization header no net.http_post.
-- Mantem schedule atual quando existir no cron.job e evita hardcode de project ref.

DO $$
DECLARE
  v_base_url text;
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bWdwcGZ5bHR3c3FyeWZ4a2JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDEwMDEsImV4cCI6MjA4NTExNzAwMX0.6TqJwx2_8dbFwbvflSZKVe6MSaagmPosQaxpg0l9Waw';
  v_schedule text;
  v_command text;
  v_job record;
BEGIN
  SELECT substring(j.command from '(https://[^''\n]+)') INTO v_base_url
  FROM cron.job j
  WHERE j.jobname IN ('sync-devops-all', 'sync-devops-timelog', 'sync-vdesk-clientes', 'sync-vdesk-helpdesk', 'sync-vdesk-timelog')
    AND j.command LIKE '%https://%.supabase.co/functions/v1/%'
  LIMIT 1;

  IF v_base_url IS NULL THEN
    v_base_url := 'https://nxmgppfyltwsqryfxkbm.supabase.co';
  END IF;

  FOR v_job IN
    SELECT *
    FROM (VALUES
      ('sync-devops-all', '0 * * * *', 'devops-sync-all'),
      ('sync-devops-timelog', '0 */2 * * *', 'devops-sync-timelog'),
      ('sync-vdesk-clientes', '*/15 * * * *', 'vdesk-sync-base-clientes'),
      ('sync-vdesk-helpdesk', '*/5 * * * *', 'vdesk-sync-helpdesk'),
      ('sync-vdesk-timelog', '0 1 * * *', 'vdesk-sync-timelog')
    ) AS t(job_name, default_schedule, function_name)
  LOOP
    SELECT j.schedule INTO v_schedule
    FROM cron.job j
    WHERE j.jobname = v_job.job_name
    LIMIT 1;

    v_schedule := COALESCE(v_schedule, v_job.default_schedule);

    v_command := format($cmd$
SELECT net.http_post(
  url := %L,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', %L,
    'x-cron-secret', public.get_cron_secret()
  ),
  body := '{}'::jsonb
) AS request_id;
$cmd$, v_base_url || '/functions/v1/' || v_job.function_name, 'Bearer ' || v_anon_key);

    PERFORM cron.unschedule(v_job.job_name)
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job.job_name);

    PERFORM cron.schedule(v_job.job_name, v_schedule, v_command);
  END LOOP;
END;
$$;
