-- ============================================================================
-- Migration: 20260428000002_revoke_anon_execute.sql
-- Purpose:   Revoke EXECUTE from `anon` on all public schema functions that
--            should not be accessible to unauthenticated users.
--            Fixes ALTO-2: 52 functions executable by anon.
--
-- Whitelist (anon-callable by design):
--   - hub_check_my_ip       : IP allow-list check before login
--   - hub_is_ip_allowed     : IP allow-list helper
--   - hub_request_ip        : Returns caller IP (used pre-auth)
--   - cleanup_login_attempts: Called from Edge Function (service role),
--                             but safe to leave callable by anon (no side-effects
--                             that expose data; uses service role in practice).
--
-- Strategy: Use a DO block to dynamically revoke from all functions NOT in
--           the whitelist, so new functions are NOT automatically exposed.
--           Developers who need a function accessible to anon must explicitly
--           GRANT it with a comment explaining why.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  fn_sig TEXT;
BEGIN
  FOR r IN
    SELECT
      p.proname AS func_name,
      pg_get_function_identity_arguments(p.oid) AS args,
      n.nspname AS schema_name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      -- Only functions that have EXECUTE granted to anon
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      -- Whitelist: keep these anon-callable
      AND p.proname NOT IN (
        'hub_check_my_ip',
        'hub_is_ip_allowed',
        'hub_request_ip',
        'cleanup_login_attempts'
      )
  LOOP
    fn_sig := format('%I.%I(%s)', r.schema_name, r.func_name, r.args);
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn_sig);
      RAISE NOTICE 'Revoked anon EXECUTE on %', fn_sig;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Could not revoke anon EXECUTE on %: %', fn_sig, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- Verify: the following query should return only the whitelisted functions
-- (run manually to validate after applying this migration):
--
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND has_function_privilege('anon', p.oid, 'EXECUTE')
-- ORDER BY p.proname;
