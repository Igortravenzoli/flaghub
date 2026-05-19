-- Garante cobertura completa dos cron jobs de sincronizacao e corrige headers/urls.
-- Inclui jobs que ficavam fora da rotina de reparo (qualidade e vdesk timelog).

DO $$
DECLARE
  v_base_url text;
  v_anon_key text;
  v_schedule text;
  v_command text;
  v_job record;
  v_gateway_integration_id uuid;
BEGIN
  SELECT substring(j.command from '(https://[^/]+\.supabase\.co)')
  INTO v_base_url
  FROM cron.job j
  WHERE j.jobname IN (
    'sync-devops-all',
    'sync-devops-timelog',
    'sync-vdesk-clientes',
    'sync-vdesk-helpdesk',
    'sync-vdesk-timelog',
    'sync-devops-qualidade'
  )
  LIMIT 1;

  IF v_base_url IS NULL THEN
    v_base_url := 'https://nxmgppfyltwsqryfxkbm.supabase.co';
  END IF;

  SELECT ds.decrypted_secret
  INTO v_anon_key
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'SUPABASE_ANON_KEY'
  LIMIT 1;

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
    SELECT j.schedule
    INTO v_schedule
    FROM cron.job j
    WHERE j.jobname = v_job.job_name
    LIMIT 1;

    v_schedule := COALESCE(v_schedule, v_job.default_schedule);

    IF COALESCE(v_anon_key, '') <> '' THEN
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
    ELSE
      v_command := format($cmd$
SELECT net.http_post(
  url := %L,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', public.get_cron_secret()
  ),
  body := '{}'::jsonb
) AS request_id;
$cmd$, v_base_url || '/functions/v1/' || v_job.function_name);
      RAISE WARNING 'SUPABASE_ANON_KEY nao encontrado no vault. Job % sera reconfigurado apenas com x-cron-secret.', v_job.job_name;
    END IF;

    PERFORM cron.unschedule(v_job.job_name)
    WHERE EXISTS (
      SELECT 1
      FROM cron.job j
      WHERE j.jobname = v_job.job_name
    );

    PERFORM cron.schedule(v_job.job_name, v_schedule, v_command);
  END LOOP;

  -- Garante linha do job no painel administrativo para o timelog VDesk.
  SELECT j.integration_id
  INTO v_gateway_integration_id
  FROM public.hub_sync_jobs j
  WHERE j.job_key = 'gateway_helpdesk_clients_default'
  LIMIT 1;

  IF v_gateway_integration_id IS NOT NULL THEN
    INSERT INTO public.hub_sync_jobs (
      job_key,
      integration_id,
      schedule_minutes,
      schedule_cron,
      enabled,
      config
    )
    VALUES (
      'vdesk-sync-timelog',
      v_gateway_integration_id,
      1440,
      '0 1 * * *',
      true,
      jsonb_build_object(
        'description', 'Sync de apontamentos VDesk para base analitica',
        'function_name', 'vdesk-sync-timelog'
      )
    )
    ON CONFLICT (job_key) DO NOTHING;
  END IF;
END;
$$;
