-- Função RPC para inserir movimentação comercial de forma segura
-- Executar no Supabase SQL Editor

DROP FUNCTION IF EXISTS insert_movimentacao_comercial(INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, INT, DATE);
DROP FUNCTION IF EXISTS update_movimentacao_comercial(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, INT, DATE);
DROP FUNCTION IF EXISTS update_movimentacao_comercial(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, INT, DATE);
DROP FUNCTION IF EXISTS delete_movimentacao_comercial(BIGINT);
DROP FUNCTION IF EXISTS delete_movimentacao_comercial(UUID);

CREATE OR REPLACE FUNCTION insert_movimentacao_comercial(
  p_cliente_codigo INT,
  p_cliente_nome TEXT,
  p_tipo TEXT,
  p_bandeira TEXT DEFAULT NULL,
  p_sistema TEXT DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL,
  p_status_encerramento TEXT DEFAULT NULL,
  p_valor_mensal DECIMAL DEFAULT NULL,
  p_ano_referencia INT DEFAULT NULL,
  p_data_evento DATE DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  cliente_codigo INT,
  cliente_nome TEXT,
  tipo TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO comercial_movimentacao_clientes (
    cliente_codigo, cliente_nome, tipo, bandeira, sistema, 
    motivo, status_encerramento, valor_mensal, ano_referencia, data_evento
  )
  VALUES (
    p_cliente_codigo, p_cliente_nome, p_tipo, p_bandeira, 
    p_sistema, p_motivo, p_status_encerramento, p_valor_mensal, 
    p_ano_referencia, p_data_evento
  )
  RETURNING comercial_movimentacao_clientes.id INTO v_id;

  RETURN QUERY
  SELECT 
    comercial_movimentacao_clientes.id,
    comercial_movimentacao_clientes.cliente_codigo,
    comercial_movimentacao_clientes.cliente_nome,
    comercial_movimentacao_clientes.tipo,
    comercial_movimentacao_clientes.created_at
  FROM comercial_movimentacao_clientes
  WHERE comercial_movimentacao_clientes.id = v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Conceder permissão apenas para usuários autenticados
GRANT EXECUTE ON FUNCTION insert_movimentacao_comercial TO authenticated;
REVOKE EXECUTE ON FUNCTION insert_movimentacao_comercial FROM anon;

-- Função RPC para editar movimentação
CREATE OR REPLACE FUNCTION update_movimentacao_comercial(
  p_id UUID,
  p_tipo TEXT DEFAULT NULL,
  p_bandeira TEXT DEFAULT NULL,
  p_sistema TEXT DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL,
  p_status_encerramento TEXT DEFAULT NULL,
  p_valor_mensal DECIMAL DEFAULT NULL,
  p_ano_referencia INT DEFAULT NULL,
  p_data_evento DATE DEFAULT NULL
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
    data_evento = COALESCE(p_data_evento, cmc.data_evento)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_movimentacao_comercial TO authenticated;
REVOKE EXECUTE ON FUNCTION update_movimentacao_comercial FROM anon;

-- Função RPC para deletar movimentação
CREATE OR REPLACE FUNCTION delete_movimentacao_comercial(p_id UUID)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM comercial_movimentacao_clientes WHERE id = p_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count = 0 THEN
    RETURN QUERY SELECT FALSE, 'Registro não encontrado';
  ELSE
    RETURN QUERY SELECT TRUE, 'Registro deletado com sucesso';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION delete_movimentacao_comercial TO authenticated;
REVOKE EXECUTE ON FUNCTION delete_movimentacao_comercial FROM anon;
