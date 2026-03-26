-- Provision SSO test user with tickets_os area membership (owner, network 2 where tickets live)
INSERT INTO public.hub_area_members (user_id, area_id, area_role, network_id, can_view_confidential)
VALUES (
  'ab3dacc5-769c-420b-ace8-0f8839b7a7eb',
  'f17e1187-e289-4be6-8b67-0eb4ae65a75a',  -- tickets_os area
  'owner',
  2,  -- Network Teste Dev where tickets exist
  false
)
ON CONFLICT DO NOTHING;