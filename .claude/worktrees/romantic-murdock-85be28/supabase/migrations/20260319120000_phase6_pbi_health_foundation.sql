-- Phase 6: PBI Health foundation tables (config + lead map)

-- 1) Lead/area mapping (single source of truth; avoids frontend hardcode)
create table if not exists public.devops_lead_area_map (
  id bigserial primary key,
  lead_email text not null unique,
  canonical_name text,
  area_key text not null,
  squad_label text,
  pipeline_role text not null check (pipeline_role in ('design', 'fabrica', 'qualidade', 'pm', 'cs')),
  visual_priority int not null default 100,
  counts_as_design boolean not null default false,
  counts_as_fabrica boolean not null default false,
  counts_as_qualidade boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_devops_lead_area_map_role on public.devops_lead_area_map(pipeline_role);
create index if not exists idx_devops_lead_area_map_active on public.devops_lead_area_map(is_active);

alter table public.devops_lead_area_map enable row level security;

drop policy if exists "Authenticated users can read lead area map" on public.devops_lead_area_map;
create policy "Authenticated users can read lead area map"
on public.devops_lead_area_map for select to authenticated
using (true);

drop policy if exists "Admins can manage lead area map" on public.devops_lead_area_map;
create policy "Admins can manage lead area map"
on public.devops_lead_area_map for all to authenticated
using (public.hub_is_admin())
with check (public.hub_is_admin());

insert into public.devops_lead_area_map (
  lead_email,
  canonical_name,
  area_key,
  squad_label,
  pipeline_role,
  visual_priority,
  counts_as_design,
  counts_as_fabrica,
  counts_as_qualidade,
  is_active
)
values
  ('ari@flag.com.br', 'Ari', 'design', 'Design', 'design', 10, true, false, false, true),
  ('fabio@flag.com.br', 'Fabio', 'fabrica', 'K8', 'fabrica', 20, false, true, false, true),
  ('jackson@flag.com.br', 'Jackson', 'fabrica', 'APP', 'fabrica', 21, false, true, false, true),
  ('klelbio@flag.com.br', 'Klelbio', 'fabrica', 'FLEXX', 'fabrica', 22, false, true, false, true),
  ('alexandre@flag.com.br', 'Alexandre', 'fabrica', 'STAGING', 'fabrica', 23, false, true, false, true),
  ('thales@flag.com.br', 'Thales', 'qualidade', 'Qualidade', 'qualidade', 30, false, false, true, true),
  ('lantim@flag.com.br', 'Lantim', 'backlog', 'PM', 'pm', 40, false, false, false, true),
  ('wilker@flag.com.br', 'Wilker', 'customer_service', 'CS', 'cs', 41, false, false, false, true),
  ('monge@flag.com.br', 'Monge', 'fabrica', 'TechLead', 'pm', 42, false, true, false, true)
on conflict (lead_email) do update
set
  canonical_name = excluded.canonical_name,
  area_key = excluded.area_key,
  squad_label = excluded.squad_label,
  pipeline_role = excluded.pipeline_role,
  visual_priority = excluded.visual_priority,
  counts_as_design = excluded.counts_as_design,
  counts_as_fabrica = excluded.counts_as_fabrica,
  counts_as_qualidade = excluded.counts_as_qualidade,
  is_active = excluded.is_active,
  updated_at = now();

-- 2) Health thresholds (admin-editable in DB; UI can come later)
create table if not exists public.pbi_health_thresholds (
  id bigserial primary key,
  stage_key text not null unique,
  label text not null,
  warn_days int not null check (warn_days >= 0),
  critical_days int not null check (critical_days >= warn_days),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pbi_health_thresholds enable row level security;

drop policy if exists "Authenticated users can read pbi health thresholds" on public.pbi_health_thresholds;
create policy "Authenticated users can read pbi health thresholds"
on public.pbi_health_thresholds for select to authenticated
using (true);

drop policy if exists "Admins can manage pbi health thresholds" on public.pbi_health_thresholds;
create policy "Admins can manage pbi health thresholds"
on public.pbi_health_thresholds for all to authenticated
using (public.hub_is_admin())
with check (public.hub_is_admin());

insert into public.pbi_health_thresholds (stage_key, label, warn_days, critical_days, notes)
values
  ('backlog', 'Backlog / Criada', 14, 30, 'Aging antes de compromisso de sprint'),
  ('design', 'Design UX/UI', 7, 14, 'Nem toda PBI passa por design'),
  ('fabrica', 'Fabrica / Desenvolvimento', 14, 21, 'Execucao principal'),
  ('qualidade', 'Qualidade / Teste', 5, 10, 'Estados Em Teste e Aguardando Deploy'),
  ('deploy', 'Aguardando Deploy', 3, 7, 'Janela antes de producao'),
  ('done', 'Encerrada / Done', 0, 0, 'Etapa final')
on conflict (stage_key) do update
set
  label = excluded.label,
  warn_days = excluded.warn_days,
  critical_days = excluded.critical_days,
  notes = excluded.notes,
  is_active = true,
  updated_at = now();

-- 3) Stage inference config with precedence columns
create table if not exists public.pbi_stage_config (
  stage_key text primary key,
  label_pt text not null,
  sort_order int not null,
  state_patterns text[] not null default '{}'::text[],
  pipeline_roles text[] not null default '{}'::text[],
  iteration_suffix_patterns text[] not null default '{}'::text[],
  fallback_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pbi_stage_config enable row level security;

drop policy if exists "Authenticated users can read pbi stage config" on public.pbi_stage_config;
create policy "Authenticated users can read pbi stage config"
on public.pbi_stage_config for select to authenticated
using (true);

drop policy if exists "Admins can manage pbi stage config" on public.pbi_stage_config;
create policy "Admins can manage pbi stage config"
on public.pbi_stage_config for all to authenticated
using (public.hub_is_admin())
with check (public.hub_is_admin());

insert into public.pbi_stage_config (
  stage_key,
  label_pt,
  sort_order,
  state_patterns,
  pipeline_roles,
  iteration_suffix_patterns,
  fallback_order,
  is_active
)
values
  ('backlog', 'Criada / Backlog', 10, array['New', 'To Do'], array['cs', 'pm'], array['BACKLOG'], 0, true),
  ('design', 'Design UX/UI', 20, array['UX', 'Design'], array['design'], array['-UX', '-UX-UI'], 100, true),
  ('fabrica', 'Fabrica / Desenvolvimento', 30, array['Active', 'In Progress', 'Doing'], array['fabrica'], array['-FAB', '-K8', '-APP', '-FLEXX', '-STAGING'], 200, true),
  ('qualidade', 'Qualidade / Teste', 40, array['Em Teste', 'Aguardando Deploy', 'Testing'], array['qualidade'], array['-QA', '-TEST'], 300, true),
  ('deploy', 'Aguardando Deploy', 50, array['Aguardando Deploy'], array[]::text[], array['-DEPLOY'], 400, true),
  ('done', 'Encerrada / Done', 60, array['Done', 'Closed', 'Resolved'], array[]::text[], array[]::text[], 500, true)
on conflict (stage_key) do update
set
  label_pt = excluded.label_pt,
  sort_order = excluded.sort_order,
  state_patterns = excluded.state_patterns,
  pipeline_roles = excluded.pipeline_roles,
  iteration_suffix_patterns = excluded.iteration_suffix_patterns,
  fallback_order = excluded.fallback_order,
  is_active = excluded.is_active,
  updated_at = now();
