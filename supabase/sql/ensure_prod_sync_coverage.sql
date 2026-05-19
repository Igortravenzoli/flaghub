DO $$
DECLARE
  v_base_url text := 'https://nxmgppfyltwsqryfxkbm.supabase.co';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bWdwcGZ5bHR3c3FyeWZ4a2JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDEwMDEsImV4cCI6MjA4NTExNzAwMX0.6TqJwx2_8dbFwbvflSZKVe6MSaagmPosQaxpg0l9Waw';
  v_gateway_integration_id uuid;
  v_devops_integration_id uuid;
  v_quality_area_id uuid;
BEGIN
  -- 1) Garantir cron de qualidade ativo
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-devops-qualidade') THEN
    PERFORM cron.schedule(
      'sync-devops-qualidade',
      '*/10 * * * *',
      format($cmd$
SELECT net.http_post(
  url := %L,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', %L,
    'x-cron-secret', public.get_cron_secret()
  ),
  body := '{}'::jsonb
) AS request_id;
$cmd$, v_base_url || '/functions/v1/devops-sync-qualidade', 'Bearer ' || v_anon_key)
    );
  END IF;

  -- 2) Referencias para hub_sync_jobs
  SELECT integration_id INTO v_gateway_integration_id
  FROM public.hub_sync_jobs
  WHERE job_key = 'gateway_helpdesk_clients_default'
  LIMIT 1;

  SELECT integration_id INTO v_devops_integration_id
  FROM public.hub_sync_jobs
  WHERE job_key = 'devops_sync_all_default'
  LIMIT 1;

  SELECT id INTO v_quality_area_id
  FROM public.hub_areas
  WHERE key = 'qualidade'
  LIMIT 1;

  -- 3) Garantir linha de vdesk timelog no painel
  IF v_gateway_integration_id IS NOT NULL THEN
    INSERT INTO public.hub_sync_jobs (job_key, integration_id, enabled, schedule_minutes, schedule_cron, config)
    VALUES (
      'vdesk-sync-timelog',
      v_gateway_integration_id,
      true,
      1440,
      '0 1 * * *',
      jsonb_build_object('description', 'Sync de apontamentos VDesk para base analitica', 'function_name', 'vdesk-sync-timelog')
    )
    ON CONFLICT (job_key) DO UPDATE
      SET enabled = EXCLUDED.enabled,
          schedule_minutes = EXCLUDED.schedule_minutes,
          schedule_cron = EXCLUDED.schedule_cron;
  END IF;

  -- 4) Garantir linha de qualidade no painel
  IF v_devops_integration_id IS NOT NULL THEN
    INSERT INTO public.hub_sync_jobs (job_key, integration_id, area_id, enabled, schedule_minutes, schedule_cron, config)
    VALUES (
      'devops-sync-qualidade',
      v_devops_integration_id,
      v_quality_area_id,
      true,
      10,
      '*/10 * * * *',
      jsonb_build_object('description', 'Sync especializado da fila oficial de Qualidade', 'function_name', 'devops-sync-qualidade', 'quality_query_wiql_id', '7b0a8298-5890-42d8-b280-1121b21786da')
    )
    ON CONFLICT (job_key) DO UPDATE
      SET enabled = EXCLUDED.enabled,
          schedule_minutes = EXCLUDED.schedule_minutes,
          schedule_cron = EXCLUDED.schedule_cron,
          area_id = COALESCE(public.hub_sync_jobs.area_id, EXCLUDED.area_id);
  END IF;
END;
$$;
