UPDATE devops_queries 
SET wiql_text = 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = ''Flag.Planejamento'' AND [System.WorkItemType] IN (''Product Backlog Item'', ''Task'', ''Bug'', ''User Story'') AND [System.State] IN (''Active'', ''In Progress'', ''New'', ''Aguardando Teste'', ''Em desenvolvimento'') ORDER BY [System.ChangedDate] DESC'
WHERE id = '557a9643-5049-43a6-b199-e498f39e9e88';

-- Also clean up orphan inactive queries that hold stale data
-- Move their items to the active queries first
INSERT INTO devops_query_items_current (query_id, work_item_id, synced_at)
SELECT '557a9643-5049-43a6-b199-e498f39e9e88', work_item_id, now()
FROM devops_query_items_current
WHERE query_id = '8ad026e0-3ad7-4c39-a8df-3184af5ec9ae'
ON CONFLICT (query_id, work_item_id) DO NOTHING;

INSERT INTO devops_query_items_current (query_id, work_item_id, synced_at)
SELECT '76c806a1-c8f8-47f1-90f0-8bab64f384d5', work_item_id, now()
FROM devops_query_items_current
WHERE query_id = '284dc411-7034-4973-90e4-8daeb4f54f29'
ON CONFLICT (query_id, work_item_id) DO NOTHING;

-- Remove orphan items from inactive queries
DELETE FROM devops_query_items_current WHERE query_id = '8ad026e0-3ad7-4c39-a8df-3184af5ec9ae';
DELETE FROM devops_query_items_current WHERE query_id = '284dc411-7034-4973-90e4-8daeb4f54f29';

-- Deactivate the duplicate queries
DELETE FROM devops_queries WHERE id IN ('8ad026e0-3ad7-4c39-a8df-3184af5ec9ae', '284dc411-7034-4973-90e4-8daeb4f54f29');