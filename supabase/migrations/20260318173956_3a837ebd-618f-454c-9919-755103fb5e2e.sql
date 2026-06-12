
DO $$
DECLARE
  v_area_id uuid;
BEGIN
  SELECT id INTO v_area_id FROM hub_areas WHERE key = 'customer_service' LIMIT 1;

  -- Banco do zero (CI) não tem a área: pula o seed em vez de inserir area_id nulo
  IF v_area_id IS NULL THEN
    RAISE NOTICE 'Área customer_service não encontrada; seed de templates CS pulado.';
    RETURN;
  END IF;

  INSERT INTO manual_import_templates (key, name, area_id, is_active, version, allowed_file_types, required_columns, column_mapping)
  VALUES
    (
      'cs_implantacoes_v1',
      'Implantações CS',
      v_area_id,
      true,
      1,
      ARRAY['csv','xlsx','xls','json'],
      '["cliente","responsavel","solucao","status"]'::jsonb,
      '{
        "cliente": "Cliente",
        "consultor": "Responsavel",
        "solucao": "Solucao",
        "status_implantacao": "Status",
        "data_inicio": "Inicio",
        "data_fim": "Fim",
        "observacoes": "Obs",
        "contato": "Contato",
        "licenca": "Licenca",
        "atuacao": "Atuacao",
        "puxada": "Puxada"
      }'::jsonb
    ),
    (
      'cs_fila_cs_v1',
      'Fila CS',
      v_area_id,
      true,
      1,
      ARRAY['csv','xlsx','xls','json'],
      '["cliente","status"]'::jsonb,
      '{
        "cliente": "Cliente",
        "responsavel": "Responsavel",
        "status": "Status",
        "prioridade": "Prioridade",
        "observacoes": "Obs",
        "data_entrada": "Entrada",
        "data_saida": "Saida"
      }'::jsonb
    )
  ON CONFLICT (key) DO NOTHING;
END $$;
