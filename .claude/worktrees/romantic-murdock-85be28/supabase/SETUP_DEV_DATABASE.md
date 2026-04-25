# Setup FlagHubDB-Dev - Database de Desenvolvimento

Este guia explica como configurar o novo projeto Supabase **FlagHubDB-Dev** com todas as migrations da produção.

## 📋 Pré-requisitos

1. ✅ Projeto **FlagHubDB-Dev** criado no Supabase
2. ✅ Supabase CLI instalado (`npm install -g supabase`)
3. ✅ Credenciais de acesso ao projeto

## 🚀 Passo a Passo

### 1. Obter as credenciais do projeto DEV

Acesse o Supabase Dashboard do projeto **FlagHubDB-Dev**:
- **Settings** → **API**
- Copie:
  - `Project URL`
  - `anon/public key`
  - `service_role key` (secret)
- **Settings** → **Database**
  - Copie: `Connection string` (Direct)
  - Anote o `Database password`

### 2. Configurar projeto localmente

#### Opção A: Usando Supabase CLI (Recomendado)

```powershell
# Link com o projeto dev
cd "c:\Users\igor.cardoso.FLAG\OneDrive - FLAG INTELLIWAN (ISV)\Área de Trabalho\PASTAS\DEVOPS\Flag\FlagHub\operations-hub"
supabase link --project-ref [SEU_PROJECT_REF_DEV]
```

Você será solicitado a fazer login no Supabase se ainda não estiver autenticado.

#### Opção B: Atualizar config.toml manualmente

Edite `supabase/config.toml`:
```toml
project_id = "[SEU_PROJECT_REF_DEV]"

[functions.vdesk-proxy]
verify_jwt = false

[functions.consultar-vdesk]
verify_jwt = false
```

### 3. Aplicar todas as migrations

As migrations serão aplicadas em ordem cronológica:

```powershell
# Aplicar todas as migrations de uma vez
supabase db push

# OU aplicar migrations individuais se necessário
supabase db push --include-seed
```

### 4. Verificar migrations aplicadas

```powershell
# Ver histórico de migrations
supabase migration list
```

Ou no Supabase Studio:
- **Database** → **Migrations**

### 5. Fazer deploy das Edge Functions

```powershell
# Deploy de todas as functions
supabase functions deploy vdesk-proxy
supabase functions deploy consultar-vdesk
```

### 6. Configurar variáveis de ambiente no Supabase

Acesse **Edge Functions** → **Environment Variables** e adicione as mesmas variáveis de produção (com valores de dev/teste):

```
VDESK_API_URL=https://[sua_url_vdesk_dev]
VDESK_API_TOKEN=[seu_token_dev]
```

## 📦 Migrations Incluídas (em ordem)

1. `20260127193248` - Backend completo (tabelas, enums, tipos)
2. `20260127193308` - Fix RLS view dashboard
3. `20260127200000` - Correlation functions
4. `20260129000000` - Import batches and improvements
5. `20260129140000` - Allow ticket insert
6. E mais 23 migrations subsequentes...

### Migration especial: FIX_RLS_SUPABASE.sql

Este arquivo contém políticas RLS adicionais. **Importante**: Ele inclui políticas de teste que permitem acesso anônimo. 

Para ambiente de desenvolvimento, você pode aplicá-lo:
```powershell
# Executar no SQL Editor do Supabase Studio
# Copie o conteúdo de supabase/migrations/FIX_RLS_SUPABASE.sql
```

> ⚠️ **ATENÇÃO**: Não use as políticas de acesso anônimo em produção!

## 🔄 Sincronização Futura

### Para copiar mudanças de PROD → DEV:

1. **Criar nova migration em DEV primeiro**:
   ```powershell
   supabase migration new "descricao_da_mudanca"
   ```

2. **Testar em DEV**:
   ```powershell
   supabase db push
   ```

3. **Depois de validar, aplicar em PROD**:
   - Altere o `project_id` no config.toml para PROD
   - Execute: `supabase db push`

### Para gerar dump de dados de PROD para DEV:

```powershell
# Exportar dados de PROD
pg_dump "postgresql://postgres:[SENHA_PROD]@[HOST_PROD]:5432/postgres" \
  --data-only \
  --table=public.networks \
  --table=public.profiles \
  --table=public.status_mapping \
  > seed_prod_data.sql

# Importar em DEV
psql "postgresql://postgres:[SENHA_DEV]@[HOST_DEV]:5432/postgres" \
  < seed_prod_data.sql
```

## 🧪 Validação

Após aplicar todas as migrations, valide:

1. **Tabelas criadas**:
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```

2. **Enums criados**:
   ```sql
   SELECT typname 
   FROM pg_type 
   WHERE typtype = 'e';
   ```

3. **Functions criadas**:
   ```sql
   SELECT routine_name 
   FROM information_schema.routines 
   WHERE routine_schema = 'public';
   ```

4. **Políticas RLS**:
   ```sql
   SELECT schemaname, tablename, policyname 
   FROM pg_policies;
   ```

## 🔐 Configurar .env.local para desenvolvimento

Crie um arquivo `.env.local` na raiz do projeto:

```env
# FlagHubDB-Dev
VITE_SUPABASE_URL=https://[seu-project-ref-dev].supabase.co
VITE_SUPABASE_ANON_KEY=[sua-anon-key-dev]

# Opcional: Service Role (não commitar!)
SUPABASE_SERVICE_ROLE_KEY=[sua-service-role-key-dev]
```

## ✅ Checklist Final

- [ ] Projeto FlagHubDB-Dev criado no Supabase
- [ ] Supabase CLI linkado ao projeto dev
- [ ] Todas as migrations aplicadas (29 arquivos)
- [ ] Edge Functions deployadas
- [ ] Variáveis de ambiente configuradas
- [ ] `.env.local` criado com credenciais dev
- [ ] Validação do schema executada
- [ ] Testes de conexão realizados

## 🆘 Troubleshooting

### Erro: "Migration already applied"
```powershell
# Ver status das migrations
supabase migration list
# Se necessário, fazer reset (⚠️ apaga todos os dados!)
supabase db reset
```

### Erro: "Authentication failed"
```powershell
# Fazer logout e login novamente
supabase logout
supabase login
```

### Erro: "Function not found"
```powershell
# Redeploy das functions
supabase functions deploy --no-verify-jwt
```

---

**Última atualização**: 1 de março de 2026
