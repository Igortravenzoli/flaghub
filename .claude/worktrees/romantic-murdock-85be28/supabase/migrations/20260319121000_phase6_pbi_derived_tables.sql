-- Phase 6: normalized PBI stage events + lifecycle and health summaries

create table if not exists public.pbi_stage_events (
  id bigserial primary key,
  work_item_id int not null references public.devops_work_items(id) on delete cascade,
  sector text,
  stage_key text not null,
  entered_at timestamptz not null,
  exited_at timestamptz,
  duration_days numeric(10,2),
  sprint_path text,
  sprint_code text,
  responsible_email text,
  inference_method text not null check (inference_method in ('state_pattern', 'pipeline_role', 'iteration_suffix', 'fallback')),
  is_overflow boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pbi_stage_events_work_item on public.pbi_stage_events(work_item_id);
create index if not exists idx_pbi_stage_events_stage on public.pbi_stage_events(stage_key);
create index if not exists idx_pbi_stage_events_sector on public.pbi_stage_events(sector);
create index if not exists idx_pbi_stage_events_sprint_code on public.pbi_stage_events(sprint_code);
create index if not exists idx_pbi_stage_events_entered_at on public.pbi_stage_events(entered_at);
create index if not exists idx_pbi_stage_events_overflow on public.pbi_stage_events(is_overflow) where is_overflow = true;

alter table public.pbi_stage_events enable row level security;

drop policy if exists "Authenticated users can read pbi stage events" on public.pbi_stage_events;
create policy "Authenticated users can read pbi stage events"
on public.pbi_stage_events for select to authenticated
using (true);

create table if not exists public.pbi_lifecycle_summary (
  work_item_id int primary key references public.devops_work_items(id) on delete cascade,
  sector text,
  current_stage text,
  has_design_stage boolean not null default false,
  first_committed_sprint text,
  last_committed_sprint text,
  lead_owner_at_commitment text,
  overflow_stage text,
  total_lead_time_days numeric(10,2),
  backlog_days numeric(10,2) not null default 0,
  design_days numeric(10,2) not null default 0,
  fabrica_days numeric(10,2) not null default 0,
  qualidade_days numeric(10,2) not null default 0,
  deploy_days numeric(10,2) not null default 0,
  sprint_migration_count int not null default 0,
  overflow_count int not null default 0,
  overflow_by_stage jsonb,
  qa_return_count int not null default 0,
  computed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pbi_lifecycle_summary_sector on public.pbi_lifecycle_summary(sector);
create index if not exists idx_pbi_lifecycle_summary_current_stage on public.pbi_lifecycle_summary(current_stage);
create index if not exists idx_pbi_lifecycle_summary_overflow on public.pbi_lifecycle_summary(overflow_count);

alter table public.pbi_lifecycle_summary enable row level security;

drop policy if exists "Authenticated users can read pbi lifecycle summary" on public.pbi_lifecycle_summary;
create policy "Authenticated users can read pbi lifecycle summary"
on public.pbi_lifecycle_summary for select to authenticated
using (true);

create table if not exists public.pbi_health_summary (
  work_item_id int primary key references public.devops_work_items(id) on delete cascade,
  sector text,
  health_status text not null check (health_status in ('verde', 'amarelo', 'vermelho')),
  bottleneck_stage text,
  health_reasons jsonb,
  computed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pbi_health_summary_sector on public.pbi_health_summary(sector);
create index if not exists idx_pbi_health_summary_status on public.pbi_health_summary(health_status);

alter table public.pbi_health_summary enable row level security;

drop policy if exists "Authenticated users can read pbi health summary" on public.pbi_health_summary;
create policy "Authenticated users can read pbi health summary"
on public.pbi_health_summary for select to authenticated
using (true);
