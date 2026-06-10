-- ============================================================================
-- Migration: 20260609140000_snapshot_qa_closed_by_provenance.sql
-- Histórico de QA por Closed By + procedência do snapshot
--
--   1. Métricas de "concluído por Closed By" no snapshot de sprint.
--   2. Procedência (snapshot_source) + as_of_datetime para distinguir
--      "estado atual" de "fim de sprint reconstruído".
-- ============================================================================

ALTER TABLE public.sprint_indicator_snapshots
  ADD COLUMN IF NOT EXISTS qa_concluidos             bigint,
  ADD COLUMN IF NOT EXISTS qa_concluidos_sem_retorno bigint,
  ADD COLUMN IF NOT EXISTS qa_concluidos_com_retorno bigint,
  ADD COLUMN IF NOT EXISTS snapshot_source           text NOT NULL DEFAULT 'estado_atual',
  ADD COLUMN IF NOT EXISTS as_of_datetime            timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sis_snapshot_source_chk'
  ) THEN
    ALTER TABLE public.sprint_indicator_snapshots
      ADD CONSTRAINT sis_snapshot_source_chk
      CHECK (snapshot_source IN ('estado_atual','fim_sprint_reconstruido','manual'));
  END IF;
END $$;

COMMENT ON COLUMN public.sprint_indicator_snapshots.snapshot_source IS
  'Procedência do dado: estado_atual (estado das tasks no momento da captura) | '
  'fim_sprint_reconstruido (estado em 23:59 do último dia da sprint, via state_history) | manual.';
COMMENT ON COLUMN public.sprint_indicator_snapshots.as_of_datetime IS
  'Momento que o dado representa: fim da sprint (reconstruído) ou snapshot_datetime (estado atual).';

-- ── Backfill de procedência das linhas existentes ────────────────────────────
-- Default: estado atual, representando o instante da captura.
UPDATE public.sprint_indicator_snapshots
   SET as_of_datetime = COALESCE(as_of_datetime, snapshot_datetime),
       snapshot_source = 'estado_atual'
 WHERE as_of_datetime IS NULL;

-- Snapshots já reconstruídos manualmente (notas indicam reconstrução de fim de sprint):
-- marca a procedência e ancora as_of_datetime em 23:59:59 BRT do último dia da sprint.
UPDATE public.sprint_indicator_snapshots sis
   SET snapshot_source = 'fim_sprint_reconstruido',
       as_of_datetime  = COALESCE(
         (SELECT ((r.sprint_end + 1)::timestamp - interval '1 second') AT TIME ZONE 'America/Sao_Paulo'
            FROM public.fn_sprint_official_range(sis.sprint_code) r
           WHERE r.sprint_end IS NOT NULL
           LIMIT 1),
         sis.as_of_datetime)
 WHERE sis.notes ILIKE '%reconstrucao_fim_sprint%' OR sis.notes ILIKE '%reconstrucao_hibrida%';
