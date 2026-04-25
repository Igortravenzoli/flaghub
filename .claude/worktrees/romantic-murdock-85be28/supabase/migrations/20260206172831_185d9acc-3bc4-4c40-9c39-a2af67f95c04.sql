
-- Expurgo completo da network 1
UPDATE public.tickets SET last_import_id = NULL WHERE network_id = 1;
DELETE FROM public.import_events WHERE import_id IN (SELECT id FROM public.imports WHERE network_id = 1);
DELETE FROM public.tickets WHERE network_id = 1;
DELETE FROM public.imports WHERE network_id = 1;
DELETE FROM public.import_batches WHERE network_id = 1;
