DROP VIEW IF EXISTS public.vw_comercial_clientes_ativos;

CREATE VIEW public.vw_comercial_clientes_ativos
WITH (security_invoker = true) AS
SELECT 
  id, 
  nome, 
  apelido, 
  status, 
  CASE bandeira 
    WHEN 'O' THEN 'Outros'
    WHEN 'N' THEN 'Nestlé'
    WHEN 'H' THEN 'Heineken'
    WHEN '1' THEN 'DPA'
    WHEN '2' THEN 'Garoto'
    WHEN 'D' THEN 'Danone'
    WHEN 'B' THEN 'Brahma'
    WHEN 'E' THEN 'Pakera'
    WHEN '4' THEN 'Nespresso'
    WHEN '5' THEN 'Froneri'
    WHEN '3' THEN 'Bebidas'
    WHEN 'A' THEN 'Ambev'
    WHEN 'F' THEN 'Flag'
    WHEN 'G' THEN 'General Mills'
    WHEN 'P' THEN 'Pepsico'
    WHEN 'R' THEN 'Red Bull'
    WHEN 'S' THEN 'Schincariol'
    WHEN 'Y' THEN 'Yoki'
    ELSE COALESCE(bandeira, 'Não Definido')
  END AS bandeira,
  bandeira AS bandeira_cod,
  sistemas_label, 
  sistemas, 
  synced_at
FROM vdesk_clients;