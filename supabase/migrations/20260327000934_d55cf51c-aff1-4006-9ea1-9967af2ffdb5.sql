-- =============================================================
-- FIX: Restrict overly permissive SELECT policies
-- Security scan found 5 ERROR + 3 WARN level issues
-- =============================================================

-- 1. alert_channels: restrict SELECT to admins only (config may contain webhook URLs/secrets)
DROP POLICY IF EXISTS "alert_channels_select_auth" ON public.alert_channels;
CREATE POLICY "alert_channels_select_admin"
  ON public.alert_channels FOR SELECT TO authenticated
  USING (public.hub_is_admin());

-- 2. devops_lead_area_map: restrict SELECT to admins or area members (exposes lead_email)
DROP POLICY IF EXISTS "Authenticated users can read lead area map" ON public.devops_lead_area_map;
CREATE POLICY "lead_area_map_select_restricted"
  ON public.devops_lead_area_map FOR SELECT TO authenticated
  USING (
    public.hub_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hub_area_members m
      JOIN public.hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key = devops_lead_area_map.area_key
    )
  );

-- 3. comercial_pesquisa_satisfacao: restrict to admin or comercial area members
DROP POLICY IF EXISTS "Authenticated users can read comercial_pesquisa_satisfacao" ON public.comercial_pesquisa_satisfacao;
CREATE POLICY "comercial_pesquisa_select_restricted"
  ON public.comercial_pesquisa_satisfacao FOR SELECT TO authenticated
  USING (
    public.hub_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hub_area_members m
      JOIN public.hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key = 'comercial'
    )
  );

-- 4. comercial_movimentacao_clientes: restrict to admin or comercial area members
DROP POLICY IF EXISTS "Authenticated users can read comercial_movimentacao_clientes" ON public.comercial_movimentacao_clientes;
CREATE POLICY "comercial_movimentacao_select_restricted"
  ON public.comercial_movimentacao_clientes FOR SELECT TO authenticated
  USING (
    public.hub_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hub_area_members m
      JOIN public.hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key = 'comercial'
    )
  );

-- 5. comercial_vendas: restrict to admin or comercial area members
DROP POLICY IF EXISTS "Authenticated users can read comercial_vendas" ON public.comercial_vendas;
CREATE POLICY "comercial_vendas_select_restricted"
  ON public.comercial_vendas FOR SELECT TO authenticated
  USING (
    public.hub_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hub_area_members m
      JOIN public.hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key = 'comercial'
    )
  );

-- 6. helpdesk_dashboard_snapshots: restrict to admin or helpdesk area members
DROP POLICY IF EXISTS "helpdesk_snap_select_auth" ON public.helpdesk_dashboard_snapshots;
CREATE POLICY "helpdesk_snap_select_restricted"
  ON public.helpdesk_dashboard_snapshots FOR SELECT TO authenticated
  USING (
    public.hub_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hub_area_members m
      JOIN public.hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key IN ('helpdesk', 'tickets_os')
    )
    OR EXISTS (
      SELECT 1 FROM public.hub_area_inheritance ai
      JOIN public.hub_areas parent ON parent.key = ai.parent_area_key
      JOIN public.hub_area_members m ON m.area_id = parent.id
      WHERE ai.child_area_key IN ('helpdesk', 'tickets_os')
        AND m.user_id = (SELECT auth.uid())
        AND m.is_active = true
    )
  );

-- 7. devops_time_logs: fix redundant condition (hub_is_admin() OR true → always true)
DROP POLICY IF EXISTS "devops_time_logs_select_auth" ON public.devops_time_logs;
CREATE POLICY "devops_time_logs_select_restricted"
  ON public.devops_time_logs FOR SELECT TO authenticated
  USING (
    public.hub_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hub_area_members m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
    )
  );