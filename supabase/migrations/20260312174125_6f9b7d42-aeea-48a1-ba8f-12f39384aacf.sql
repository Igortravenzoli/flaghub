
INSERT INTO cs_implantacoes_records (batch_id, cliente, consultor, solucao, status_implantacao, data_inicio, data_fim, observacoes, contato, licenca, atuacao, puxada, raw)
SELECT 
  mir.batch_id,
  (mir.normalized->>'cliente'),
  (mir.normalized->>'consultor'),
  (mir.normalized->>'solucao'),
  (mir.normalized->>'status_implantacao'),
  NULL::date,
  NULL::date,
  (mir.normalized->>'observacoes'),
  (mir.normalized->>'contato'),
  (mir.normalized->>'licenca'),
  (mir.normalized->>'atuacao'),
  (mir.normalized->>'puxada'),
  mir.normalized
FROM manual_import_rows mir
WHERE mir.batch_id = '41ccd79e-27ad-45dd-a7ee-3035da42efb8'
  AND mir.is_valid = true;

UPDATE manual_import_batches 
SET status = 'published', published_at = now()
WHERE id = '41ccd79e-27ad-45dd-a7ee-3035da42efb8';
