-- Corrigir tickets já correlacionados: se tem OS encontrada no VDESK mas severity é critico por UNKNOWN_STATUS, mudar para atencao
UPDATE public.tickets
SET severity = 'atencao', updated_at = now()
WHERE is_active = true
  AND os_found_in_vdesk = true
  AND inconsistency_code = 'UNKNOWN_STATUS'
  AND severity = 'critico';

-- Corrigir tickets com OS encontrada e sem inconsistência real para info
UPDATE public.tickets
SET severity = 'info', inconsistency_code = NULL, updated_at = now()
WHERE is_active = true
  AND os_found_in_vdesk = true
  AND inconsistency_code = 'UNKNOWN_STATUS'
  AND internal_status IS NOT NULL;

-- Agora que os mapeamentos numéricos existem, atualizar internal_status dos tickets com external_status numérico
UPDATE public.tickets t
SET internal_status = sm.internal_status,
    inconsistency_code = CASE 
      WHEN t.inconsistency_code = 'UNKNOWN_STATUS' THEN NULL 
      ELSE t.inconsistency_code 
    END,
    severity = CASE
      WHEN t.inconsistency_code = 'UNKNOWN_STATUS' AND t.os_found_in_vdesk = true THEN 'info'
      WHEN t.inconsistency_code = 'UNKNOWN_STATUS' AND (t.os_found_in_vdesk IS NULL OR t.os_found_in_vdesk = false) THEN t.severity
      ELSE t.severity
    END,
    updated_at = now()
FROM public.status_mapping sm
WHERE t.network_id = sm.network_id
  AND lower(t.external_status) = lower(sm.external_status)
  AND sm.is_active = true
  AND t.internal_status IS NULL
  AND t.is_active = true;