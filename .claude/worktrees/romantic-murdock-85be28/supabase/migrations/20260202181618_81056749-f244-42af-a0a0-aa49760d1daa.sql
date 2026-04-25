-- Tabela de mapeamento de domínios para networks
CREATE TABLE IF NOT EXISTS public.domain_network_mapping (
  id SERIAL PRIMARY KEY,
  email_domain VARCHAR(255) NOT NULL UNIQUE,
  network_id BIGINT REFERENCES public.networks(id) ON DELETE CASCADE,
  default_role app_role DEFAULT 'operacional',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.domain_network_mapping ENABLE ROW LEVEL SECURITY;

-- Policy: Apenas admins podem ver/modificar
CREATE POLICY "Admins can manage domain mappings"
ON public.domain_network_mapping
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Função de auto-provisioning para novos usuários
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_domain TEXT;
  v_mapping RECORD;
BEGIN
  -- Extrair domínio do email
  v_domain := SPLIT_PART(NEW.email, '@', 2);
  
  -- Buscar mapeamento
  SELECT * INTO v_mapping 
  FROM public.domain_network_mapping 
  WHERE email_domain = v_domain;
  
  -- Criar profile
  INSERT INTO public.profiles (user_id, full_name, network_id)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      SPLIT_PART(NEW.email, '@', 1)
    ),
    v_mapping.network_id
  )
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      network_id = COALESCE(public.profiles.network_id, EXCLUDED.network_id);
  
  -- Criar role padrão (apenas se não existir)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE(v_mapping.default_role, 'operacional'))
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger para novos usuários
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();