-- Add soft-delete column for imports (keeps audit trail)
ALTER TABLE public.imports
ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- Update get_imports_history to filter hidden imports
CREATE OR REPLACE FUNCTION public.get_imports_history(
  p_network_id bigint DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  id bigint,
  network_id bigint,
  imported_by uuid,
  file_name text,
  file_type text,
  status text,
  total_records integer,
  errors_count integer,
  warnings_count integer,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_network_id BIGINT;
BEGIN
  IF public.is_admin() THEN
    v_network_id := COALESCE(p_network_id, public.auth_network_id());
  ELSE
    v_network_id := public.auth_network_id();
  END IF;

  RETURN QUERY
  SELECT 
    i.id,
    i.network_id,
    i.imported_by,
    i.file_name,
    i.file_type,
    i.status,
    i.total_records,
    i.errors_count,
    i.warnings_count,
    i.created_at
  FROM public.imports i
  WHERE i.network_id = v_network_id
    AND i.is_hidden = false
  ORDER BY i.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Function to hide imports (soft delete) for a network
CREATE OR REPLACE FUNCTION public.hide_imports(p_network_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count integer;
BEGIN
  -- Only admin or gestao can hide imports
  IF NOT public.is_admin_or_gestao() THEN
    RAISE EXCEPTION 'Permission denied: only admin or gestao can hide imports';
  END IF;

  -- Only allow hiding imports for user's own network (unless admin)
  IF NOT public.is_admin() AND p_network_id != public.auth_network_id() THEN
    RAISE EXCEPTION 'Permission denied: cannot hide imports from other networks';
  END IF;

  UPDATE public.imports
  SET is_hidden = true
  WHERE network_id = p_network_id
    AND is_hidden = false;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;
