-- Ensure helpdesk_v1 template exists with a valid area_id across environments
DO $$
DECLARE
  v_area_id uuid;
BEGIN
  SELECT id
    INTO v_area_id
  FROM public.hub_areas
  WHERE key IN ('helpdesk', 'tickets_os', 'ticket_os')
  ORDER BY CASE key
    WHEN 'helpdesk' THEN 1
    WHEN 'tickets_os' THEN 2
    ELSE 3
  END
  LIMIT 1;

  IF v_area_id IS NULL THEN
    RAISE EXCEPTION 'Nao foi possivel localizar area Helpdesk/Tickets em public.hub_areas';
  END IF;

  INSERT INTO public.manual_import_templates (
    key,
    name,
    area_id,
    is_active,
    required_columns,
    optional_columns,
    allowed_file_types,
    version
  )
  VALUES (
    'helpdesk_v1',
    'Helpdesk Tickets JSON',
    v_area_id,
    true,
    '["number", "short_description", "state"]'::jsonb,
    '["priority", "assigned_to", "opened_at", "closed_at", "category", "description", "sys_class_name"]'::jsonb,
    ARRAY['json','csv','xlsx'],
    1
  )
  ON CONFLICT (key) DO UPDATE
  SET
    name = EXCLUDED.name,
    area_id = EXCLUDED.area_id,
    is_active = true,
    required_columns = EXCLUDED.required_columns,
    optional_columns = EXCLUDED.optional_columns,
    allowed_file_types = EXCLUDED.allowed_file_types,
    version = GREATEST(public.manual_import_templates.version, EXCLUDED.version);
END $$;