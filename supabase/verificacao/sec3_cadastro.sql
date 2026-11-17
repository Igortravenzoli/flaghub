-- ============================================================================
-- Verificação SEC3 (20261117100000): a função do hook decide certo e ninguém da API a alcança.
--
-- ENSAIO (antes de aplicar): mandar NUMA chamada só o corpo da migration seguido deste
-- arquivo — o RAISE do fim desfaz a migration junto (só cria objetos novos: sem trava
-- em nada que já existe). CONFERÊNCIA (depois): este arquivo sozinho.
--   • "SEC3 OK — ..."     → passou (e nada foi gravado)
--   • "SEC3 FALHOU: ..."  → a asserção que quebrou
--
-- Roda como postgres (que não é membro de supabase_auth_admin): a decisão é testada
-- chamando a função; o acesso do Auth e o bloqueio da API, por has_*_privilege.
-- ============================================================================
DO $$
DECLARE
  f   text := 'privado.hub_antes_de_criar_usuario(jsonb)';
  r   jsonb;
  ok  text := '';
  ERR constant text := 'Cadastro só pela conta Microsoft da Flag.';
  FUNCTION_NEGA constant text := '403';
BEGIN
  -- ---- decisão ------------------------------------------------------------
  r := privado.hub_antes_de_criar_usuario('{"user":{"email":"novo@flag.com.br","app_metadata":{"provider":"azure","providers":["azure"]}}}');
  IF r <> '{}'::jsonb THEN RAISE EXCEPTION 'SEC3 FALHOU: azure (app_metadata) deveria passar: %', r; END IF;

  r := privado.hub_antes_de_criar_usuario('{"user":{"email":"novo@flag.com.br","app_metadata":{},"identities":[{"provider":"azure"}]}}');
  IF r <> '{}'::jsonb THEN RAISE EXCEPTION 'SEC3 FALHOU: azure (identities) deveria passar: %', r; END IF;
  ok := ok || 'azure passa; ';

  r := privado.hub_antes_de_criar_usuario('{"user":{"email":"curioso@gmail.com","app_metadata":{"provider":"email","providers":["email"]}}}');
  IF r #>> '{error,http_code}' IS DISTINCT FROM FUNCTION_NEGA OR r #>> '{error,message}' IS DISTINCT FROM ERR THEN
    RAISE EXCEPTION 'SEC3 FALHOU: e-mail de fora deveria dar 403: %', r; END IF;

  r := privado.hub_antes_de_criar_usuario('{"user":{"email":"alguem@flag.com.br","app_metadata":{"provider":"email"}}}');
  IF r #>> '{error,http_code}' IS DISTINCT FROM FUNCTION_NEGA THEN RAISE EXCEPTION 'SEC3 FALHOU: e-mail @flag por senha sem autorização deveria dar 403: %', r; END IF;
  ok := ok || 'e-mail sem autorização 403 (inclusive @flag); ';

  -- payloads estranhos: negam, não explodem
  FOR r IN SELECT privado.hub_antes_de_criar_usuario(x::jsonb) FROM unnest(ARRAY[
      '{}', '{"user":null}', '{"user":{"identities":null}}', '{"user":{"identities":{"provider":"azure"}}}',
      '{"user":{"phone":"5511999999999","app_metadata":{"provider":"phone"}}}',
      '{"user":{"is_anonymous":true,"app_metadata":{"provider":"anonymous"}}}',
      '{"user":{"email":"x@y.z","app_metadata":{"provider":"AZURE-fake"}}}']) x LOOP
    IF r #>> '{error,http_code}' IS DISTINCT FROM FUNCTION_NEGA THEN RAISE EXCEPTION 'SEC3 FALHOU: payload estranho deveria dar 403: %', r; END IF;
  END LOOP;
  ok := ok || 'payload estranho/telefone/anônimo 403; ';

  -- pré-autorizado: uma vez, e vencido não vale
  INSERT INTO privado.cadastro_permitido (email, motivo) VALUES ('sec3.teste@flag.com.br', 'teste SEC3');
  INSERT INTO privado.cadastro_permitido (email, motivo, expira_em) VALUES ('sec3.vencido@flag.com.br', 'teste SEC3', now() - interval '1 minute');
  r := privado.hub_antes_de_criar_usuario('{"user":{"email":"  SEC3.Teste@flag.com.br ","app_metadata":{"provider":"email"}}}');
  IF r <> '{}'::jsonb THEN RAISE EXCEPTION 'SEC3 FALHOU: pré-autorizado deveria passar: %', r; END IF;
  r := privado.hub_antes_de_criar_usuario('{"user":{"email":"sec3.teste@flag.com.br","app_metadata":{"provider":"email"}}}');
  IF r #>> '{error,http_code}' IS DISTINCT FROM FUNCTION_NEGA THEN RAISE EXCEPTION 'SEC3 FALHOU: pré-autorização é de uso único: %', r; END IF;
  r := privado.hub_antes_de_criar_usuario('{"user":{"email":"sec3.vencido@flag.com.br","app_metadata":{"provider":"email"}}}');
  IF r #>> '{error,http_code}' IS DISTINCT FROM FUNCTION_NEGA THEN RAISE EXCEPTION 'SEC3 FALHOU: pré-autorização vencida deveria dar 403: %', r; END IF;
  ok := ok || 'pré-autorizado passa 1 vez, vencido 403; ';

  -- ---- quem alcança ----------------------------------------------------------
  IF NOT has_function_privilege('supabase_auth_admin', f, 'EXECUTE') THEN RAISE EXCEPTION 'SEC3 FALHOU: o Auth não executa o hook'; END IF;
  IF NOT has_schema_privilege('supabase_auth_admin', 'privado', 'USAGE') THEN RAISE EXCEPTION 'SEC3 FALHOU: o Auth não usa o schema'; END IF;
  IF NOT has_table_privilege('supabase_auth_admin', 'privado.cadastro_permitido', 'SELECT') THEN RAISE EXCEPTION 'SEC3 FALHOU: o Auth não lê a pré-autorização'; END IF;
  IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN RAISE EXCEPTION 'SEC3 FALHOU: a API executa o hook'; END IF;
  IF has_schema_privilege('anon', 'privado', 'USAGE') OR has_schema_privilege('authenticated', 'privado', 'USAGE') THEN RAISE EXCEPTION 'SEC3 FALHOU: a API usa o schema privado'; END IF;
  IF has_table_privilege('authenticated', 'privado.cadastro_permitido', 'SELECT')
     OR has_table_privilege('authenticated', 'privado.cadastro_permitido', 'INSERT') THEN RAISE EXCEPTION 'SEC3 FALHOU: a API mexe na pré-autorização'; END IF;
  ok := ok || 'só o Auth alcança; ';

  RAISE EXCEPTION 'SEC3 OK — % (nada foi gravado)', ok;
END $$;
