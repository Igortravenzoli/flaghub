-- ============================================================================
-- Migration: 20260520100000_sync_qa_return_count.sql
-- Sincronização de qa_return_count com devops_qa_return_events
--
-- PROBLEMA: pbi_lifecycle_summary.qa_return_count estava sempre 0
-- CAUSA: compute_pbi_health_all() não sincronizava com devops_qa_return_events
--
-- SOLUÇÃO:
-- 1. Criar função de sincronização
-- 2. Contar eventos por work_item em devops_qa_return_events
-- 3. Executar backfill nos dados existentes
-- ============================================================================

-- ── 1. Função: sync_qa_return_count_from_events ────────────────────────────
-- Sincroniza qa_return_count em pbi_lifecycle_summary baseado em devops_qa_return_events
CREATE OR REPLACE FUNCTION public.sync_qa_return_count_from_events()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Atualizar pbi_lifecycle_summary com contagem de eventos QA por work_item
  UPDATE pbi_lifecycle_summary pls
  SET
    qa_return_count = COALESCE(event_counts.count, 0),
    updated_at = now()
  FROM (
    SELECT
      work_item_id,
      COUNT(DISTINCT detected_at, work_item_id) as count
    FROM devops_qa_return_events dqre
    GROUP BY work_item_id
  ) event_counts
  WHERE pls.work_item_id = event_counts.work_item_id
    AND pls.qa_return_count != event_counts.count;

  -- Resetar items com qa_return_count > 0 que não têm eventos
  UPDATE pbi_lifecycle_summary pls
  SET
    qa_return_count = 0,
    updated_at = now()
  WHERE pls.qa_return_count > 0
    AND NOT EXISTS (
      SELECT 1 FROM devops_qa_return_events dqre
      WHERE dqre.work_item_id = pls.work_item_id
    );
$$;

COMMENT ON FUNCTION public.sync_qa_return_count_from_events IS
  'Sincroniza qa_return_count em pbi_lifecycle_summary com base em devops_qa_return_events. Executa UPDATE apenas nos registros que mudaram.';

-- ── 2. Executar backfill imediatamente ────────────────────────────────────
-- Sincronizar todos os dados
SELECT public.sync_qa_return_count_from_events();

-- ── 3. Validação: mostrar resumo antes/depois ────────────────────────────
-- Após execução, verificar consistência entre as duas tabelas:
-- SELECT COUNT(*) FROM pbi_lifecycle_summary WHERE qa_return_count > 0;
-- SELECT COUNT(DISTINCT work_item_id) FROM devops_qa_return_events;
-- Estes dois devem ser iguais (items com retorno QA).

-- ── 4. Trigger: auto-sincronização em INSERT/UPDATE devops_qa_return_events
-- Quando um novo evento QA é criado, atualizar pbi_lifecycle_summary automaticamente
CREATE OR REPLACE FUNCTION public.trig_sync_qa_return_on_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atualizar ou inserir registro em pbi_lifecycle_summary
  UPDATE pbi_lifecycle_summary pls
  SET
    qa_return_count = (
      SELECT COUNT(*) FROM devops_qa_return_events dqre
      WHERE dqre.work_item_id = NEW.work_item_id
    ),
    updated_at = now()
  WHERE pls.work_item_id = NEW.work_item_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trig_sync_qa_return_on_event IS
  'Trigger automático que sincroniza qa_return_count quando um novo evento QA é inserido.';

-- Criar trigger (se não existir)
DROP TRIGGER IF EXISTS tr_sync_qa_return_on_event ON devops_qa_return_events;
CREATE TRIGGER tr_sync_qa_return_on_event
AFTER INSERT OR UPDATE ON devops_qa_return_events
FOR EACH ROW
EXECUTE FUNCTION public.trig_sync_qa_return_on_event();

-- ── 5. Validação pós-sincronização ────────────────────────────────────────
-- Contar items com retorno QA (deveria corresponder a 13 em S9-2026)
-- SELECT COUNT(DISTINCT work_item_id) as items_com_retorno_qa 
-- FROM pbi_lifecycle_summary WHERE qa_return_count > 0;

-- Por sprint (validação):
-- SELECT last_committed_sprint, COUNT(*) as items_com_retorno 
-- FROM pbi_lifecycle_summary 
-- WHERE qa_return_count > 0 
-- GROUP BY last_committed_sprint 
-- ORDER BY last_committed_sprint DESC;
