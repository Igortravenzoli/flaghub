

# Otimização da Correlação em Lote (Batch)

## Problema Atual

Para correlacionar 100 tickets, o navegador faz **100 chamadas HTTP** individuais para a Edge Function, que por sua vez faz 100 chamadas para a API VDESK. Isso gera:
- Latência acumulada (cada chamada tem overhead de rede browser-to-edge)
- Risco de timeout no navegador
- Uso excessivo de conexões simultâneas

## Solução Proposta

Mover o loop de correlação para dentro da **Edge Function** (servidor). O navegador fará **1 unica chamada POST** enviando todos os ticket IDs, e a Edge Function processará internamente com o token já cacheado.

```text
ANTES (100 tickets = 100 chamadas do browser):
  Browser --[1]--> Edge Function --> VDESK
  Browser --[2]--> Edge Function --> VDESK
  Browser --[3]--> Edge Function --> VDESK
  ... (x100)

DEPOIS (100 tickets = 1 chamada do browser):
  Browser --[1 POST com 100 IDs]--> Edge Function --[loop interno]--> VDESK
                                    (token cacheado, sem CORS overhead)
```

## Detalhes Técnicos

### 1. Edge Function `vdesk-proxy` - Nova action `correlacao-batch`

- Aceitar **POST** com body `{ tickets: ["INC001", "INC002", ...] }`
- Obter token VDESK uma unica vez (ja cacheado)
- Processar tickets em lotes paralelos de 5 (mesmo ritmo atual, mas server-side)
- Retornar resultados consolidados com status individual de cada ticket
- Formato de resposta:
  ```json
  {
    "success": true,
    "results": [
      { "ticket": "INC001", "found": true, "osEncontradas": ["OS123"], "data": [...] },
      { "ticket": "INC002", "found": false, "message": "Sem OS vinculada" }
    ],
    "summary": { "total": 100, "found": 85, "notFound": 15, "errors": 0 }
  }
  ```

### 2. Proxy Service - Nova funcao `correlacionarBatchViaProxy`

- Novo metodo em `src/services/vdeskProxyService.ts`
- Envia todos os ticket IDs em uma unica chamada POST
- Timeout maior (120s) para processar lotes grandes

### 3. Hook `useAutoCorrelation` - Simplificação

- `correlateAllPending` passa a buscar os tickets pendentes e enviar todos de uma vez para a Edge Function
- Progresso recebido via resposta final (nao streaming, mas muito mais rapido no total)
- Mantém fallback para correlação individual caso o batch falhe
- Atualização do Supabase continua sendo feita no frontend apos receber os resultados consolidados

### 4. Atualização em massa no Supabase

- Apos receber os resultados do batch, o hook fara updates agrupados:
  - Tickets encontrados: atualizar `os_found_in_vdesk=true`, `os_number`, `vdesk_payload`
  - Tickets nao encontrados: atualizar `os_found_in_vdesk=false`, `inconsistency_code='OS_NOT_FOUND'`
- Usar Promise.all para paralelizar os updates no Supabase

## Beneficios

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Chamadas HTTP do browser | N | 1 |
| Autenticações VDESK | 1 (cache) | 1 (cache) |
| Round-trips de rede | N x 2 (browser-edge-vdesk) | 1 (browser-edge) + N (edge-vdesk interno) |
| Tempo estimado (100 tickets) | ~60-90s | ~15-25s |

