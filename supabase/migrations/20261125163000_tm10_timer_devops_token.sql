-- ============================================================================
-- TIMER FLAG / TM10 — vínculo com o Azure DevOps por pessoa (token Entra delegado)
--
-- Por quê: as escritas de work item do Timer (criar Task/PBI, reunião, mudar o
-- estado) saem com o PAT de serviço, e o History do Azure DevOps mostra o dono
-- do PAT. Com a chave TIMER_DEVOPS_DELEGADO ligada, a edge `timer-devops` grava
-- com um token Microsoft Entra delegado da própria pessoa. O access token dura
-- cerca de 1 h e a Supabase não o renova: a edge precisa do refresh token da
-- pessoa guardado do lado do servidor. É o que esta migration cria.
-- Desenho e riscos: docs/timer-identidade-por-dev.md.
--
-- Desenho:
--   • privado.timer_devops_token: uma linha por pessoa, com o refresh token
--     CIFRADO pela edge (AES-256-GCM; a chave é o secret TIMER_TOKEN_CHAVE e
--     nunca chega ao banco). O banco, o dump do backup e quem lê a tabela só
--     veem a cifra. O CHECK do formato impede gravar um token em claro por
--     engano.
--   • Schema `privado`: o PostgREST não o expõe. Nem anon nem authenticated
--     alcançam a tabela, com ou sem RLS.
--   • A edge (service role) fala com a tabela só por três funções do `public`,
--     executáveis APENAS pelo service_role: ler, gravar e apagar.
--   • Só quem tem o Timer ATIVO tem vínculo: gravar recusa, ler devolve nada,
--     e revogar o acesso apaga o vínculo na hora (gatilho em timer_access).
--   • Apagou o usuário, apagou o vínculo (FK com ON DELETE CASCADE).
--
-- Escopo: 100% aditivo. Com a chave desligada (o padrão), a edge nem chama
-- estas funções. Depende da SEC3 (schema privado) e da TM1 (timer_access).
-- Prova: supabase/verificacao/tm10_devops_token_timer.sql.
-- Volta: DROP TRIGGER timer_access_revogado_apaga_vinculo ON public.timer_access;
--        DROP FUNCTION public.timer_devops_token_ler(uuid),
--                      public.timer_devops_token_gravar(uuid, text, text),
--                      public.timer_devops_token_apagar(uuid),
--                      privado.timer_devops_token_ao_revogar();
--        DROP TABLE privado.timer_devops_token;
--        e apagar o registro 20261125163000.
-- ============================================================================

CREATE TABLE IF NOT EXISTS privado.timer_devops_token (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_cifrado  text NOT NULL,
  entra_sub        text NOT NULL,
  vinculado_em     timestamptz NOT NULL DEFAULT now(),
  renovado_em      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT timer_devops_token_cifrado_check
    CHECK (refresh_cifrado ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$' AND length(refresh_cifrado) <= 16384),
  CONSTRAINT timer_devops_token_sub_check
    CHECK (btrim(entra_sub) <> '' AND length(entra_sub) <= 255)
);

COMMENT ON TABLE privado.timer_devops_token IS
  'TM10: refresh token Microsoft Entra de cada pessoa do Timer, CIFRADO pela edge timer-devops (AES-256-GCM, chave só no secret TIMER_TOKEN_CHAVE). Serve para a edge gravar work item no Azure DevOps com a identidade da pessoa. Acesso só pelas funções public.timer_devops_token_* (service_role).';
COMMENT ON COLUMN privado.timer_devops_token.refresh_cifrado IS
  'v1.<iv>.<cifra+tag> em base64url. Nunca o token em claro. O user_id entra como dado autenticado: a cifra de uma pessoa não abre na linha de outra.';
COMMENT ON COLUMN privado.timer_devops_token.entra_sub IS
  'Sujeito (sub) do id_token conferido no vínculo. A cada renovação a edge confere que o token continua sendo desta pessoa.';
COMMENT ON COLUMN privado.timer_devops_token.renovado_em IS
  'Última vez em que o refresh token foi regravado (a edge regrava no máximo uma vez por semana por pessoa).';

REVOKE ALL ON TABLE privado.timer_devops_token FROM PUBLIC;
REVOKE ALL ON TABLE privado.timer_devops_token FROM anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- ler: a linha da pessoa, só se o Timer dela está ativo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.timer_devops_token_ler(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
           'refresh_cifrado', t.refresh_cifrado,
           'entra_sub',       t.entra_sub,
           'renovado_em',     t.renovado_em)
    FROM privado.timer_devops_token t
    JOIN public.timer_access a ON a.user_id = t.user_id AND a.status = 'ativo'
   WHERE t.user_id = p_user;
$$;

COMMENT ON FUNCTION public.timer_devops_token_ler(uuid) IS
  'TM10: o vínculo cifrado de uma pessoa com o Timer ativo (NULL se não há). Só o service_role executa.';

-- ---------------------------------------------------------------------------
-- gravar: vínculo novo (com p_sub) ou regravação do refresh token (p_sub NULL)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.timer_devops_token_gravar(p_user uuid, p_cifrado text, p_sub text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.timer_access WHERE user_id = p_user AND status = 'ativo') THEN
    RAISE EXCEPTION 'timer_sem_acesso' USING ERRCODE = '42501';
  END IF;

  IF p_sub IS NULL THEN
    -- regravação: só troca a cifra de um vínculo que já existe
    UPDATE privado.timer_devops_token
       SET refresh_cifrado = p_cifrado, renovado_em = now()
     WHERE user_id = p_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'timer_vinculo_inexistente' USING ERRCODE = 'P0002';
    END IF;
    RETURN;
  END IF;

  INSERT INTO privado.timer_devops_token (user_id, refresh_cifrado, entra_sub)
  VALUES (p_user, p_cifrado, p_sub)
  ON CONFLICT (user_id) DO UPDATE
    SET refresh_cifrado = EXCLUDED.refresh_cifrado,
        entra_sub       = EXCLUDED.entra_sub,
        vinculado_em    = now(),
        renovado_em     = now();
END;
$$;

COMMENT ON FUNCTION public.timer_devops_token_gravar(uuid, text, text) IS
  'TM10: grava o vínculo cifrado (com p_sub = vínculo novo; sem = só regrava a cifra). Recusa quem não tem o Timer ativo. Só o service_role executa.';

-- ---------------------------------------------------------------------------
-- apagar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.timer_devops_token_apagar(p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM privado.timer_devops_token WHERE user_id = p_user;
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.timer_devops_token_apagar(uuid) IS
  'TM10: apaga o vínculo de uma pessoa (true se havia). Só o service_role executa.';

REVOKE EXECUTE ON FUNCTION public.timer_devops_token_ler(uuid)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.timer_devops_token_gravar(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.timer_devops_token_apagar(uuid)             FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_devops_token_ler(uuid)                TO service_role;
GRANT  EXECUTE ON FUNCTION public.timer_devops_token_gravar(uuid, text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.timer_devops_token_apagar(uuid)             TO service_role;

-- ---------------------------------------------------------------------------
-- revogou o Timer, apagou o vínculo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.timer_devops_token_ao_revogar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM privado.timer_devops_token WHERE user_id = NEW.user_id;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION privado.timer_devops_token_ao_revogar() IS
  'TM10: gatilho de public.timer_access — acesso revogado apaga o vínculo com o Azure DevOps.';
REVOKE ALL ON FUNCTION privado.timer_devops_token_ao_revogar() FROM PUBLIC;
REVOKE ALL ON FUNCTION privado.timer_devops_token_ao_revogar() FROM anon, authenticated;

DROP TRIGGER IF EXISTS timer_access_revogado_apaga_vinculo ON public.timer_access;
CREATE TRIGGER timer_access_revogado_apaga_vinculo
  AFTER UPDATE OF status ON public.timer_access
  FOR EACH ROW
  WHEN (NEW.status = 'revogado' AND OLD.status IS DISTINCT FROM 'revogado')
  EXECUTE FUNCTION privado.timer_devops_token_ao_revogar();
