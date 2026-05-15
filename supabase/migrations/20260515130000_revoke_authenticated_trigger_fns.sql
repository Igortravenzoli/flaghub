-- ============================================================================
-- Migration: 20260515130000_revoke_authenticated_trigger_fns.sql
-- Pentest Round 3 — Gap da migration 20260515120200:
--   protect_mfa_exempt() ainda chamável por `authenticated`
--
-- Contexto:
--   A migration 20260515120200 corretamente revogou EXECUTE de `anon` e
--   `PUBLIC` para protect_mfa_exempt(). Contudo, não revogou de `authenticated`.
--   O Supabase Linter (lint 0029) reporta corretamente que a função ainda
--   é chamável via /rest/v1/rpc/protect_mfa_exempt por usuários autenticados.
--
-- Problema:
--   protect_mfa_exempt() é uma função de TRIGGER (RETURNS trigger).
--   Nunca deve ser invocada diretamente via REST API — ela só deve ser
--   disparada automaticamente pelo motor de triggers do PostgreSQL quando
--   ocorre um UPDATE na tabela profiles (coluna mfa_exempt).
--
--   Uma chamada manual por authenticated:
--     (a) não tem efeito prático (o motor PG retorna erro pois o contexto
--         de trigger não está ativo)
--     (b) mas confirma a existência da função e gera noise de segurança
--     (c) em caso de bug futuro, poderia ser explorada
--
-- Correção: revogar EXECUTE de `authenticated` também.
--   O trigger on_profiles_mfa_exempt_change continua funcionando normalmente
--   pois triggers invocam funções com os privilégios do PROPRIETÁRIO da função
--   (SECURITY DEFINER), não do chamador.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.protect_mfa_exempt() FROM authenticated;

COMMENT ON FUNCTION public.protect_mfa_exempt() IS
'Trigger function: protege a coluna mfa_exempt em profiles. '
'NÃO chamar diretamente — acionada apenas via trigger on_profiles_mfa_exempt_change. '
'Sem acesso direto por anon, PUBLIC ou authenticated.';
