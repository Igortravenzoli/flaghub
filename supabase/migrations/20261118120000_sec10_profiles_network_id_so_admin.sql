-- ============================================================================
-- SEC10 — profiles.network_id só muda por admin (ou service_role / migração).
--
-- Auditoria de 17–18/11/2026 (skill security-audit da Cloudflare, run-2, confirmado em sandbox
-- local com as migrations do repositório): a política "Users can update own profile"
-- (20260127193248:275-278) não limita coluna e o único gatilho de profiles protege só
-- mfa_exempt. auth_network_id() lê profiles.network_id, e as políticas de tickets
-- (20260326202414:126-161) e os RPCs get_tickets / get_ticket_detail / get_dashboard_summary
-- liberam por "network_id = auth_network_id()" sem hub_is_approved(). Resultado reproduzido:
-- uma conta authenticated SEM membership (hub_is_approved = f) faz PATCH no próprio profile com
-- network_id = N e passa a ler (com raw_payload/vdesk_payload), alterar e inserir tickets da rede N.
-- O cadastro sempre pretendeu o contrário: provision_user e handle_new_user criam o profile com
-- network_id NULL ("admin must assign"); quem grava a rede é a tela /usuarios
-- (useUsers.updateUserNetwork), só de admin.
--
-- Esta migration acrescenta um gatilho BEFORE INSERT OR UPDATE em profiles que recusa (42501)
-- a uma sessão de usuário (auth.role() = 'authenticated' ou 'anon') que não seja admin
-- (hub_is_admin(): global ou legado):
--   - INSERT com network_id não nulo;
--   - UPDATE que mude network_id.
-- service_role (edges), o cron e as migrations (sem claims de usuário) não são afetados.
-- Não mexe em dado: perfis que já têm rede ficam como estão (ver a leitura D da verificação).
--
-- Prova: supabase/verificacao/sec10_network_id.sql. Volta: supabase/verificacao/sec10_network_id_volta.sql
-- ============================================================================

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.protect_profile_network_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') AND NOT public.hub_is_admin() THEN
    IF TG_OP = 'INSERT' AND NEW.network_id IS NOT NULL THEN
      RAISE EXCEPTION 'permission denied: only administrators can set network_id'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.network_id IS DISTINCT FROM OLD.network_id THEN
      RAISE EXCEPTION 'permission denied: only administrators can modify network_id'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_network_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_profile_network_id_trigger ON public.profiles;
CREATE TRIGGER protect_profile_network_id_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_network_id();

RESET lock_timeout;
