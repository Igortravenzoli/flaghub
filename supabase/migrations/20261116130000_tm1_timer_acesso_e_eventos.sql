-- ============================================================================
-- TIMER FLAG / Fase 1 — acesso próprio e trilha de uso
--
-- Por quê: o Timer Flag (rota /timer) é para devs que NÃO têm acesso aos KPIs.
-- O "aprovado" de hoje é `hub_is_approved()` = qualquer vínculo ativo em
-- hub_area_members OU admin, e ~40 tabelas de KPI confiam nele. Se o Timer
-- virasse uma linha de hub_areas, quem tem só o Timer passaria a ler tudo.
--
-- Desenho:
--   • timer_access é uma tabela À PARTE de hub_area_members. Quem tem só o
--     Timer continua NÃO aprovado para o hub: `hub_is_approved()` não muda, e
--     toda política de KPI segue barrando essa pessoa sem ser tocada.
--   • `hub_has_timer()` é a régua das tabelas e RPCs do Timer (fases 3 e 4).
--   • A concessão é automática, mas só pela edge `timer-devops` (op `ativar`),
--     que valida o SSO Microsoft do tenant Flag antes de gravar. O cliente não
--     tem INSERT/UPDATE aqui: não dá para se conceder o acesso pelo PostgREST.
--   • Revogado fica revogado: a edge não reconcede quem o admin revogou.
--   • timer_eventos é a trilha de uso (append-only). O servidor grava os
--     eventos que importam (concessão, e nas próximas fases start/pausa/
--     auto-pausa/postagem). O cliente só registra eventos de uma lista
--     fechada, por RPC, com teto de tamanho e de frequência.
--
-- Escopo: 100% aditivo. Não altera tabela, view, RPC nem política existente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. timer_access — quem pode usar o Timer
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timer_access (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                text NOT NULL,
  status               text NOT NULL DEFAULT 'ativo',
  origem               text NOT NULL DEFAULT 'sso_auto',
  sso_tenant_id        text NULL,
  devops_guid          text NULL,
  devops_display       text NULL,
  devops_email         text NULL,
  devops_resolvido_em  timestamptz NULL,
  concedido_em         timestamptz NOT NULL DEFAULT now(),
  revogado_em          timestamptz NULL,
  revogado_por         uuid NULL,
  motivo_revogacao     text NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT timer_access_status_check CHECK (status IN ('ativo','revogado')),
  CONSTRAINT timer_access_origem_check CHECK (origem IN ('sso_auto','admin')),
  CONSTRAINT timer_access_revogado_check CHECK (
    status <> 'revogado' OR revogado_em IS NOT NULL
  )
);

COMMENT ON TABLE public.timer_access IS
  'Acesso ao Timer Flag, separado de hub_area_members de propósito: quem tem só o Timer NÃO é hub_is_approved() e não lê KPI. Escrita só pela edge timer-devops (service role) e pelas RPCs de admin.';
COMMENT ON COLUMN public.timer_access.devops_guid IS
  'Id da identidade no Azure DevOps (vssps, busca por MailAddress do e-mail do SSO). É o userId que a TechsBCN grava. Nunca vem do corpo da requisição.';
COMMENT ON COLUMN public.timer_access.sso_tenant_id IS
  'Tenant do Azure AD (claim tid) visto na concessão.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_timer_access_email
  ON public.timer_access (lower(email));

DROP TRIGGER IF EXISTS set_timer_access_updated_at ON public.timer_access;
CREATE TRIGGER set_timer_access_updated_at
  BEFORE UPDATE ON public.timer_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.timer_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_access FORCE ROW LEVEL SECURITY;

-- O default privilege do Supabase concede tudo (inclusive TRUNCATE, que não
-- passa por RLS) a anon e authenticated. Só fica o SELECT.
REVOKE ALL ON TABLE public.timer_access FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.timer_access TO authenticated;

DROP POLICY IF EXISTS timer_access_select_proprio_ou_admin ON public.timer_access;
CREATE POLICY timer_access_select_proprio_ou_admin ON public.timer_access
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.hub_is_admin());

-- ---------------------------------------------------------------------------
-- 2. hub_has_timer() — a régua do Timer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hub_has_timer()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.timer_access
    WHERE user_id = (SELECT auth.uid())
      AND status = 'ativo'
  );
$$;

COMMENT ON FUNCTION public.hub_has_timer() IS
  'True quando o usuário logado tem o Timer Flag ativo. NÃO implica hub_is_approved(): o Timer não abre KPI.';

REVOKE EXECUTE ON FUNCTION public.hub_has_timer() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.hub_has_timer() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. timer_eventos — trilha de uso (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timer_eventos (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evento       text NOT NULL,
  origem       text NOT NULL,
  cliente      text NULL,
  plataforma   text NULL,
  versao_app   text NULL,
  entry_id     uuid NULL,
  work_item_id integer NULL,
  detalhe      jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT timer_eventos_evento_check  CHECK (evento ~ '^[a-z][a-z0-9_]{1,47}$'),
  CONSTRAINT timer_eventos_origem_check  CHECK (origem IN ('servidor','cliente')),
  CONSTRAINT timer_eventos_cliente_check CHECK (cliente IS NULL OR cliente IN ('web','desktop','widget')),
  CONSTRAINT timer_eventos_plataforma_check CHECK (
    plataforma IS NULL OR plataforma IN ('windows','macos','linux','outra')
  ),
  CONSTRAINT timer_eventos_versao_check  CHECK (versao_app IS NULL OR length(versao_app) <= 32),
  CONSTRAINT timer_eventos_detalhe_check CHECK (pg_column_size(detalhe) <= 4096)
);

COMMENT ON TABLE public.timer_eventos IS
  'Trilha de uso do Timer Flag. Append-only: sem UPDATE/DELETE para ninguém além do service role. origem=servidor é gravado por edge/RPC (fonte de verdade das ações); origem=cliente é o que o app relata, por timer_registrar_evento, de uma lista fechada.';

CREATE INDEX IF NOT EXISTS idx_timer_eventos_user_criado
  ON public.timer_eventos (user_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_timer_eventos_evento_criado
  ON public.timer_eventos (evento, criado_em DESC);

ALTER TABLE public.timer_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_eventos FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.timer_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.timer_eventos TO authenticated;

DROP POLICY IF EXISTS timer_eventos_select_proprio_ou_admin ON public.timer_eventos;
CREATE POLICY timer_eventos_select_proprio_ou_admin ON public.timer_eventos
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.hub_is_admin());

-- ---------------------------------------------------------------------------
-- 4. timer_registrar_evento — o que o app pode relatar
-- ---------------------------------------------------------------------------
-- Lista fechada: o cliente NÃO grava eventos de ação (start, pausa, postagem…).
-- Esses nascem no servidor, dentro das RPCs das próximas fases, para a trilha
-- não depender do que o app diz.
-- Teto: 60 eventos de cliente por usuário em 10 min — o suficiente para uso
-- normal, pouco para encher a tabela (e o egress) num laço.
CREATE OR REPLACE FUNCTION public.timer_registrar_evento(
  p_evento     text,
  p_cliente    text DEFAULT 'web',
  p_plataforma text DEFAULT NULL,
  p_versao_app text DEFAULT NULL,
  p_detalhe    jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_recentes integer;
BEGIN
  IF v_uid IS NULL OR NOT public.hub_has_timer() THEN
    RAISE EXCEPTION 'timer_sem_acesso' USING ERRCODE = '42501';
  END IF;

  IF p_evento NOT IN ('abriu', 'baixou_instalador', 'janela_oculta', 'janela_visivel', 'erro_cliente') THEN
    RAISE EXCEPTION 'timer_evento_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_recentes
  FROM public.timer_eventos
  WHERE user_id = v_uid
    AND origem = 'cliente'
    AND criado_em > now() - interval '10 minutes';

  IF v_recentes >= 60 THEN
    -- Silencioso de propósito: o app não deve quebrar por causa da trilha.
    RETURN;
  END IF;

  INSERT INTO public.timer_eventos (user_id, evento, origem, cliente, plataforma, versao_app, detalhe)
  VALUES (
    v_uid,
    p_evento,
    'cliente',
    CASE WHEN p_cliente IN ('web','desktop','widget') THEN p_cliente ELSE NULL END,
    CASE WHEN p_plataforma IN ('windows','macos','linux','outra') THEN p_plataforma ELSE NULL END,
    left(p_versao_app, 32),
    CASE WHEN pg_column_size(coalesce(p_detalhe, '{}'::jsonb)) <= 2048
         THEN coalesce(p_detalhe, '{}'::jsonb)
         ELSE jsonb_build_object('truncado', true) END
  );
END;
$$;

COMMENT ON FUNCTION public.timer_registrar_evento(text, text, text, text, jsonb) IS
  'Evento de uso relatado pelo app do Timer (lista fechada, teto de 60 por 10 min). Ações do timer são registradas pelo servidor, não por aqui.';

REVOKE EXECUTE ON FUNCTION public.timer_registrar_evento(text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_registrar_evento(text, text, text, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Admin: revogar e reativar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.timer_revogar_acesso(p_user_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.hub_is_admin() THEN
    RAISE EXCEPTION 'apenas_admin' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = '22023';
  END IF;

  UPDATE public.timer_access
     SET status = 'revogado',
         revogado_em = now(),
         revogado_por = auth.uid(),
         motivo_revogacao = left(p_motivo, 500)
   WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'timer_acesso_inexistente' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.timer_eventos (user_id, evento, origem, detalhe)
  VALUES (p_user_id, 'acesso_revogado', 'servidor',
          jsonb_build_object('por', auth.uid(), 'motivo', left(p_motivo, 500)));
END;
$$;

CREATE OR REPLACE FUNCTION public.timer_reativar_acesso(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.hub_is_admin() THEN
    RAISE EXCEPTION 'apenas_admin' USING ERRCODE = '42501';
  END IF;

  UPDATE public.timer_access
     SET status = 'ativo',
         origem = 'admin',
         revogado_em = NULL,
         revogado_por = NULL,
         motivo_revogacao = NULL
   WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'timer_acesso_inexistente' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.timer_eventos (user_id, evento, origem, detalhe)
  VALUES (p_user_id, 'acesso_reativado', 'servidor', jsonb_build_object('por', auth.uid()));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.timer_revogar_acesso(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_revogar_acesso(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.timer_reativar_acesso(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.timer_reativar_acesso(uuid) TO authenticated;
