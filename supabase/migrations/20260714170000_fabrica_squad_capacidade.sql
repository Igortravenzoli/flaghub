-- Capacidade produtiva por pessoa (horas/dia), base do "Capacidade × Realizado".
--
-- Regra do gestor: colaborador integral = 7h/dia; a capacidade do período é
-- horas/dia × dias úteis (seg–sex) do período; a capacidade da squad é a soma
-- dos membros. O realizado vem do timelog (DevOps).
--
-- Os VALORES por pessoa não são versionados (repo público) — a carga vai direto
-- no banco. Aqui só o schema, com o padrão 7h/dia.

alter table public.fabrica_squad_membership
  add column if not exists capacidade_h_dia numeric(4,2) not null default 7
  check (capacidade_h_dia >= 0 and capacidade_h_dia <= 24);

comment on column public.fabrica_squad_membership.capacidade_h_dia is
  'Horas produtivas por dia útil (planilha do gestor). Capacidade do período = valor × dias úteis. Squad = soma dos membros.';
