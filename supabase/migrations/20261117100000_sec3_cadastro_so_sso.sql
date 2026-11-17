-- ============================================================================
-- SEC3 — conta nova só pelo SSO da Microsoft da Flag (hook before-user-created).
--
-- Achado da revisão de 16/11/2026: o cadastro por e-mail estava aberto no servidor
-- (disable_signup=false, autoconfirm ligado, sem captcha). Qualquer pessoa na
-- internet fazia POST /auth/v1/signup com a anon key e saía com um JWT
-- authenticated: o front só escondia o botão.
--
-- disable_signup=true NÃO serve: barra também o primeiro login SSO de quem entra
-- na Flag (o GoTrue cria o usuário nesse login). Em vez disso, esta migration cria
-- a função do hook "before user created", que o Auth chama antes de criar
-- QUALQUER usuário:
--   • provedor azure (o SSO, single-tenant da Flag)       → deixa criar
--   • e-mail pré-autorizado por admin, não vencido, 1 uso → deixa criar
--     (contas por senha, como a monitor@: o admin põe o e-mail em
--      privado.cadastro_permitido e cria a conta em seguida)
--   • qualquer outra coisa                                → 403
-- O hook só vale para conta NOVA: login de quem já existe (o telão, todos) não passa por ele.
--
-- Tudo no schema `privado`, que o PostgREST não expõe (db_schema = public,graphql_public):
-- nem a função nem a tabela viram RPC/tabela da API. Só o supabase_auth_admin usa.
--
-- Ligar o hook é config do Auth, à parte: scripts/sec3-auth-prod.mjs (aplicar | conferir | volta).
-- Prova: supabase/verificacao/sec3_cadastro.sql.
-- Volta: o hook desligado já devolve o estado de antes; os objetos podem ficar
--        (ou: DROP SCHEMA privado CASCADE; e apagar o registro 20261117100000).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS privado;
REVOKE ALL ON SCHEMA privado FROM PUBLIC;
REVOKE ALL ON SCHEMA privado FROM anon, authenticated;
GRANT USAGE ON SCHEMA privado TO supabase_auth_admin;

CREATE TABLE IF NOT EXISTS privado.cadastro_permitido (
  email      text PRIMARY KEY CHECK (email = lower(btrim(email)) AND email <> ''),
  motivo     text NOT NULL CHECK (btrim(motivo) <> ''),
  criado_por text NOT NULL DEFAULT current_user,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  expira_em  timestamptz NOT NULL DEFAULT now() + interval '7 days',
  usado_em   timestamptz
);
COMMENT ON TABLE privado.cadastro_permitido IS
  'SEC3: e-mails que o admin autorizou a ganhar conta fora do SSO (ex.: monitor de TV). Uso único, vence em 7 dias.';
REVOKE ALL ON privado.cadastro_permitido FROM PUBLIC;
REVOKE ALL ON privado.cadastro_permitido FROM anon, authenticated;
GRANT SELECT, UPDATE (usado_em) ON privado.cadastro_permitido TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION privado.hub_antes_de_criar_usuario(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user       jsonb := coalesce(event -> 'user', '{}'::jsonb);
  v_provedor   text  := lower(coalesce(event #>> '{user,app_metadata,provider}', ''));
  v_email      text  := lower(btrim(coalesce(event #>> '{user,email}', '')));
  v_identities jsonb := v_user -> 'identities';
  v_azure      boolean := false;
BEGIN
  IF v_provedor = 'azure' THEN
    v_azure := true;
  ELSIF jsonb_typeof(v_identities) = 'array' THEN
    v_azure := EXISTS (SELECT 1 FROM jsonb_array_elements(v_identities) i WHERE lower(i ->> 'provider') = 'azure');
  END IF;
  IF v_azure THEN
    RETURN '{}'::jsonb;
  END IF;

  IF v_email <> '' THEN
    UPDATE privado.cadastro_permitido
       SET usado_em = now()
     WHERE email = v_email AND usado_em IS NULL AND expira_em > now();
    IF FOUND THEN
      RETURN '{}'::jsonb;
    END IF;
  END IF;

  RETURN jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Cadastro só pela conta Microsoft da Flag.'));
END
$$;
COMMENT ON FUNCTION privado.hub_antes_de_criar_usuario(jsonb) IS
  'SEC3: hook before-user-created do Auth. azure passa; e-mail pré-autorizado passa uma vez; o resto 403.';
REVOKE ALL ON FUNCTION privado.hub_antes_de_criar_usuario(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION privado.hub_antes_de_criar_usuario(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION privado.hub_antes_de_criar_usuario(jsonb) TO supabase_auth_admin;
