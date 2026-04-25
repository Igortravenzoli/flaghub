
-- Seed hub_areas
INSERT INTO public.hub_areas (key, name) VALUES
  ('produtos', 'Produtos'),
  ('comercial', 'Comercial'),
  ('customer_service', 'Customer Service'),
  ('fabrica', 'Fábrica'),
  ('qualidade', 'Qualidade'),
  ('tickets_os', 'Tickets & OS')
ON CONFLICT (key) DO NOTHING;

-- Seed hub_integrations
INSERT INTO public.hub_integrations (key, name, type, auth_type) VALUES
  ('devops', 'Azure DevOps', 'api', 'pat'),
  ('timelog', 'Timelog TechsBCN', 'api', 'pat'),
  ('vdesk_gateway', 'VDESK Gateway', 'api', 'gateway_token'),
  ('servicenow_import', 'ServiceNow Import', 'file', 'none')
ON CONFLICT (key) DO NOTHING;

-- Seed IP allowlist
INSERT INTO public.hub_ip_allowlist (cidr, label) VALUES
  ('186.249.231.177/32', 'Century'),
  ('200.166.93.33/32', 'Embratel');
