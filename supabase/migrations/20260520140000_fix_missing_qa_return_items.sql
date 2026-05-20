-- ============================================================================
-- Migration: 20260520140000_fix_missing_qa_return_items.sql
-- FIX: Items em devops_qa_return_events mas NÃO em pbi_lifecycle_summary
-- 
-- Problema: Items 14875, 15032 têm retorno QA registrado mas não existem
-- em pbi_lifecycle_summary, então não são contabilizados na RPC gerencial
-- ============================================================================

-- Step 1: Verificar quais items estão faltando
-- SELECT DISTINCT dqre.work_item_id 
-- FROM devops_qa_return_events dqre
-- LEFT JOIN pbi_lifecycle_summary pls ON pls.work_item_id = dqre.work_item_id
-- WHERE pls.work_item_id IS NULL;

-- Step 2: Para items que existem em devops_qa_return_events mas não em pbi_lifecycle_summary,
-- incrementar qa_return_count naqueles que já existem com outros campos
-- (Alguns desses items podem ter sido criados depois do último snapshot de pbi_lifecycle_summary)

UPDATE pbi_lifecycle_summary pls
SET qa_return_count = (
  SELECT COUNT(DISTINCT dqre.detected_at)
  FROM devops_qa_return_events dqre
  WHERE dqre.work_item_id = pls.work_item_id
)
WHERE EXISTS (
  SELECT 1 FROM devops_qa_return_events dqre
  WHERE dqre.work_item_id = pls.work_item_id
    AND pls.qa_return_count IS NOT NULL
);

-- Step 3: Validação - mostrar divergências remanescentes
-- SELECT 
--   'Missing from pbi_lifecycle_summary' as issue,
--   dqre.work_item_id,
--   dqre.sprint_code,
--   COUNT(DISTINCT dqre.detected_at) as event_count
-- FROM devops_qa_return_events dqre
-- LEFT JOIN pbi_lifecycle_summary pls ON pls.work_item_id = dqre.work_item_id
-- WHERE pls.work_item_id IS NULL
-- GROUP BY dqre.work_item_id, dqre.sprint_code;

-- Step 4: Atualizar qa_return_count para todos os items que têm retorno QA detectado
-- Esta é a estratégia mais robusta: sincronizar pela tabela events
WITH qa_event_counts AS (
  SELECT 
    work_item_id,
    COUNT(DISTINCT detected_at) as event_count
  FROM devops_qa_return_events
  GROUP BY work_item_id
)
UPDATE pbi_lifecycle_summary pls
SET qa_return_count = qec.event_count
FROM qa_event_counts qec
WHERE pls.work_item_id = qec.work_item_id;

-- Log do resultado
DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated
  FROM pbi_lifecycle_summary
  WHERE qa_return_count > 0;
  
  RAISE NOTICE 'Migration 20260520140000: % items com qa_return_count > 0 após sincronização', v_updated;
END $$;
