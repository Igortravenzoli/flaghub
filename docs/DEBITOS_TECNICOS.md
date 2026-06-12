# Débitos técnicos

Registro de decisões pragmáticas que precisam de revisita. Ao quitar um item,
mover para a seção "Quitados" com a data e o commit.

## Abertos

### DT-001 — App Entra "Teams Graph" com função híbrida (Teams + SharePoint)

- **Data:** 2026-06-12
- **Contexto:** para conectar o espelho SGSI (`sharepoint-sync-sgsi`) ao site
  `flagcom.sharepoint.com/sites/PORTALSGSI` sem criar um novo app registration,
  reaproveitamos o app Entra já usado pela integração Teams
  (secrets `TEAMS_GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET`). A function usa
  fallback: lê `SHAREPOINT_*` se existir, senão `TEAMS_GRAPH_*`.
- **Dívida:**
  1. Renomear o app no Entra ID para um nome que represente a função híbrida
     (ex.: `FlagHub Graph Integrations`), já que hoje o nome sugere uso
     exclusivo do Teams.
  2. Opcionalmente, renomear os secrets no Supabase para um prefixo neutro
     (ex.: `MSGRAPH_*`) e remover o fallback duplo em
     `supabase/functions/sharepoint-sync-sgsi/index.ts`.
- **Pré-requisito pendente:** conceder ao app a permissão de aplicação
  **Sites.Read.All** (Microsoft Graph) + admin consent — sem isso o sync SGSI
  retorna 403 no Graph.
- **Risco de manter:** confusão operacional (rotação de secret do "Teams"
  derruba também o espelho SGSI sem que o nome avise isso).

## Quitados

_(vazio)_
