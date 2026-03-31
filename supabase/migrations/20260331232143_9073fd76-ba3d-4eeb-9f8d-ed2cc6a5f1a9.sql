INSERT INTO manual_import_templates (key, name, area_id, required_columns, column_mapping, allowed_file_types, is_active, version)
VALUES (
  'comercial_movimentacao_v1',
  'Movimentação Comercial (Ganhos/Perdas/Riscos)',
  'ce73d4b3-973f-4347-8a35-2866b066b56e',
  '["cliente_nome", "tipo"]'::jsonb,
  '{
    "cliente_nome": "Cliente",
    "cliente_codigo": "Código",
    "tipo": "Tipo",
    "sistema": "Sistema",
    "bandeira": "Bandeira",
    "motivo": "Motivo",
    "status_encerramento": "Status Encerramento",
    "valor_mensal": "Valor Mensal",
    "data_evento": "Data Evento",
    "ano_referencia": "Ano Referência"
  }'::jsonb,
  ARRAY['csv', 'xlsx'],
  true,
  1
);