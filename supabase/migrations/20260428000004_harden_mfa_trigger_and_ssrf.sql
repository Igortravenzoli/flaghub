-- ============================================================================
-- Migration: 20260428000004_harden_mfa_trigger_and_ssrf.sql
-- Purpose:   Two hardening fixes found in pentest round 2 (2026-04-28):
--
--   1. protect_mfa_exempt trigger extended to BEFORE INSERT OR UPDATE.
--      Previously only fired on UPDATE — mfa_exempt=true could be set
--      at INSERT time (e.g. via service-role edge function).
--
--   2. Idempotent DROP of any surviving anon test policies on public.tickets.
--      The official migration chain already removes these, but this acts as
--      a safety net in case FIX_RLS_SUPABASE.sql was ever run manually.
-- ============================================================================

-- ── 1. MFA exempt trigger: cover INSERT as well as UPDATE ───────────────────

CREATE OR REPLACE FUNCTION public.protect_mfa_exempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- On INSERT: block setting mfa_exempt=true by non-admins
  IF TG_OP = 'INSERT' THEN
    IF NEW.mfa_exempt IS TRUE AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'permission denied: only administrators can set mfa_exempt'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- On UPDATE: block changing mfa_exempt by non-admins
  IF TG_OP = 'UPDATE' THEN
    IF NEW.mfa_exempt IS DISTINCT FROM OLD.mfa_exempt AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'permission denied: only administrators can modify mfa_exempt'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Replace the UPDATE-only trigger with INSERT OR UPDATE
DROP TRIGGER IF EXISTS protect_mfa_exempt_trigger ON public.profiles;
CREATE TRIGGER protect_mfa_exempt_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_mfa_exempt();

-- ── 2. Safety net: drop any surviving anon test policies on tickets ──────────
-- These were already dropped by migrations 20260130142646 and 20260204134410.
-- This is idempotent — IF EXISTS means no error if they don't exist.

DROP POLICY IF EXISTS "Allow anonymous read for testing"   ON public.tickets;
DROP POLICY IF EXISTS "Allow anonymous insert for testing" ON public.tickets;
DROP POLICY IF EXISTS "Allow anonymous update for testing" ON public.tickets;

-- Also ensure anon has no table-level SELECT/INSERT/UPDATE on tickets
REVOKE SELECT, INSERT, UPDATE ON public.tickets FROM anon;
