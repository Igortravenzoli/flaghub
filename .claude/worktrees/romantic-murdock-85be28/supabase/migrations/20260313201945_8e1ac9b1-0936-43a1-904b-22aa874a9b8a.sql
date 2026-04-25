
-- Returns obfuscated role code instead of plain role name.
-- Mapping: admin→s1, gestao→s2, qualidade→s3, operacional→s4
CREATE OR REPLACE FUNCTION public.auth_user_role_masked()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT CASE public.auth_user_role()
    WHEN 'admin'       THEN 's1'
    WHEN 'gestao'      THEN 's2'
    WHEN 'qualidade'   THEN 's3'
    WHEN 'operacional' THEN 's4'
    ELSE NULL
  END;
$$;
