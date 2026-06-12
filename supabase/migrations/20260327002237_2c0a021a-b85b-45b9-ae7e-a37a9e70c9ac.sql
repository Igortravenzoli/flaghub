-- Guardado por existência do pai (banco do zero no CI não tem dados de ambiente)
INSERT INTO manual_import_templates (key, name, area_id, allowed_file_types, required_columns, column_mapping, is_active, version)
SELECT
  'comercial_pesquisa_v1',
  'Pesquisa de Satisfação Comercial',
  '91191531-6a82-40e5-9f2e-e8e4fe76f294'::uuid,
  ARRAY['csv', 'json', 'xlsx', 'xls'],
  '["cliente_nome", "bandeira"]'::jsonb,
  '{"cliente_codigo": "codigo_puxada", "cliente_nome": "cliente", "bandeira": "bandeira", "data_pesquisa": "data_contato", "responsavel_contato": "responsavel_contato", "notas_por_produto": "notas_por_produto", "qualitativo": "qualitativo"}'::jsonb,
  true,
  1
WHERE EXISTS (SELECT 1 FROM public.hub_areas WHERE id = '91191531-6a82-40e5-9f2e-e8e4fe76f294');
