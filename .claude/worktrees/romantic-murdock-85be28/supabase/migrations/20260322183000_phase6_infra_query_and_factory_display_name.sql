do $$
begin
  insert into public.devops_queries (
    name,
    wiql_id,
    source_mode,
    sector,
    is_active,
    refresh_minutes,
    config
  )
  select
    '07-Infraestrutura',
    'e6af59bf-64c5-4bf5-b926-d5039e9222f2',
    'saved_query',
    'infraestrutura',
    true,
    10,
    jsonb_build_object(
      'description', 'Fila oficial de Infraestrutura',
      'official', true,
      'queue_kind', 'infraestrutura_current',
      'official_name', '07-Infraestrutura'
    )
  where not exists (
    select 1
    from public.devops_queries
    where wiql_id = 'e6af59bf-64c5-4bf5-b926-d5039e9222f2'
  );

  update public.devops_queries
  set
    name = '07-Infraestrutura',
    sector = 'infraestrutura',
    source_mode = 'saved_query',
    wiql_id = 'e6af59bf-64c5-4bf5-b926-d5039e9222f2',
    is_active = true,
    refresh_minutes = coalesce(refresh_minutes, 10),
    config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
      'description', 'Fila oficial de Infraestrutura',
      'official', true,
      'queue_kind', 'infraestrutura_current',
      'official_name', '07-Infraestrutura'
    )
  where wiql_id = 'e6af59bf-64c5-4bf5-b926-d5039e9222f2'
     or (sector = 'infraestrutura' and name = '07-Infraestrutura');

  update public.devops_queries
  set
    name = '08-Fabrica Itens em Progresso',
    config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
      'official_name', '08-Fabrica Itens em Progresso'
    )
  where sector = 'fabrica'
    and name in ('06-Fabrica Itens em Progresso', '07-Fabrica Itens em Progresso');

  update public.devops_queries
  set
    config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
      'official_name', '08-Fabrica Itens em Progresso'
    )
  where sector = 'fabrica'
    and name = '08-Fabrica Itens em Progresso';
end $$;