-- Corrigir get_user_role para retornar a role de maior privilégio
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role 
  FROM public.user_roles 
  WHERE user_id = p_user_id 
  ORDER BY 
    CASE role 
      WHEN 'admin' THEN 1 
      WHEN 'gestao' THEN 2 
      WHEN 'qualidade' THEN 3 
      WHEN 'operacional' THEN 4 
    END
  LIMIT 1;
$$;