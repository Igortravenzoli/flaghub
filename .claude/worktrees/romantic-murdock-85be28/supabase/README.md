# 📁 Estrutura de Migrations - FlagHub

Este diretório contém todas as migrations do banco de dados e scripts de setup para ambientes de desenvolvimento.

## 📂 Estrutura de Arquivos

```
supabase/
├── migrations/                    # Migrations SQL
│   ├── 00_SETUP_REFERENCE.sql    # Referência e validação
│   ├── 20260127193248_...sql     # Migration 1: Backend completo
│   ├── 20260127193308_...sql     # Migration 2: Fix RLS
│   ├── ...                       # Migrations 3-29
│   └── FIX_RLS_SUPABASE.sql      # Políticas RLS adicionais
│
├── functions/                     # Edge Functions
│   ├── vdesk-proxy/              # Proxy para API VDesk
│   └── consultar-vdesk/          # Consulta dados VDesk
│
├── config.toml                    # Configuração do projeto
├── SETUP_DEV_DATABASE.md          # 📘 Guia completo de setup
├── QUICK_START.txt                # 🚀 Início rápido
├── apply-all-migrations.ps1       # Script de aplicação
└── validate-migrations.ps1        # Script de validação
```

## 🎯 Para Começar

### Setup Rápido (5 minutos)

1. **Leia o Quick Start**:
   ```
   cat QUICK_START.txt
   ```

2. **Valide as migrations**:
   ```powershell
   .\validate-migrations.ps1
   ```

3. **Aplique no projeto dev**:
   ```powershell
   .\apply-all-migrations.ps1 -ProjectRef SEU_PROJECT_REF
   ```

### Setup Detalhado

Para instruções completas, consulte: **[SETUP_DEV_DATABASE.md](SETUP_DEV_DATABASE.md)**

## 📋 Ordem de Execução das Migrations

As migrations são executadas automaticamente em ordem cronológica pelo Supabase CLI. O formato é:

```
YYYYMMDDHHMMSS_identificador-uuid.sql
```

### Cronologia Completa

| # | Data | Arquivo | Descrição |
|---|------|---------|-----------|
| 1 | 27/01/2026 19:32 | `20260127193248_ef6fa2c3...` | Backend completo: tabelas, enums, RLS |
| 2 | 27/01/2026 19:33 | `20260127193308_45916c00...` | Fix RLS view dashboard |
| 3 | 27/01/2026 20:00 | `20260127200000_correlation...` | Functions de correlação |
| 4 | 29/01/2026 00:00 | `20260129000000_import_batches...` | Sistema de import em lote |
| 5 | 29/01/2026 14:00 | `20260129140000_allow_ticket...` | Políticas RLS para insert |
| 6-29 | Jan-Fev 2026 | ... | Ajustes e melhorias |

> **Nota**: O arquivo `FIX_RLS_SUPABASE.sql` não segue o padrão de timestamp e deve ser aplicado manualmente se necessário.

## 🔧 Scripts Disponíveis

### `validate-migrations.ps1`

Valida a integridade e ordem das migrations antes de aplicar.

```powershell
.\validate-migrations.ps1
```

**Verifica**:
- ✅ Ordem cronológica
- ✅ Sintaxe SQL básica
- ✅ Duplicatas
- ✅ Arquivos vazios

### `apply-all-migrations.ps1`

Aplica todas as migrations em um projeto Supabase.

```powershell
# Uso básico
.\apply-all-migrations.ps1 -ProjectRef abc123xyz

# Dry run (sem aplicar)
.\apply-all-migrations.ps1 -ProjectRef abc123xyz -DryRun

# Ajuda
.\apply-all-migrations.ps1 -Help
```

**Funcionalidades**:
- 🔗 Link automático com projeto
- 📊 Validações pré-aplicação
- 📝 Relatório detalhado
- ✅ Confirmação de segurança

## 🗃️ Schema do Banco de Dados

### Principais Tabelas

- **`networks`** - Redes/clientes
- **`profiles`** - Perfis de usuários
- **`user_roles`** - Roles dos usuários
- **`tickets`** - Tickets do sistema
- **`ordem_servicos`** - Ordens de serviço
- **`ticket_os_correlation`** - Correlação tickets ↔ OS
- **`status_mapping`** - Mapeamento de status
- **`import_batches`** - Controle de importações

### Enums

- `app_role` - Roles: operacional, gestao, qualidade, admin
- `internal_status` - Status: novo, em_atendimento, em_analise, finalizado, cancelado
- `ticket_severity` - Severidade: critico, atencao, info

### Views

- `v_dashboard_summary` - Resumo do dashboard por network
- `v_ticket_os_details` - Detalhes completos de tickets com OS

### Functions Principais

- `auth_network_id()` - Retorna network_id do usuário autenticado
- `is_admin()` - Verifica se usuário é admin
- `auto_correlate_ticket_os()` - Correlação automática tickets ↔ OS
- `get_dashboard_summary()` - Busca dados do dashboard

## 🔐 Row Level Security (RLS)

Todas as tabelas principais possuem RLS habilitado. As políticas garantem:

- Usuários só veem dados de sua network
- Admins têm acesso total
- Políticas específicas para INSERT/UPDATE/DELETE
- Functions com `SECURITY DEFINER` para operações privilegiadas

> ⚠️ **IMPORTANTE**: O arquivo `FIX_RLS_SUPABASE.sql` inclui políticas para acesso anônimo (testes). **NÃO use em produção!**

## 🚀 Edge Functions

### `vdesk-proxy`

Proxy seguro para API VDesk com autenticação.

**Deploy**:
```bash
supabase functions deploy vdesk-proxy
```

**Env vars necessárias**:
- `VDESK_API_URL`
- `VDESK_API_TOKEN`

### `consultar-vdesk`

Função para consultar dados do VDesk.

**Deploy**:
```bash
supabase functions deploy consultar-vdesk
```

## 🔄 Workflow: Dev → Prod

### Criando Nova Migration

1. **Criar em DEV primeiro**:
   ```bash
   supabase migration new "add_new_feature"
   ```

2. **Editar o arquivo SQL criado**:
   ```sql
   -- migrations/20260301000000_add_new_feature.sql
   ALTER TABLE tickets ADD COLUMN new_field TEXT;
   ```

3. **Aplicar em DEV**:
   ```bash
   supabase db push
   ```

4. **Testar completamente**

5. **Aplicar em PROD**:
   ```bash
   # Atualizar config.toml com project_id de prod
   supabase db push --linked
   ```

### Sincronizando Dados

Para copiar dados de PROD para DEV (use com cuidado):

```bash
# Exportar de PROD
supabase db dump --data-only > prod_data.sql

# Importar em DEV
supabase db reset  # ⚠️ Apaga tudo!
supabase db push
psql $DEV_DATABASE_URL < prod_data.sql
```

## 📝 Boas Práticas

### ✅ DO

- Sempre criar migrations em DEV primeiro
- Testar completamente antes de PROD
- Usar nomes descritivos para migrations
- Documentar mudanças significativas
- Versionar migrations no Git
- Fazer backup antes de migrations grandes

### ❌ DON'T

- Nunca editar migrations já aplicadas
- Nunca aplicar migrations diretamente em PROD sem testar
- Não commitar credenciais (`.env.local`, etc)
- Não usar políticas de teste em PROD
- Não deletar migrations do histórico

## 🆘 Troubleshooting

### Migration já está aplicada

```bash
supabase migration list
# Se tiver duplicata, fazer reset (⚠️ apaga dados!)
supabase db reset
```

### Erro de autenticação

```bash
supabase logout
supabase login
```

### Migration falhou parcialmente

```sql
-- Verificar o que foi aplicado
SELECT * FROM supabase_migrations.schema_migrations;

-- Reverter manualmente se necessário
-- (criar migration de rollback)
```

### Edge Function não está funcionando

```bash
# Ver logs
supabase functions logs vdesk-proxy

# Redeploy
supabase functions deploy vdesk-proxy --no-verify-jwt
```

## 📚 Recursos

- [Documentação Supabase](https://supabase.com/docs)
- [SQL Editor](https://supabase.com/docs/guides/database/overview)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)

## 📞 Suporte

Para problemas ou dúvidas:
1. Consulte a documentação acima
2. Verifique os logs: `supabase logs`
3. Revise o código das migrations

---

**Última atualização**: 1 de março de 2026
