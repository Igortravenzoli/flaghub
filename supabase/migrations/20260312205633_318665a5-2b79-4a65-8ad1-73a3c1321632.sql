CREATE OR REPLACE VIEW public.vw_qualidade_kpis WITH (security_invoker = true) AS
SELECT 
  work_item_id AS id,
  title,
  work_item_type,
  state,
  assigned_to_display,
  priority,
  created_date,
  changed_date,
  web_url
FROM vw_devops_queue_items dq
WHERE sector = 'qualidade'
   OR work_item_type = ANY (ARRAY['Bug', 'Test Case', 'Test Plan', 'Test Suite']);