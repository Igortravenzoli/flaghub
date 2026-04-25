
-- Fix required_columns to match normalized field names (column_mapping keys)
UPDATE manual_import_templates 
SET required_columns = '["cliente","consultor","solucao","status_implantacao"]'::jsonb 
WHERE key = 'cs_implantacoes_v1';

-- Remove unnecessary template
DELETE FROM manual_import_templates WHERE key = 'cs_fila_cs_v1';
