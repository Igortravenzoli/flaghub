-- ============================================================================
-- v_horas_negocio ganha a cadeia até o PBI
-- ============================================================================
--
-- O TimeLog Executivo desce quatro níveis: cliente → PBI → task → lançamento.
-- A view parava na task, então o front teria de buscar os pais numa segunda
-- consulta e remontar a árvore em memória — duas viagens e uma junção feita no
-- navegador sobre milhares de linhas.
--
-- `pbi_id` usa coalesce(pai, o próprio item): Bug com hora lançada direto nele
-- não tem pai e É o topo da sua própria cadeia. Sem o coalesce, toda hora de
-- Bug cairia num balde "sem PBI" que não existe na realidade.
--
-- Os KPIs de classificação do período (PBIs sem cliente, sem produto, só por
-- tag) saem daqui contando `distinct pbi_id`, e é por isso que a origem do PBI
-- viaja junto: a origem da TASK não responde a pergunta, porque a task quase
-- nunca tem o campo preenchido — quem tem é o pai.

drop view if exists public.v_horas_negocio;

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
  n.sprint_code,

  -- ── cadeia até o PBI ──
  coalesce(p.id, n.id) as pbi_id,
  coalesce(p.title, n.title) as pbi_title,
  coalesce(p.work_item_type, n.work_item_type) as pbi_type,
  coalesce(p.cliente, n.cliente) as pbi_cliente,
  coalesce(p.produto, n.produto) as pbi_produto,
  coalesce(p.cliente_origem, n.cliente_origem) as pbi_cliente_origem,
  coalesce(p.produto_origem, n.produto_origem) as pbi_produto_origem
from public.v_timelog_unified u
left join public.v_devops_work_items_negocio n on n.id = u.task_id
left join public.v_devops_work_items_negocio p on p.id = n.parent_id;

comment on view public.v_horas_negocio is
  'Base da visão financeira: horas consolidadas por work item, dia e colaborador, com cliente, produto, origem e a cadeia até o PBI pai. VDESK e DevOps consolidados por greatest(), nunca somados.';
