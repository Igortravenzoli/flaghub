-- Atualizar tickets que têm OS no VDESK (sem has_os que é gerado)
UPDATE tickets 
SET 
  os_found_in_vdesk = true,
  os_number = '754095',
  inconsistency_code = NULL,
  severity = 'info',
  updated_at = now()
WHERE ticket_external_id = 'INC22838782';

UPDATE tickets 
SET 
  os_found_in_vdesk = true,
  os_number = '754108',
  inconsistency_code = NULL,
  severity = 'info',
  updated_at = now()
WHERE ticket_external_id = 'INC22854978';