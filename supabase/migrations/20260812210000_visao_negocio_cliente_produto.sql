-- ============================================================================
-- Visão de negócio: cliente e produto por work item, e horas por cliente/produto
-- ============================================================================
--
-- Resolve CLIENTE e PRODUTO para a visão financeira, com a origem exposta em
-- coluna. O gestor exigiu saber de onde veio cada linha, porque a cobertura
-- muda por período e um total sem procedência não é auditável.
--
-- Cadeia de resolução, na ordem:
--   1. campo personalizado do próprio item
--   2. campo personalizado do PAI  (metade das horas só resolve aqui — task
--      raramente tem o campo, o PBI tem)
--   3. tag do próprio item
--   4. tag do pai
--   5. nada → cliente/produto nulos, e a hora aparece no relatório como
--      "sem cliente" em vez de sumir
--
-- ATENÇÃO AOS REF-NAMES, ESTÃO TROCADOS NA ORIGEM:
--
--     Custom.PRODUTOSS  contém a picklist de CLIENTES ("Heineken", "Nestle")
--     Custom.CLIENTESS  contém a picklist de PRODUTOS ("Flexx", "Portal Broker")
--
-- Quem criou os campos na FLAG inverteu o nome interno e corrigiu só o rótulo
-- do formulário; é assim que o Timer (modeia-platform) já consome. Esta view é
-- o ÚNICO lugar onde a tradução para a semântica correta acontece. Trocar por
-- intuição inverte cliente e produto no relatório financeiro inteiro.
--
-- Medido em 12/08/2026, horas de abril a agosto de 2026, campo + tag:
--   cliente  69% a 88%
--   produto  88% a 99%
-- Antes disso a coleta não trazia os campos, então período anterior a março de
-- 2026 subestima e depende de backfill.

-- ── Dicionário de tags ──────────────────────────────────────────────────────
--
-- Espelha `src/lib/products.ts`, que já classificava tag para a Fábrica e o
-- Gerencial QA. Virou tabela porque o financeiro vai descobrir produto faltando
-- no meio de um fechamento, e trocar uma linha aqui não pode exigir deploy.
--
-- A regra herdada do products.ts continua valendo: o que não está aqui é
-- tratado como CLIENTE. Ou seja, esta tabela lista só o que NÃO é cliente.
create table if not exists public.devops_tag_dicionario (
  tag_upper     text primary key,
  tipo          text not null check (tipo in ('produto', 'marcador')),
  nome_canonico text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.devops_tag_dicionario is
  'Tags do DevOps que NÃO são cliente. Espelha src/lib/products.ts. Tag ausente aqui é classificada como cliente.';
comment on column public.devops_tag_dicionario.nome_canonico is
  'Nome de exibição. Nulo usa a tag como veio do DevOps.';

alter table public.devops_tag_dicionario enable row level security;

drop policy if exists "tag_dicionario_leitura_autenticada" on public.devops_tag_dicionario;
create policy "tag_dicionario_leitura_autenticada"
  on public.devops_tag_dicionario for select
  to authenticated using (true);

insert into public.devops_tag_dicionario (tag_upper, tipo, nome_canonico) values
  ('FLEXX',          'produto', 'Flexx'),
  ('FLEXXSALES',     'produto', 'FlexX Sales'),
  ('CONNECTSALES',   'produto', 'ConnectSales'),
  ('FLEXXGO',        'produto', 'FlexxGo'),
  ('FLEXXGPS',       'produto', 'FlexxGPS'),
  ('HEISHOP',        'produto', 'HeiShop'),
  ('PORTALBROKER',   'produto', 'Portal Broker'),
  ('PORTAL BROKER',  'produto', 'Portal Broker'),
  ('FLEXXLEAD',      'produto', 'FlexxLead'),
  ('QUICKONE',       'produto', 'QuickOne'),
  ('CONNECTMERCHAN', 'produto', 'ConnectMerchan'),
  ('FLEXXSPEED',     'produto', 'FlexxSpeed'),
  ('FLEXXDECISION',  'produto', 'FlexxDecision'),
  ('FLEXXPROMO',     'produto', 'FlexxPromo'),
  ('SUITEFLEXX',     'produto', 'Suite Flexx'),
  ('SMARTSALES',     'produto', 'SmartSales'),
  ('BUG',            'marcador', null),
  ('PRIORIZACAO',    'marcador', null),
  ('RETORNO QA',     'marcador', null),
  ('MELHORIA',       'marcador', null),
  ('TRANSBORDO',     'marcador', null),
  ('AVIAO',          'marcador', null),
  ('ESCOPOPAGO',     'marcador', null),
  ('CRITICIDADE',    'marcador', null),
  ('STAGING',        'marcador', null),
  ('ROADMAP2026',    'marcador', null),
  ('IA',             'marcador', null),
  ('BI',             'marcador', null),
  ('CTI',            'marcador', null),
  ('FLAG',           'marcador', null),
  ('FLG',            'marcador', null),
  ('HNK',            'marcador', null),
  ('BEES',           'marcador', null),
  ('ASPIN',          'marcador', null),
  ('ESTOQUECHEK',    'marcador', null)
on conflict (tag_upper) do nothing;

-- ── Cliente e produto por work item ─────────────────────────────────────────

drop view if exists public.v_horas_negocio;
drop view if exists public.v_devops_work_items_negocio;

create view public.v_devops_work_items_negocio
with (security_invoker = true) as
with base as (
  select
    w.id, w.work_item_type, w.title, w.state, w.parent_id,
    w.iteration_path, w.area_path, w.assigned_to_display,
    w.tags as tags_proprias,
    p.tags as tags_pai,
    -- ver o aviso do cabeçalho: PRODUTOSS traz cliente, CLIENTESS traz produto
    w.custom_fields ->> 'Custom.PRODUTOSS' as campo_cliente_proprio,
    p.custom_fields ->> 'Custom.PRODUTOSS' as campo_cliente_pai,
    w.custom_fields ->> 'Custom.CLIENTESS' as campo_produto_proprio,
    p.custom_fields ->> 'Custom.CLIENTESS' as campo_produto_pai
  from public.devops_work_items w
  left join public.devops_work_items p on p.id = w.parent_id
),
-- Tag do item e tag do pai viram linhas, com o nível preservado para o
-- desempate: tag do próprio item sempre ganha da tag do pai.
tag_classificada as (
  select
    b.id,
    x.nivel,
    coalesce(d.tipo, 'cliente') as tipo,
    coalesce(d.nome_canonico, x.tag) as nome
  from base b
  cross join lateral (
    select 'proprio'::text as nivel, trim(t) as tag
      from unnest(string_to_array(coalesce(b.tags_proprias, ''), ';')) t
    union all
    select 'pai', trim(t)
      from unnest(string_to_array(coalesce(b.tags_pai, ''), ';')) t
  ) x
  left join public.devops_tag_dicionario d on d.tag_upper = upper(x.tag)
  where x.tag <> ''
),
tag_cliente as (
  select
    id,
    (array_agg(nome  order by (nivel = 'pai'), nome))[1] as valor,
    (array_agg(nivel order by (nivel = 'pai'), nome))[1] as nivel,
    array_agg(distinct nome) as opcoes
  from tag_classificada where tipo = 'cliente' group by id
),
tag_produto as (
  select
    id,
    (array_agg(nome  order by (nivel = 'pai'), nome))[1] as valor,
    (array_agg(nivel order by (nivel = 'pai'), nome))[1] as nivel,
    array_agg(distinct nome) as opcoes
  from tag_classificada where tipo = 'produto' group by id
)
select
  b.id,
  b.work_item_type,
  b.title,
  b.state,
  b.parent_id,
  b.iteration_path,
  b.area_path,
  b.assigned_to_display,
  (regexp_match(b.iteration_path, 'S[0-9]+-[0-9]{4}'))[1] as sprint_code,

  coalesce(b.campo_cliente_proprio, b.campo_cliente_pai, tc.valor) as cliente,
  case
    when coalesce(b.campo_cliente_proprio, b.campo_cliente_pai) is not null then 'campo'
    when tc.valor is not null then 'tag'
  end as cliente_origem,
  case
    when b.campo_cliente_proprio is not null then false
    when b.campo_cliente_pai    is not null then true
    when tc.valor is not null then (tc.nivel = 'pai')
  end as cliente_herdado,
  -- Ambíguo só existe no caminho da tag: a picklist do campo é seleção única,
  -- conferido em 12/08/2026 (zero itens com ';' em qualquer dos dois campos).
  -- Quando ambíguo, `cliente` traz o primeiro em ordem alfabética e
  -- `cliente_tags` traz todos, para o rateio ser decidido no relatório e não
  -- escondido aqui.
  (coalesce(b.campo_cliente_proprio, b.campo_cliente_pai) is null
    and coalesce(array_length(tc.opcoes, 1), 0) > 1) as cliente_ambiguo,
  tc.opcoes as cliente_tags,

  coalesce(b.campo_produto_proprio, b.campo_produto_pai, tp.valor) as produto,
  case
    when coalesce(b.campo_produto_proprio, b.campo_produto_pai) is not null then 'campo'
    when tp.valor is not null then 'tag'
  end as produto_origem,
  case
    when b.campo_produto_proprio is not null then false
    when b.campo_produto_pai    is not null then true
    when tp.valor is not null then (tp.nivel = 'pai')
  end as produto_herdado,
  (coalesce(b.campo_produto_proprio, b.campo_produto_pai) is null
    and coalesce(array_length(tp.opcoes, 1), 0) > 1) as produto_ambiguo,
  tp.opcoes as produto_tags
from base b
left join tag_cliente tc on tc.id = b.id
left join tag_produto tp on tp.id = b.id;

comment on view public.v_devops_work_items_negocio is
  'Cliente e produto por work item, com a origem (campo ou tag) e se veio do pai. Único lugar que traduz os ref-names invertidos Custom.PRODUTOSS=cliente e Custom.CLIENTESS=produto.';

-- ── Horas por cliente, produto e colaborador ────────────────────────────────
--
-- Sai de `v_timelog_unified`, não de `v_devops_time_logs_ativos` direto, por
-- duas razões que não podem ser perdidas:
--
--   1. VDESK e DevOps são A MESMA HORA lançada em dois lugares. Somar dobra o
--      número. `greatest()` por (work item, dia, colaborador) consolida, que é
--      a regra que já vale no portal.
--   2. Hora que existe só no VDESK entraria em zero se a base fosse só o lado
--      DevOps.
--
-- A exclusão de hora removida no DevOps continua valendo: o lado DevOps do
-- v_timelog_unified já é construído sobre v_devops_time_logs_ativos, que
-- desconta `devops_time_log_orphans`.
create view public.v_horas_negocio
with (security_invoker = true) as
select
  u.task_id as work_item_id,
  u.log_date,
  u.user_canonical as colaborador,
  greatest(coalesce(u.minutes_vdesk, 0), coalesce(u.minutes_devops, 0))::integer as minutos,
  round(greatest(coalesce(u.minutes_vdesk, 0), coalesce(u.minutes_devops, 0))::numeric / 60.0, 2) as horas,
  u.minutes_vdesk,
  u.minutes_devops,
  u.status as conciliacao,
  n.cliente,
  n.cliente_origem,
  n.cliente_herdado,
  n.cliente_ambiguo,
  n.produto,
  n.produto_origem,
  n.produto_herdado,
  n.produto_ambiguo,
  n.work_item_type,
  n.title as work_item_title,
  n.state as work_item_state,
  n.iteration_path,
  n.sprint_code
from public.v_timelog_unified u
left join public.v_devops_work_items_negocio n on n.id = u.task_id;

comment on view public.v_horas_negocio is
  'Base da visão financeira: horas consolidadas por work item, dia e colaborador, com cliente e produto resolvidos e a origem exposta. VDESK e DevOps consolidados por greatest(), nunca somados.';
