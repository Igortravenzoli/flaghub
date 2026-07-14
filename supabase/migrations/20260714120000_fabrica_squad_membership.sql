-- Roster fixo das squads da Fábrica (K8 / FLEXX / STAGING / APP).
--
-- Define a squad "de casa" de cada colaborador — usado pela visão por squad e
-- pelo cálculo de uso cruzado (dev de uma fábrica apontando horas em item de
-- outra). A atribuição por tarefa continua vindo do Épico; este roster é a
-- lente de PESSOA FIXA que o gestor usa na planilha.
--
-- IMPORTANTE: os nomes NÃO são versionados aqui. Este repositório é público;
-- a carga do roster é feita direto no banco (dados pessoais ficam sob RLS).
-- `colaborador` casa com devops_time_logs.user_name / canonical_name.

create table if not exists public.fabrica_squad_membership (
  id           bigserial primary key,
  colaborador  text        not null,
  squad        text        not null check (squad in ('K8', 'FLEXX', 'STAGING', 'APP')),
  papel        text        not null default 'dev' check (papel in ('lead', 'dev')),
  ativo        boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint fabrica_squad_membership_colaborador_uniq unique (colaborador)
);

create index if not exists fabrica_squad_membership_squad_idx
  on public.fabrica_squad_membership (squad)
  where ativo;

alter table public.fabrica_squad_membership enable row level security;

-- Leitura para qualquer usuário autenticado do HUB.
drop policy if exists "fabrica_squad_membership_select" on public.fabrica_squad_membership;
create policy "fabrica_squad_membership_select"
  on public.fabrica_squad_membership
  for select
  to authenticated
  using (true);

comment on table public.fabrica_squad_membership is
  'Roster fixo dev->squad da Fábrica (fonte: planilha do gestor). Base do uso cruzado de capacity.';
