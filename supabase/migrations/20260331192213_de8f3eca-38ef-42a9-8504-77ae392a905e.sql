
-- 1. Update CS view to include effort and tags
DROP VIEW IF EXISTS vw_customer_service_kpis;
CREATE OR REPLACE VIEW vw_customer_service_kpis AS
SELECT 'devops_queue'::text AS source,
    dq.query_name,
    dq.work_item_id,
    dq.title,
    dq.work_item_type,
    dq.state,
    dq.assigned_to_display,
    dq.priority,
    dq.effort,
    dq.tags,
    dq.created_date,
    dq.changed_date,
    NULL::date AS data_referencia,
    NULL::text AS consultor_impl,
    NULL::text AS solucao,
    NULL::text AS status_implantacao,
    dq.web_url
   FROM vw_devops_queue_items dq
  WHERE dq.sector = 'customer_service'::text
UNION ALL
 SELECT 'manual_implantacao'::text AS source,
    NULL::text AS query_name,
    NULL::integer AS work_item_id,
    cr.cliente AS title,
    'Implantação'::text AS work_item_type,
    cr.status_implantacao AS state,
    cr.consultor AS assigned_to_display,
    NULL::integer AS priority,
    NULL::numeric AS effort,
    NULL::text AS tags,
    cr.data_inicio::timestamp with time zone AS created_date,
    cr.data_fim::timestamp with time zone AS changed_date,
    cr.data_referencia,
    cr.consultor AS consultor_impl,
    cr.solucao,
    cr.status_implantacao,
    NULL::text AS web_url
   FROM cs_implantacoes_records cr;

-- 2. Create purge RPC for CS implantações (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION purge_cs_implantacoes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM cs_implantacoes_records;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION purge_cs_implantacoes() TO authenticated;
