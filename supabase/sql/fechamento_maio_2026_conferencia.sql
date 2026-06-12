-- ================================================================
-- CONFERÊNCIA FECHAMENTO MAIO/2026 — correções pendentes
-- Fonte: planilha "Fechamento Maio26, Perda e ganho 2026.xlsx"
-- Gerado em 2026-06-11. NÃO aplicado automaticamente — revisar e
-- executar no SQL Editor do Supabase (projeto nxmgppfyltwsqryfxkbm).
-- ================================================================

-- ----------------------------------------------------------------
-- 1) VENDAS MAIO: remover duplicata do Nestlé Merchan
--    Banco tem 2 lançamentos de R$ 7.009,86; planilha tem 1.
--    Mantém o original de 21/05 e remove o recadastro de 29/05.
--    (Após executar: total de maio = R$ 249.846,36, igual à planilha)
-- ----------------------------------------------------------------
DELETE FROM comercial_vendas
 WHERE deal_title = 'Nestlé Merchan | Faturamento'
   AND deal_value = 7009.86
   AND closed_date::date = '2026-05-29';

-- Corrige a organização do original (planilha: Nestlé; banco: Flag)
UPDATE comercial_vendas
   SET organization = 'Nestlé'
 WHERE deal_title = 'Nestlé Merchan | Faturamento Maio 2026'
   AND organization = 'Flag';

-- Normaliza period_month para o dia 1 do mês (lançamentos de 29/05)
UPDATE comercial_vendas
   SET period_month = date_trunc('month', period_month)::date
 WHERE period_month IS NOT NULL
   AND period_month <> date_trunc('month', period_month)::date;

-- ----------------------------------------------------------------
-- 2) AGENTE DE IA: limpar anotação de migração e restaurar a meta
--    monetária de mai/2026 (49.600 foi zerada por um update antigo)
-- ----------------------------------------------------------------
UPDATE comercial_metas
   SET observacao = NULL,
       updated_at = now()
 WHERE produto ILIKE '%Agente de IA%'
   AND observacao ~* '^meta em (r\$|milhares)';

UPDATE comercial_metas
   SET meta_valor_total = 49600,
       updated_at = now()
 WHERE produto ILIKE '%Agente de IA%'
   AND mes_referencia = 'mai-2026'
   AND meta_valor_total IS NULL;

-- ----------------------------------------------------------------
-- 3) METAS DE FATURAMENTO Q2: normalizar para 110k/mês
--    (abr=330.000 e jun=10.840.000 foram criadas pelo cadastro
--    trimestral que falhou; decisão: 110k em cada mês)
-- ----------------------------------------------------------------
UPDATE comercial_metas
   SET valor_meta = 110000,
       updated_at = now()
 WHERE tipo = 'faturamento'
   AND mes_referencia IN ('abr-2026', 'jun-2026')
   AND valor_meta <> 110000;

-- ----------------------------------------------------------------
-- 4) GANHOS 2026 FALTANTES (planilha "Ganho 2026" → movimentação)
--    Banco tem 5 de 8; faltam Alegari, Pam e Serrana.
--    valor_mensal = mensalidade da planilha.
-- ----------------------------------------------------------------
INSERT INTO comercial_movimentacao_clientes
  (cliente_codigo, cliente_nome, tipo, data_evento, sistema, bandeira, motivo, valor_mensal, status_encerramento, ano_referencia)
VALUES
  (NULL, 'Alegari Distribuidora', 'ganho', '2026-04-01', NULL, 'Outros',   'Recorrente', 2500, NULL, 2026),
  (NULL, 'Pam Distribuidora',     'ganho', '2026-04-01', NULL, 'Outros',   'Recorrente', 1200, NULL, 2026),
  (NULL, 'Serrana Distribuidora', 'ganho', '2026-05-01', NULL, 'Heineken', 'Recorrente', 4040, NULL, 2026);

-- ----------------------------------------------------------------
-- 5) PERDAS 2026 FALTANTES (planilha "Perda 2026" — 9 formalizadas,
--    nenhuma lançada no banco)
-- ----------------------------------------------------------------
INSERT INTO comercial_movimentacao_clientes
  (cliente_codigo, cliente_nome, tipo, data_evento, sistema, bandeira, motivo, valor_mensal, status_encerramento, ano_referencia)
VALUES
  ('900101', 'Central B. Condeuba',  'perda', '2026-03-31', 'ERP FlexX', 'Outros', 'Encerrou atividade',                                            1290.00, 'Formalizado', 2026),
  ('90053',  'Carvalho Serro',       'perda', '2026-03-31', 'ERP FlexX', 'Outros', 'Encerrou atividade',                                            1193.20, 'Formalizado', 2026),
  ('90082',  'Carvalho Guanhaes',    'perda', '2026-03-31', 'ERP FlexX', 'Outros', 'Encerrou atividade - Base sem faturamento - Negociação Flag',      0.00, 'Formalizado', 2026),
  ('90081',  'Carvalho Curvelo',     'perda', '2026-03-31', 'ERP FlexX', 'Outros', 'Encerrou atividade - Base sem faturamento - Negociação Flag',      0.00, 'Formalizado', 2026),
  ('90080',  'Carvalho Brasilandia', 'perda', '2026-03-31', 'ERP FlexX', 'Outros', 'Encerrou atividade - Base sem faturamento - Negociação Flag',      0.00, 'Formalizado', 2026),
  ('900101', 'RD Comércio',          'perda', '2026-03-31', 'ERP FlexX', 'Outros', 'Encerrou atividade',                                            1290.00, 'Formalizado', 2026),
  ('181800', 'Distribuidora Lopes',  'perda', '2026-04-16', 'ERP FlexX', 'Garoto', 'Destituido pela Nestlé',                                        2839.50, 'Formalizado', 2026),
  ('182500', 'Friovel',              'perda', '2026-04-20', 'ERP FlexX', 'Garoto', 'Destituido pela Nestlé',                                        3450.06, 'Formalizado', 2026),
  ('90062',  'Genial Alimentos',     'perda', '2026-04-24', 'ERP FlexX', 'Outros', 'Encerrou atividade',                                            1546.77, 'Formalizado', 2026);

-- ----------------------------------------------------------------
-- CONFERÊNCIA PÓS-EXECUÇÃO
-- ----------------------------------------------------------------
-- Maio deve fechar em 249.846,36 (5 lançamentos):
SELECT COUNT(*) AS lancamentos, SUM(deal_value) AS total_maio
  FROM comercial_vendas
 WHERE period_month >= '2026-05-01' AND period_month < '2026-06-01';

-- Ganhos 2026 = 8 | Perdas 2026 = 9:
SELECT tipo, COUNT(*) FROM comercial_movimentacao_clientes
 WHERE ano_referencia = 2026 GROUP BY tipo;
