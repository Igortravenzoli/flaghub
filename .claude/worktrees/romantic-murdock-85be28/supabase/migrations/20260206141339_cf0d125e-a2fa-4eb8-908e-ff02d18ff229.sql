
-- Adicionar coluna para armazenar payload completo do VDESK
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS vdesk_payload jsonb DEFAULT NULL;

-- Comentário para documentação
COMMENT ON COLUMN public.tickets.vdesk_payload IS 'Dados completos retornados pela API VDESK durante a correlação (cliente, bandeira, programador, sistema, componente, descrição, etc.)';
