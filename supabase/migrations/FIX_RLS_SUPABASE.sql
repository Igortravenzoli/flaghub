-- =====================================================
-- EXECUTAR NO SUPABASE STUDIO → SQL EDITOR
-- =====================================================
-- Este script adiciona políticas RLS para permitir INSERT/UPDATE em tickets

-- 1. Adicionar política para permitir INSERT em tickets (usuários autenticados)
CREATE POLICY "Users can insert tickets in their network" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR network_id = public.auth_network_id()
  );

-- 2. Adicionar política para permitir UPDATE em tickets (usuários autenticados)
CREATE POLICY "Users can update tickets in their network" ON public.tickets
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR network_id = public.auth_network_id())
  WITH CHECK (public.is_admin() OR network_id = public.auth_network_id());

-- 3. Política para permitir acesso anônimo durante testes
-- ATENÇÃO: Estas políticas permitem acesso total anônimo - usar apenas em ambiente de testes!
CREATE POLICY "Allow anonymous read for testing" ON public.tickets
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Allow anonymous insert for testing" ON public.tickets
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous update for testing" ON public.tickets
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Verificar políticas criadas
SELECT schemaname, tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'tickets';
