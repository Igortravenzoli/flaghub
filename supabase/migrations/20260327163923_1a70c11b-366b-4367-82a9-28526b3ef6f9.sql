
-- Fix cron jobs pointing to old project URL (onpdhywrzjtwxaxuvijw -> nxmgppfyltwsqryfxkbm)
-- Also clean up duplicate devops_queries

-- 1. Fix cron job: sync-devops-all
SELECT cron.unschedule('sync-devops-all');
SELECT cron.schedule(
  'sync-devops-all',
  '0 0 * * *',
  $$SELECT net.http_post(
    url := 'https://nxmgppfyltwsqryfxkbm.supabase.co/functions/v1/devops-sync-all',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;$$
);

-- 2. Fix cron job: sync-devops-timelog
SELECT cron.unschedule('sync-devops-timelog');
SELECT cron.schedule(
  'sync-devops-timelog',
  '0 0 * * *',
  $$SELECT net.http_post(
    url := 'https://nxmgppfyltwsqryfxkbm.supabase.co/functions/v1/devops-sync-timelog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;$$
);

-- 3. Fix cron job: sync-vdesk-clientes
SELECT cron.unschedule('sync-vdesk-clientes');
SELECT cron.schedule(
  'sync-vdesk-clientes',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := 'https://nxmgppfyltwsqryfxkbm.supabase.co/functions/v1/vdesk-sync-base-clientes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;$$
);

-- 4. Fix cron job: sync-vdesk-helpdesk
SELECT cron.unschedule('sync-vdesk-helpdesk');
SELECT cron.schedule(
  'sync-vdesk-helpdesk',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := 'https://nxmgppfyltwsqryfxkbm.supabase.co/functions/v1/vdesk-sync-helpdesk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;$$
);

-- 5. Deactivate duplicate 06 - Em Qualidade (keep 76c806a1 which has same data)
UPDATE public.devops_queries SET is_active = false WHERE id = '284dc411-7034-4973-90e4-8daeb4f54f29';

-- 6. Deactivate duplicate 08-Fabrica (keep 557a9643 which is the canonical ID per memory)
UPDATE public.devops_queries SET is_active = false WHERE id = '8ad026e0-3ad7-4c39-a8df-3184af5ec9ae';
