-- Phase 6 incremental adjustments:
-- 1. official Quality queue by DevOps WIQL id
-- 2. Fábrica query renamed to 07 and expanded with Aguardando Teste
-- 3. current Quality queue view restricted to Em Teste / Aguardando Deploy
-- 4. stage inference updated so Aguardando Teste remains in Fábrica
-- 5. dedicated sync job for Quality

do $$
declare
  v_quality_query_db_id uuid;
  v_quality_area_id uuid;
  v_azure_integration_id uuid;
begin
  insert into public.devops_queries (
    name,
    wiql_id,
    source_mode,
    sector,
    is_active,
    refresh_minutes,
    config
  )
  values (
    '06 - Em Qualidade',
    '7b0a8298-5890-42d8-b280-1121b21786da',
    'saved_query',
    'qualidade',
    true,
    10,
    jsonb_build_object(
      'description', 'Fila oficial atual de Qualidade',
      'official', true,
      'queue_kind', 'current_quality'
    )
  )
  on conflict do nothing;

  update public.devops_queries
  set
    name = '06 - Em Qualidade',
    sector = 'qualidade',
    source_mode = 'saved_query',
    wiql_id = '7b0a8298-5890-42d8-b280-1121b21786da',
    is_active = true,
    refresh_minutes = coalesce(refresh_minutes, 10),
    config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
      'description', 'Fila oficial atual de Qualidade',
      'official', true,
      'queue_kind', 'current_quality'
    )
  where wiql_id = '7b0a8298-5890-42d8-b280-1121b21786da';

  update public.devops_queries
  set name = '07-Fabrica Itens em Progresso'
  where sector = 'fabrica'
    and name = '06-Fabrica Itens em Progresso';

  update public.devops_queries
  set
    wiql_text = 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = ''Flag.Planejamento'' AND [System.WorkItemType] IN (''Product Backlog Item'', ''Task'', ''Bug'', ''User Story'') AND [System.State] IN (''Active'', ''In Progress'', ''New'', ''Aguardando Teste'') ORDER BY [System.ChangedDate] DESC',
    config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
      'supports_waiting_test', true,
      'official_name', '07-Fabrica Itens em Progresso'
    )
  where sector = 'fabrica'
    and source_mode = 'inline_wiql';

  update public.pbi_stage_config
  set
    state_patterns = array['Active', 'In Progress', 'Em desenvolvimento', 'Aguardando Teste'],
    label_pt = 'Fabrica / Desenvolvimento',
    sort_order = 30
  where stage_key = 'fabrica';

  update public.pbi_stage_config
  set
    state_patterns = array['Em Teste', 'Testing'],
    label_pt = 'Qualidade / Teste',
    sort_order = 40
  where stage_key = 'qualidade';

  update public.pbi_stage_config
  set
    state_patterns = array['Aguardando Deploy'],
    label_pt = 'Aguardando Deploy',
    sort_order = 50
  where stage_key = 'deploy';

  create or replace view public.vw_qualidade_kpis
  with (security_invoker = true) as
  with quality_query as (
    select id
    from public.devops_queries
    where wiql_id = '7b0a8298-5890-42d8-b280-1121b21786da'
    order by created_at desc
    limit 1
  ),
  current_queue as (
    select
      qic.work_item_id,
      qic.synced_at as snapshot_at
    from public.devops_query_items_current qic
    join quality_query qq on qq.id = qic.query_id
  ),
  base as (
    select
      wi.id,
      wi.title,
      wi.work_item_type,
      wi.state,
      wi.assigned_to_display,
      wi.priority,
      wi.tags,
      wi.iteration_path,
      wi.created_date,
      wi.changed_date,
      wi.web_url,
      cq.snapshot_at,
      case
        when wi.state in ('Em Teste', 'Aguardando Deploy') then true
        else false
      end as is_quality_state,
      case
        when wi.state = 'Aguardando Deploy' then true
        else false
      end as is_waiting_deploy,
      case
        when wi.iteration_path is null then false
        when wi.iteration_path ~* 'S\\d+-\\d{4}' then true
        else false
      end as has_sprint_code,
      upper(substring(wi.iteration_path from '(S\\d+-\\d{4})')) as sprint_code
    from current_queue cq
    join public.devops_work_items wi on wi.id = cq.work_item_id
  )
  select
    id,
    title,
    work_item_type,
    state,
    assigned_to_display,
    priority,
    created_date,
    changed_date,
    web_url,
    tags,
    iteration_path,
    sprint_code,
    true as is_current_queue,
    is_waiting_deploy,
    has_sprint_code,
    snapshot_at
  from base
  where is_quality_state = true
  order by changed_date desc nulls last, snapshot_at desc nulls last;

  select id into v_quality_query_db_id
  from public.devops_queries
  where wiql_id = '7b0a8298-5890-42d8-b280-1121b21786da'
  order by created_at desc
  limit 1;

  select id into v_quality_area_id
  from public.hub_areas
  where key = 'qualidade'
  limit 1;

  select id into v_azure_integration_id
  from public.hub_integrations
  where key = 'azure_devops'
  limit 1;

  if v_azure_integration_id is not null then
    insert into public.hub_sync_jobs (
      job_key,
      integration_id,
      area_id,
      schedule_minutes,
      enabled,
      config
    )
    values (
      'devops-sync-qualidade',
      v_azure_integration_id,
      v_quality_area_id,
      10,
      true,
      jsonb_build_object(
        'description', 'Sync especializado da fila oficial de Qualidade',
        'function_name', 'devops-sync-qualidade',
        'quality_query_wiql_id', '7b0a8298-5890-42d8-b280-1121b21786da',
        'quality_query_db_id', v_quality_query_db_id
      )
    )
    on conflict do nothing;
  end if;
end
$$;