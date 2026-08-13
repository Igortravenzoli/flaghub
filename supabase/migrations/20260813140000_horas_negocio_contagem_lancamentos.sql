-- ============================================================================
-- v_horas_negocio expõe a contagem de lançamentos de cada lado
-- ============================================================================
--
-- A view é consolidada por (work item, dia, colaborador): uma linha dela pode
-- conter MAIS DE UM lançamento do VDESK. Contar linhas para responder "quantos
-- lançamentos do VDESK chegaram ao DevOps" dá o número errado — em julho/2026
-- dava 175 onde a verdade são 178, porque três tuplas tinham dois lançamentos
-- cada.
--
-- `rows_vdesk` e `rows_devops` já existiam em v_timelog_unified e só não
-- estavam sendo repassadas. O KPI de sincronização passa a somá-las em vez de
-- contar linhas, e o rótulo "lançamentos" volta a ser verdade.

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
  -- Quantos lançamentos originais estão consolidados nesta linha.
  coalesce(u.rows_vdesk, 0)::integer as lancamentos_vdesk,
  coalesce(u.rows_devops, 0)::integer as lancamentos_devops,
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
  'Base da visão financeira: horas consolidadas por work item, dia e colaborador, com cliente, produto, origem, a cadeia até o PBI pai e a contagem de lançamentos de cada lado. VDESK e DevOps consolidados por greatest(), nunca somados.';
