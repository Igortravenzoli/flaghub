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

### DT-002 — `devops_time_logs`: a política restrita por área não restringe nada

- **Data:** 2026-11-16 (achado no RLS-A, ao mapear o isolamento do Timer Flag)
- **Contexto:** a tabela tem DUAS políticas `FOR SELECT TO authenticated`, e o
  Postgres soma políticas permissivas por OR:
  - `devops_time_logs_select_restricted` (20260401122825): admin OU membership
    ativa numa das áreas técnicas da lista;
  - `devops_time_logs_select` (20260421180000): `hub_is_approved()`.

  Como a segunda vale para qualquer aprovado, a primeira não tem efeito: todo
  usuário aprovado, de qualquer área, lê todas as horas. O comentário de
  `src/App.tsx` sobre a rota `/timelog` ("a RLS de `devops_time_logs` já limita
  o não-admin à sua área") está errado por isso.
- **Decisão pendente (Igor):** NÃO mudado no RLS-A, porque muda quem vê horas.
  Opções: (a) apagar `devops_time_logs_select` e deixar só a restrita (o telão
  precisa continuar vendo — o monitor tem `leitura` na Fábrica, conferir se a
  Fábrica está na lista); (b) manter as duas e corrigir o comentário do App.tsx.
  O Timer Flag (`hub_has_timer()`) deve decidir isto antes de existir usuário
  só-Timer, que não passa em `hub_is_approved()` mas pode ser membro técnico.
- **Risco de manter:** horas por pessoa visíveis a qualquer área aprovada
  (Comercial, CS…), contra a intenção registrada no código.

## Quitados

_(vazio)_
