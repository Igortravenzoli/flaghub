-- =============================================================================
-- 20260514120000_register_vdesk_sync_timelog_cron.sql
-- Regista cron job para a edge function vdesk-sync-timelog.
--
-- Frequência: diária às 01:00 UTC (antes do sync devops das 00:00)
-- Comportamento: sem parâmetros → function usa os últimos 7 dias como janela
-- Padrão: idêntico aos crons sync-devops-timelog e sync-devops-all
-- =============================================================================

-- Remove versão anterior caso exista (idempotente)
SELECT cron.unschedule('sync-vdesk-timelog')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-vdesk-timelog'
);

SELECT cron.schedule(
  'sync-vdesk-timelog',
  '0 1 * * *',
  $$SELECT net.http_post(
    url := 'https://nxmgppfyltwsqryfxkbm.supabase.co/functions/v1/vdesk-sync-timelog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;$$
);
