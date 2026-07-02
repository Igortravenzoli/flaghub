-- =============================================================
-- Funil de Vendas: lançamentos mensais (visão mês a mês + histórico)
-- comercial_funil vira catálogo de etapas; quantitativos passam a
-- viver em comercial_funil_lancamentos (1 linha por etapa × mês).
-- =============================================================

CREATE TABLE IF NOT EXISTS public.comercial_funil_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id uuid NOT NULL REFERENCES public.comercial_funil(id) ON DELETE CASCADE,
  mes date NOT NULL,
  quantidade int NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (etapa_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_comercial_funil_lanc_mes ON public.comercial_funil_lancamentos (mes);

ALTER TABLE public.comercial_funil_lancamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comercial_funil_lanc_select" ON public.comercial_funil_lancamentos;
CREATE POLICY "comercial_funil_lanc_select" ON public.comercial_funil_lancamentos
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "comercial_funil_lanc_write" ON public.comercial_funil_lancamentos;
CREATE POLICY "comercial_funil_lanc_write" ON public.comercial_funil_lancamentos
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

-- Migra quantitativos já lançados no modelo antigo (coluna quantidade do
-- catálogo) para o mês corrente — idempotente e sem perder nada.
INSERT INTO public.comercial_funil_lancamentos (etapa_id, mes, quantidade)
SELECT id, date_trunc('month', now())::date, quantidade
FROM public.comercial_funil
WHERE quantidade > 0
ON CONFLICT (etapa_id, mes) DO NOTHING;
