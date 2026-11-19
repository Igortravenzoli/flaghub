-- Volta da SEC10 (20261118120000): tira o gatilho e a função. Não há dado a restaurar.
SET lock_timeout = '3s';
DROP TRIGGER IF EXISTS protect_profile_network_id_trigger ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profile_network_id();
RESET lock_timeout;
