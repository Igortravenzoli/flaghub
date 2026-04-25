CREATE TABLE public.comercial_vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_title text,
  organization text,
  observation text,
  deal_value numeric(12,2),
  closed_date timestamptz,
  period_month date,
  source_sheet text,
  batch_id uuid REFERENCES public.manual_import_batches(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comercial_vendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read comercial_vendas"
  ON public.comercial_vendas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert comercial_vendas"
  ON public.comercial_vendas FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update comercial_vendas"
  ON public.comercial_vendas FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete comercial_vendas"
  ON public.comercial_vendas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));