-- Add quantity-based tracking columns to comercial_metas
-- realizado_quantidade: actual achieved quantity for the period
-- valor_unitario: unit price per license/unit (R$) — sensitive, owner-only view

ALTER TABLE comercial_metas
  ADD COLUMN IF NOT EXISTS realizado_quantidade integer,
  ADD COLUMN IF NOT EXISTS valor_unitario numeric;

-- Update insert RPC to accept new parameters
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
  p_valor_unitario numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO comercial_metas (
    produto, tipo, status, mes_referencia, valor_meta, observacao,
    data_inicio_meta, data_fim_meta, realizado_quantidade, valor_unitario
  )
  VALUES (
    p_produto, p_tipo, p_status, p_mes_referencia, p_valor_meta, p_observacao,
    p_data_inicio_meta, p_data_fim_meta, p_realizado_quantidade, p_valor_unitario
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Update update RPC to accept new parameters
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
  p_valor_unitario numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
    updated_at = now()
  WHERE id = p_id;
END;
$$;
