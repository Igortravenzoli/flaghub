
# Plano: Correção da Integração VDESK

## Problema Identificado

A página de Busca VDESK está apresentando "Failed to fetch" porque:

1. **Os hooks (`useTicketsOSApi.ts`) chamam `ticketsOSApi.ts` que faz requisições diretas** à API externa `https://clientes.flag.com.br/Flag.Ai.Gateway`
2. **O navegador bloqueia essas requisições por CORS** (Cross-Origin Resource Sharing)
3. **A Edge Function `vdesk-proxy` existe e suporta a ação `consultar`**, mas não está sendo utilizada pelos hooks de consulta
4. **A Edge Function precisa ser re-deployada** para garantir disponibilidade

---

## Solução

Migrar os hooks de consulta para usar o serviço proxy (`vdeskProxyService.ts`) que roteia as requisições através da Edge Function, contornando as restrições de CORS.

---

## Alterações Necessárias

### 1. Atualizar hooks para usar o Proxy

Modificar `src/hooks/useTicketsOSApi.ts` para importar e utilizar as funções do `vdeskProxyService.ts`:

- Substituir `consultarTicketsOS` por `consultarTicketsViaProxy`
- Substituir `correlacionarTicket` por `correlacionarTicketViaProxy`
- Remover dependência do `useApiSessionToken` (o proxy gerencia tokens internamente)

### 2. Re-deploy da Edge Function

Garantir que a função `vdesk-proxy` esteja corretamente deployada e respondendo.

### 3. Atualizar Headers CORS (se necessário)

Verificar se os headers CORS da Edge Function incluem todos os headers necessários do Supabase client.

---

## Detalhes Técnicos

### Arquivo: `src/hooks/useTicketsOSApi.ts`

Mudanças principais:

```typescript
// ANTES
import { 
  consultarTicketsOS, 
  correlacionarTicket, 
} from '@/services/ticketsOSApi';
import { useApiSessionToken } from './useApiSessionToken';

// DEPOIS
import { 
  consultarTicketsViaProxy, 
  correlacionarTicketViaProxy,
  ConsultaResponse,
  CorrelacaoResponse,
} from '@/services/vdeskProxyService';
```

Cada hook será simplificado para chamar diretamente o proxy:

```typescript
export function useConsultarTicketsOS(params, enabled = true) {
  return useQuery({
    queryKey: ['tickets-os', 'consultar', params],
    queryFn: () => consultarTicketsViaProxy(params),
    enabled: enabled && (!!params.ticketNestle || !!params.osNumber || ...),
    // ...
  });
}
```

### Arquivo: `supabase/functions/vdesk-proxy/index.ts`

Atualizar headers CORS para incluir todos os headers do Supabase:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useTicketsOSApi.ts` | Usar `vdeskProxyService` ao invés de `ticketsOSApi` |
| `supabase/functions/vdesk-proxy/index.ts` | Atualizar headers CORS |

---

## Benefícios da Mudança

1. **Resolve CORS**: Todas as requisições passam pelo backend (Edge Function)
2. **Gerenciamento de Token Centralizado**: O proxy gerencia autenticação com a API externa
3. **Fallback Automático**: O proxy já implementa fallback entre endpoints HTTPS/HTTP
4. **Logs Centralizados**: Facilita debug e monitoramento

---

## Fluxo Após a Correção

```text
Usuário digita ticket
       ↓
Frontend (useConsultarTicketsOS)
       ↓
consultarTicketsViaProxy()
       ↓
fetch() → Edge Function (vdesk-proxy)
       ↓
Edge Function → API Externa (clientes.flag.com.br)
       ↓
Resposta JSON → Frontend
```

---

## Estimativa

| Tarefa | Tempo |
|--------|-------|
| Atualizar hooks | 15 min |
| Atualizar CORS da Edge Function | 5 min |
| Re-deploy e teste | 10 min |
| **Total** | **30 min** |
