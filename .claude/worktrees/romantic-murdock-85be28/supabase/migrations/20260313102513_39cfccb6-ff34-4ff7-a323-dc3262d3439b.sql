-- Add web_url to vw_fabrica_kpis
CREATE OR REPLACE VIEW public.vw_fabrica_kpis WITH (security_invoker = true) AS
SELECT dq.work_item_id AS id,
    dq.title,
    dq.work_item_type,
    dq.state,
    dq.assigned_to_display,
    dq.priority,
    dq.effort,
    dq.iteration_path,
    dq.created_date,
    dq.changed_date,
    dq.parent_id,
    p.title AS parent_title,
    p.work_item_type AS parent_type,
    dq.web_url
FROM vw_devops_queue_items dq
LEFT JOIN devops_work_items p ON p.id = dq.parent_id
WHERE dq.sector = 'fabrica';

-- Add web_url to vw_infraestrutura_kpis
CREATE OR REPLACE VIEW public.vw_infraestrutura_kpis WITH (security_invoker = true) AS
SELECT work_item_id AS id,
    title,
    work_item_type,
    state,
    assigned_to_display,
    priority,
    effort,
    tags,
    created_date,
    changed_date,
    web_url
FROM vw_devops_queue_items dq
WHERE sector = 'infraestrutura'
   OR (tags IS NOT NULL AND (tags ILIKE '%infra%' OR tags ILIKE '%ISO%' OR tags ILIKE '%segurança%' OR tags ILIKE '%rede%'));

-- Add web_url to vw_customer_service_kpis
CREATE OR REPLACE VIEW public.vw_customer_service_kpis WITH (security_invoker = true) AS
SELECT 'devops_queue'::text AS source,
    dq.query_name,
    dq.work_item_id,
    dq.title,
    dq.work_item_type,
    dq.state,
    dq.assigned_to_display,
    dq.priority,
    dq.created_date,
    dq.changed_date,
    NULL::date AS data_referencia,
    NULL::text AS consultor_impl,
    NULL::text AS solucao,
    NULL::text AS status_implantacao,
    dq.web_url
FROM vw_devops_queue_items dq
WHERE dq.sector = 'customer_service'
UNION ALL
SELECT 'manual_implantacao'::text AS source,
    NULL::text AS query_name,
    NULL::integer AS work_item_id,
    cr.cliente AS title,
    'Implantação'::text AS work_item_type,
    cr.status_implantacao AS state,
    cr.consultor AS assigned_to_display,
    NULL::integer AS priority,
    cr.data_inicio::timestamp with time zone AS created_date,
    cr.data_fim::timestamp with time zone AS changed_date,
    cr.data_referencia,
    cr.consultor AS consultor_impl,
    cr.solucao,
    cr.status_implantacao,
    NULL::text AS web_url
FROM cs_implantacoes_records cr;