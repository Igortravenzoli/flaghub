
# Plano: SSO com Microsoft Entra ID (Azure AD)

## Resumo

Implementar login com Single Sign-On usando Microsoft Entra ID (Azure AD), permitindo que colaboradores façam login com suas credenciais corporativas Microsoft.

---

## Esforço Estimado

| Etapa | Tempo |
|-------|-------|
| Configuração Azure Portal | 30-60 min |
| Configuração Supabase Dashboard | 15 min |
| Alterações no código | 2-3 horas |
| Trigger para auto-provisioning | 30 min |
| Testes | 1-2 horas |
| **Total** | **4-7 horas** |

---

## Pré-requisitos

1. **Acesso ao Azure Portal** com permissões para registrar aplicativos
2. **Tenant ID** do Azure AD da organização

---

## Etapa 1: Configuração no Azure Portal (Manual)

Acesse: https://portal.azure.com

### 1.1 Registrar Aplicativo

1. Navegue até **Microsoft Entra ID** > **App registrations**
2. Clique em **New registration**
3. Configure:
   - **Name**: `FLAG Painel Operacional`
   - **Supported account types**: Escolha conforme sua necessidade
   - **Redirect URI**: `https://nxmgppfyltwsqryfxkbm.supabase.co/auth/v1/callback`
4. Clique em **Register**

### 1.2 Obter Credenciais

1. Copie o **Application (client) ID**
2. Vá em **Certificates & secrets** > **New client secret**
3. Defina uma descrição e validade
4. Copie o **Value** do secret (não será exibido novamente!)

### 1.3 Configurar URL do Issuer

O formato da URL é:
```text
https://login.microsoftonline.com/{tenant-id}/v2.0
```

---

## Etapa 2: Configuração no Supabase Dashboard

Acesse: https://supabase.com/dashboard/project/nxmgppfyltwsqryfxkbm/auth/providers

1. Localize **Azure (Microsoft)** na lista de providers
2. Habilite o toggle
3. Preencha:
   - **Azure Client ID**: `(Application ID do passo 1.2)`
   - **Azure Client Secret**: `(Secret do passo 1.2)`
   - **Azure Tenant URL**: `https://login.microsoftonline.com/{tenant-id}/v2.0`
4. Salve

---

## Etapa 3: Alterações no Código

### 3.1 Atualizar Hook de Autenticação

Adicionar função `signInWithAzure` no `useAuth.ts`:

```typescript
const signInWithAzure = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email profile openid',
      redirectTo: window.location.origin + '/dashboard',
    }
  });
  return { data, error };
};
```

### 3.2 Atualizar Página de Login

Adicionar botão "Entrar com Microsoft" no `Login.tsx`:

- Botão com ícone Microsoft acima do formulário de email/senha
- Separador visual "ou" entre as opções
- Handler que chama `signInWithAzure()`

### 3.3 Layout Proposto

```text
┌─────────────────────────────────┐
│         FLAG Painel             │
│     Operacional                 │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │ 🪟  Entrar com Microsoft  │  │
│  └───────────────────────────┘  │
│                                 │
│  ────────── ou ──────────       │
│                                 │
│  [Entrar] [Cadastrar]           │
│                                 │
│  Email: ___________             │
│  Senha: ___________             │
│                                 │
│  [ Entrar ]                     │
└─────────────────────────────────┘
```

---

## Etapa 4: Auto-provisioning de Usuários SSO

Criar trigger no banco para criar automaticamente profile e role quando usuário fizer primeiro login via SSO.

### 4.1 Tabela de Mapeamento de Domínios

```sql
CREATE TABLE IF NOT EXISTS domain_network_mapping (
  id SERIAL PRIMARY KEY,
  email_domain VARCHAR(255) NOT NULL UNIQUE,
  network_id BIGINT REFERENCES networks(id),
  default_role app_role DEFAULT 'operacional',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 Função de Auto-provisioning

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_domain TEXT;
  v_mapping RECORD;
BEGIN
  -- Extrair domínio do email
  v_domain := SPLIT_PART(NEW.email, '@', 2);
  
  -- Buscar mapeamento
  SELECT * INTO v_mapping 
  FROM domain_network_mapping 
  WHERE email_domain = v_domain;
  
  -- Criar profile
  INSERT INTO profiles (user_id, full_name, network_id)
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
      network_id = COALESCE(profiles.network_id, EXCLUDED.network_id);
  
  -- Criar role padrão
  INSERT INTO user_roles (user_id, role)
  VALUES (NEW.id, COALESCE(v_mapping.default_role, 'operacional'))
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 4.3 Trigger

```sql
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_user();
```

---

## Etapa 5: Configurar Mapeamento de Domínios

Exemplo de inserção inicial:

```sql
INSERT INTO domain_network_mapping (email_domain, network_id, default_role)
VALUES 
  ('flag.com.br', 1, 'operacional'),
  ('empresa-cliente.com.br', 2, 'operacional');
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useAuth.ts` | Adicionar `signInWithAzure()` |
| `src/pages/Login.tsx` | Adicionar botão Microsoft + separador |
| Migração SQL | Trigger + tabela de mapeamento |

---

## Considerações de Segurança

1. **Roles são atribuídas como 'operacional' por padrão** - admins precisam ser promovidos manualmente via SQL
2. **O login por email/senha continuará funcionando** durante a transição
3. **Usuários SSO terão contas separadas** de usuários email/senha existentes
4. Considerar desabilitar auto-cadastro após migração completa

---

## Próximos Passos Opcionais

- Sincronizar grupos do Azure AD com roles do sistema
- Desabilitar login email/senha após migração
- Configurar logout único (Single Logout)
