-- ============================================================================
-- Capacidade variável: desconto de férias
--
-- Capacidade do período era `h/dia × dias úteis` para todo mundo, igual. Quem
-- está de férias entrava na conta como se estivesse disponível, e a squad
-- aparecia com utilização artificialmente baixa.
--
-- A fonte das férias é a lista SG-LST-013 (Controle Colaborador) do SharePoint,
-- já espelhada em `sgsi_items` pelo sync `sharepoint-sync-sgsi` (list_key 013).
--
-- ── Por que uma coluna de vínculo, e não casamento por nome ──────────────────
-- O nome do RH é o completo (com todos os sobrenomes) e o do apontamento é o
-- abreviado (primeiro nome + inicial + sobrenome). A regra "primeiro nome + último
-- sobrenome" casa 26 de 31 pessoas, mas erra em 5 (sobrenome usado no dia a dia
-- que é nome do meio no RH, cadastro sem sobrenome, homônimo parcial). O erro é
-- SILENCIOSO: a pessoa simplesmente nunca aparece de férias.
-- Por isso o vínculo é dado, não heurística. `sharepoint_nome` nulo = sem
-- desconto (fail-open: na dúvida, capacidade cheia, nunca capacidade fantasma).
--
-- ── Por que uma view, e não outra tabela sincronizada ────────────────────────
-- O espelho já é atualizado de 6 em 6 horas pelo cron. Uma tabela derivada
-- precisaria de um segundo job e criaria uma terceira versão da verdade.
-- ============================================================================

alter table public.fabrica_squad_membership
  add column if not exists sharepoint_nome text;

comment on column public.fabrica_squad_membership.sharepoint_nome is
  'NOME COMPLETO exato na lista SG-LST-013 (Controle Colaborador). Vínculo para o desconto de férias na capacidade. Nulo = sem desconto.';

create index if not exists fabrica_squad_membership_sharepoint_nome_idx
  on public.fabrica_squad_membership (sharepoint_nome)
  where sharepoint_nome is not null;

-- ── Ausências por colaborador do roster ─────────────────────────────────────
-- Uma linha por período de ausência, já no nome que o portal usa.
--
-- As datas chegam do Graph como meia-noite de Brasília em UTC
-- (2026-08-06T03:00:00Z). Converter para America/Sao_Paulo antes de cortar a
-- data, senão o primeiro dia escorrega para o dia anterior.
--
-- O STATUS da lista NÃO entra no filtro de propósito: em 12/08/2026 havia 19
-- pessoas com status "Férias" das quais só 2 estavam de férias de fato — o
-- status não é atualizado no retorno. Quem manda é o intervalo de datas.
create or replace view public.v_colaborador_ausencias as
select
  r.colaborador,
  'ferias'::text as tipo,
  ((i.fields->>'DATA INICIO FÉRIAS')::timestamptz at time zone 'America/Sao_Paulo')::date as data_inicio,
  ((i.fields->>'DATA FIM FÉRIAS')::timestamptz    at time zone 'America/Sao_Paulo')::date as data_fim,
  i.fields->>'NOME COMPLETO' as origem_nome,
  i.modified_sp
from public.sgsi_items i
join public.fabrica_squad_membership r
  on r.sharepoint_nome = i.fields->>'NOME COMPLETO'
where i.list_key = '013'
  and i.fields ? 'DATA INICIO FÉRIAS'
  and i.fields ? 'DATA FIM FÉRIAS'
  and r.ativo

union all

-- Licenciamento: mesmo formato (início/fim) e mesmo efeito na capacidade.
--
-- Leitura do gestor (12/08/2026): é LICENÇA MÉDICA, ou seja, ausência de fato,
-- e por isso desconta capacidade igual a férias. Não veio confirmado por quem
-- preenche a lista; se um dia se descobrir que o campo é licenciamento de
-- acesso ou equipamento (controle de TI), basta apagar este bloco.
--
-- O `tipo` fica separado de propósito, mas a TELA NÃO EXIBE O TIPO: o chip diz
-- só "ausente Nd". Licença médica é dado de saúde, e o painel é visto por todo
-- o setor — quem precisa do detalhe consulta a origem, não o dashboard.
--
-- Volume hoje: 3 registros em 70, todos de 2024, de 3 a 6 dias; só 1 cai em
-- alguém do roster, então o impacto atual na capacidade é zero.
select
  r.colaborador,
  'licenciamento'::text as tipo,
  ((i.fields->>'DATA INICIO LICENCIAMENTO')::timestamptz at time zone 'America/Sao_Paulo')::date as data_inicio,
  ((i.fields->>'DATA FIM LICENCIAMENTO')::timestamptz    at time zone 'America/Sao_Paulo')::date as data_fim,
  i.fields->>'NOME COMPLETO' as origem_nome,
  i.modified_sp
from public.sgsi_items i
join public.fabrica_squad_membership r
  on r.sharepoint_nome = i.fields->>'NOME COMPLETO'
where i.list_key = '013'
  and i.fields ? 'DATA INICIO LICENCIAMENTO'
  and i.fields ? 'DATA FIM LICENCIAMENTO'
  and r.ativo;

comment on view public.v_colaborador_ausencias is
  'Períodos de ausência (férias e licenciamento) por colaborador do roster, a partir do espelho da SG-LST-013. Filtra por DATA, nunca por STATUS — o status da lista não é atualizado no retorno das férias.';

grant select on public.v_colaborador_ausencias to authenticated;
