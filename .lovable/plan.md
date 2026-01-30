
# Plano: Autenticação Segura com Token de Sessão para API Tickets-OS

## Resumo

Implementar um sistema de autenticação em duas etapas onde:
1. A aplicação obtém um token de sessão ao carregar (via `/api/faq/validate-client`)
2. Usa esse token para autenticar nas chamadas subsequentes (`/api/tickets-os/correlacao`)
3. Renova automaticamente o token quando expirado

## Fluxo Visual

```text
+------------------+     +------------------+     +------------------+
|   Página carrega |---->| POST validate-   |---->| Armazena token   |
|   (refresh)      |     | client           |     | localStorage     |
+------------------+     +------------------+     +------------------+
                                                          |
                                                          v
+------------------+     +------------------+     +------------------+
|   Usuário clica  |---->| Token válido?    |---->| GET correlacao   |
|   "Consultar"    |     |                  |     | com Bearer       |
+------------------+     +------------------+     +------------------+
                                |
                                | Token expirado?
                                v
                         +------------------+
                         | Renova token     |
                         | e tenta de novo  |
                         +------------------+
```

## Etapas de Implementação

### 1. Criar serviço de gerenciamento de token de sessão

**Arquivo:** `src/services/apiSessionToken.ts`

Funções:
- `validateClient()`: Chama `POST /api/faq/validate-client` com `{codigoPuxada: "1"}`
- `getStoredToken()`: Recupera token do localStorage
- `isTokenValid()`: Verifica se o token não expirou
- `getValidToken()`: Obtém token válido (reutiliza ou renova)
- `clearToken()`: Limpa token armazenado

Estrutura do localStorage:
```typescript
interface StoredSessionToken {
  token: string;
  expiresAt: string; // ISO date
  createdAt: string;
}
```

### 2. Criar hook para gerenciamento automático do token

**Arquivo:** `src/hooks/useApiSessionToken.ts`

- Inicializa token ao montar o componente
- Expõe estado de carregamento e erro
- Função para obter token válido com retry automático
- Renovação proativa antes da expiração

### 3. Atualizar serviço de API Tickets-OS

**Arquivo:** `src/services/ticketsOSApi.ts`

Modificações:
- Substituir `obterTokenSupabase()` por `getValidToken()` do novo serviço
- Adicionar lógica de retry com renovação de token em caso de 401
- Manter compatibilidade com código existente

### 4. Atualizar hooks de consumo da API

**Arquivo:** `src/hooks/useTicketsOSApi.ts`

Modificações:
- Usar o novo hook `useApiSessionToken`
- Garantir que o token seja obtido antes das requisições
- Adicionar retry automático com renovação de token

### 5. Atualizar hook de auto-correlação

**Arquivo:** `src/hooks/useAutoCorrelation.ts`

Modificações:
- Usar `getValidToken()` do novo serviço
- Adicionar tratamento de erro 401 com retry

## Detalhes Técnicos

### Interface de Response do validate-client

```typescript
interface ValidateClientResponse {
  sessionToken: string;
  expiresAt: string; // ISO 8601
  // outros campos opcionais da API
}
```

### Chave do localStorage

```typescript
const STORAGE_KEY = 'flag_api_session_token';
```

### Margem de segurança para expiração

Token será considerado expirado 60 segundos antes do tempo real para evitar race conditions.

### Tratamento de erros

- Se `validate-client` falhar: exibe toast de erro e permite retry
- Se token expirar durante requisição: renova automaticamente e retenta
- Limite de 2 tentativas de renovação por requisição

## Arquivos Afetados

| Arquivo | Ação |
|---------|------|
| `src/services/apiSessionToken.ts` | **Criar** - Serviço de gerenciamento de token |
| `src/hooks/useApiSessionToken.ts` | **Criar** - Hook React para token |
| `src/services/ticketsOSApi.ts` | **Modificar** - Usar novo serviço de token |
| `src/hooks/useTicketsOSApi.ts` | **Modificar** - Integrar com novo hook |
| `src/hooks/useAutoCorrelation.ts` | **Modificar** - Usar novo serviço de token |

## Observações

- O token Supabase ainda será usado para autenticação interna do app (profiles, RLS)
- O token da API externa (`sessionToken`) é específico para chamadas ao VDESK
- Os dois sistemas de autenticação coexistem sem conflitos
