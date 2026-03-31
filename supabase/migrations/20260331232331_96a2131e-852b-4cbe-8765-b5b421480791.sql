UPDATE public.manual_import_templates
SET column_mapping = '{
  "cliente_nome": "Cliente",
  "cliente_codigo": "Código Puxada",
  "tipo": "Tipo",
  "sistema": "Sistema",
  "bandeira": "Bandeira",
  "motivo": "Motivo",
  "status_encerramento": "Status Encerramento",
  "valor_mensal": "Valor Mensal",
  "data_evento": "Data Evento",
  "ano_referencia": "Ano Referência"
}'::jsonb,
    required_columns = '["cliente_nome", "tipo"]'::jsonb,
    allowed_file_types = ARRAY['csv', 'xlsx'],
    is_active = true,
    version = GREATEST(COALESCE(version, 0), 1)
WHERE key = 'comercial_movimentacao_v1';