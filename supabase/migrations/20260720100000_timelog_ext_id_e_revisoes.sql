-- ============================================================================
-- Timelog: id oficial da extensão + trilha de revisões (tratamento de edição)
--
-- Contexto (conferência 19-20/07/2026): todos os lançamentos estavam com
-- ext_entry_id NULL por um bug na normalização do devops-sync-timelog
-- (passava entry.id como docId, anulando o próprio teste). Com isso, edição
-- de lançamento no DevOps viraria LINHA NOVA (fantasma na soma) em vez de
-- atualização. Este pacote:
--
--   1. Backfill: ext_entry_id ← raw->>'id' (uuid por lançamento da extensão;
--      conferido 6.276/6.276 presentes e únicos).
--   2. Troca o índice único PARCIAL por constraint única plena — o upsert do
--      PostgREST (ON CONFLICT ext_entry_id) não infere índice parcial.
--   3. Tabela devops_time_log_revisions + trigger: toda edição preserva a
--      versão anterior (antes/depois auditável); ingested_at nunca é
--      sobrescrito (mantém o "primeira vez visto").
--
-- Par no frontend: selo "vN · editado" no drill-down quando etag > 1.
-- ============================================================================

-- 1. Backfill do id oficial
update public.devops_time_logs
   set ext_entry_id = raw->>'id'
 where ext_entry_id is null
   and coalesce(raw->>'id', '') <> '';

-- 2. Índice parcial → constraint única plena (árbitro válido p/ upsert)
drop index if exists public.idx_devops_time_logs_ext_entry_id;
alter table public.devops_time_logs
  drop constraint if exists devops_time_logs_ext_entry_id_key;
alter table public.devops_time_logs
  add constraint devops_time_logs_ext_entry_id_key unique (ext_entry_id);

-- 3. Trilha de revisões — versão anterior de cada lançamento editado
create table if not exists public.devops_time_log_revisions (
  id uuid primary key default gen_random_uuid(),
  time_log_id uuid not null,
  ext_entry_id text,
  work_item_id integer,
  log_date date,
  start_time text,
  time_minutes integer,
  user_name text,
  notes text,
  etag text,
  revised_at timestamptz not null default now()
);

comment on table public.devops_time_log_revisions is
  'Versões anteriores de lançamentos do DevOps TimeLog editados após a criação. Gravada por trigger no UPDATE de devops_time_logs; o frontend sinaliza etag>1 como "vN · editado".';

alter table public.devops_time_log_revisions enable row level security;

drop policy if exists devops_time_log_revisions_select on public.devops_time_log_revisions;
create policy devops_time_log_revisions_select
  on public.devops_time_log_revisions for select to authenticated
  using (
    hub_is_admin() or exists (
      select 1 from hub_area_members m
      join hub_areas a on a.id = m.area_id
      where m.user_id = (select auth.uid()) and m.is_active
        and a.key = any (array['fabrica','qualidade','programacao','devops','infraestrutura','produtos'])
    )
  );

create or replace function public.fn_log_time_log_revision()
returns trigger
language plpgsql security definer set search_path = 'public'
as $$
begin
  -- ingested_at é "primeira vez visto" — nunca sobrescrever em update
  new.ingested_at := old.ingested_at;

  -- Upsert no-op do sync (roda a cada 15 min sobre a base toda): nada mudou →
  -- cancela o UPDATE (evita churn de tuplas e mantém a métrica de upserts útil).
  if new.work_item_id is not distinct from old.work_item_id
     and new.log_date     is not distinct from old.log_date
     and new.start_time   is not distinct from old.start_time
     and new.time_minutes is not distinct from old.time_minutes
     and new.user_name    is not distinct from old.user_name
     and new.user_id_ext  is not distinct from old.user_id_ext
     and new.notes        is not distinct from old.notes
     and new.etag         is not distinct from old.etag
     and new.raw          is not distinct from old.raw
  then
    return null;
  end if;

  if (old.time_minutes is distinct from new.time_minutes)
     or (old.log_date     is distinct from new.log_date)
     or (old.start_time   is distinct from new.start_time)
     or (old.notes        is distinct from new.notes)
     or (old.work_item_id is distinct from new.work_item_id)
     or (old.user_name    is distinct from new.user_name) then
    insert into public.devops_time_log_revisions
      (time_log_id, ext_entry_id, work_item_id, log_date, start_time, time_minutes, user_name, notes, etag)
    values
      (old.id, old.ext_entry_id, old.work_item_id, old.log_date, old.start_time, old.time_minutes, old.user_name, old.notes, old.etag);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_time_log_revision on public.devops_time_logs;
create trigger trg_time_log_revision
  before update on public.devops_time_logs
  for each row execute function public.fn_log_time_log_revision();
