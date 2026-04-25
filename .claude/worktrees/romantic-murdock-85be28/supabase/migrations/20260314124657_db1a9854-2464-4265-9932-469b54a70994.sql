
CREATE OR REPLACE VIEW public.vw_fabrica_kpis
WITH (security_invoker = on) AS
SELECT 
    dq.work_item_id AS id,
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
WHERE dq.sector = 'fabrica'

UNION ALL

SELECT 
    child.id,
    child.title,
    child.work_item_type,
    child.state,
    child.assigned_to_display,
    child.priority,
    child.effort,
    child.iteration_path,
    child.created_date,
    child.changed_date,
    child.parent_id,
    parent_pbi.title AS parent_title,
    parent_pbi.work_item_type AS parent_type,
    child.web_url
FROM devops_work_items child
JOIN vw_devops_queue_items dq_parent ON dq_parent.work_item_id = child.parent_id AND dq_parent.sector = 'fabrica'
LEFT JOIN devops_work_items parent_pbi ON parent_pbi.id = child.parent_id
WHERE child.work_item_type IN ('Task', 'Bug')
  AND child.id NOT IN (
    SELECT dq2.work_item_id FROM vw_devops_queue_items dq2 WHERE dq2.sector = 'fabrica'
  );
