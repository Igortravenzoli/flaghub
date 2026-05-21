-- Tabela de metas comerciais + RPCs de CRUD seguro

CREATE TABLE IF NOT EXISTS public.comercial_metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('produto', 'acao_comercial')),
  status TEXT NOT NULL CHECK (status IN ('ativo', 'em_lancamento', 'batido_meta', 'nao_batido')),
  mes_referencia TEXT NOT NULL CHECK (mes_referencia ~ '^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)-[0-9]{4}$'),
  valor_meta NUMERIC NULL,
  observacao TEXT NULL,
  data_inicio_meta DATE NULL,
  data_fim_meta DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT comercial_metas_unique UNIQUE (produto, tipo, mes_referencia)
);

CREATE INDEX IF NOT EXISTS idx_comercial_metas_mes ON public.comercial_metas (mes_referencia);
CREATE INDEX IF NOT EXISTS idx_comercial_metas_status ON public.comercial_metas (status);

ALTER TABLE public.comercial_metas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comercial_metas_select_anon" ON public.comercial_metas;
DROP POLICY IF EXISTS "comercial_metas_select_authenticated" ON public.comercial_metas;

CREATE POLICY "comercial_metas_select_anon"
  ON public.comercial_metas
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "comercial_metas_select_authenticated"
  ON public.comercial_metas
  FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.set_comercial_metas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_set_comercial_metas_updated_at ON public.comercial_metas;
CREATE TRIGGER tr_set_comercial_metas_updated_at
  BEFORE UPDATE ON public.comercial_metas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_comercial_metas_updated_at();

DROP FUNCTION IF EXISTS public.insert_meta_comercial(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, DATE);
DROP FUNCTION IF EXISTS public.update_meta_comercial(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, DATE);
DROP FUNCTION IF EXISTS public.delete_meta_comercial(UUID);

CREATE OR REPLACE FUNCTION public.insert_meta_comercial(
  p_produto TEXT,
  p_tipo TEXT,
  p_status TEXT,
  p_mes_referencia TEXT,
  p_valor_meta NUMERIC DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL,
  p_data_inicio_meta DATE DEFAULT NULL,
  p_data_fim_meta DATE DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  produto TEXT,
  tipo TEXT,
  status TEXT,
  mes_referencia TEXT,
  valor_meta NUMERIC,
  observacao TEXT,
  data_inicio_meta DATE,
  data_fim_meta DATE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.comercial_metas (
    produto, tipo, status, mes_referencia, valor_meta, observacao, data_inicio_meta, data_fim_meta
  )
  VALUES (
    p_produto, p_tipo, p_status, lower(p_mes_referencia), p_valor_meta, p_observacao, p_data_inicio_meta, p_data_fim_meta
  )
  RETURNING comercial_metas.id INTO v_id;

  RETURN QUERY
  SELECT cm.id, cm.produto, cm.tipo, cm.status, cm.mes_referencia, cm.valor_meta, cm.observacao, cm.data_inicio_meta, cm.data_fim_meta, cm.created_at, cm.updated_at
  FROM public.comercial_metas cm
  WHERE cm.id = v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_meta_comercial(
  p_id UUID,
  p_produto TEXT DEFAULT NULL,
  p_tipo TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_mes_referencia TEXT DEFAULT NULL,
  p_valor_meta NUMERIC DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL,
  p_data_inicio_meta DATE DEFAULT NULL,
  p_data_fim_meta DATE DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  produto TEXT,
  tipo TEXT,
  status TEXT,
  mes_referencia TEXT,
  valor_meta NUMERIC,
  observacao TEXT,
  data_inicio_meta DATE,
  data_fim_meta DATE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  UPDATE public.comercial_metas cm
  SET
    produto = COALESCE(p_produto, cm.produto),
    tipo = COALESCE(p_tipo, cm.tipo),
    status = COALESCE(p_status, cm.status),
    mes_referencia = COALESCE(lower(p_mes_referencia), cm.mes_referencia),
    valor_meta = COALESCE(p_valor_meta, cm.valor_meta),
    observacao = COALESCE(p_observacao, cm.observacao),
    data_inicio_meta = COALESCE(p_data_inicio_meta, cm.data_inicio_meta),
    data_fim_meta = COALESCE(p_data_fim_meta, cm.data_fim_meta)
  WHERE cm.id = p_id;

  RETURN QUERY
  SELECT cm.id, cm.produto, cm.tipo, cm.status, cm.mes_referencia, cm.valor_meta, cm.observacao, cm.data_inicio_meta, cm.data_fim_meta, cm.created_at, cm.updated_at
  FROM public.comercial_metas cm
  WHERE cm.id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.delete_meta_comercial(p_id UUID)
RETURNS TABLE (success BOOLEAN, message TEXT) AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM public.comercial_metas WHERE id = p_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN QUERY SELECT FALSE, 'Registro não encontrado';
  ELSE
    RETURN QUERY SELECT TRUE, 'Registro removido com sucesso';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.insert_meta_comercial TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_meta_comercial TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_meta_comercial TO authenticated;

GRANT EXECUTE ON FUNCTION public.insert_meta_comercial TO anon;
GRANT EXECUTE ON FUNCTION public.update_meta_comercial TO anon;
GRANT EXECUTE ON FUNCTION public.delete_meta_comercial TO anon;

-- Seed inicial
INSERT INTO public.comercial_metas (produto, tipo, status, mes_referencia, valor_meta, observacao, data_inicio_meta, data_fim_meta)
VALUES
  ('Nova implantação – Outras marcas', 'acao_comercial', 'ativo', 'abr-2026', 1, NULL, '2026-04-01', '2026-04-30'),
  ('Nova implantação – Outras marcas', 'acao_comercial', 'ativo', 'mai-2026', 1, NULL, '2026-05-01', '2026-05-31'),
  ('Nova implantação – HNK', 'acao_comercial', 'ativo', 'abr-2026', NULL, NULL, '2026-04-01', '2026-04-30'),
  ('Nova implantação – HNK', 'acao_comercial', 'ativo', 'mai-2026', 1, NULL, '2026-05-01', '2026-05-31'),
  ('FlexX Promo', 'produto', 'ativo', 'abr-2026', 300, NULL, '2026-04-01', '2026-04-30'),
  ('FlexX Promo', 'produto', 'ativo', 'mai-2026', 400, NULL, '2026-05-01', '2026-05-31'),
  ('FlexX Sales', 'produto', 'ativo', 'abr-2026', 150, NULL, '2026-04-01', '2026-04-30'),
  ('FlexX Sales', 'produto', 'ativo', 'mai-2026', 400, NULL, '2026-05-01', '2026-05-31'),
  ('GO', 'produto', 'ativo', 'abr-2026', 50, NULL, '2026-04-01', '2026-04-30'),
  ('GO', 'produto', 'ativo', 'mai-2026', 80, NULL, '2026-05-01', '2026-05-31'),
  ('Agente de IA – Sugestão de pedidos', 'produto', 'em_lancamento', 'abr-2026', 24800, 'Meta em milhares (24,8K)', '2026-04-01', '2026-04-30'),
  ('Agente de IA – Sugestão de pedidos', 'produto', 'em_lancamento', 'mai-2026', 49600, 'Meta em milhares (49,6K)', '2026-05-01', '2026-05-31'),
  ('Reconhecimento de imagem', 'produto', 'em_lancamento', 'abr-2026', NULL, 'Produto novo, meta a definir', '2026-04-01', '2026-04-30'),
  ('Reconhecimento de imagem', 'produto', 'em_lancamento', 'mai-2026', NULL, 'Produto novo, meta a definir', '2026-05-01', '2026-05-31')
ON CONFLICT (produto, tipo, mes_referencia) DO NOTHING;
