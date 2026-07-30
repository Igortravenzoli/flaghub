-- =============================================================================
-- PRD — Catálogo de produtos comerciais: nome editável e ordenação manual
--
-- Contexto (reunião com Miller, 29/07/2026): o time comercial precisa padronizar
-- os nomes dos produtos ("implantação Nespresso", "implantação Heineken"…) e
-- ordenar a lista conforme a lógica de apresentação, não em ordem alfabética.
--
-- Problema que isto resolve (achados 6 e 7 do PLANO_AJUSTES_COMERCIAL_30-07):
--   1. `comercial_metas.produto` e `comercial_venda_itens.produto` são texto livre
--      e o casamento meta ↔ venda é por string. Renomear numa linha e não nas
--      outras faz a Qtd Realizada cair para zero SEM AVISO.
--   2. `comercial_metas` tem UNIQUE (produto, tipo, mes_referencia) — renomear
--      para um nome já usado no mesmo mês estoura constraint na cara do usuário.
--   3. Não existe onde guardar ordem de produto (a tabela ordenava por
--      localeCompare no front).
--
-- Solução: catálogo + RPCs transacionais. O nome continua sendo a chave de
-- casamento (não há FK) — o que muda é que renomear passa a ser uma operação
-- atômica e validada, nunca um UPDATE de linha solta.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.comercial_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ordem int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comercial_produtos_ordem ON public.comercial_produtos (ordem, nome);

-- Seed: tudo que já existe em metas e itens de venda, em ordem alfabética
-- (a ordem alfabética é só o ponto de partida — o gestor reordena na tela).
INSERT INTO public.comercial_produtos (nome, ordem)
SELECT nome, (row_number() OVER (ORDER BY nome))::int * 10
FROM (
  SELECT DISTINCT produto AS nome FROM public.comercial_metas WHERE tipo <> 'faturamento'
  UNION
  SELECT DISTINCT produto FROM public.comercial_venda_itens
) s
ON CONFLICT (nome) DO NOTHING;

ALTER TABLE public.comercial_produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comercial_produtos_select" ON public.comercial_produtos;
CREATE POLICY "comercial_produtos_select" ON public.comercial_produtos
FOR SELECT TO authenticated USING (true);

-- Escrita direta segue a mesma régua do funil (admin ou gestor comercial).
-- A ordenação usa esta policy; o rename usa a RPC (precisa de transação).
DROP POLICY IF EXISTS "comercial_produtos_write" ON public.comercial_produtos;
CREATE POLICY "comercial_produtos_write" ON public.comercial_produtos
FOR ALL TO authenticated
USING (
  public.hub_is_admin() OR EXISTS (
    SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
      AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
  )
)
WITH CHECK (
  public.hub_is_admin() OR EXISTS (
    SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
      AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
  )
);

CREATE OR REPLACE FUNCTION public.set_comercial_produtos_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_comercial_produtos_updated_at ON public.comercial_produtos;
CREATE TRIGGER tr_set_comercial_produtos_updated_at
  BEFORE UPDATE ON public.comercial_produtos
  FOR EACH ROW EXECUTE FUNCTION public.set_comercial_produtos_updated_at();

-- ── Catálogo se mantém sozinho: meta nova de produto registra o produto ───────
CREATE OR REPLACE FUNCTION public.sync_comercial_produto_catalogo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo <> 'faturamento' THEN
    INSERT INTO public.comercial_produtos (nome, ordem)
    VALUES (
      NEW.produto,
      COALESCE((SELECT MAX(ordem) FROM public.comercial_produtos), 0) + 10
    )
    ON CONFLICT (nome) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_comercial_produto_catalogo ON public.comercial_metas;
CREATE TRIGGER tr_sync_comercial_produto_catalogo
  AFTER INSERT OR UPDATE OF produto ON public.comercial_metas
  FOR EACH ROW EXECUTE FUNCTION public.sync_comercial_produto_catalogo();

-- ── RPC: renomear produto de ponta a ponta, numa transação ───────────────────
-- Valida a colisão com comercial_metas_unique ANTES de escrever e devolve
-- mensagem legível (o erro cru de constraint não diz qual mês colidiu).
DROP FUNCTION IF EXISTS public.rename_produto_comercial(text, text);
CREATE OR REPLACE FUNCTION public.rename_produto_comercial(p_de text, p_para text)
RETURNS TABLE (metas_atualizadas int, itens_atualizados int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_para text := btrim(p_para);
  v_metas int := 0;
  v_itens int := 0;
  v_conflito text;
BEGIN
  IF NOT (
    public.hub_is_admin() OR EXISTS (
      SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
        AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
    )
  ) THEN
    RAISE EXCEPTION 'permission denied: admin ou gestor comercial';
  END IF;

  IF v_para IS NULL OR v_para = '' THEN
    RAISE EXCEPTION 'Nome do produto não pode ser vazio';
  END IF;

  IF p_de = v_para THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  -- Colisão com o UNIQUE (produto, tipo, mes_referencia): já existe meta do
  -- destino no mesmo tipo+mês em que a origem também tem meta.
  SELECT string_agg(DISTINCT origem.mes_referencia, ', ' ORDER BY origem.mes_referencia)
    INTO v_conflito
  FROM public.comercial_metas origem
  JOIN public.comercial_metas destino
    ON destino.produto = v_para
   AND destino.tipo = origem.tipo
   AND destino.mes_referencia = origem.mes_referencia
  WHERE origem.produto = p_de;

  IF v_conflito IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe meta de "%" em: %. Consolide ou remova essas metas antes de renomear.',
      v_para, v_conflito;
  END IF;

  UPDATE public.comercial_metas SET produto = v_para, updated_at = now() WHERE produto = p_de;
  GET DIAGNOSTICS v_metas = ROW_COUNT;

  UPDATE public.comercial_venda_itens SET produto = v_para WHERE produto = p_de;
  GET DIAGNOSTICS v_itens = ROW_COUNT;

  -- Catálogo: renomeia a linha; se o destino já existir (produto só de venda),
  -- absorve a origem mantendo a ordem do destino.
  IF EXISTS (SELECT 1 FROM public.comercial_produtos WHERE nome = v_para) THEN
    DELETE FROM public.comercial_produtos WHERE nome = p_de;
  ELSE
    UPDATE public.comercial_produtos SET nome = v_para WHERE nome = p_de;
  END IF;

  PERFORM public.hub_audit_log(
    'comercial_produto_rename'::text, 'comercial_produtos'::text, NULL::text,
    jsonb_build_object('de', p_de, 'para', v_para, 'metas', v_metas, 'itens', v_itens)
  );

  RETURN QUERY SELECT v_metas, v_itens;
END;
$$;

-- ── RPC: reordenar em bloco (a ordem vale para tabela, cards e selects) ──────
DROP FUNCTION IF EXISTS public.reordenar_produtos_comercial(text[]);
CREATE OR REPLACE FUNCTION public.reordenar_produtos_comercial(p_nomes text[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF NOT (
    public.hub_is_admin() OR EXISTS (
      SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
        AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
    )
  ) THEN
    RAISE EXCEPTION 'permission denied: admin ou gestor comercial';
  END IF;

  UPDATE public.comercial_produtos p
     SET ordem = s.pos * 10, updated_at = now()
    FROM (SELECT nome, ordinality::int AS pos FROM unnest(p_nomes) WITH ORDINALITY AS t(nome, ordinality)) s
   WHERE p.nome = s.nome;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

-- Funções de trigger nunca devem ser chamáveis via REST (mesma régua da
-- migration 20260515130000 — o trigger roda com os privilégios do dono).
REVOKE EXECUTE ON FUNCTION public.sync_comercial_produto_catalogo() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_comercial_produtos_updated_at() FROM anon, authenticated, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.rename_produto_comercial(text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reordenar_produtos_comercial(text[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_produto_comercial(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reordenar_produtos_comercial(text[]) TO authenticated;
