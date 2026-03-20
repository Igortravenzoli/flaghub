-- Phase 6: views and RPCs for PBI lifecycle analytics

create or replace view public.vw_pbi_with_feature_epic
with (security_invoker = true) as
select
  pbi.id as work_item_id,
  pbi.title as work_item_title,
  pbi.work_item_type as work_item_type,
  pbi.state as work_item_state,
  pbi.assigned_to_unique as assigned_to_email,
  pbi.iteration_path,
  feature.id as feature_id,
  feature.title as feature_title,
  feature.state as feature_state,
  epic.id as epic_id,
  epic.title as epic_title,
  epic.state as epic_state
from public.devops_work_items pbi
left join public.devops_work_items feature on feature.id = pbi.parent_id and feature.work_item_type = 'Feature'
left join public.devops_work_items epic on epic.id = feature.parent_id and epic.work_item_type = 'Epic'
where pbi.work_item_type in ('Product Backlog Item', 'User Story', 'Bug');

create or replace function public.rpc_feature_pbi_summary(
  p_sector text default null,
  p_sprint_code text default null,
  p_date_start date default null,
  p_date_end date default null
)
returns table (
  feature_id int,
  feature_title text,
  epic_id int,
  epic_title text,
  pbi_count bigint,
  bug_count bigint,
  verde_count bigint,
  amarelo_count bigint,
  vermelho_count bigint,
  avg_lead_time_days numeric,
  overflow_count bigint
)
language sql
stable
security invoker
as $$
with base as (
  select
    v.feature_id,
    coalesce(v.feature_title, 'Sem Feature') as feature_title,
    v.epic_id,
    coalesce(v.epic_title, 'Sem Epic') as epic_title,
    v.work_item_id,
    v.work_item_type,
    l.total_lead_time_days,
    l.overflow_count,
    h.health_status
  from public.vw_pbi_with_feature_epic v
  left join public.pbi_lifecycle_summary l on l.work_item_id = v.work_item_id
  left join public.pbi_health_summary h on h.work_item_id = v.work_item_id
  where
    (
      p_sector is null
      or exists (
        select 1
        from public.devops_query_items_current qic
        join public.devops_queries dq on dq.id = qic.query_id
        where qic.work_item_id = v.work_item_id
          and dq.sector = p_sector
      )
    )
    and (
      p_sprint_code is null
      or exists (
        select 1
        from public.pbi_stage_events pse
        where pse.work_item_id = v.work_item_id
          and pse.sprint_code = p_sprint_code
      )
    )
    and (
      (p_date_start is null and p_date_end is null)
      or exists (
        select 1
        from public.pbi_stage_events pse
        where pse.work_item_id = v.work_item_id
          and pse.entered_at::date >= coalesce(p_date_start, pse.entered_at::date)
          and pse.entered_at::date <= coalesce(p_date_end, pse.entered_at::date)
      )
    )
)
select
  feature_id,
  feature_title,
  epic_id,
  epic_title,
  count(*) filter (where work_item_type in ('Product Backlog Item', 'User Story')) as pbi_count,
  count(*) filter (where work_item_type = 'Bug') as bug_count,
  count(*) filter (where health_status = 'verde') as verde_count,
  count(*) filter (where health_status = 'amarelo') as amarelo_count,
  count(*) filter (where health_status = 'vermelho') as vermelho_count,
  round(avg(total_lead_time_days)::numeric, 2) as avg_lead_time_days,
  coalesce(sum(overflow_count), 0)::bigint as overflow_count
from base
group by feature_id, feature_title, epic_id, epic_title
order by feature_title;
$$;

create or replace function public.rpc_pbi_bottleneck_summary(
  p_sector text default null,
  p_sprint_code text default null,
  p_date_start date default null,
  p_date_end date default null
)
returns table (
  stage_key text,
  stage_label text,
  avg_days_in_stage numeric,
  max_days_in_stage numeric,
  count_in_stage bigint,
  count_overtime bigint,
  overflow_count_in_stage bigint
)
language sql
stable
security invoker
as $$
with filtered_events as (
  select pse.*
  from public.pbi_stage_events pse
  where
    (p_sector is null or pse.sector = p_sector)
    and (p_sprint_code is null or pse.sprint_code = p_sprint_code)
    and (p_date_start is null or pse.entered_at::date >= p_date_start)
    and (p_date_end is null or pse.entered_at::date <= p_date_end)
),
agg as (
  select
    fe.stage_key,
    avg(coalesce(fe.duration_days, greatest(0, extract(epoch from (now() - fe.entered_at)) / 86400.0))) as avg_days,
    max(coalesce(fe.duration_days, greatest(0, extract(epoch from (now() - fe.entered_at)) / 86400.0))) as max_days,
    count(*) as total_rows,
    count(*) filter (where fe.is_overflow) as overflow_rows
  from filtered_events fe
  group by fe.stage_key
)
select
  a.stage_key,
  coalesce(sc.label_pt, a.stage_key) as stage_label,
  round(a.avg_days::numeric, 2) as avg_days_in_stage,
  round(a.max_days::numeric, 2) as max_days_in_stage,
  a.total_rows::bigint as count_in_stage,
  count(*) filter (
    where coalesce(fe.duration_days, greatest(0, extract(epoch from (now() - fe.entered_at)) / 86400.0)) > coalesce(ht.warn_days, 99999)
  )::bigint as count_overtime,
  a.overflow_rows::bigint as overflow_count_in_stage
from agg a
left join public.pbi_stage_config sc on sc.stage_key = a.stage_key
left join public.pbi_health_thresholds ht on ht.stage_key = a.stage_key
left join filtered_events fe on fe.stage_key = a.stage_key
group by a.stage_key, sc.label_pt, a.avg_days, a.max_days, a.total_rows, a.overflow_rows
order by coalesce(sc.sort_order, 999), a.stage_key;
$$;

create or replace function public.rpc_pbi_health_overview(
  p_sector text default null,
  p_sprint_code text default null,
  p_date_start date default null,
  p_date_end date default null
)
returns table (
  total_count bigint,
  verde_count bigint,
  amarelo_count bigint,
  vermelho_count bigint,
  items_with_bottleneck bigint
)
language sql
stable
security invoker
as $$
with eligible as (
  select distinct l.work_item_id
  from public.pbi_lifecycle_summary l
  where
    (p_sector is null or l.sector = p_sector)
    and (
      p_sprint_code is null
      or exists (
        select 1
        from public.pbi_stage_events pse
        where pse.work_item_id = l.work_item_id
          and pse.sprint_code = p_sprint_code
      )
    )
    and (
      (p_date_start is null and p_date_end is null)
      or exists (
        select 1
        from public.pbi_stage_events pse
        where pse.work_item_id = l.work_item_id
          and pse.entered_at::date >= coalesce(p_date_start, pse.entered_at::date)
          and pse.entered_at::date <= coalesce(p_date_end, pse.entered_at::date)
      )
    )
)
select
  count(*)::bigint as total_count,
  count(*) filter (where h.health_status = 'verde')::bigint as verde_count,
  count(*) filter (where h.health_status = 'amarelo')::bigint as amarelo_count,
  count(*) filter (where h.health_status = 'vermelho')::bigint as vermelho_count,
  count(*) filter (where h.bottleneck_stage is not null)::bigint as items_with_bottleneck
from eligible e
left join public.pbi_health_summary h on h.work_item_id = e.work_item_id;
$$;

grant execute on function public.rpc_feature_pbi_summary(text, text, date, date) to authenticated;
grant execute on function public.rpc_pbi_bottleneck_summary(text, text, date, date) to authenticated;
grant execute on function public.rpc_pbi_health_overview(text, text, date, date) to authenticated;
