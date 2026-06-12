-- vw_infraestrutura_kpis: inclui os itens marcados com o prefixo [INFRA]
-- (e filhos do Epic/PBI 2700), que chegam pela query 02-Devops Base Geral.
-- Motivo: a query 07-Infraestrutura falha no DevOps (WIQL e6af59bf inválido/
-- sem acesso) e nunca populou o snapshot — a view só enxergava itens por
-- sector/tags (~47 itens vs 859 reais). A fábrica já usa o mesmo marcador
-- para EXCLUIR esses itens (useFabricaKpis: INFRA_PREFIX + PBI 2700).

CREATE OR REPLACE VIEW public.vw_infraestrutura_kpis AS
WITH infra_pais AS (
  SELECT id FROM public.devops_work_items
  WHERE title ILIKE '[INFRA]%' OR id = 2700
),
base AS (
  -- Regra original: itens de queries do setor ou com tags de infra
  SELECT dq.work_item_id,
    dq.title,
    dq.work_item_type,
    dq.state,
    dq.assigned_to_display,
    dq.priority,
    dq.effort,
    dq.tags,
    dq.iteration_path,
    dq.created_date,
    dq.changed_date,
    dq.web_url,
    dq.snapshot_at
  FROM public.vw_devops_queue_items dq
  WHERE dq.sector = 'infraestrutura'
     OR (dq.tags IS NOT NULL AND (
          dq.tags ILIKE '%infra%' OR dq.tags ILIKE '%iso%'
          OR dq.tags ILIKE '%seguranca%' OR dq.tags ILIKE '%segurança%'
          OR dq.tags ILIKE '%rede%'))

  UNION ALL

  -- Itens marcados [INFRA] (qualquer origem) e filhos diretos desses pais
  SELECT wi.id AS work_item_id,
    wi.title,
    wi.work_item_type,
    wi.state,
    wi.assigned_to_display,
    wi.priority,
    wi.effort,
    wi.tags,
    wi.iteration_path,
    wi.created_date,
    wi.changed_date,
    wi.web_url,
    wi.synced_at AS snapshot_at
  FROM public.devops_work_items wi
  WHERE (wi.title ILIKE '[INFRA]%' OR wi.parent_id IN (SELECT id FROM infra_pais))
    AND COALESCE(wi.state, '') <> 'Removed'
)
SELECT DISTINCT ON (work_item_id) work_item_id AS id,
  title,
  work_item_type,
  state,
  assigned_to_display,
  priority,
  effort,
  tags,
  created_date,
  changed_date,
  web_url,
  iteration_path
FROM base
ORDER BY work_item_id, changed_date DESC NULLS LAST, snapshot_at DESC NULLS LAST;
