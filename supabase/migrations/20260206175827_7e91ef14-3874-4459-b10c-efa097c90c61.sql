-- Adicionar mapeamentos numéricos para status (muitos sistemas exportam códigos numéricos)
INSERT INTO public.status_mapping (network_id, external_status, internal_status, is_active)
VALUES
  (1, '1', 'novo', true),
  (1, '2', 'em_atendimento', true),
  (1, '3', 'em_analise', true)
ON CONFLICT DO NOTHING;