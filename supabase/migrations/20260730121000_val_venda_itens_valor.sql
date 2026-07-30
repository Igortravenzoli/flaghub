-- =============================================================================
-- VAL — Valor nos produtos vendidos (reunião com Miller, 29/07/2026)
--
-- "Adicionar uma coluna de valor nos produtos vendidos para calcular
--  automaticamente o valor total (quantidade × valor unitário), permitindo
--  edição manual quando necessário."
--
-- Regra de leitura: valor_efetivo = COALESCE(valor_total, quantidade * valor_unitario)
--   - valor_unitario: preço da unidade (pré-preenchido a partir da meta do mês)
--   - valor_total: override manual — só é gravado quando o usuário corrige a conta
--
-- ⚠ NÃO é fonte de faturamento. `comercial_vendas.deal_value` continua sendo o
-- valor do contrato (decisão D5 do PLANO_AJUSTES_COMERCIAL_30-07); a soma dos
-- itens é conferência, e a divergência é EXIBIDA, nunca corrigida em silêncio.
-- Inverter isso exigiria recalcular todo o histórico de faturamento.
-- =============================================================================

ALTER TABLE public.comercial_venda_itens
  ADD COLUMN IF NOT EXISTS valor_unitario numeric NULL,
  ADD COLUMN IF NOT EXISTS valor_total    numeric NULL;

COMMENT ON COLUMN public.comercial_venda_itens.valor_unitario IS
  'Preço unitário do item. Sugerido a partir de comercial_metas.valor_unitario do mês.';
COMMENT ON COLUMN public.comercial_venda_itens.valor_total IS
  'Override manual do total do item. Quando NULL, o total é quantidade * valor_unitario.';

-- Backfill do que dá para inferir sem chutar: unitário da meta do mesmo produto
-- e mesmo mês de referência da venda. Itens sem meta correspondente ficam NULL
-- (aparecem como "—" na tela, e não como zero — zero seria mentira).
UPDATE public.comercial_venda_itens i
   SET valor_unitario = m.valor_unitario
  FROM public.comercial_vendas v
  JOIN public.comercial_metas m
    ON m.tipo <> 'faturamento'
   AND m.valor_unitario IS NOT NULL
 WHERE i.venda_id = v.id
   AND i.valor_unitario IS NULL
   AND m.produto = i.produto
   AND m.mes_referencia = lower(
         (ARRAY['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'])[
           EXTRACT(MONTH FROM COALESCE(v.period_month, v.closed_date))::int
         ] || '-' || EXTRACT(YEAR FROM COALESCE(v.period_month, v.closed_date))::text
       );
