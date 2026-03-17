-- 1. Assign sectors to queries that are missing them
UPDATE devops_queries SET sector = 'fabrica' WHERE name = '03-Em Fila Backlog para Priorizar' AND sector IS NULL;
UPDATE devops_queries SET sector = 'produtos' WHERE name = '05-Em Fila UX-UI' AND sector IS NULL;

-- 2. Fix vw_fabrica_kpis to use sector-based filtering instead of area_path
DROP VIEW IF EXISTS vw_fabrica_kpis;
CREATE VIEW vw_fabrica_kpis WITH (security_invoker=on) AS
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
  p.work_item_type AS parent_type
FROM vw_devops_queue_items dq
LEFT JOIN devops_work_items p ON p.id = dq.parent_id
WHERE dq.sector = 'fabrica';

-- 3. Fix vw_qualidade_kpis to include Bug/Test items from base geral
DROP VIEW IF EXISTS vw_qualidade_kpis;
CREATE VIEW vw_qualidade_kpis WITH (security_invoker=on) AS
SELECT 
  dq.work_item_id AS id,
  dq.title,
  dq.work_item_type,
  dq.state,
  dq.assigned_to_display,
  dq.priority,
  dq.created_date,
  dq.changed_date
FROM vw_devops_queue_items dq
WHERE dq.sector = 'qualidade'
   OR dq.work_item_type IN ('Bug', 'Test Case', 'Test Plan', 'Test Suite');

-- 4. Fix vw_infraestrutura_kpis to use tags for infra identification
DROP VIEW IF EXISTS vw_infraestrutura_kpis;
CREATE VIEW vw_infraestrutura_kpis WITH (security_invoker=on) AS
SELECT 
  dq.work_item_id AS id,
  dq.title,
  dq.work_item_type,
  dq.state,
  dq.assigned_to_display,
  dq.priority,
  dq.effort,
  dq.tags,
  dq.created_date,
  dq.changed_date
FROM vw_devops_queue_items dq
WHERE dq.sector = 'infraestrutura'
   OR (dq.tags IS NOT NULL AND (
     dq.tags ILIKE '%infra%' 
     OR dq.tags ILIKE '%ISO%' 
     OR dq.tags ILIKE '%segurança%'
     OR dq.tags ILIKE '%rede%'
   ));