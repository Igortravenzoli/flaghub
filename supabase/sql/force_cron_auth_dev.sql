DO $$
DECLARE
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ucGRoeXdyemp0d3hheHV2aWp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0MDE3MTIsImV4cCI6MjA4Nzk3NzcxMn0.D0N8dtsr7EHsReGCwHV6YNxsAx5z9P3LYoPaX2P-Pb0';
  v_base_url text := 'https://onpdhywrzjtwxaxuvijw.supabase.co';
  v_schedule text;
  v_command text;
  v_job record;
BEGIN
  FOR v_job IN
    SELECT *
    FROM (VALUES
      ('sync-devops-all', '*/10 * * * *', 'devops-sync-all'),
      ('sync-devops-timelog', '*/15 * * * *', 'devops-sync-timelog'),
      ('sync-vdesk-clientes', '*/15 * * * *', 'vdesk-sync-base-clientes'),
      ('sync-vdesk-helpdesk', '*/15 * * * *', 'vdesk-sync-helpdesk'),
      ('sync-vdesk-timelog', '0 1 * * *', 'vdesk-sync-timelog'),
      ('sync-devops-qualidade', '*/10 * * * *', 'devops-sync-qualidade')
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
