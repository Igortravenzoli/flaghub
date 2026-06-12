-- ================================================================
-- MIGRAÇÃO: comercial_venda_itens — produtos/quantidades por venda
-- Permite que uma venda declare quais produtos e quantas unidades
-- foram vendidas; a Qtd Realizada da Meta Produtos passa a ser
-- calculada em tempo real (manual + vendas), sem dupla digitação.
-- Data: 2026-06-10
-- ================================================================

CREATE TABLE IF NOT EXISTS comercial_venda_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES comercial_vendas(id) ON DELETE CASCADE,
  produto text NOT NULL,
  quantidade integer NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venda_itens_venda ON comercial_venda_itens (venda_id);
CREATE INDEX IF NOT EXISTS idx_venda_itens_produto ON comercial_venda_itens (produto);

-- RLS espelhando comercial_vendas
ALTER TABLE comercial_venda_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venda_itens_select_restricted" ON comercial_venda_itens;
CREATE POLICY "venda_itens_select_restricted"
  ON comercial_venda_itens FOR SELECT TO authenticated
  USING (
    hub_is_admin() OR EXISTS (
      SELECT 1
      FROM hub_area_members m
      JOIN hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key = 'comercial'
    )
  );

DROP POLICY IF EXISTS "Admins can insert venda_itens" ON comercial_venda_itens;
CREATE POLICY "Admins can insert venda_itens"
  ON comercial_venda_itens FOR INSERT TO authenticated
  WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update venda_itens" ON comercial_venda_itens;
CREATE POLICY "Admins can update venda_itens"
  ON comercial_venda_itens FOR UPDATE TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete venda_itens" ON comercial_venda_itens;
CREATE POLICY "Admins can delete venda_itens"
  ON comercial_venda_itens FOR DELETE TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));
