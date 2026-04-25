
-- Replace mark_tickets_inactive with delete_tickets_by_network for expurgo
CREATE OR REPLACE FUNCTION public.delete_tickets_by_network(p_network_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.tickets
  WHERE network_id = p_network_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
