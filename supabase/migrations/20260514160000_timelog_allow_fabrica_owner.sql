-- Permite que owners da area 'fabrica' aprovem/rejeitem lancamentos de timelog
-- (alem dos admins globais). Mantem mesma semantica da RPC original.

CREATE OR REPLACE FUNCTION public.rpc_timelog_set_status(
    p_queue_id  uuid,
    p_action    text,
    p_reason    text DEFAULT NULL
)
RETURNS public.timelog_post_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_caller uuid := auth.uid();
    v_is_admin boolean;
    v_row public.timelog_post_queue%ROWTYPE;
    v_new_status text;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Autenticação obrigatória.' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.hub_user_global_roles
         WHERE user_id = v_caller AND role = 'admin'
        UNION ALL
        SELECT 1 FROM public.user_roles
         WHERE user_id = v_caller AND role = 'admin'
        UNION ALL
        SELECT 1
          FROM public.hub_area_members m
          JOIN public.hub_areas a ON a.id = m.area_id
         WHERE m.user_id = v_caller
           AND m.area_role = 'owner'
           AND a.key = 'fabrica'
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Apenas admins ou owner da Fábrica podem aprovar/rejeitar lançamentos.' USING ERRCODE = '42501';
    END IF;

    v_new_status := CASE p_action
        WHEN 'approve' THEN 'approved'
        WHEN 'reject'  THEN 'rejected'
        WHEN 'reset'   THEN 'pending'
        ELSE NULL
    END;

    IF v_new_status IS NULL THEN
        RAISE EXCEPTION 'Ação inválida: %.', p_action USING ERRCODE = '22023';
    END IF;

    UPDATE public.timelog_post_queue
       SET status         = v_new_status,
           approved_by    = CASE WHEN v_new_status = 'approved' THEN v_caller ELSE approved_by END,
           approved_at    = CASE WHEN v_new_status = 'approved' THEN now()    ELSE approved_at END,
           error_message  = coalesce(p_reason, error_message)
     WHERE id = p_queue_id
     RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item de fila não encontrado: %.', p_queue_id USING ERRCODE = 'P0002';
    END IF;

    RETURN v_row;
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_timelog_set_status(uuid, text, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_timelog_set_status(uuid, text, text) TO authenticated;
