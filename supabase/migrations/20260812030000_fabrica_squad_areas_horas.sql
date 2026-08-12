-- ============================================================================
-- Roster: áreas que entram SÓ para contagem de horas
--
-- O roster nasceu com as quatro fábricas da Flag (K8, FLEXX, STAGING, APP), que
-- são times de ENTREGA: o nome no roster define tanto de quem se conta hora
-- quanto o que é item da Fábrica (`foraDoRoster` recorta o escopo de PBI em
-- useFabricaKpis).
--
-- Com a expansão da visão de colaboradores entram quatro grupos que NÃO são time
-- de entrega de sprint: INFRA, DESIGN, QUALIDADE e PRODUTOS. Decisão de 12/08/2026: eles
-- entram só no contexto de HORAS. O front separa as duas listas (SQUADS =
-- fábricas, AREAS = grupos de horas) e monta o recorte de item apenas com as
-- fábricas, então cadastrar gente aqui não move nenhum KPI de sprint.
--
-- Capacidade segue o padrão da casa: 7h/dia por colaborador (default da coluna
-- capacidade_h_dia). Área PODE ter lead (PRODUTOS tem); quando não tem, o card
-- mostra "sem lead definido no roster".
--
-- Os NOMES continuam fora do versionamento (repo público): esta migration só
-- abre o domínio do check; a carga das pessoas vai direto no banco.
-- ============================================================================

alter table public.fabrica_squad_membership
  drop constraint if exists fabrica_squad_membership_squad_check;

alter table public.fabrica_squad_membership
  add constraint fabrica_squad_membership_squad_check
  check (squad in ('K8', 'FLEXX', 'STAGING', 'APP', 'INFRA', 'DESIGN', 'QUALIDADE', 'PRODUTOS'));

comment on column public.fabrica_squad_membership.squad is
  'K8/FLEXX/STAGING/APP = fábricas (times de entrega; definem o escopo de item da Fábrica). INFRA/DESIGN/QUALIDADE/PRODUTOS = áreas que entram só na contagem de horas, sem efeito em KPI de sprint.';
