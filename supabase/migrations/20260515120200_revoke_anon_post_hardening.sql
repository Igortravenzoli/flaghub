-- ============================================================================
-- Migration: 20260515120200_revoke_anon_post_hardening.sql
-- Pentest Round 3 — Revogar EXECUTE de `anon` em funções criadas após
--                   a migration de revogação original (20260428000002)
--
-- Contexto:
--   A migration 20260428000002_revoke_anon_execute.sql revogou o EXECUTE de
--   `anon` em todas as funções existentes na época. Porém, o PostgreSQL
--   concede EXECUTE ao PUBLIC (que inclui `anon`) automaticamente para
--   QUALQUER nova função criada. Isso significa que funções adicionadas
--   APÓS aquela migration ficaram novamente expostas ao role anon.
--
-- Funções expostas ao anon que não deveriam estar:
--
--   ┌───────────────────────────────┬───────────────────────────────────────┐
--   │ Função                        │ Por que é um problema                 │
--   ├───────────────────────────────┼───────────────────────────────────────┤
--   │ hub_is_approved()             │ Retorna bool: revela se o user        │
--   │                               │ autenticado está aprovado. Não faz    │
--   │                               │ sentido para anon (sem auth.uid()).   │
--   ├───────────────────────────────┼───────────────────────────────────────┤
--   │ protect_mfa_exempt()          │ Função de TRIGGER, não deve ser       │
--   │                               │ chamável diretamente pela REST API.   │
--   │                               │ Anon não deve poder invocar triggers. │
--   ├───────────────────────────────┼───────────────────────────────────────┤
--   │ rpc_qa_return_by_assignee()   │ Retorna dados internos de QA          │
--   │                               │ (responsável × retornos). Informação  │
--   │                               │ sensível de equipe interna.           │
--   ├───────────────────────────────┼───────────────────────────────────────┤
--   │ rpc_qa_return_by_sprint()     │ Retorna dados de QA por sprint.       │
--   │                               │ Idem: informação interna.             │
--   ├───────────────────────────────┼───────────────────────────────────────┤
--   │ rpc_qa_return_open_items()    │ Lista itens de retorno QA em aberto.  │
--   │                               │ Exposição de backlog interno.         │
--   ├───────────────────────────────┼───────────────────────────────────────┤
--   │ rpc_qa_return_summary(text,   │ Sumariza retornos QA por sprint/área. │
--   │   text)                       │ Informação operacional interna.       │
--   └───────────────────────────────┴───────────────────────────────────────┘
--
-- Whitelist de anon (mantidos intencionalmente, ver 20260428000002):
--   - hub_check_my_ip()    : verifica IP antes do login (pré-autenticação)
--   - hub_is_ip_allowed()  : helper de IP allowlist (pré-autenticação)
--   - hub_request_ip()     : retorna IP do caller (pré-autenticação)
--   - cleanup_login_attempts(): chamado por Edge Function (rate-limit)
--
-- Estratégia para novas funções:
--   Ao criar qualquer nova função pública, SEMPRE incluir explicitamente:
--     REVOKE EXECUTE ON FUNCTION <nome> FROM PUBLIC;
--     REVOKE EXECUTE ON FUNCTION <nome> FROM anon;
--     GRANT  EXECUTE ON FUNCTION <nome> TO authenticated;
--   Isso evita que o próximo "lote" de novas funções fique exposto.
--
-- Referência: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
-- ============================================================================


-- ── hub_is_approved() ────────────────────────────────────────────────────────
-- Semanticamente inútil para anon (auth.uid() = NULL → sempre false).
-- Revogar evita chamadas desnecessárias e elimina o alerta do linter.

REVOKE EXECUTE ON FUNCTION public.hub_is_approved() FROM anon;
REVOKE EXECUTE ON FUNCTION public.hub_is_approved() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hub_is_approved() TO authenticated;


-- ── protect_mfa_exempt() ─────────────────────────────────────────────────────
-- Função de trigger (RETURNS trigger). Nunca deve ser chamada diretamente
-- via REST API — só deve ser invocada pelo motor de triggers do PostgreSQL.
-- Revogar EXECUTE do PUBLIC impede chamadas manuais.

REVOKE EXECUTE ON FUNCTION public.protect_mfa_exempt() FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_mfa_exempt() FROM PUBLIC;
-- Nota: authenticated também não precisa chamar esta função diretamente.
-- A coluna GRANT TO authenticated abaixo é omitida propositalmente.


-- ── rpc_qa_return_by_assignee() ──────────────────────────────────────────────
-- Dados de retorno QA por responsável. Sensível: revela quem retornou
-- mais itens e padrões de performance da equipe. Apenas autenticados.

REVOKE EXECUTE ON FUNCTION public.rpc_qa_return_by_assignee() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_qa_return_by_assignee() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_qa_return_by_assignee() TO authenticated;


-- ── rpc_qa_return_by_sprint() ────────────────────────────────────────────────
-- Dados de retorno QA agrupados por sprint. Informação interna de processo.

REVOKE EXECUTE ON FUNCTION public.rpc_qa_return_by_sprint() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_qa_return_by_sprint() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_qa_return_by_sprint() TO authenticated;


-- ── rpc_qa_return_open_items() ───────────────────────────────────────────────
-- Lista itens de retorno QA em aberto. Exposição de backlog e work items
-- de desenvolvimento interno.

REVOKE EXECUTE ON FUNCTION public.rpc_qa_return_open_items() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_qa_return_open_items() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_qa_return_open_items() TO authenticated;


-- ── rpc_qa_return_summary(text, text) ────────────────────────────────────────
-- Resumo de retornos QA por sprint e área. Contém KPIs internos de qualidade.

REVOKE EXECUTE ON FUNCTION public.rpc_qa_return_summary(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_qa_return_summary(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_qa_return_summary(text, text) TO authenticated;


-- ── Garantir que a whitelist pré-autenticação continua acessível a anon ──────
-- (redundante com 20260428000002, mas idempotente e serve como documentação
--  explícita do estado desejado)

GRANT EXECUTE ON FUNCTION public.hub_check_my_ip()         TO anon;
GRANT EXECUTE ON FUNCTION public.hub_request_ip()          TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_login_attempts()  TO anon;

-- hub_is_ip_allowed tem múltiplos overloads; usa loop para cobrir todos
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS fn_sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hub_is_ip_allowed'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.fn_sig);
  END LOOP;
END;
$$;


-- ── Proteção forward: revogar PUBLIC de QUALQUER nova função SECURITY DEFINER ─
-- As linhas abaixo NÃO substituem o controle por função, mas servem como
-- documentação do processo para novos desenvolvedores:
--
-- PADRÃO OBRIGATÓRIO ao criar funções SECURITY DEFINER:
--
--   CREATE OR REPLACE FUNCTION public.minha_funcao(...)
--   RETURNS ...
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path = public
--   AS $$...$$ ;
--
--   REVOKE EXECUTE ON FUNCTION public.minha_funcao(...) FROM PUBLIC;
--   REVOKE EXECUTE ON FUNCTION public.minha_funcao(...) FROM anon;
--   GRANT  EXECUTE ON FUNCTION public.minha_funcao(...) TO authenticated;
--   -- Ou: TO service_role   (para funções chamadas apenas por Edge Functions)
--   -- Ou: nenhum GRANT      (para funções de trigger, nunca chamadas diretamente)


-- Verificação pós-migração:
--
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND has_function_privilege('anon', p.oid, 'EXECUTE')
-- ORDER BY p.proname;
--
-- Resultado esperado: APENAS as 4 funções da whitelist pré-autenticação.
