-- ============================================================================
-- Migration: 20260428000001_harden_destructive_rpcs.sql
-- Purpose:   Add admin-only guard to three destructive RPCs that previously
--            could be called by any authenticated (or even anon) user.
--            Fixes CRIT-01, CRIT-02, CRIT-03 from pentest report.
-- ============================================================================

-- ── 1. delete_tickets_by_network ─────────────────────────────────────────────
-- Deletes ALL tickets for a given network. Previously callable by any role.
-- Now restricted to hub admins (is_admin()).
CREATE OR REPLACE FUNCTION public.delete_tickets_by_network(p_network_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Security guard: only admins may bulk-delete tickets
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissão negada: apenas administradores podem expurgar tickets.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.tickets
  WHERE network_id = p_network_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Revoke broad grants; only service_role and authenticated admins (via is_admin()) may call.
-- anon must not be able to invoke this at all.
REVOKE EXECUTE ON FUNCTION public.delete_tickets_by_network(bigint) FROM anon;
GRANT  EXECUTE ON FUNCTION public.delete_tickets_by_network(bigint) TO authenticated;

-- ── 2. purge_cs_implantacoes ──────────────────────────────────────────────────
-- Truncates the entire cs_implantacoes_records table.
-- Previously callable by any role.
CREATE OR REPLACE FUNCTION public.purge_cs_implantacoes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Security guard: only admins may purge CS implantações
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissão negada: apenas administradores podem expurgar implantações.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM cs_implantacoes_records WHERE true;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_cs_implantacoes() FROM anon;
GRANT  EXECUTE ON FUNCTION public.purge_cs_implantacoes() TO authenticated;

-- ── 3. purge_old_inactive_tickets ─────────────────────────────────────────────
-- Deletes tickets older than N days that are marked inactive.
-- Previously callable by any role.
CREATE OR REPLACE FUNCTION public.purge_old_inactive_tickets(
  p_network_id INTEGER,
  p_days_threshold INTEGER DEFAULT 7
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Security guard: only admins may purge inactive tickets
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissão negada: apenas administradores podem expurgar tickets inativos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.tickets
  WHERE network_id = p_network_id
    AND is_active = FALSE
    AND last_seen_at < NOW() - (p_days_threshold || ' days')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_inactive_tickets(INTEGER, INTEGER) FROM anon;
GRANT  EXECUTE ON FUNCTION public.purge_old_inactive_tickets(INTEGER, INTEGER) TO authenticated;
