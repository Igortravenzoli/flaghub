
-- 1. Remover constraint unique que impede re-importação
ALTER TABLE public.imports DROP CONSTRAINT IF EXISTS imports_network_id_file_hash_key;

-- 2. Atualizar get_recent_batches para incluir nome do usuário
DROP FUNCTION IF EXISTS public.get_recent_batches(integer, integer);

CREATE FUNCTION public.get_recent_batches(p_network_id integer, p_limit integer DEFAULT 20)
 RETURNS TABLE(
   id integer, 
   batch_name character varying, 
   status character varying, 
   total_files integer, 
   total_records integer, 
   errors_count integer, 
   warnings_count integer, 
   clear_before_import boolean, 
   created_at timestamp with time zone, 
   completed_at timestamp with time zone, 
   imported_by_email character varying,
   imported_by_name text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.batch_name,
    b.status,
    b.total_files,
    b.total_records,
    b.errors_count,
    b.warnings_count,
    b.clear_before_import,
    b.created_at,
    b.completed_at,
    u.email as imported_by_email,
    p.full_name as imported_by_name
  FROM public.import_batches b
  LEFT JOIN auth.users u ON b.imported_by = u.id
  LEFT JOIN public.profiles p ON b.imported_by = p.user_id
  WHERE b.network_id = p_network_id
  ORDER BY b.created_at DESC
  LIMIT p_limit;
END;
$function$;
