ALTER TABLE public.comercial_movimentacao_clientes
DROP CONSTRAINT IF EXISTS comercial_movimentacao_clientes_tipo_check;

ALTER TABLE public.comercial_movimentacao_clientes
ADD CONSTRAINT comercial_movimentacao_clientes_tipo_check
CHECK (tipo = ANY (ARRAY['perda'::text, 'ganho'::text, 'risco'::text]));