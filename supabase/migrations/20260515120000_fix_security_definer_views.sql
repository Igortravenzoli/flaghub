-- ============================================================================
-- Migration: 20260515120000_fix_security_definer_views.sql
-- Pentest Round 3 — Remediação de Views SECURITY DEFINER (nível ERROR)
--
-- Problema:
--   Por padrão, toda VIEW criada sem a cláusula "WITH (security_invoker = true)"
--   é executada com os privilégios do PROPRIETÁRIO da view (SECURITY DEFINER).
--   Isso contorna o Row Level Security (RLS) das tabelas subjacentes: qualquer
--   usuário que possa SELECT na view acessa TODAS as linhas, ignorando políticas
--   de isolamento por network_id, aprovação etc.
--
-- Alertas cobertos:
--   ┌─────────────────────────────────────┬────────────────────────────────────┐
--   │ View                                │ Risco                              │
--   ├─────────────────────────────────────┼────────────────────────────────────┤
--   │ public.vw_hub_integrations_safe     │ RLS de hub_integrations ignorado   │
--   │ public.v_dashboard_summary          │ RLS de tickets ignorado            │
--   │ public.vw_devops_lead_area_map_safe │ RLS de devops_lead_area_map bypass │
--   │ public.vw_customer_service_kpis     │ RLS de cs_implantacoes bypass      │
--   │ public.v_timelog_unified            │ RLS de vdesk/devops_time_logs byp. │
--   └─────────────────────────────────────┴────────────────────────────────────┘
--
-- Correção:
--   Recriar cada view com "WITH (security_invoker = true)" → o PostgreSQL
--   executa a consulta com os privilégios do USUÁRIO que chama, aplicando
--   normalmente as políticas RLS das tabelas base.
--
--   Onde a view já possuía sua própria cláusula WHERE de controle de acesso
--   (chamadas a hub_is_admin(), auth_network_id() etc.) esse filtro é
--   PRESERVADO como segunda camada de defesa.
--
-- Referência: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view
-- ============================================================================


-- ── 1. vw_hub_integrations_safe ──────────────────────────────────────────────
--
-- Contexto: a migration 20260401121709 recriou esta view com
--   "WITH (security_invoker = false)" de forma explícita, removendo a coluna
--   `config` (que contém credenciais). O raciocínio era que, sem dados
--   sensíveis, SECURITY DEFINER era inofensivo.
--
-- Problema residual: com SECURITY DEFINER ativa, um usuário autenticado
--   qualquer (inclusive não aprovado / não pertencente ao network correto)
--   pode listar TODAS as integrações da plataforma via:
--     GET /rest/v1/vw_hub_integrations_safe
--   pois o RLS em hub_integrations é ignorado.
--
-- Correção: security_invoker = true → RLS de hub_integrations é honrado.
--   O GRANT SELECT TO authenticated abaixo garante que usuários autenticados
--   aprovados (cobertos pelas políticas RLS da tabela base) possam usar a view.

DROP VIEW IF EXISTS public.vw_hub_integrations_safe;

CREATE VIEW public.vw_hub_integrations_safe
  WITH (security_invoker = true)
AS
SELECT
  id,
  key,
  name,
  type,
  auth_type,
  base_url,
  is_active,
  last_health_at,
  created_at
  -- coluna `config` deliberadamente omitida (contém tokens/credenciais)
FROM public.hub_integrations;

GRANT SELECT ON public.vw_hub_integrations_safe TO authenticated;

COMMENT ON VIEW public.vw_hub_integrations_safe IS
'Metadados públicos (sem config/credenciais) de hub_integrations. '
'security_invoker=true: RLS da tabela base é aplicado normalmente.';


-- ── 2. v_dashboard_summary ───────────────────────────────────────────────────
--
-- Contexto: view de resumo de tickets por network_id. Já contém um WHERE
--   inline que faz controle de acesso via is_admin() / auth_network_id() /
--   hub_has_area_network_role(), mas como é SECURITY DEFINER esse filtro
--   roda com privilégios elevados e acessa TODOS os tickets antes de filtrar.
--
-- Problema: se um atacante autenticar com um usuário sem aprovação mas sem
--   RLS bloqueando (e.g., RLS retorna false mas SECURITY DEFINER ignora),
--   ele pode manipular os parâmetros para obter dados de outros networks.
--
-- Correção: security_invoker = true. O WHERE de controle de acesso inline
--   é mantido como segunda camada de defesa (defense-in-depth).

DROP VIEW IF EXISTS public.v_dashboard_summary;

CREATE VIEW public.v_dashboard_summary
  WITH (security_invoker = true)
AS
SELECT
  network_id,
  count(*)                                                                          AS total_tickets,
  count(*) FILTER (WHERE severity = 'critico'::ticket_severity)                    AS tickets_criticos,
  count(*) FILTER (WHERE severity = 'atencao'::ticket_severity)                    AS tickets_atencao,
  count(*) FILTER (WHERE has_os = false OR has_os IS NULL)                         AS tickets_sem_os,
  count(*) FILTER (
    WHERE severity = 'info'::ticket_severity
       OR (has_os = true AND os_found_in_vdesk = true)
  )                                                                                  AS tickets_ok,
  max(updated_at)                                                                   AS last_updated
FROM public.tickets t
WHERE is_active = true
  -- Controle de acesso inline (defense-in-depth sobre o RLS da tabela base):
  AND (
    public.is_admin()
    OR network_id = public.auth_network_id()
    OR public.hub_has_area_network_role(
         'tickets_os', network_id, ARRAY['leitura','operacional','owner']
       )
  )
GROUP BY network_id;

COMMENT ON VIEW public.v_dashboard_summary IS
'Resumo de tickets por network. security_invoker=true + filtro inline de acesso.';


-- ── 3. vw_devops_lead_area_map_safe ──────────────────────────────────────────
--
-- Contexto: criada em 20260401130134 com "security_barrier = true" mas SEM
--   "security_invoker = true". security_barrier evita que o otimizador
--   "vaze" linhas para funções externas, mas NÃO muda quem executa a query.
--   A view ainda roda como SECURITY DEFINER → bypassa RLS de devops_lead_area_map.
--
-- Problema: a máscara de lead_email (CASE WHEN hub_is_admin() THEN ...) é
--   a única proteção. Sem RLS, qualquer auth vê TODAS as áreas (incluindo
--   áreas de outros networks se existirem).
--
-- Correção: adicionar security_invoker = true. Mantemos security_barrier = true
--   (boa prática para views com CASE/funções) E o CASE WHEN como máscara de
--   coluna sensível.

DROP VIEW IF EXISTS public.vw_devops_lead_area_map_safe;

CREATE VIEW public.vw_devops_lead_area_map_safe
  WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  id,
  CASE WHEN public.hub_is_admin() THEN lead_email ELSE '***' END AS lead_email,
  canonical_name,
  area_key,
  squad_label,
  pipeline_role,
  visual_priority,
  counts_as_design,
  counts_as_fabrica,
  counts_as_qualidade,
  is_active
FROM public.devops_lead_area_map;

COMMENT ON VIEW public.vw_devops_lead_area_map_safe IS
'Mapa de áreas/leads. lead_email mascarado para não-admins. '
'security_invoker=true + security_barrier=true.';


-- ── 4. vw_customer_service_kpis ──────────────────────────────────────────────
--
-- Contexto: view criada em 20260331192213 sem nenhuma opção de segurança.
--   Agrega dados de `vw_devops_queue_items` e `cs_implantacoes_records`.
--   Com SECURITY DEFINER padrão, RLS de cs_implantacoes_records é ignorado:
--   qualquer usuário autenticado pode ver implantações de todos os clientes.
--
-- Problema: cs_implantacoes_records pode conter dados de clientes confidenciais
--   (consultor, data_inicio, solucao) visíveis sem restrição de network.
--
-- Correção: security_invoker = true → RLS das tabelas base é aplicado.

DROP VIEW IF EXISTS public.vw_customer_service_kpis;

CREATE VIEW public.vw_customer_service_kpis
  WITH (security_invoker = true)
AS
SELECT
  'devops_queue'::text         AS source,
  dq.query_name,
  dq.work_item_id,
  dq.title,
  dq.work_item_type,
  dq.state,
  dq.assigned_to_display,
  dq.priority,
  dq.effort,
  dq.tags,
  dq.created_date,
  dq.changed_date,
  NULL::date                   AS data_referencia,
  NULL::text                   AS consultor_impl,
  NULL::text                   AS solucao,
  NULL::text                   AS status_implantacao,
  dq.web_url
FROM public.vw_devops_queue_items dq
WHERE dq.sector = 'customer_service'

UNION ALL

SELECT
  'manual_implantacao'::text   AS source,
  NULL::text                   AS query_name,
  NULL::integer                AS work_item_id,
  cr.cliente                   AS title,
  'Implantação'::text          AS work_item_type,
  cr.status_implantacao        AS state,
  cr.consultor                 AS assigned_to_display,
  NULL::integer                AS priority,
  NULL::numeric                AS effort,
  NULL::text                   AS tags,
  cr.data_inicio::timestamptz  AS created_date,
  cr.data_fim::timestamptz     AS changed_date,
  cr.data_referencia,
  cr.consultor                 AS consultor_impl,
  cr.solucao,
  cr.status_implantacao,
  NULL::text                   AS web_url
FROM public.cs_implantacoes_records cr;

COMMENT ON VIEW public.vw_customer_service_kpis IS
'KPIs de Customer Service (DevOps queue + implantações manuais). '
'security_invoker=true: RLS das tabelas base é honrado.';


-- ── 5. v_timelog_unified ─────────────────────────────────────────────────────
--
-- Contexto: view criada em 20260430120000 para comparar apontamentos VDESK
--   vs Azure DevOps. Sem security_invoker, um usuário autenticado qualquer
--   via /rest/v1/v_timelog_unified vê os apontamentos de TODOS os usuários
--   e TODOS os work items — violação grave de privacidade de horas trabalhadas.
--
-- Correção: security_invoker = true. As tabelas devops_time_logs e
--   vdesk_time_logs devem ter políticas RLS adequadas (admin ou
--   network_id do usuário). Esta view não duplica os dados; apenas agrega.

DROP VIEW IF EXISTS public.v_timelog_unified;

CREATE VIEW public.v_timelog_unified
  WITH (security_invoker = true)
AS
WITH vdesk_agg AS (
  SELECT
    v.task_devops                                                              AS task_id,
    v.log_date,
    coalesce(cm.canonical_name, v.usuario_vdesk)                              AS user_canonical,
    v.usuario_vdesk                                                            AS vdesk_user_name,
    sum(v.tempo_segundos)                                                      AS seconds_vdesk,
    round(sum(v.tempo_segundos) / 60.0)::int                                   AS minutes_vdesk,
    count(*)                                                                   AS rows_vdesk,
    array_agg(v.id)                                                            AS vdesk_log_ids,
    max(v.num_os)                                                              AS num_os_sample
  FROM public.vdesk_time_logs v
  LEFT JOIN public.devops_collaborator_map cm
    ON lower(cm.vdesk_user_name) = lower(v.usuario_vdesk)
   AND coalesce(cm.is_active, true)
  GROUP BY v.task_devops, v.log_date, coalesce(cm.canonical_name, v.usuario_vdesk), v.usuario_vdesk
),
devops_agg AS (
  SELECT
    d.work_item_id                                                             AS task_id,
    d.log_date,
    coalesce(cm.canonical_name, d.user_name)                                  AS user_canonical,
    sum(d.time_minutes)                                                        AS minutes_devops,
    count(*)                                                                   AS rows_devops
  FROM public.devops_time_logs d
  LEFT JOIN public.devops_collaborator_map cm
    ON lower(cm.timelog_name) = lower(d.user_name)
   AND coalesce(cm.is_active, true)
  WHERE d.work_item_id IS NOT NULL
  GROUP BY d.work_item_id, d.log_date, coalesce(cm.canonical_name, d.user_name)
)
SELECT
  coalesce(v.task_id,         d.task_id)                                      AS task_id,
  coalesce(v.log_date,        d.log_date)                                     AS log_date,
  coalesce(v.user_canonical,  d.user_canonical)                               AS user_canonical,
  v.vdesk_user_name,
  coalesce(v.minutes_vdesk,  0)                                               AS minutes_vdesk,
  coalesce(d.minutes_devops, 0)                                               AS minutes_devops,
  coalesce(v.minutes_vdesk,  0) - coalesce(d.minutes_devops, 0)               AS gap_minutes,
  v.rows_vdesk,
  d.rows_devops,
  v.vdesk_log_ids,
  v.num_os_sample,
  wi.title                                                                     AS work_item_title,
  wi.state                                                                     AS work_item_state,
  wi.assigned_to_display                                                       AS work_item_assigned_to,
  wi.web_url                                                                   AS work_item_url,
  CASE
    WHEN v.task_id IS NULL THEN 'only_devops'
    WHEN d.task_id IS NULL THEN 'only_vdesk'
    WHEN coalesce(v.minutes_vdesk, 0) = coalesce(d.minutes_devops, 0) THEN 'match'
    ELSE 'divergent'
  END                                                                           AS status
FROM vdesk_agg v
FULL OUTER JOIN devops_agg d
  ON  d.task_id       = v.task_id
 AND  d.log_date      = v.log_date
 AND  d.user_canonical = v.user_canonical
LEFT JOIN public.devops_work_items wi
  ON wi.id = coalesce(v.task_id, d.task_id);

COMMENT ON VIEW public.v_timelog_unified IS
'Visão única (VDESK ↔ DevOps) por (task, dia, usuário). '
'Status: match / only_vdesk / only_devops / divergent. '
'security_invoker=true: RLS de vdesk_time_logs e devops_time_logs é aplicado.';

-- Verificação pós-migração (rodar manualmente no SQL editor):
--
-- SELECT viewname, definition
-- FROM pg_views
-- WHERE schemaname = 'public'
--   AND viewname IN (
--     'vw_hub_integrations_safe',
--     'v_dashboard_summary',
--     'vw_devops_lead_area_map_safe',
--     'vw_customer_service_kpis',
--     'v_timelog_unified'
--   );
--
-- Nenhuma dessas views deve aparecer com "SECURITY DEFINER" no Supabase Linter
-- após esta migration.
