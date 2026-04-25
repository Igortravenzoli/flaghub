# Inventário do Supabase Remoto

Data da validação: 2026-04-01

Projeto validado remotamente:

- `project_ref`: `nxmgppfyltwsqryfxkbm`
- origem da validação: Supabase CLI conectado ao projeto remoto

Escopo desta validação:

- Edge Functions publicadas
- Secrets cadastrados no projeto
- Tabelas e views reais do banco remoto
- Rotinas SQL do schema `public`
- Cron jobs ativos no schema `cron`
- Policies RLS presentes no ambiente

Observação importante:

- este arquivo lista nomes e estrutura;
- valores de secrets não são expostos;
- os dados abaixo refletem o ambiente remoto no momento da consulta e podem divergir de migrations futuras.

## Resumo

- `17` Edge Functions ativas
- `11` secrets cadastrados
- `55` tabelas no schema `public`
- `12` views no schema `public`
- `49` rotinas no schema `public`
- `6` cron jobs

## Edge Functions publicadas

- `vdesk-proxy`
- `consultar-vdesk`
- `auth-rate-limit`
- `devops-sync-all`
- `devops-sync-query`
- `devops-sync-timelog`
- `manual-upload-parse`
- `manual-upload-publish`
- `vdesk-sync-base-clientes`
- `vdesk-sync-helpdesk`
- `vdesk-ticket-os`
- `manage-sync-schedules`
- `vdesk-tickets-os`
- `devops-sync-qualidade`
- `smtp-test`
- `webhook-test`
- `survey-import`

Observações:

- quase todas estão com `status = ACTIVE`;
- a maioria está com `verify_jwt = false`;
- `vdesk-ticket-os` aparece com `verify_jwt = true`.

## Secrets cadastrados

Foram encontrados os seguintes nomes de secret no projeto:

- `ALLOWED_ORIGINS`
- `CRON_SECRET`
- `DEVOPS_PAT`
- `GATEWAY_BASE_URL`
- `GATEWAY_SERVICE_NAME`
- `GATEWAY_SERVICE_SECRET`
- `LOVABLE_API_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_DB_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`

## Views públicas

- `v_dashboard_summary`
- `vw_comercial_clientes_ativos`
- `vw_customer_service_kpis`
- `vw_devops_lead_area_map_safe`
- `vw_devops_queue_items`
- `vw_devops_work_items_hierarchy`
- `vw_fabrica_kpis`
- `vw_helpdesk_kpis`
- `vw_hub_integrations_safe`
- `vw_hub_metric_formulas`
- `vw_infraestrutura_kpis`
- `vw_qualidade_kpis`

## Tabelas públicas

- `alert_channels`
- `alert_deliveries`
- `alert_rules`
- `comercial_movimentacao_clientes`
- `comercial_pesquisa_satisfacao`
- `comercial_vendas`
- `cs_fila_manual_records`
- `cs_implantacoes_records`
- `devops_collaborator_map`
- `devops_lead_area_map`
- `devops_queries`
- `devops_query_items_current`
- `devops_time_logs`
- `devops_work_items`
- `domain_network_mapping`
- `helpdesk_dashboard_snapshots`
- `hub_access_requests`
- `hub_area_inheritance`
- `hub_area_members`
- `hub_areas`
- `hub_audit_logs`
- `hub_dashboards`
- `hub_integration_endpoints`
- `hub_integrations`
- `hub_ip_allowlist`
- `hub_manual_uploads`
- `hub_metrics_registry`
- `hub_raw_ingestions`
- `hub_sync_jobs`
- `hub_sync_runs`
- `hub_user_global_roles`
- `import_batches`
- `import_events`
- `imports`
- `login_attempts`
- `manual_import_batches`
- `manual_import_rows`
- `manual_import_templates`
- `networks`
- `pbi_health_summary`
- `pbi_health_thresholds`
- `pbi_lifecycle_summary`
- `pbi_stage_config`
- `pbi_stage_events`
- `profiles`
- `sector_health`
- `settings`
- `status_mapping`
- `survey_aggregates`
- `survey_ai_runs`
- `survey_imports`
- `survey_responses`
- `tickets`
- `user_roles`
- `vdesk_clients`

## Rotinas SQL do schema public

- `auth_network_id`
- `auth_user_role`
- `auth_user_role_masked`
- `batch_validate_os`
- `cleanup_login_attempts`
- `compute_pbi_health_all`
- `delete_tickets_by_network`
- `get_batch_statistics`
- `get_correlation_stats`
- `get_cron_secret`
- `get_dashboard_summary`
- `get_imports_history`
- `get_inconsistency_report`
- `get_recent_batches`
- `get_ticket_detail`
- `get_ticket_timeline`
- `get_tickets`
- `get_tickets_needing_os_validation`
- `get_user_network_id`
- `get_user_role`
- `handle_new_user`
- `has_role`
- `hide_imports`
- `hub_audit_log`
- `hub_can_view_confidential`
- `hub_check_my_ip`
- `hub_effective_network_id`
- `hub_fill_member_network_id`
- `hub_has_area_network_role`
- `hub_is_admin`
- `hub_is_ip_allowed`
- `hub_log_sso_login`
- `hub_request_ip`
- `hub_resolve_area_network_id`
- `hub_user_has_area`
- `is_admin`
- `is_admin_or_gestao`
- `jsonb_merge`
- `mark_tickets_inactive`
- `provision_user`
- `purge_cs_implantacoes`
- `purge_network_data`
- `purge_old_inactive_tickets`
- `recalculate_ticket_severities`
- `rpc_devops_timelog_agg`
- `rpc_feature_pbi_summary`
- `rpc_pbi_bottleneck_summary`
- `rpc_pbi_health_overview`
- `update_updated_at_column`

## Cron jobs

- `1` `cleanup-helpdesk-snapshots-daily` `10 2 * * *` ativo
- `2` `cleanup-hub-raw-ingestions-daily` `25 2 * * *` ativo
- `9` `sync-vdesk-clientes` `*/15 * * * *` ativo
- `11` `sync-devops-all` `0 * * * *` ativo
- `13` `sync-devops-timelog` `0 */2 * * *` ativo
- `15` `sync-vdesk-helpdesk` `*/5 * * * *` ativo

Leitura operacional dos cron jobs:

- há duas rotinas de limpeza diária;
- a sincronização de clientes VDesk roda a cada 15 minutos;
- a sincronização geral do DevOps roda de hora em hora;
- o timelog do DevOps roda a cada 2 horas;
- o snapshot de helpdesk roda a cada 5 minutos.

## RLS validado no ambiente

O ambiente remoto está com RLS ativo e múltiplas policies no schema `public`, incluindo grupos como:

- policies administrativas para `hub_*`, `alert_*`, `manual_import_*`, `pbi_*`;
- policies restritas por área para dados comerciais, pesquisa, uploads e surveys;
- policies específicas para `tickets`, `imports`, `profiles`, `settings`, `status_mapping` e `user_roles`;
- policies de leitura autenticada para objetos operacionais como `devops_work_items`, `devops_query_items_current`, `vdesk_clients` e derivados.

Exemplos confirmados no ambiente:

- `comercial_movimentacao_select_restricted`
- `comercial_pesquisa_select_restricted`
- `comercial_vendas_select_restricted`
- `cs_impl_select`
- `cs_fila_select`
- `devops_work_items_select_auth`
- `devops_queries_select_restricted`
- `helpdesk_snap_select_restricted`
- `pbi_health_summary_select_restricted`
- `pbi_lifecycle_summary_select_restricted`
- `survey_imports_select_area`
- `survey_responses_select_area`
- `Users can view tickets by network or helpdesk area`

## Conclusões práticas

- o projeto remoto está acessível e consistente com a arquitetura observada no código;
- há evidência concreta de automações ativas por `pg_cron`;
- as views setoriais críticas existem no banco remoto;
- a camada de segurança por RLS está presente e extensa;
- os secrets e edge functions necessários para sync e uploads estão cadastrados no ambiente.