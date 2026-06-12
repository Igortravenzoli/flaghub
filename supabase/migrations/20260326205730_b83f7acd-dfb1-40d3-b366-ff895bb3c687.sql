-- Provision SSO test user with tickets_os area membership (owner, network 2 where tickets live)
-- Guardado por existência dos pais (banco do zero no CI não tem dados de ambiente)
INSERT INTO public.hub_area_members (user_id, area_id, area_role, network_id, can_view_confidential)
SELECT
  'ab3dacc5-769c-420b-ace8-0f8839b7a7eb'::uuid,
  'f17e1187-e289-4be6-8b67-0eb4ae65a75a'::uuid,  -- tickets_os area
  'owner',
  2,  -- Network Teste Dev where tickets exist
  false
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = 'ab3dacc5-769c-420b-ace8-0f8839b7a7eb')
  AND EXISTS (SELECT 1 FROM public.hub_areas WHERE id = 'f17e1187-e289-4be6-8b67-0eb4ae65a75a')
  AND EXISTS (SELECT 1 FROM public.networks WHERE id = 2)
ON CONFLICT DO NOTHING;
