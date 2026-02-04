
-- Corrigir profiles sem network_id - atribuir à network 1 (única existente)
UPDATE public.profiles 
SET network_id = 1 
WHERE network_id IS NULL;
