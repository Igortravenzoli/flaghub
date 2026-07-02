-- =============================================================
-- Permissões Comercial: owner/operacional da área podem escrever
-- Contexto: gestor do setor (owner em hub_area_members) não conseguia
-- editar Venda Produtos nem movimentação — escrita estava restrita ao
-- has_role(admin) legado.
-- =============================================================

-- ── comercial_vendas: escrita para admin OU owner/operacional da área ──
DROP POLICY IF EXISTS "comercial_vendas_insert_area" ON public.comercial_vendas;
CREATE POLICY "comercial_vendas_insert_area" ON public.comercial_vendas
FOR INSERT TO authenticated
WITH CHECK (
  hub_is_admin() OR EXISTS (
    SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
      AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
  )
);

DROP POLICY IF EXISTS "comercial_vendas_update_area" ON public.comercial_vendas;
CREATE POLICY "comercial_vendas_update_area" ON public.comercial_vendas
FOR UPDATE TO authenticated
USING (
  hub_is_admin() OR EXISTS (
    SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
      AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
  )
);

DROP POLICY IF EXISTS "comercial_vendas_delete_area" ON public.comercial_vendas;
CREATE POLICY "comercial_vendas_delete_area" ON public.comercial_vendas
FOR DELETE TO authenticated
USING (
  hub_is_admin() OR EXISTS (
    SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
      AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
  )
);

-- ── comercial_venda_itens: mesma regra ──
DROP POLICY IF EXISTS "venda_itens_insert_area" ON public.comercial_venda_itens;
CREATE POLICY "venda_itens_insert_area" ON public.comercial_venda_itens
FOR INSERT TO authenticated
WITH CHECK (
  hub_is_admin() OR EXISTS (
    SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
      AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
  )
);

DROP POLICY IF EXISTS "venda_itens_update_area" ON public.comercial_venda_itens;
CREATE POLICY "venda_itens_update_area" ON public.comercial_venda_itens
FOR UPDATE TO authenticated
USING (
  hub_is_admin() OR EXISTS (
    SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
      AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
  )
);

DROP POLICY IF EXISTS "venda_itens_delete_area" ON public.comercial_venda_itens;
CREATE POLICY "venda_itens_delete_area" ON public.comercial_venda_itens
FOR DELETE TO authenticated
USING (
  hub_is_admin() OR EXISTS (
    SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
      AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
  )
);

-- ── comercial_movimentacao_clientes: UPDATE para owner (só existia p/ admin) ──
DROP POLICY IF EXISTS "comercial_movimentacao_update_area_owner" ON public.comercial_movimentacao_clientes;
CREATE POLICY "comercial_movimentacao_update_area_owner" ON public.comercial_movimentacao_clientes
FOR UPDATE TO authenticated
USING (
  hub_is_admin() OR EXISTS (
    SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
      AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
  )
);

-- ── delete_meta_comercial: admin OU owner/operacional da área ──
CREATE OR REPLACE FUNCTION public.delete_meta_comercial(p_id uuid)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INT;
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
  DELETE FROM public.comercial_metas WHERE id = p_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RETURN QUERY SELECT FALSE, 'Registro não encontrado';
  ELSE
    RETURN QUERY SELECT TRUE, 'Registro removido com sucesso';
  END IF;
END;
$function$;

-- ── update_movimentacao_comercial: permitir editar código e nome do cliente ──
DROP FUNCTION IF EXISTS update_movimentacao_comercial(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, INT, DATE);

CREATE OR REPLACE FUNCTION update_movimentacao_comercial(
  p_id UUID,
  p_tipo TEXT DEFAULT NULL,
  p_bandeira TEXT DEFAULT NULL,
  p_sistema TEXT DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL,
  p_status_encerramento TEXT DEFAULT NULL,
  p_valor_mensal DECIMAL DEFAULT NULL,
  p_ano_referencia INT DEFAULT NULL,
  p_data_evento DATE DEFAULT NULL,
  p_cliente_codigo INT DEFAULT NULL,
  p_cliente_nome TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  cliente_codigo INT,
  cliente_nome TEXT,
  tipo TEXT,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  UPDATE comercial_movimentacao_clientes AS cmc
  SET
    tipo = COALESCE(p_tipo, cmc.tipo),
    bandeira = COALESCE(p_bandeira, cmc.bandeira),
    sistema = COALESCE(p_sistema, cmc.sistema),
    motivo = COALESCE(p_motivo, cmc.motivo),
    status_encerramento = COALESCE(p_status_encerramento, cmc.status_encerramento),
    valor_mensal = COALESCE(p_valor_mensal, cmc.valor_mensal),
    ano_referencia = COALESCE(p_ano_referencia, cmc.ano_referencia),
    data_evento = COALESCE(p_data_evento, cmc.data_evento),
    cliente_codigo = COALESCE(p_cliente_codigo, cmc.cliente_codigo),
    cliente_nome = COALESCE(p_cliente_nome, cmc.cliente_nome)
  WHERE cmc.id = p_id;

  RETURN QUERY
  SELECT
    comercial_movimentacao_clientes.id,
    comercial_movimentacao_clientes.cliente_codigo,
    comercial_movimentacao_clientes.cliente_nome,
    comercial_movimentacao_clientes.tipo,
    NOW() AS updated_at
  FROM comercial_movimentacao_clientes
  WHERE comercial_movimentacao_clientes.id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

GRANT EXECUTE ON FUNCTION update_movimentacao_comercial TO authenticated;
REVOKE EXECUTE ON FUNCTION update_movimentacao_comercial FROM anon;
