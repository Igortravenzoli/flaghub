-- ============================================================================
-- Detecção de lançamento excluído na origem
--
-- O sync do TimeLog nunca apaga: ele insere e atualiza. Se alguém excluir um
-- apontamento na extensão do DevOps, a linha fica no portal para sempre e a
-- base passa a ter MAIS que a origem, sem nenhum sinal.
--
-- Medição de 12/08/2026: a extensão devolve 7.137 lançamentos e a base tem
-- 7.175. As outras hipóteses para a diferença (filtro de time, filtro de
-- usuário, composição do time) já foram eliminadas uma a uma.
--
-- ── Por que uma tabela de órfãos, e não um carimbo por linha ─────────────────
-- A primeira tentativa foi uma coluna `last_seen_at` em devops_time_logs,
-- gravada em toda linha do payload. Não funciona, e a razão é boa: o trigger
-- `trg_time_log_revision` CANCELA o update quando nenhuma coluna de conteúdo
-- muda, de propósito, para não gerar 7 mil updates a cada 15 minutos. Um
-- carimbo por linha ou seria descartado por essa trava, ou exigiria derrubá-la
-- e trocar um diagnóstico por churn permanente de tuplas.
--
-- Esta tabela guarda só a DIFERENÇA (dezenas de linhas), calculada em memória
-- pelo sync: id que está na base e não veio no payload. Some quando o
-- lançamento reaparece.
--
-- Nada é apagado de devops_time_logs por isso. O portal só passa a saber a
-- diferença entre "existe" e "existiu"; o que fazer com essas linhas é decisão
-- de quem lê o número.
-- ============================================================================

create table if not exists public.devops_time_log_orphans (
  ext_entry_id     text primary key,
  work_item_id     integer,
  log_date         date,
  user_name        text,
  time_minutes     integer,
  /** Primeira coleta em que a linha deixou de vir no payload. */
  first_missing_at timestamptz not null default now(),
  last_checked_at  timestamptz not null default now()
);

comment on table public.devops_time_log_orphans is
  'Lançamentos que existem em devops_time_logs e não vêm mais no payload da extensão TimeLog: excluídos na origem. Preenchido por devops-sync-timelog v3.3; a linha some quando o lançamento reaparece.';

create index if not exists devops_time_log_orphans_log_date_idx
  on public.devops_time_log_orphans (log_date);

alter table public.devops_time_log_orphans enable row level security;

drop policy if exists devops_time_log_orphans_select on public.devops_time_log_orphans;
create policy devops_time_log_orphans_select
  on public.devops_time_log_orphans for select to authenticated
  using (hub_is_admin());

-- A tentativa anterior fica desfeita: coluna sem uso é dívida.
alter table public.devops_time_logs drop column if exists last_seen_at;
