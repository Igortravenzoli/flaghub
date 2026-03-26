INSERT INTO manual_import_templates (key, name, area_id, is_active, required_columns, optional_columns, allowed_file_types, version)
VALUES (
  'helpdesk_v1',
  'Helpdesk Tickets JSON',
  'f17e1187-e289-4be6-8b67-0eb4ae65a75a',
  true,
  '["number", "short_description", "state"]'::jsonb,
  '["priority", "assigned_to", "opened_at", "closed_at", "category", "description", "sys_class_name"]'::jsonb,
  ARRAY['json','csv','xlsx'],
  1
);