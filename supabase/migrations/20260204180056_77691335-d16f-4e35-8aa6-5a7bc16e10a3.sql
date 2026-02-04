
-- 1. Popular domain_network_mapping com o domínio flag.com.br
INSERT INTO public.domain_network_mapping (email_domain, network_id, default_role)
VALUES ('flag.com.br', 1, 'operacional')
ON CONFLICT (email_domain) DO NOTHING;

-- 2. Criar trigger para auto-provisioning de novos usuários
-- O trigger precisa ser criado no schema auth, ligado à tabela auth.users
-- Isso deve ser feito via Supabase Dashboard SQL Editor com permissões elevadas
-- Porém, podemos criar uma função que é chamada manualmente ou via webhook

-- Vamos criar uma função que pode ser chamada para provisionar usuário manualmente
CREATE OR REPLACE FUNCTION public.provision_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_domain TEXT;
  v_mapping RECORD;
  v_result JSONB;
BEGIN
  -- Buscar dados do usuário via auth.users
  SELECT id, email, raw_user_meta_data INTO v_user
  FROM auth.users
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Extrair domínio do email
  v_domain := SPLIT_PART(v_user.email, '@', 2);
  
  -- Buscar mapeamento
  SELECT * INTO v_mapping 
  FROM public.domain_network_mapping 
  WHERE email_domain = v_domain;
  
  -- Criar/Atualizar profile
  INSERT INTO public.profiles (user_id, full_name, network_id)
  VALUES (
    v_user.id,
    COALESCE(
      v_user.raw_user_meta_data->>'full_name',
      v_user.raw_user_meta_data->>'name',
      SPLIT_PART(v_user.email, '@', 1)
    ),
    v_mapping.network_id
  )
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = COALESCE(
        EXCLUDED.full_name, 
        public.profiles.full_name
      ),
      network_id = COALESCE(
        public.profiles.network_id, 
        EXCLUDED.network_id
      );
  
  -- Criar role padrão (apenas se não existir)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user.id, COALESCE(v_mapping.default_role, 'operacional'))
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN jsonb_build_object(
    'success', true, 
    'user_id', v_user.id,
    'email', v_user.email,
    'network_id', v_mapping.network_id,
    'role', COALESCE(v_mapping.default_role, 'operacional')
  );
END;
$$;

-- Conceder permissão para authenticated users chamarem a função
GRANT EXECUTE ON FUNCTION public.provision_user(UUID) TO authenticated;
