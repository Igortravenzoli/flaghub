-- Limpar dados de importação para reimportação de teste
-- Ordem: primeiro eventos, depois imports, depois batches, depois tickets

-- Limpar eventos de importação
DELETE FROM public.import_events;

-- Limpar importações
DELETE FROM public.imports;

-- Limpar lotes de importação
DELETE FROM public.import_batches;

-- Limpar todos os tickets
DELETE FROM public.tickets;