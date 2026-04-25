-- =====================================================
-- MIGRATION: Permitir inserção de tickets
-- Data: 2026-01-29
-- =====================================================

-- Adicionar política para permitir INSERT em tickets
-- Usuários autenticados podem inserir tickets na sua própria network
CREATE POLICY "Users can insert tickets in their network" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR network_id = public.auth_network_id()
  );

-- Adicionar política para permitir UPDATE em tickets
-- Usuários autenticados podem atualizar tickets na sua própria network
CREATE POLICY "Users can update tickets in their network" ON public.tickets
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR network_id = public.auth_network_id())
  WITH CHECK (public.is_admin() OR network_id = public.auth_network_id());

-- Política temporária para permitir acesso anônimo durante testes
-- ATENÇÃO: Remover em produção!
CREATE POLICY "Allow anonymous read for testing" ON public.tickets
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Allow anonymous insert for testing" ON public.tickets
  FOR INSERT TO anon
  WITH CHECK (true);
