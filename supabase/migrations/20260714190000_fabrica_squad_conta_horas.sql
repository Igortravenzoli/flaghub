-- Distingue lead EXECUTOR (administra e opera — horas contam) de lead SÓ GESTOR
-- (não opera — horas não contam como hora de fábrica).
--
-- `papel` continua dizendo quem é o lead (cabeçalho do Lead→Dev). `conta_horas`
-- diz se as horas da pessoa entram na capacidade e no realizado da fábrica.
--   · dev / lead executor (Klélbio, Jackson) → conta_horas = true
--   · lead só gestor (Monge, Fabio)           → conta_horas = false
--
-- Valores por pessoa são carregados direto no banco (repo público).

alter table public.fabrica_squad_membership
  add column if not exists conta_horas boolean not null default true;

comment on column public.fabrica_squad_membership.conta_horas is
  'Se as horas contam como hora de fábrica (capacidade + realizado). false = lead só gestor.';
