-- =============================================================================
-- RLS-A — preparo da bancada (1ª parte da chamada única; ver rls_a_verificacao.sql).
-- Cria as pessoas sintéticas DENTRO da transação que o RAISE final desfaz.
-- Triggers envolvidos (conferidos em 16/11/2026): handle_new_user (cria o
-- perfil), hub_fill_member_network_id, protect_mfa_exempt — nenhum fala com
-- fora do banco (sem pg_net/http/notify).
-- =============================================================================
SET LOCAL statement_timeout = '150s';
SET LOCAL lock_timeout = '5s';   -- DDL de política espera leitores; não fica preso

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-4000-a000-00000000a001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-a-pendente@bancada.invalid',  '{"full_name":"RLS-A pendente"}',  now(), now()),
  ('00000000-0000-4000-a000-00000000a002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-a-aprovado@bancada.invalid',  '{"full_name":"RLS-A aprovado"}',  now(), now()),
  ('00000000-0000-4000-a000-00000000a003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-a-comercial@bancada.invalid', '{"full_name":"RLS-A comercial"}', now(), now()),
  ('00000000-0000-4000-a000-00000000a004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-a-ex-owner@bancada.invalid',  '{"full_name":"RLS-A ex-owner"}',  now(), now()),
  ('00000000-0000-4000-a000-00000000a005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'rls-a-owner-fab@bancada.invalid', '{"full_name":"RLS-A owner fab"}', now(), now());

INSERT INTO public.hub_area_members (user_id, area_id, area_role, is_active)
SELECT v.uid, a.id, v.papel, v.ativo
  FROM (VALUES
    ('00000000-0000-4000-a000-00000000a002'::uuid, 'qualidade', 'leitura', true),
    ('00000000-0000-4000-a000-00000000a003'::uuid, 'comercial', 'owner',   true),
    ('00000000-0000-4000-a000-00000000a004'::uuid, 'fabrica',   'owner',   false),
    ('00000000-0000-4000-a000-00000000a005'::uuid, 'fabrica',   'owner',   true)
  ) v(uid, area, papel, ativo)
  JOIN public.hub_areas a ON a.key = v.area;
