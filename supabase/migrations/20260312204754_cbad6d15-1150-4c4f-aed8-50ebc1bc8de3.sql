-- Guardado por existência do pai (banco do zero no CI não tem dados de ambiente)
INSERT INTO hub_sync_jobs (job_key, integration_id, enabled, schedule_minutes, config)
SELECT 'devops_qa_retorno', '81c067cc-1c06-4dba-832e-d118118ac8cd'::uuid, true, null::integer, '{"description": "Calcula retornos QA (quantas vezes voltou para Em Teste)"}'::jsonb
WHERE EXISTS (SELECT 1 FROM public.hub_integrations WHERE id = '81c067cc-1c06-4dba-832e-d118118ac8cd');
