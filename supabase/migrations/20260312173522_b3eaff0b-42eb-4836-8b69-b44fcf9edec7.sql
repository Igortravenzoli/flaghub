-- Update column_mapping to match the real XLSX columns
UPDATE manual_import_templates
SET 
  column_mapping = jsonb_build_object(
    'cliente',            'Cliente',
    'consultor',          'Responsável',
    'solucao',            'Solução',
    'status_implantacao', 'Status',
    'data_inicio',        'Inicio',
    'data_fim',           'Fim',
    'observacoes',        'Obs',
    'contato',            'Contato',
    'licenca',            'Licença',
    'atuacao',            'Atuação',
    'puxada',             'Puxada'
  ),
  required_columns = '["cliente", "solucao", "status_implantacao"]'::jsonb,
  version = 2
WHERE key = 'cs_implantacoes_v1';

-- Add missing columns to cs_implantacoes_records
ALTER TABLE cs_implantacoes_records 
  ADD COLUMN IF NOT EXISTS contato text,
  ADD COLUMN IF NOT EXISTS licenca text,
  ADD COLUMN IF NOT EXISTS atuacao text,
  ADD COLUMN IF NOT EXISTS puxada text;