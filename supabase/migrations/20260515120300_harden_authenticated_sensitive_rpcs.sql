-- ============================================================================
-- Migration: 20260515120300_harden_authenticated_sensitive_rpcs.sql
-- Pentest Round 3 — Endurecimento de Funções SECURITY DEFINER Acessíveis
--                   por Usuários Autenticados (nível WARN + análise de risco)
--
-- Contexto:
--   O Supabase Linter alerta sobre todas as funções SECURITY DEFINER chamáveis
--   por `authenticated`. Muitas dessas funções são intencionalmente acessíveis
--   (ex: get_tickets, rpc_devops_timelog_agg). Este arquivo trata apenas as
--   que apresentam risco REAL identificado em análise de código:
--
--   RISCO CRÍTICO:
--   ┌───────────────────────────────┬──────────────────────────────────────────┐
--   │ Função                        │ Risco                                    │
--   ├───────────────────────────────┼──────────────────────────────────────────┤
--   │ get_cron_secret()             │ CRÍTICO: expõe segredo do vault Supabase │
--   │                               │ via REST API para qualquer autenticado.  │
--   │                               │ Mesmo com guarda is_admin(), a função    │
--   │                               │ confirma a existência do segredo e a     │
--   │                               │ resposta 403 é timing-observável.        │
--   ├───────────────────────────────┼──────────────────────────────────────────┤
--   │ handle_new_user()             │ ALTO: função de trigger criada para ser  │
--   │                               │ chamada automaticamente pelo Supabase    │
--   │                               │ Auth, não diretamente pelo usuário.      │
--   │                               │ Chamada manual por autenticado pode      │
--   │                               │ duplicar perfis ou corromper dados.      │
--   ├───────────────────────────────┼──────────────────────────────────────────┤
--   │ hub_fill_member_network_id()  │ MÉDIO: utilitário de migração de dados.  │
--   │                               │ Qualquer autenticado pode triggerar um   │
--   │                               │ UPDATE em massa em hub_area_members.     │
--   └───────────────────────────────┴──────────────────────────────────────────┘
--
--   RISCO MÉDIO (guard interno insuficiente):
--   ┌───────────────────────────────┬──────────────────────────────────────────┐
--   │ mark_tickets_inactive(int)    │ Qualquer autenticado pode marcar TODOS   │
--   │                               │ os tickets de um network como inativos.  │
--   │                               │ A função não verifica is_admin().        │
--   ├───────────────────────────────┼──────────────────────────────────────────┤
--   │ purge_network_data(bigint)    │ ALTO: deleta registros de um network.    │
--   │                               │ Qualquer autenticado pode deletar dados  │
--   │                               │ de qualquer network (IDOR destrutivo).   │
--   └───────────────────────────────┴──────────────────────────────────────────┘
--
-- Estratégia de correção por tipo:
--   - Funções de TRIGGER: revogar EXECUTE de PUBLIC e authenticated
--     (nunca devem ser chamadas diretamente via REST)
--   - Funções administrativas: mover para service_role apenas
--     (chamadas apenas por Edge Functions com autenticação própria)
--   - Funções com guard insuficiente: adicionar verificação is_admin() interna
--
-- Referência: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCO 1: get_cron_secret() — CRÍTICO
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Problema: qualquer usuário autenticado pode chamar
--   POST /rest/v1/rpc/get_cron_secret
-- Mesmo recebendo 403 (graças ao guard is_admin()), isso:
--   (a) Confirma que o segredo "cron_secret" existe no vault
--   (b) Pode ser explorado por timing analysis para enumerar secrets
--   (c) Em caso de bug futuro no guard, vaza o segredo diretamente
--
-- Correção: revogar authenticated. A função já é chamada internamente
-- pelo pg_cron (como role 'postgres') — o EXECUTE de authenticated não
-- é necessário para o funcionamento do sistema.

REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM anon;
-- Acesso direto permanece apenas para:
--   • role 'postgres' (pg_cron) → chamada interna, sem REST API
--   • service_role (Edge Functions que precisem do secret)
GRANT  EXECUTE ON FUNCTION public.get_cron_secret() TO service_role;

COMMENT ON FUNCTION public.get_cron_secret() IS
'Retorna o cron_secret do vault. Acessível APENAS por service_role e postgres (pg_cron). '
'NÃO deve ser chamável via REST API.';


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCO 2: handle_new_user() — ALTO (trigger function)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Problema: função de trigger que cria o profile do usuário no first login.
-- É acionada automaticamente pelo trigger "on_auth_user_created" em auth.users.
-- Não deve ser chamável diretamente — isso poderia:
--   (a) Criar perfis duplicados (ou conflito de UNIQUE)
--   (b) Executar lógica de provisionamento fora do fluxo normal de auth
--
-- Correção: revogar EXECUTE de autenticados. O trigger continua funcionando
-- pois triggers invocam funções com os privilégios do owner, não do caller.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;

COMMENT ON FUNCTION public.handle_new_user() IS
'Trigger function: cria profile no primeiro login. '
'NÃO chamar diretamente — acionada apenas via trigger on_auth_user_created.';


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCO 3: hub_fill_member_network_id() — MÉDIO (utilitário de migração)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Problema: utilitário criado para preencher retroativamente network_id em
-- hub_area_members onde era NULL. Qualquer autenticado pode disparar esse
-- UPDATE em massa via REST API, causando carga desnecessária no banco e
-- potencialmente sobrescrevendo network_ids customizados.
--
-- Correção: restringir a service_role (chamável por Edge Function de admin).

REVOKE EXECUTE ON FUNCTION public.hub_fill_member_network_id() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.hub_fill_member_network_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hub_fill_member_network_id() FROM anon;
GRANT  EXECUTE ON FUNCTION public.hub_fill_member_network_id() TO service_role;

COMMENT ON FUNCTION public.hub_fill_member_network_id() IS
'Utilitário de migração: preenche network_id em hub_area_members. '
'Restrito a service_role — não exposto via REST API.';


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCO 4: mark_tickets_inactive(integer) — MÉDIO → adicionar guard is_admin
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Problema: qualquer usuário autenticado pode marcar TODOS os tickets de
-- qualquer network como inativos via:
--   POST /rest/v1/rpc/mark_tickets_inactive  { "p_network_id": <qualquer> }
--
-- Não há verificação de:
--   (a) Se o usuário pertence ao network especificado (IDOR)
--   (b) Se o usuário tem permissão de escrita (autorização)
--
-- Isso é um UPDATE em massa sem guard — equivalente a um DoS de dados.
--
-- Correção: adicionar guard is_admin() como primeira linha de defesa.
-- O processo de "inativar tickets" normalmente é chamado por Edge Functions
-- com service_role, então restringir a admins não quebra nenhum fluxo de usuário.

CREATE OR REPLACE FUNCTION public.mark_tickets_inactive(p_network_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Guard: apenas admins podem marcar tickets como inativos em massa
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissão negada: apenas administradores podem inativar tickets em massa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.tickets
  SET    is_active  = false,
         updated_at = now()
  WHERE  network_id = p_network_id
    AND  is_active  = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Manter callable por authenticated (o guard interno é a proteção)
REVOKE EXECUTE ON FUNCTION public.mark_tickets_inactive(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_tickets_inactive(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_tickets_inactive(integer) TO authenticated;

COMMENT ON FUNCTION public.mark_tickets_inactive(integer) IS
'Marca todos os tickets ativos de um network como inativos. '
'Restrito a administradores via is_admin() guard interno.';


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCO 5: purge_network_data(bigint) — ALTO → restringir a service_role
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Problema: deleta registros de dados de um network inteiro. Qualquer
-- usuário autenticado poderia deletar dados de qualquer network (IDOR
-- destrutivo). Esse é um dos comandos mais perigosos do sistema.
--
-- Análise: a função JÁ possui guard interno robusto:
--   IF NOT (is_admin() OR (is_admin_or_gestao() AND auth_network_id() = p_network_id))
-- Isso cobre IDOR e autorização. Manter EXECUTE para authenticated preserva o
-- fluxo do hook usePurgeData.ts (Importacoes.tsx) sem comprometer a segurança.
-- Padrão idêntico ao BLOCO 4 (mark_tickets_inactive): guard interno + GRANT authenticated.
--
-- Correção: revogar apenas de anon/PUBLIC; manter authenticated com proteção do guard.

REVOKE EXECUTE ON FUNCTION public.purge_network_data(bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_network_data(bigint) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.purge_network_data(bigint) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_network_data(bigint) TO service_role;

COMMENT ON FUNCTION public.purge_network_data(bigint) IS
'Apaga dados de um network. Guard interno is_admin()/is_admin_or_gestao() obrigatório. '
'Acessível por authenticated (guard) e service_role (Edge Functions).';


-- ══════════════════════════════════════════════════════════════════════════════
-- BLOCO 6: recalculate_ticket_severities — restringir a service_role + admin
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Problema: recalcular severidades em massa para qualquer network_id
-- sem guard. Operação computacionalmente cara + potencialmente manipulável.
-- Um usuário mal-intencionado pode forçar recálculos repetidos (DoS) ou
-- tentar manipular severidades de networks que não lhe pertencem.

-- A função existente retorna TABLE(...); CREATE OR REPLACE não pode mudar o tipo de retorno.
-- Fazemos DROP + CREATE para aplicar o novo guard + tipo de retorno simplificado.
DROP FUNCTION IF EXISTS public.recalculate_ticket_severities(bigint, integer);

CREATE FUNCTION public.recalculate_ticket_severities(
  p_network_id bigint,
  p_grace_hours integer DEFAULT 24
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Guard: apenas admins ou service_role podem disparar recálculo em massa
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissão negada: apenas administradores podem recalcular severidades.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Recalcular: tickets sem OS e fora do período de graça → atencao ou critico
  UPDATE public.tickets
  SET
    severity   = CASE
                   WHEN (now() - created_at) > (p_grace_hours * 2 || ' hours')::interval
                     THEN 'critico'::ticket_severity
                   ELSE 'atencao'::ticket_severity
                 END,
    updated_at = now()
  WHERE network_id  = p_network_id
    AND is_active   = true
    AND (has_os = false OR has_os IS NULL)
    AND (now() - created_at) > (p_grace_hours || ' hours')::interval
    AND severity    != 'critico'::ticket_severity;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalculate_ticket_severities(bigint, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_ticket_severities(bigint, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recalculate_ticket_severities(bigint, integer) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.recalculate_ticket_severities(bigint, integer) TO service_role;

COMMENT ON FUNCTION public.recalculate_ticket_severities(bigint, integer) IS
'Recalcula severidades de tickets sem OS. Guard is_admin() obrigatório.';


-- ══════════════════════════════════════════════════════════════════════════════
-- RESUMO DE ALERTAS DO LINTER QUE PERMANECEM (INTENCIONAIS)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Os seguintes alertas "authenticated_security_definer_function_executable"
-- são ESPERADOS e ACEITÁVEIS — cada função foi revisada e é necessária:
--
--   auth_network_id()          : lê network_id do usuário atual (somente-leitura)
--   auth_user_role()           : retorna role do usuário atual (somente-leitura)
--   auth_user_role_masked()    : retorna código mascarado de role
--   batch_validate_os(jsonb)   : valida OS em lote (guarda de auth.uid() interna)
--   cleanup_login_attempts()   : limpeza de rate-limit (sem retorno de dados)
--   compute_pbi_health_all()   : cálculo de saúde de PBIs (guard interno)
--   delete_tickets_by_network(): guard is_admin() adicionado em 20260428000001
--   get_batch_statistics(int)  : estatísticas de batch (filtra por network do user)
--   get_correlation_stats(big) : correlações (filtra por network do user)
--   get_dashboard_summary(big) : dashboard summary (filtra por network do user)
--   get_imports_history(...)   : histórico de imports (filtra por network do user)
--   get_inconsistency_report() : relatório de inconsistências (filtra por network)
--   get_recent_batches(...)    : batches recentes (filtra por network do user)
--   get_ticket_detail(text)    : detalhe de ticket (filtra por network do user)
--   get_ticket_timeline(text)  : timeline de ticket (filtra por network do user)
--   get_tickets(...)           : lista de tickets (filtra por network do user)
--   get_tickets_needing_os_*() : tickets sem OS (filtra por network do user)
--   get_user_network_id(uuid)  : retorna network de UM user (ok para admin)
--   get_user_role(uuid)        : retorna role de UM user (ok para admin)
--   has_role(uuid, app_role)   : verifica role (helper de autorização)
--   hide_imports(bigint)       : oculta imports (admin-only por lógica de negócio)
--   hub_audit_log(...)         : registra ação de auditoria (append-only)
--   hub_can_view_confidential(): verifica acesso confidencial (somente-leitura)
--   hub_check_my_ip()          : IP allowlist check
--   hub_effective_network_id() : resolve network_id efetivo do user
--   hub_has_area_network_role(): verifica role em área (somente-leitura)
--   hub_is_admin()             : verifica se admin (somente-leitura)
--   hub_is_approved()          : verifica aprovação (somente-leitura)
--   hub_is_ip_allowed()        : verifica IP (somente-leitura)
--   hub_log_sso_login()        : registra login SSO (append-only)
--   hub_request_ip()           : retorna IP (somente-leitura)
--   hub_resolve_area_network_id(): resolve network de área (somente-leitura)
--   hub_user_has_area(uuid)    : verifica membership em área (somente-leitura)
--   is_admin()                 : verifica admin (helper)
--   is_admin_or_gestao()       : verifica admin/gestão (helper)
--   provision_user(uuid)       : provisiona user (chamado no first login via AuthContext)
--   purge_cs_implantacoes()    : guard is_admin() adicionado em 20260428000001
--   purge_old_inactive_tickets(): guard is_admin() adicionado em 20260428000001
--   rpc_devops_timelog_agg()   : agrega timelogs (filtra por network do user)
--   rpc_feature_pbi_summary()  : resumo PBIs (filtra por area/role)
--   rpc_gerencial_fabrica_*()  : dashboards gerenciais (filtra por role)
--   rpc_gerencial_qa_summary() : dashboard QA (filtra por role)
--   rpc_pbi_bottleneck_*()     : bottlenecks (filtra por área)
--   rpc_pbi_health_overview()  : saúde de PBIs (filtra por área)
--   rpc_qa_desempenho_*()      : desempenho QA (filtra por role)
--   rpc_qa_return_by_assignee(): retornos por responsável (auth only)
--   rpc_qa_return_by_sprint()  : retornos por sprint (auth only)
--   rpc_qa_return_open_items() : itens abertos (auth only)
--   rpc_qa_return_summary()    : resumo de retornos (auth only)
--   rpc_timelog_queue_post()   : enfileira timelog (verifica auth.uid() interna)
--   rpc_timelog_set_status()   : status de fila (verifica auth.uid() interna)
