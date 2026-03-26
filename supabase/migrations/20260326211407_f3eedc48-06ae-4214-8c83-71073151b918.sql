-- Provisionar acesso do usuário SSO à área Comercial (network_id=2, owner)
INSERT INTO public.hub_area_members (user_id, area_id, area_role, network_id, can_view_confidential)
VALUES ('ab3dacc5-769c-420b-ace8-0f8839b7a7eb', '91191531-6a82-40e5-9f2e-e8e4fe76f294', 'owner', 2, false)
ON CONFLICT DO NOTHING;