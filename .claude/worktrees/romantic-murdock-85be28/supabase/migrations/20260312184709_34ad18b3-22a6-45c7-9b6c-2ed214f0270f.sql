CREATE OR REPLACE VIEW public.vw_comercial_clientes_ativos AS
SELECT id, nome, apelido, status, bandeira, sistemas_label, sistemas, synced_at
FROM vdesk_clients;