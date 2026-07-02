-- =============================================================
-- Funil de Vendas Comercial: etapas (categorias) e quantitativos
-- Dois funis: SDR (Geral) e Comercial (Geral).
-- Leitura: autenticados · Escrita: admin OU owner/operacional da área.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.comercial_funil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funil text NOT NULL CHECK (funil IN ('sdr', 'comercial')),
  etapa text NOT NULL,
  icone text,
  ordem int NOT NULL DEFAULT 0,
  quantidade int NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funil, etapa)
);

ALTER TABLE public.comercial_funil ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comercial_funil_select" ON public.comercial_funil;
CREATE POLICY "comercial_funil_select" ON public.comercial_funil
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "comercial_funil_write" ON public.comercial_funil;
CREATE POLICY "comercial_funil_write" ON public.comercial_funil
FOR ALL TO authenticated
USING (
  hub_is_admin() OR EXISTS (
    SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
      AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
  )
)
WITH CHECK (
  hub_is_admin() OR EXISTS (
    SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
    WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
      AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
  )
);

-- Seed das etapas padrão (idempotente)
INSERT INTO public.comercial_funil (funil, etapa, icone, ordem) VALUES
  ('sdr', 'Lead Captado',             '🎯', 1),
  ('sdr', 'Mineração (FIT)',          '🔎', 2),
  ('sdr', 'Decisor Identificado',     '👤', 3),
  ('sdr', 'Primeiro Contato',         '📞', 4),
  ('sdr', 'Qualificação',             '💬', 5),
  ('sdr', 'Oportunidade Gerada',      '✅', 6),
  ('sdr', 'Transferido ao Comercial', '🤝', 7),
  ('comercial', 'Oportunidade Recebida', '📥', 1),
  ('comercial', 'Diagnóstico',           '🧩', 2),
  ('comercial', 'Demonstração',          '🖥️', 3),
  ('comercial', 'Proposta Comercial',    '📄', 4),
  ('comercial', 'Negociação',            '🤝', 5),
  ('comercial', 'Cliente Fechado',       '🏆', 6)
ON CONFLICT (funil, etapa) DO NOTHING;
