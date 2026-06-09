-- ================================================================
-- MIGRAÇÃO: meta_valor_total — meta monetária direta (sem quantidade)
-- Para produtos cuja meta é um valor R$ e não uma quantidade
-- (ex.: Agente de IA – Sugestão de pedidos).
-- Data: 2026-06-09
-- ================================================================

-- 1. Nova coluna
ALTER TABLE comercial_metas
  ADD COLUMN IF NOT EXISTS meta_valor_total numeric;

-- 2. Migrar dados do Agente de IA: o valor que estava em valor_meta
--    (24800 / 49600) era monetário, não quantidade.
UPDATE comercial_metas
   SET meta_valor_total = valor_meta,
       valor_meta = NULL,
       updated_at = now()
 WHERE produto ILIKE '%Agente de IA%'
   AND meta_valor_total IS NULL;

-- 3. Remover sobrecargas antigas das RPCs
DROP FUNCTION IF EXISTS insert_meta_comercial(text, text, text, text, numeric, text, date, date);
DROP FUNCTION IF EXISTS insert_meta_comercial(text, text, text, text, numeric, text, date, date, integer, numeric);
DROP FUNCTION IF EXISTS update_meta_comercial(uuid, text, text, text, text, numeric, text, date, date);
DROP FUNCTION IF EXISTS update_meta_comercial(uuid, text, text, text, text, numeric, text, date, date, integer, numeric);

-- 4. Recriar insert com p_meta_valor_total (DEFAULT NULL = retrocompatível)
CREATE OR REPLACE FUNCTION insert_meta_comercial(
  p_produto text,
  p_tipo text,
  p_status text,
  p_mes_referencia text,
  p_valor_meta numeric DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_data_inicio_meta date DEFAULT NULL,
  p_data_fim_meta date DEFAULT NULL,
  p_realizado_quantidade integer DEFAULT NULL,
  p_valor_unitario numeric DEFAULT NULL,
  p_meta_valor_total numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO comercial_metas (
    produto, tipo, status, mes_referencia, valor_meta, observacao,
    data_inicio_meta, data_fim_meta, realizado_quantidade, valor_unitario,
    meta_valor_total
  )
  VALUES (
    p_produto, p_tipo, p_status, p_mes_referencia, p_valor_meta, p_observacao,
    p_data_inicio_meta, p_data_fim_meta, p_realizado_quantidade, p_valor_unitario,
    p_meta_valor_total
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 5. Recriar update com p_meta_valor_total
CREATE OR REPLACE FUNCTION update_meta_comercial(
  p_id uuid,
  p_produto text,
  p_tipo text,
  p_status text,
  p_mes_referencia text,
  p_valor_meta numeric DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_data_inicio_meta date DEFAULT NULL,
  p_data_fim_meta date DEFAULT NULL,
  p_realizado_quantidade integer DEFAULT NULL,
  p_valor_unitario numeric DEFAULT NULL,
  p_meta_valor_total numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE comercial_metas SET
    produto = p_produto,
    tipo = p_tipo,
    status = p_status,
    mes_referencia = p_mes_referencia,
    valor_meta = p_valor_meta,
    observacao = p_observacao,
    data_inicio_meta = p_data_inicio_meta,
    data_fim_meta = p_data_fim_meta,
    realizado_quantidade = p_realizado_quantidade,
    valor_unitario = p_valor_unitario,
    meta_valor_total = p_meta_valor_total,
    updated_at = now()
  WHERE id = p_id;
END;
$$;

-- 6. Grants
GRANT EXECUTE ON FUNCTION public.insert_meta_comercial(text, text, text, text, numeric, text, date, date, integer, numeric, numeric) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_meta_comercial(uuid, text, text, text, text, numeric, text, date, date, integer, numeric, numeric) TO authenticated, anon;
