-- Operational migration: initial historical backfill for closed sprints in 2026.
-- Idempotent behavior is controlled by rpc_backfill_closed_sprint_snapshots(p_force_reprocess => false).

DO $$
BEGIN
  PERFORM *
  FROM public.rpc_backfill_closed_sprint_snapshots(
    p_year => 2026,
    p_force_reprocess => false,
    p_notes => 'initial_backfill_2026_factory_qa'
  );
END;
$$;