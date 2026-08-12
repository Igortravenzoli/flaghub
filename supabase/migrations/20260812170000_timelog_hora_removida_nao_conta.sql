-- ============================================================================
-- Hora removida na origem não é contabilizada
--
-- Decisão do gestor (12/08/2026): lançamento apagado no DevOps depois de
-- coletado NÃO conta nas horas. O rastro continua guardado — a tabela crua
-- `devops_time_logs` permanece completa e `devops_time_log_orphans` marca quem
-- sumiu —, mas toda SOMA passa a sair da view de ativos.
--
-- Por que view e não delete: apagar destruiria a única prova de que o
-- lançamento existiu, e é justamente essa prova que permite ao portal mostrar
-- ao colaborador "estes registros foram removidos e não foram contabilizados".
--
-- Em 07/2026 a diferença é de 30 lançamentos e 96,63 h (3.402,73 → 3.306,10).
--
-- Quem passa a ler a view de ativos:
--   - rpc_devops_timelog_agg  (base de todas as horas da Fábrica)
--   - v_timelog_unified       (reconciliação Vdesk × DevOps)
--   - useFabricaKpis          (régua de jornada acima do limite)
--   - AlocacaoLeadDevCard     (drill dev → task → lançamento)
-- Quem continua lendo a tabela crua, de propósito:
--   - useColaboradorAtividade (para LISTAR o removido, marcado e fora da soma)
-- ============================================================================

create or replace view public.v_devops_time_logs_ativos
with (security_invoker = true) as
select t.*
  from public.devops_time_logs t
 where not exists (
   select 1 from public.devops_time_log_orphans o where o.ext_entry_id = t.ext_entry_id
 );

comment on view public.v_devops_time_logs_ativos is
  'devops_time_logs SEM os lancamentos removidos na origem (devops_time_log_orphans). E daqui que sai toda soma de horas: hora apagada no DevOps nao conta. A tabela crua continua completa, para o portal poder MOSTRAR o que foi removido.';

grant select on public.v_devops_time_logs_ativos to authenticated;

-- Reconciliação passa a comparar o VDESK contra o DevOps ATIVO.
create or replace view public.v_timelog_unified as
 WITH vdesk_agg AS (
         SELECT v_1.task_devops AS task_id,
            v_1.log_date,
            COALESCE(cm.canonical_name, v_1.usuario_vdesk) AS user_canonical,
            v_1.usuario_vdesk AS vdesk_user_name,
            sum(v_1.tempo_segundos) AS seconds_vdesk,
            round(sum(v_1.tempo_segundos)::numeric / 60.0)::integer AS minutes_vdesk,
            count(*) AS rows_vdesk,
            array_agg(v_1.id) AS vdesk_log_ids,
            max(v_1.num_os) AS num_os_sample
           FROM vdesk_time_logs v_1
             LEFT JOIN devops_collaborator_map cm ON lower(cm.vdesk_user_name) = lower(v_1.usuario_vdesk) AND COALESCE(cm.is_active, true)
          GROUP BY v_1.task_devops, v_1.log_date, (COALESCE(cm.canonical_name, v_1.usuario_vdesk)), v_1.usuario_vdesk
        ), devops_agg AS (
         SELECT d_1.work_item_id AS task_id,
            d_1.log_date,
            COALESCE(cm.canonical_name, d_1.user_name) AS user_canonical,
            sum(d_1.time_minutes) AS minutes_devops,
            count(*) AS rows_devops
           FROM v_devops_time_logs_ativos d_1
             LEFT JOIN devops_collaborator_map cm ON lower(cm.timelog_name) = lower(d_1.user_name) AND COALESCE(cm.is_active, true)
          WHERE d_1.work_item_id IS NOT NULL
          GROUP BY d_1.work_item_id, d_1.log_date, (COALESCE(cm.canonical_name, d_1.user_name))
        )
 SELECT COALESCE(v.task_id, d.task_id) AS task_id,
    COALESCE(v.log_date, d.log_date) AS log_date,
    COALESCE(v.user_canonical, d.user_canonical) AS user_canonical,
    v.vdesk_user_name,
    COALESCE(v.minutes_vdesk, 0) AS minutes_vdesk,
    COALESCE(d.minutes_devops, 0::bigint) AS minutes_devops,
    COALESCE(v.minutes_vdesk, 0) - COALESCE(d.minutes_devops, 0::bigint) AS gap_minutes,
    v.rows_vdesk,
    d.rows_devops,
    v.vdesk_log_ids,
    v.num_os_sample,
    wi.title AS work_item_title,
    wi.state AS work_item_state,
    wi.assigned_to_display AS work_item_assigned_to,
    wi.web_url AS work_item_url,
        CASE
            WHEN v.task_id IS NULL THEN 'only_devops'::text
            WHEN d.task_id IS NULL THEN 'only_vdesk'::text
            WHEN COALESCE(v.minutes_vdesk, 0) = COALESCE(d.minutes_devops, 0::bigint) THEN 'match'::text
            ELSE 'divergent'::text
        END AS status
   FROM vdesk_agg v
     FULL JOIN devops_agg d ON d.task_id = v.task_id AND d.log_date = v.log_date AND d.user_canonical = v.user_canonical
     LEFT JOIN devops_work_items wi ON wi.id = COALESCE(v.task_id, d.task_id);

-- Agregação que alimenta todas as horas da Fábrica.
create or replace function public.rpc_devops_timelog_agg(p_from date default null, p_to date default null, p_work_item_ids integer[] default null)
returns table(work_item_id integer, user_name text, total_minutes integer, min_log_date date, max_log_date date)
language sql stable security definer set search_path to 'public' as $fn$
  SELECT
    tl.work_item_id,
    tl.user_name,
    SUM(COALESCE(tl.time_minutes, 0))::int AS total_minutes,
    MIN(tl.log_date)::date AS min_log_date,
    MAX(tl.log_date)::date AS max_log_date
  FROM public.v_devops_time_logs_ativos tl
  WHERE (p_from IS NULL OR tl.log_date >= p_from)
    AND (p_to IS NULL OR tl.log_date <= p_to)
    AND (
      p_work_item_ids IS NULL
      OR array_length(p_work_item_ids, 1) IS NULL
      OR tl.work_item_id = ANY (p_work_item_ids)
    )
  GROUP BY tl.work_item_id, tl.user_name;
$fn$;
