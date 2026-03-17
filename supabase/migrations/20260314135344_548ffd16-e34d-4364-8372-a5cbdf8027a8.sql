INSERT INTO public.devops_queries (name, sector, source_mode, wiql_text, is_active, refresh_minutes)
VALUES (
  '06-Fabrica Itens em Progresso',
  'fabrica',
  'inline_wiql',
  'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = ''Flag.Planejamento'' AND [System.WorkItemType] IN (''Product Backlog Item'', ''Task'', ''Bug'', ''User Story'') AND [System.State] IN (''Active'', ''In Progress'', ''New'') ORDER BY [System.ChangedDate] DESC',
  true,
  10
);