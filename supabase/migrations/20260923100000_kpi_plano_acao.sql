-- ============================================================================
-- FASE5 / APRESENTACAO-3 — Plano de ação por indicador (reunião gerencial)
--
-- Por quê: a solicitação gerencial de 25/09/2026 pede, no item 3, "o plano de
-- ação para os indicadores em que ainda não estamos atingindo o resultado
-- esperado", apresentado DENTRO do FlagHub. Não existia onde registrar isso.
--
-- Escopo: 100% aditivo. Não altera tabela, view, RPC nem política existente.
-- O card que lê esta tabela vive só na Visão Executiva de mesa; o modo TV não
-- é tocado (decisão D-AP3: o telão continua sendo o slide de metas).
--
-- Regra de acesso (D-AP2):
--   ler   = admin global OU membro da área (mesma régua do hub_user_has_area,
--           que já trata herança) — o Roger tem 'leitura' nas 7 áreas.
--   gravar= admin global OU OWNER da área (helper novo hub_user_is_area_owner,
--           espelho do isOwner do front, useHubAreas.ts).
--   apagar= ninguém: não há política de DELETE nem GRANT de DELETE. Remoção é
--           soft-delete por is_active, para o histórico da reunião não sumir.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper: o usuário é OWNER desta área? (com herança, igual ao front)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hub_user_is_area_owner(p_area_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hub_area_members m
    JOIN public.hub_areas a ON a.id = m.area_id
    WHERE m.user_id = (SELECT auth.uid())
      AND m.is_active = true
      AND m.area_role = 'owner'
      AND a.key = p_area_key
  )
  OR EXISTS (
    -- herança: owner da área-pai também é owner da filha
    SELECT 1
    FROM public.hub_area_inheritance ai
    JOIN public.hub_areas parent ON parent.key = ai.parent_area_key
    JOIN public.hub_area_members m ON m.area_id = parent.id
    WHERE ai.child_area_key = p_area_key
      AND m.user_id = (SELECT auth.uid())
      AND m.is_active = true
      AND m.area_role = 'owner'
  );
$$;

COMMENT ON FUNCTION public.hub_user_is_area_owner(text) IS
  'True quando o usuário logado é owner da área (por chave), direto ou por herança. Espelha isOwner() do front (useHubAreas).';

REVOKE EXECUTE ON FUNCTION public.hub_user_is_area_owner(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.hub_user_is_area_owner(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tabela
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kpi_plano_acao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_key        text NOT NULL REFERENCES public.hub_areas(key) ON UPDATE CASCADE,
  indicador       text NOT NULL,
  indicador_chave text NULL,
  periodo_ref     text NOT NULL,
  situacao        text NOT NULL,
  resultado_texto text NULL,
  causa           text NULL,
  acao            text NULL,
  responsavel     text NULL,
  prazo           date NULL,
  status          text NOT NULL DEFAULT 'aberta',
  ordem           integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  origem          text NOT NULL DEFAULT 'flaghub',
  created_by      uuid NULL DEFAULT auth.uid(),
  updated_by      uuid NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT kpi_plano_acao_periodo_ref_check CHECK (periodo_ref ~ '^\d{4}-Q[1-4]$'),
  CONSTRAINT kpi_plano_acao_situacao_check    CHECK (situacao IN ('abaixo_da_meta','em_risco','atingido')),
  CONSTRAINT kpi_plano_acao_status_check      CHECK (status   IN ('aberta','em_andamento','concluida','cancelada')),
  CONSTRAINT kpi_plano_acao_origem_check      CHECK (origem   IN ('flaghub','carga_sql')),
  -- indicador abaixo da meta exige plano completo; 'em_risco' pode ficar só
  -- como ponto de atenção registrado, sem ação definida.
  CONSTRAINT kpi_plano_acao_acao_obrigatoria_check CHECK (
    situacao <> 'abaixo_da_meta'
    OR (acao IS NOT NULL AND responsavel IS NOT NULL AND prazo IS NOT NULL)
  )
);

COMMENT ON TABLE public.kpi_plano_acao IS
  'Plano de ação por indicador e trimestre, apresentado na Visão Executiva de mesa (FASE5, reunião de 25/09/2026). Escrita: admin ou owner da área. Sem DELETE: use is_active.';
COMMENT ON COLUMN public.kpi_plano_acao.indicador_chave IS
  'Identificador estável do indicador quando existir (ex.: fabrica.entrega, cs.sla24h.nestle). Livre por ora.';
COMMENT ON COLUMN public.kpi_plano_acao.resultado_texto IS
  'Resultado declarado pelo gestor para indicador que o FlagHub ainda não calcula (ex.: SLA de julho do CS). Nunca entra em cálculo (D-AP5).';
COMMENT ON COLUMN public.kpi_plano_acao.origem IS
  'flaghub = registrado na tela; carga_sql = carregado em lote antes da reunião.';

CREATE INDEX IF NOT EXISTS idx_kpi_plano_acao_area_periodo_status
  ON public.kpi_plano_acao (area_key, periodo_ref, status);

DROP TRIGGER IF EXISTS set_kpi_plano_acao_updated_at ON public.kpi_plano_acao;
CREATE TRIGGER set_kpi_plano_acao_updated_at
  BEFORE UPDATE ON public.kpi_plano_acao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Privilégios e RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.kpi_plano_acao ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.kpi_plano_acao FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.kpi_plano_acao TO authenticated;

-- Leitura: admin ou quem tem a área (a mesma régua das outras telas do setor)
DROP POLICY IF EXISTS kpa_select_admin_or_area ON public.kpi_plano_acao;
CREATE POLICY kpa_select_admin_or_area ON public.kpi_plano_acao
  FOR SELECT TO authenticated
  USING (
    public.hub_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hub_areas a
      WHERE a.key = kpi_plano_acao.area_key
        AND public.hub_user_has_area(a.id)
    )
  );

-- Escrita: admin ou owner da área
DROP POLICY IF EXISTS kpa_insert_admin_or_owner ON public.kpi_plano_acao;
CREATE POLICY kpa_insert_admin_or_owner ON public.kpi_plano_acao
  FOR INSERT TO authenticated
  WITH CHECK (
    public.hub_is_admin() OR public.hub_user_is_area_owner(kpi_plano_acao.area_key)
  );

DROP POLICY IF EXISTS kpa_update_admin_or_owner ON public.kpi_plano_acao;
CREATE POLICY kpa_update_admin_or_owner ON public.kpi_plano_acao
  FOR UPDATE TO authenticated
  USING (
    public.hub_is_admin() OR public.hub_user_is_area_owner(kpi_plano_acao.area_key)
  )
  WITH CHECK (
    public.hub_is_admin() OR public.hub_user_is_area_owner(kpi_plano_acao.area_key)
  );

-- Sem política de DELETE: a remoção é soft (is_active = false).
