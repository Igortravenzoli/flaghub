
-- Comercial: Pesquisa de Satisfação
CREATE TABLE public.comercial_pesquisa_satisfacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_codigo integer,
  cliente_nome text,
  bandeira text,
  data_pesquisa date,
  responsavel_contato text,
  notas_por_produto jsonb DEFAULT '{}'::jsonb,
  qualitativo jsonb DEFAULT '{}'::jsonb,
  batch_id uuid REFERENCES public.manual_import_batches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cliente_codigo, data_pesquisa)
);

ALTER TABLE public.comercial_pesquisa_satisfacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read comercial_pesquisa_satisfacao"
  ON public.comercial_pesquisa_satisfacao FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert comercial_pesquisa_satisfacao"
  ON public.comercial_pesquisa_satisfacao FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update comercial_pesquisa_satisfacao"
  ON public.comercial_pesquisa_satisfacao FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete comercial_pesquisa_satisfacao"
  ON public.comercial_pesquisa_satisfacao FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Comercial: Movimentação de Clientes (Perdas/Ganhos)
CREATE TABLE public.comercial_movimentacao_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_codigo integer,
  cliente_nome text,
  tipo text NOT NULL CHECK (tipo IN ('perda', 'ganho')),
  data_evento date,
  sistema text,
  bandeira text,
  motivo text,
  valor_mensal numeric(12,2),
  status_encerramento text,
  ano_referencia integer,
  batch_id uuid REFERENCES public.manual_import_batches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cliente_codigo, data_evento, tipo)
);

ALTER TABLE public.comercial_movimentacao_clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read comercial_movimentacao_clientes"
  ON public.comercial_movimentacao_clientes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert comercial_movimentacao_clientes"
  ON public.comercial_movimentacao_clientes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update comercial_movimentacao_clientes"
  ON public.comercial_movimentacao_clientes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete comercial_movimentacao_clientes"
  ON public.comercial_movimentacao_clientes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
