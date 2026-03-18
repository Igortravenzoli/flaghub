INSERT INTO hub_sync_jobs (job_key, integration_id, enabled, schedule_minutes, schedule_cron) VALUES
  ('devops_sync_all_default', '37368263-1238-4106-99dd-b003b7bd6c43', false, 10, '*/10 * * * *'),
  ('gateway_helpdesk_clients_default', 'c62b6fad-0aec-4700-8474-e69d9333b68c', false, 15, '*/15 * * * *'),
  ('gateway_helpdesk_dashboard_default', 'c62b6fad-0aec-4700-8474-e69d9333b68c', false, 15, '*/15 * * * *'),
  ('devops-sync-timelog', '1e335ada-966c-4f02-b6cd-65df8be23be6', false, 15, '*/15 * * * *')
ON CONFLICT (job_key) DO NOTHING;