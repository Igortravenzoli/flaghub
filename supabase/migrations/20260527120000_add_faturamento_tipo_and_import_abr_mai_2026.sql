-- ================================================================
-- MIGRAÇÃO: Adiciona 'faturamento' como tipo em comercial_metas
--           + Importa metas e vendas Abr/Mai 2026
-- Data: 2026-05-27
-- ================================================================

-- 1. Remover constraints antigas (ambos os possíveis nomes)
ALTER TABLE comercial_metas DROP CONSTRAINT IF EXISTS comercial_metas_tipo_check;
ALTER TABLE comercial_metas DROP CONSTRAINT IF EXISTS metas_tipo_check;

-- 2. Adicionar nova constraint incluindo 'faturamento'
ALTER TABLE comercial_metas
  ADD CONSTRAINT comercial_metas_tipo_check
  CHECK (tipo IN ('produto', 'acao_comercial', 'faturamento'));

-- 3. Metas Produtos — Abril 2026
INSERT INTO comercial_metas
  (produto, tipo, status, mes_referencia, valor_meta, realizado_quantidade, valor_unitario, observacao, data_inicio_meta, data_fim_meta, created_at, updated_at)
VALUES
  ('Nova implantação – Outras marcas',                                           'produto', 'ativo', 'abr-2026',   1, NULL, 6000, NULL, NULL, NULL, NOW(), NOW()),
  ('Nova implantação – HNK',                                                     'produto', 'ativo', 'abr-2026',   6, NULL, NULL, NULL, NULL, NULL, NOW(), NOW()),
  ('FlexX Promo',                                                                'produto', 'ativo', 'abr-2026', 300, NULL,   62, NULL, NULL, NULL, NOW(), NOW()),
  ('FlexX Sales',                                                                'produto', 'ativo', 'abr-2026', 150, NULL,   40, NULL, NULL, NULL, NOW(), NOW()),
  ('GO',                                                                         'produto', 'ativo', 'abr-2026',  50, NULL,   25, NULL, NULL, NULL, NOW(), NOW()),
  ('Agente de IA – Sugestão de pedidos / Reconhecimento de imagem',              'produto', 'ativo', 'abr-2026',   6, NULL, NULL, NULL, NULL, NULL, NOW(), NOW())
ON CONFLICT (produto, tipo, mes_referencia) DO NOTHING;

-- 4. Metas Produtos — Maio 2026
INSERT INTO comercial_metas
  (produto, tipo, status, mes_referencia, valor_meta, realizado_quantidade, valor_unitario, observacao, data_inicio_meta, data_fim_meta, created_at, updated_at)
VALUES
  ('Nova implantação – Outras marcas',                                           'produto', 'ativo', 'mai-2026',   1, NULL,  6000, NULL, NULL, NULL, NOW(), NOW()),
  ('Nova implantação – HNK',                                                     'produto', 'ativo', 'mai-2026',   1, NULL, 10000, NULL, NULL, NULL, NOW(), NOW()),
  ('FlexX Promo',                                                                'produto', 'ativo', 'mai-2026', 400, NULL,    62, NULL, NULL, NULL, NOW(), NOW()),
  ('FlexX Sales',                                                                'produto', 'ativo', 'mai-2026', 400, NULL,    40, NULL, NULL, NULL, NOW(), NOW()),
  ('GO',                                                                         'produto', 'ativo', 'mai-2026',  80, NULL,    25, NULL, NULL, NULL, NOW(), NOW()),
  ('Agente de IA – Sugestão de pedidos / Reconhecimento de imagem',              'produto', 'ativo', 'mai-2026',   6, NULL,  NULL, NULL, NULL, NULL, NOW(), NOW())
ON CONFLICT (produto, tipo, mes_referencia) DO NOTHING;

-- 5. Vendas Produtos — Abril e Maio 2026
INSERT INTO comercial_vendas
  (deal_title, organization, observation, deal_value, closed_date, period_month, source_sheet, created_at)
VALUES
  ('Pam Dist. - ERP completo',                                       'Outros',          'Novo Cliente',                             18400.00, '2026-04-30', '2026-04', 'Venda_Produtos', NOW()),
  ('Dist. Lopes - Licença Consulta, sem edição de dados - D.C',      'Garoto (Nestlé)', '',                                        10560.00, '2026-04-30', '2026-04', 'Venda_Produtos', NOW()),
  ('Renovação Contratual Anual - Clientes - Abril/2026',             'Flag',            'Novo Cliente',                              2581.32, '2026-04-23', '2026-04', 'Venda_Produtos', NOW()),
  ('Renovação Contratual Anual - Clientes - Mar/26',                 'Flag',            'Novo Cliente',                              8529.12, '2026-04-23', '2026-04', 'Venda_Produtos', NOW()),
  ('Faturamento Merchan - Extra Nestlé',                             'Nestlé',          'Novo Cliente',                              7770.62, '2026-04-10', '2026-04', 'Venda_Produtos', NOW()),
  ('Alegari - ERP Completo',                                         'Flag',            'Novo Cliente',                             63380.00, '2026-04-23', '2026-04', 'Venda_Produtos', NOW()),
  ('Nestlé Merchan | Faturamento Maio 2026',                         'Flag',            'Receita Recorrente / Faturamento Mensal',   7009.86, '2026-05-21', '2026-05', 'Venda_Produtos', NOW());
