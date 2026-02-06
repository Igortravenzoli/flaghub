-- Forçar re-correlação: resetar os_found_in_vdesk para tickets que têm inconsistência contraditória
-- (ex: tem OS encontrada no VDESK mas marcado como NO_OS_OVERDUE)
UPDATE public.tickets
SET 
  os_found_in_vdesk = NULL,
  vdesk_payload = NULL,
  inconsistency_code = CASE
    WHEN internal_status IS NULL THEN 'UNKNOWN_STATUS'
    WHEN os_number IS NULL THEN 'NO_OS_OVERDUE'
    ELSE inconsistency_code
  END,
  severity = CASE
    WHEN internal_status IS NULL THEN 'atencao'
    WHEN os_number IS NULL THEN 'critico'
    ELSE severity
  END,
  updated_at = now()
WHERE is_active = true
  AND network_id = 1;