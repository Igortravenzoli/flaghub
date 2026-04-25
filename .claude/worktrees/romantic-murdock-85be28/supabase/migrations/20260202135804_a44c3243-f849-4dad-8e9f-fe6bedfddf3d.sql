-- Função para expurgar todos os dados de uma network
-- Executada com SECURITY DEFINER para ter permissões elevadas
CREATE OR REPLACE FUNCTION public.purge_network_data(p_network_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tickets_deleted integer;
  v_imports_deleted integer;
  v_batches_deleted integer;
  v_events_deleted integer;
BEGIN
  -- Verificar se o usuário tem permissão (admin ou gestao da mesma network)
  IF NOT (is_admin() OR (is_admin_or_gestao() AND auth_network_id() = p_network_id)) THEN
    RAISE EXCEPTION 'Permissão negada: apenas admin ou gestão podem expurgar dados';
  END IF;

  -- 1. Remover referência de last_import_id dos tickets
  UPDATE tickets SET last_import_id = NULL WHERE network_id = p_network_id;

  -- 2. Contar e deletar eventos de importação
  WITH deleted_events AS (
    DELETE FROM import_events
    WHERE import_id IN (SELECT id FROM imports WHERE network_id = p_network_id)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_events_deleted FROM deleted_events;

  -- 3. Contar e deletar tickets
  WITH deleted_tickets AS (
    DELETE FROM tickets WHERE network_id = p_network_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_tickets_deleted FROM deleted_tickets;

  -- 4. Contar e deletar imports
  WITH deleted_imports AS (
    DELETE FROM imports WHERE network_id = p_network_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_imports_deleted FROM deleted_imports;

  -- 5. Contar e deletar batches
  WITH deleted_batches AS (
    DELETE FROM import_batches WHERE network_id = p_network_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_batches_deleted FROM deleted_batches;

  RETURN json_build_object(
    'success', true,
    'tickets_deleted', v_tickets_deleted,
    'imports_deleted', v_imports_deleted,
    'batches_deleted', v_batches_deleted,
    'events_deleted', v_events_deleted
  );
END;
$$;