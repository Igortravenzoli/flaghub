
-- Seeds com UUIDs de ambiente: guardados por existência dos pais para que a
-- cadeia de migrations aplique num banco do zero (CI). Em DEV/PROD, onde os
-- pais existem, o comportamento é idêntico ao original.

-- Seed manual_import_templates
DO $seed$
BEGIN
  IF EXISTS (SELECT 1 FROM public.hub_areas WHERE id = 'd5f7d366-d6e2-4e4b-9089-307248317045') THEN
    INSERT INTO public.manual_import_templates (key, name, area_id, version, allowed_file_types, required_columns, column_mapping)
    VALUES
      ('cs_implantacoes_v1', 'Implantações CS', 'd5f7d366-d6e2-4e4b-9089-307248317045', 1, '{csv,xlsx,json}',
       '["cliente","consultor","solucao","status_implantacao","data_inicio"]'::jsonb,
       '{"cliente":"cliente","consultor":"consultor","solucao":"solucao","status":"status_implantacao","data_inicio":"data_inicio","data_fim":"data_fim","horas":"horas_totais","observacoes":"observacoes"}'::jsonb
      ),
      ('cs_fila_cs_v1', 'Fila CS Manual', 'd5f7d366-d6e2-4e4b-9089-307248317045', 1, '{csv,xlsx,json}',
       '["cliente","responsavel","status"]'::jsonb,
       '{"id_origem":"id_origem","cliente":"cliente","responsavel":"responsavel","status":"status","data_entrada":"data_entrada","data_saida":"data_saida","prioridade":"prioridade","observacoes":"observacoes"}'::jsonb
      )
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $seed$;

-- Seed hub_integration_endpoints for devops
INSERT INTO public.hub_integration_endpoints (integration_id, key, method, path, notes)
SELECT v.integration_id::uuid, v.key, v.method, v.path, v.notes
FROM (VALUES
  ('81c067cc-1c06-4dba-832e-d118118ac8cd', 'wiql', 'POST', '/{org}/{project}/_apis/wit/wiql?api-version=7.1', 'WIQL query execution'),
  ('81c067cc-1c06-4dba-832e-d118118ac8cd', 'workitemsbatch', 'POST', '/{org}/_apis/wit/workitemsbatch?api-version=7.0', 'Batch work items fetch')
) AS v(integration_id, key, method, path, notes)
WHERE EXISTS (SELECT 1 FROM public.hub_integrations hi WHERE hi.id = v.integration_id::uuid)
ON CONFLICT DO NOTHING;

-- Seed hub_integration_endpoints for gateway
INSERT INTO public.hub_integration_endpoints (integration_id, key, method, path, notes)
SELECT v.integration_id::uuid, v.key, v.method, v.path, v.notes
FROM (VALUES
  ('b3db748e-b4c1-4b71-90a9-87a54b105dcc', 'service_token', 'POST', '/api/client-auth/service-token', 'Service auth token'),
  ('b3db748e-b4c1-4b71-90a9-87a54b105dcc', 'helpdesk_clientes', 'GET', '/api/helpdesk/clientes', 'List helpdesk clients'),
  ('b3db748e-b4c1-4b71-90a9-87a54b105dcc', 'helpdesk_dashboard', 'GET', '/api/helpdesk/dashboard', 'Helpdesk dashboard KPIs')
) AS v(integration_id, key, method, path, notes)
WHERE EXISTS (SELECT 1 FROM public.hub_integrations hi WHERE hi.id = v.integration_id::uuid)
ON CONFLICT DO NOTHING;

-- Seed hub_sync_jobs defaults
INSERT INTO public.hub_sync_jobs (job_key, integration_id, schedule_minutes, enabled, config)
SELECT v.job_key, v.integration_id::uuid, v.schedule_minutes, v.enabled, v.config::jsonb
FROM (VALUES
  ('devops_sync_all_default', '81c067cc-1c06-4dba-832e-d118118ac8cd', 10, true, '{"description":"Sync all active DevOps queries"}'),
  ('gateway_helpdesk_clients_default', 'b3db748e-b4c1-4b71-90a9-87a54b105dcc', 15, true, '{"description":"Sync helpdesk clients from Gateway"}'),
  ('gateway_helpdesk_dashboard_default', 'b3db748e-b4c1-4b71-90a9-87a54b105dcc', 15, true, '{"description":"Sync helpdesk dashboard snapshots"}')
) AS v(job_key, integration_id, schedule_minutes, enabled, config)
WHERE EXISTS (SELECT 1 FROM public.hub_integrations hi WHERE hi.id = v.integration_id::uuid)
ON CONFLICT DO NOTHING;
