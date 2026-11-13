-- ============================================================================
-- Organograma Fábricas / Produto (11/2026): grupo › fábrica › pessoa
-- ============================================================================
-- O organograma passou de 4 squads planas (K8, FLEXX, STAGING, APP) para três
-- grupos — Sustentação, Evolução e Híbrida — com nove fábricas, e parte das
-- pessoas divide o tempo entre duas fábricas (50% / 50%).
--
-- A tabela não comportava isso por dois motivos:
--   1. UNIQUE (colaborador): uma pessoa, uma fábrica.
--   2. CHECK (squad in (...)): só os oito nomes antigos.
--
-- ── O que muda ───────────────────────────────────────────────────────────────
--   • `alocacao_pct`: quanto da pessoa está naquela fábrica. Default 100, então
--     nenhuma linha existente muda de significado.
--   • a unicidade passa a ser (colaborador, squad): a mesma pessoa pode ter uma
--     linha por fábrica, nunca duas na mesma.
--   • o CHECK aceita os códigos novos E os antigos (K8, FLEXX). Os antigos ficam
--     de propósito: a carga das pessoas é feita à parte (nome não vai para o
--     repositório), e entre esta migration e a carga o cadastro antigo tem que
--     continuar válido. Saem numa migration futura, quando ninguém mais estiver
--     neles.
--
-- ── O que NÃO muda ───────────────────────────────────────────────────────────
--   • o grupo (Sustentação/Evolução/Híbrida) não é coluna: é derivado do código
--     da fábrica em src/lib/fabricaOrganograma.ts, que é a fonte única dos
--     nomes. O teste `fabricaOrganograma.test.ts` confere que a lista do CHECK
--     abaixo e a do arquivo são a mesma.
--   • `v_colaborador_ausencias` junta por `sharepoint_nome`; com duas linhas da
--     mesma pessoa ela devolve o período em dobro. Não precisa mexer: o front
--     já une períodos sobrepostos antes de descontar (`diasUteisAusentes`).
--   • o significado de `capacidade_h_dia`: segue sendo a jornada produtiva da
--     PESSOA. A capacidade na fábrica é h/dia × alocacao_pct.
-- ============================================================================

alter table public.fabrica_squad_membership
  add column if not exists alocacao_pct numeric(5,2) not null default 100;

alter table public.fabrica_squad_membership
  drop constraint if exists fabrica_squad_membership_alocacao_pct_check;
alter table public.fabrica_squad_membership
  add constraint fabrica_squad_membership_alocacao_pct_check
  check (alocacao_pct > 0 and alocacao_pct <= 100);

comment on column public.fabrica_squad_membership.alocacao_pct is
  'Percentual da pessoa nesta fábrica (1–100). Quem divide o tempo tem uma linha por fábrica. Capacidade na fábrica = capacidade_h_dia × alocacao_pct / 100.';

-- Uma pessoa, várias fábricas — mas nunca duas linhas na mesma.
alter table public.fabrica_squad_membership
  drop constraint if exists fabrica_squad_membership_colaborador_uniq;
alter table public.fabrica_squad_membership
  drop constraint if exists fabrica_squad_membership_colaborador_squad_uniq;
alter table public.fabrica_squad_membership
  add constraint fabrica_squad_membership_colaborador_squad_uniq unique (colaborador, squad);

alter table public.fabrica_squad_membership
  drop constraint if exists fabrica_squad_membership_squad_check;
alter table public.fabrica_squad_membership
  add constraint fabrica_squad_membership_squad_check
  check (squad in (
    -- Sustentação
    'GPS_GO', 'APP', 'PROMO_SUITE', 'ERP_SUST',
    -- Evolução
    'ERP_EVOL', 'IR', 'LAB', 'INFRA',
    -- Híbrida
    'STAGING',
    -- Áreas de apoio (só horas)
    'QUALIDADE', 'DESIGN', 'PRODUTOS',
    -- Formato anterior, até a carga do organograma novo
    'K8', 'FLEXX'
  ));

comment on table public.fabrica_squad_membership is
  'Roster pessoa -> fábrica (organograma de 11/2026). Uma linha por pessoa e fábrica, com alocacao_pct. O grupo (Sustentação/Evolução/Híbrida) é derivado do código em src/lib/fabricaOrganograma.ts.';
