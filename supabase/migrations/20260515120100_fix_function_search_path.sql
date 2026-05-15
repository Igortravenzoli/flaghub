-- ============================================================================
-- Migration: 20260515120100_fix_function_search_path.sql
-- Pentest Round 3 — Remediação de Funções com search_path Mutável (WARN)
--
-- Problema (CVE-class: Schema Injection / Search Path Hijacking):
--   Funções PL/pgSQL que não fixam o search_path são vulneráveis a um ataque
--   conhecido como "search_path injection" ou "schema poisoning":
--
--     1. Um atacante com permissão de criar objetos em algum schema cria uma
--        tabela, função ou operador com o mesmo nome de um objeto do schema
--        "public" em um schema com maior precedência (ex: pg_temp).
--     2. Quando a função alvo é executada, o PostgreSQL resolve nomes sem
--        qualificação (ex: "now()", "profiles") pelo search_path vigente,
--        podendo chamar o objeto do atacante no lugar do legítimo.
--     3. Resultado: execução de código arbitrário com os privilégios da
--        função (que pode ser SECURITY DEFINER).
--
--   Referência: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
--               https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY
--
-- Funções corrigidas:
--   ┌────────────────────────────┬──────────────────────────────────────────┐
--   │ Função                     │ Uso                                      │
--   ├────────────────────────────┼──────────────────────────────────────────┤
--   │ public.set_updated_at      │ Trigger genérico de updated_at           │
--   │ public.fn_set_vdesk_ext_key│ Trigger de chave de idempotência VDESK  │
--   └────────────────────────────┴──────────────────────────────────────────┘
--
-- Correção: adicionar "SET search_path = public" à definição de cada função.
--   Isso imobiliza o search_path durante a execução, independente de quem
--   chama e de qual schema_path está vigente na sessão.
--
-- Nota: por serem funções de trigger (RETURNS trigger), elas NÃO são
--   expostas pela PostgREST/REST API, então não há risco de chamada direta.
--   Mesmo assim, o hardening do search_path é obrigatório como boa prática
--   e elimina o alerta do Supabase Linter.
-- ============================================================================


-- ── 1. set_updated_at ────────────────────────────────────────────────────────
--
-- Trigger genérico que atualiza a coluna `updated_at` para now() antes de
-- cada INSERT ou UPDATE. Usada em várias tabelas (vdesk_time_logs,
-- timelog_post_queue, etc.).
--
-- Risco sem search_path fixo: um atacante em pg_temp poderia criar uma
-- função "now()" que retorna uma data falsa, corrompendo silenciosamente
-- os timestamps de auditoria.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (padrão) é correto aqui: é uma trigger helper, sem
-- necessidade de privilégios elevados.
SET search_path = public   -- ← fix: imobiliza o search_path
AS $fn$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.set_updated_at() IS
'Trigger: atualiza updated_at = now() antes de INSERT/UPDATE. search_path fixo.';


-- ── 2. fn_set_vdesk_ext_key ──────────────────────────────────────────────────
--
-- Trigger que calcula e mantém sincronizada a coluna `vdesk_ext_key` em
-- vdesk_time_logs. A chave é a concatenação determinística de campos que
-- identificam unicamente um apontamento VDESK, garantindo idempotência.
--
-- Risco sem search_path fixo: se extract(), to_char() ou outros built-ins
-- forem "sombreados" por objetos em pg_temp, a chave de idempotência poderia
-- ser calculada erroneamente, causando inserções duplicadas ou falhas de UNIQUE.

CREATE OR REPLACE FUNCTION public.fn_set_vdesk_ext_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public   -- ← fix: imobiliza o search_path
AS $fn$
BEGIN
    -- Chave composta: task_devops:num_os:usuario_vdesk:log_date:epoch_us
    -- epoch em microssegundos (100% imutável; sem dependência de TZ ou locale).
    NEW.vdesk_ext_key := NEW.task_devops::text
        || ':' || NEW.num_os
        || ':' || NEW.usuario_vdesk
        || ':' || NEW.log_date::text
        || ':' || (extract(epoch FROM NEW.data_historico) * 1000000)::bigint::text;
    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.fn_set_vdesk_ext_key() IS
'Trigger: calcula vdesk_ext_key (idempotência VDESK). search_path fixo.';

-- Os triggers que usam essas funções (trg_vdesk_time_logs_ext_key,
-- trg_vdesk_time_logs_updated_at) NÃO precisam ser recriados — eles referenciam
-- a função por OID e a nova definição é aplicada automaticamente.

-- Verificação pós-migração (rodar no SQL Editor do Supabase):
--
-- SELECT proname, prosecdef,
--        pg_get_function_arguments(oid) AS args,
--        proconfig  -- deve conter 'search_path=public'
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
--   AND proname IN ('set_updated_at', 'fn_set_vdesk_ext_key');
