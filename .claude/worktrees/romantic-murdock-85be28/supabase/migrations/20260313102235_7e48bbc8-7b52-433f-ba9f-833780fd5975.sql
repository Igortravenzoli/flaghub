UPDATE devops_work_items
SET web_url = 'https://dev.azure.com/FlagIW/' || COALESCE(team_project, 'Flag.Planejamento') || '/_workitems/edit/' || id
WHERE web_url IS NULL;