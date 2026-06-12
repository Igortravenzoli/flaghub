-- Provisionar acesso do usuário SSO à área Comercial (network_id=2, owner)
-- Guardado por existência dos pais (banco do zero no CI não tem dados de ambiente)
INSERT INTO public.hub_area_members (user_id, area_id, area_role, network_id, can_view_confidential)
SELECT 'ab3dacc5-769c-420b-ace8-0f8839b7a7eb'::uuid, '91191531-6a82-40e5-9f2e-e8e4fe76f294'::uuid, 'owner', 2, false
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = 'ab3dacc5-769c-420b-ace8-0f8839b7a7eb')
  AND EXISTS (SELECT 1 FROM public.hub_areas WHERE id = '91191531-6a82-40e5-9f2e-e8e4fe76f294')
  AND EXISTS (SELECT 1 FROM public.networks WHERE id = 2)
ON CONFLICT DO NOTHING;
